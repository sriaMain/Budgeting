"""Header global search: GET /api/search/?q=<text>

One call that finds the text across the Project Details tabs - projects (Overview), tasks,
milestones, resources, expenses (expenses and vendor bills), invoices and payments - so the header
can jump straight to the row. Each result names its project, the tab it lives on, and the text that
tab's own search box needs to show it (`tab_search`). The Financials tab has no rows of its own:
matched projects list their tabs (Financials included) as shortcuts.

Admins / managers (and superusers) search everything. Everyone else gets only the tasks assigned to
them, which open in Tasks & time.
"""
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .external_api import _task_assignees
from .models import Milestone, Project, ResourceAssignment, Task
from .resource_service import profile_of, profiles

MIN_LENGTH = 2
MAX_LENGTH = 100
PER_SECTION = 5
STAFF_ROLES = ("Admin", "Manager", "Project Manager")

# Same tabs as the frontend's hooks/useProjectFilters.ts (tabsFor).
CLIENT_TABS = ['Overview', 'Tasks', 'Expenses', 'Resources', 'Invoices', 'Milestones', 'Financials', 'Payments']
INTERNAL_TABS = ['Overview', 'Tasks', 'Resources', 'Milestones', 'Expenses', 'Budget', 'Activity']

SECTIONS = [
    ('projects', 'Projects'), ('tasks', 'Tasks'), ('milestones', 'Milestones'), ('resources', 'Resources'),
    ('expenses', 'Expenses'), ('invoices', 'Invoices'), ('payments', 'Payments'),
]


def is_staff_user(user):
    return user.is_superuser or user.roles.filter(role_name__in=STAFF_ROLES).exists()


def project_tabs(project):
    if project.project_category == 'internal':
        return INTERNAL_TABS
    is_fixed = (project.engagement_type or 'fixed') == 'fixed'
    return [t for t in CLIENT_TABS if t != 'Milestones' or is_fixed]


def _join(*parts):
    return ' · '.join(str(p) for p in parts if p)


def _result(section, key, title, subtitle, project, tab, tab_search=''):
    if tab not in project_tabs(project):  # e.g. a milestone of a Time & Material project
        tab, tab_search = 'Overview', ''
    return {
        "section": section, "key": f"{section}-{key}", "title": title, "subtitle": subtitle,
        "project_id": project.pk, "project_name": project.project_name,
        "tab": tab, "tab_search": (tab_search or '')[:MAX_LENGTH],
    }


def _first(qs):
    """Up to PER_SECTION rows, and whether there were more."""
    rows = list(qs[:PER_SECTION + 1])
    return rows[:PER_SECTION], len(rows) > PER_SECTION


def search_projects(q):
    cond = Q(project_name__icontains=q) | Q(client__company_name__icontains=q) | Q(department__icontains=q)
    if q.isdigit():
        cond |= Q(project_no=int(q))
    rows, more = _first(Project.objects.filter(cond).select_related('client').order_by('project_name'))
    out = []
    for p in rows:
        r = _result('projects', p.pk, p.project_name,
                    _join(f"#{p.pk}", p.client.company_name if p.client_id else 'Internal project', p.get_status_display()),
                    p, 'Overview')
        r["tabs"] = project_tabs(p)
        out.append(r)
    return out, more


def search_tasks(q):
    cond = (
        Q(title__icontains=q) | Q(description__icontains=q)
        | Q(assigned_to__first_name__icontains=q) | Q(assigned_to__last_name__icontains=q)
        | Q(assigned_hrms_employee__full_name__icontains=q) | Q(assigned_hrms_employee__employee_id__iexact=q)
        | Q(assigned_to__hrms_employee__employee_id__iexact=q)
        | Q(freelancer_assignments__freelancer__full_name__icontains=q)
    )
    qs = (Task.objects.filter(project__isnull=False).filter(cond).distinct()
          .select_related('project', 'milestone', 'assigned_to__hrms_employee', 'assigned_hrms_employee')
          .order_by('-modified_at', '-id'))
    rows, more = _first(qs)
    who = _task_assignees(rows)
    return [
        _result('tasks', t.pk, t.title,
                _join(t.project.project_name, (who.get(t.pk) or {}).get('resource_name') or 'Unassigned', t.get_status_display()),
                t.project, 'Tasks', t.title)
        for t in rows
    ], more


def search_own_tasks(user, q):
    """Not staff: only the tasks assigned to this user - they open in Tasks & time."""
    qs = (Task.objects.filter(assigned_to=user)
          .filter(Q(title__icontains=q) | Q(description__icontains=q) | Q(project__project_name__icontains=q))
          .select_related('project').order_by('-modified_at', '-id'))
    rows, more = _first(qs)
    return [{
        "section": "tasks", "key": f"tasks-{t.pk}", "title": t.title,
        "subtitle": _join(t.project.project_name if t.project_id else None, t.get_status_display()),
        "project_id": None, "project_name": t.project.project_name if t.project_id else None,
        "tab": None, "tab_search": "", "task_id": t.pk,
    } for t in rows], more


def search_milestones(q):
    qs = (Milestone.objects.filter(is_active=True).filter(Q(name__icontains=q) | Q(description__icontains=q))
          .select_related('project').order_by('project__project_name', 'sequence', 'id'))
    rows, more = _first(qs)
    return [
        _result('milestones', m.pk, m.name, _join(m.project.project_name, m.get_status_display()), m.project, 'Milestones', m.name)
        for m in rows
    ], more


def search_resources(q):
    """People on projects' Resources tabs, matched by name or code (as that tab's search does) -
    one result per person per project."""
    from accounts.models import Account, Vendor
    from freelancer_onboarding.models import Freelancer

    employees = Account.objects.filter(
        Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(username__iexact=q)
        | Q(hrms_employee__full_name__icontains=q) | Q(hrms_employee__employee_id__icontains=q)
    ).values('pk')
    freelancers = Freelancer.objects.filter(Q(full_name__icontains=q) | Q(freelancer_code__icontains=q)).values('pk')
    vendors = Vendor.objects.filter(Q(name__icontains=q) | Q(vendor_reference_no__icontains=q)).values('pk')
    qs = (
        ResourceAssignment.objects.filter(is_active=True)
        .filter(Q(resource_type='employee', resource_id__in=employees)
                | Q(resource_type='freelancer', resource_id__in=freelancers)
                | Q(resource_type='vendor', resource_id__in=vendors)
                | Q(resource_type='external', external_name__icontains=q))
        .select_related('project').order_by('-updated_at', '-id')
    )
    picked, seen, more = [], set(), False
    for a in qs[:200]:
        who = (a.project_id, a.resource_type, (a.external_name or '').lower() if a.resource_type == 'external' else a.resource_id)
        if who in seen:
            continue
        if len(picked) == PER_SECTION:
            more = True
            break
        seen.add(who)
        picked.append(a)
    found = profiles(picked)
    out = []
    for a in picked:
        p = profile_of(a, found)
        out.append(_result('resources', a.pk, _join(p.name, p.code),
                           _join(a.project.project_name, a.role or p.designation, a.get_status_display()),
                           a.project, 'Resources', p.name))
    return out, more


def search_expenses(q):
    """The Expenses tab's rows: expenses and vendor bills, newest first."""
    from finances.models import Expense, VendorBill

    expenses = list(
        Expense.objects.filter(project__isnull=False)
        .filter(Q(expense_no__icontains=q) | Q(description__icontains=q) | Q(category__icontains=q)
                | Q(vendor__name__icontains=q) | Q(freelancer__full_name__icontains=q)
                | Q(employee__first_name__icontains=q) | Q(employee__last_name__icontains=q))
        .select_related('project', 'vendor', 'freelancer', 'employee').order_by('-expense_date', '-id')[:PER_SECTION + 1]
    )
    bills = list(
        VendorBill.objects.filter(Q(project__isnull=False) | Q(purchase_order__project__isnull=False))
        .filter(Q(bill_no__icontains=q) | Q(description__icontains=q) | Q(vendor__name__icontains=q))
        .select_related('project', 'purchase_order__project', 'vendor').order_by('-bill_date', '-id')[:PER_SECTION + 1]
    )
    rows = []
    for e in expenses:
        payee = ((e.vendor.name if e.vendor_id else None) or (e.freelancer.full_name if e.freelancer_id else None)
                 or (e.employee.get_full_name() if e.employee_id else None))
        rows.append((e.expense_date, _result(
            'expenses', f"expense-{e.pk}", _join(e.expense_no, (e.description or '')[:80]),
            _join(e.project.project_name, payee, e.get_category_display()), e.project, 'Expenses', e.expense_no)))
    for b in bills:
        project = b.project or b.purchase_order.project
        rows.append((b.bill_date, _result(
            'expenses', f"bill-{b.pk}", _join(f"Bill {b.bill_no}", (b.description or '')[:80]),
            _join(project.project_name, b.vendor.name if b.vendor_id else None), project, 'Expenses', b.bill_no)))
    rows.sort(key=lambda r: (r[0] is not None, r[0]), reverse=True)
    return [r for _, r in rows[:PER_SECTION]], len(rows) > PER_SECTION


def search_invoices(q):
    from finances.models import Invoice

    qs = (Invoice.objects.filter(project__isnull=False)
          .filter(Q(invoice_no__icontains=q) | Q(client__company_name__icontains=q))
          .select_related('project', 'client').order_by('-issue_date', '-id'))
    rows, more = _first(qs)
    return [
        _result('invoices', i.pk, i.invoice_no,
                _join(i.project.project_name, i.client.company_name if i.client_id else None, i.get_status_display()),
                i.project, 'Invoices', i.invoice_no)
        for i in rows
    ], more


def search_payments(q):
    """Incoming payments against a project's invoices (the Payments tab's received payments)."""
    from finances.models import InvoicePayment

    qs = (InvoicePayment.objects.filter(invoice__project__isnull=False)
          .filter(Q(reference_no__icontains=q) | Q(invoice__invoice_no__icontains=q) | Q(notes__icontains=q))
          .select_related('invoice__project').order_by('-payment_date', '-id'))
    rows, more = _first(qs)
    return [
        _result('payments', p.pk, _join(p.reference_no or 'Payment', f"for {p.invoice.invoice_no}"),
                _join(p.invoice.project.project_name, p.payment_date.strftime('%d-%m-%Y') if p.payment_date else None,
                      p.get_status_display()),
                p.invoice.project, 'Payments', p.reference_no or p.invoice.invoice_no)
        for p in rows
    ], more


SEARCHES = {
    'projects': search_projects, 'tasks': search_tasks, 'milestones': search_milestones,
    'resources': search_resources, 'expenses': search_expenses, 'invoices': search_invoices,
    'payments': search_payments,
}


class GlobalSearchAPIView(APIView):
    """GET /api/search/?q=<text> -> {"query", "sections": [{"key", "label", "results", "has_more"}]}.
    Sections with no matches are left out. Fewer than 2 characters returns nothing, except a
    one-digit number, which looks up that project number only."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = ' '.join((request.query_params.get('q') or '').split())[:MAX_LENGTH]
        sections = []
        if len(q) >= MIN_LENGTH or q.isdigit():
            staff = is_staff_user(request.user)
            if staff and len(q) < MIN_LENGTH:
                found = [('projects', 'Projects', *search_projects(q))]
            elif staff:
                found = [(key, label, *SEARCHES[key](q)) for key, label in SECTIONS]
            elif len(q) >= MIN_LENGTH:
                found = [('tasks', 'Tasks', *search_own_tasks(request.user, q))]
            else:
                found = []
            sections = [
                {"key": key, "label": label, "results": results, "has_more": more}
                for key, label, results, more in found if results
            ]
        return Response({"query": q, "sections": sections})
