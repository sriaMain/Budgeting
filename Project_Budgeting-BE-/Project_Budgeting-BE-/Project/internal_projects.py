"""Internal Projects (Project.project_category == 'internal'): created directly - no quotation,
client, contract value, invoices or payments - with an Approved Internal Budget (ProjectBudget.
total_budget, see ProjectBudget.cost_budget). They reuse the existing Milestone, ResourceAssignment,
Expense and VendorBill models and the same cost rule as every Fixed Budget project:

    Actual Cost    = resource cost (assigned cost) + expenses (resource categories excluded)
                     + paid vendor bill amounts
    Remaining      = Approved Internal Budget - Actual Cost
    Milestone      : the same, per milestone, against its allocated budget

Client projects (from a quotation) are not affected by anything here.
"""
from decimal import Decimal

from django.db.models import Q

ZERO = Decimal("0.00")
MANAGER_ROLES = ('Admin', 'Manager', 'Project Manager')


def can_manage_internal_projects(user):
    """Admin, Manager and Project Manager roles (and superusers) create and edit internal projects."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    roles = Q()
    for name in MANAGER_ROLES:
        roles |= Q(role_name__iexact=name)
    return user.roles.filter(roles).exists()


def department_options():
    """Department names for an internal project: the departments of employees active in AIRA HRMS
    (the same list the Add Resource filter uses), plus any already used on a project."""
    from hrms_integration.models import HrmsEmployee
    from .models import Project

    names = set(
        HrmsEmployee.objects.filter(is_active_in_hrms=True).exclude(department='')
        .values_list('department', flat=True)
    )
    names |= set(Project.objects.exclude(department='').values_list('department', flat=True))
    return sorted({n.strip() for n in names if n and n.strip()}, key=str.lower)


def pct(part, whole):
    """part as a % of whole (2 dp), or None without a whole."""
    if not whole:
        return None
    return (Decimal(part) / Decimal(whole) * 100).quantize(Decimal("0.01"))


def milestone_rows(project):
    """One row per active milestone - allocated budget, its costs, remaining, progress and how
    many resources work on it. Same figures as the Milestones tab."""
    rows = []
    for m in project.milestones.filter(is_active=True).order_by('sequence', 'id'):
        live = m.resource_assignments.filter(is_active=True).exclude(status='removed')
        budget = m.budget_amount or ZERO
        actual = m.actual_cost
        rows.append({
            "id": m.id,
            "sequence": m.sequence,
            "name": m.name,
            "status": m.status,
            "status_display": m.get_status_display(),
            "progress": m.completion_percent or 0,
            "planned_start_date": m.planned_start_date,
            "planned_end_date": m.planned_end_date,
            "budget": budget,
            "resource_cost": m.resource_cost,
            "resource_count": live.count(),
            "expenses_amount": m.expenses_amount,
            "bills_amount": m.bills_amount,
            "actual_cost": actual,
            "remaining_budget": budget - actual,
            "used_percent": pct(actual, budget),
            "is_over_budget": bool(budget) and actual > budget,
        })
    return rows


def _who(user):
    if not user:
        return None
    return getattr(user, 'display_name', None) or user.get_full_name() or user.username


def _changed_later(created, updated):
    """True when a record was edited after it was created (not just saved twice while creating)."""
    return bool(created and updated and (updated - created).total_seconds() > 60)


def _money(value, currency):
    return f"{currency} {Decimal(value or 0):,.2f}"


def project_activity(project):
    """The project's history, newest first, from the records themselves (no separate log table):
    the project, its milestones, resources, expenses, vendor bills and their payments, and the
    finance audit log's changes. Each event: {at, kind, action, title, detail, actor}."""
    from datetime import datetime

    from django.utils import timezone

    from finances.models import ExpensePayment, FinancialAuditLog, OutgoingPayment, VendorBill
    from hrms_integration.external_api import resource_identities, resource_identity

    currency = project.currency or 'INR'
    events = []

    def add(at, kind, action, title, detail='', actor=None):
        if at is None:
            return
        if not hasattr(at, 'hour'):  # a date -> start of that day
            at = timezone.make_aware(datetime(at.year, at.month, at.day))
        events.append({"at": at, "kind": kind, "action": action, "title": title, "detail": detail, "actor": actor})

    add(project.created_at, 'project', 'created', f"Project created: {project.project_name}",
        ' · '.join(x for x in (project.get_project_category_display(), project.department) if x))
    if _changed_later(project.created_at, project.modified_at):
        add(project.modified_at, 'project', 'updated', "Project details updated", f"Status: {project.get_status_display()}")

    for m in project.milestones.select_related('created_by', 'updated_by'):
        add(m.created_at, 'milestone', 'created', f"Milestone added: {m.name}",
            f"Allocated {_money(m.budget_amount, currency)}", _who(m.created_by))
        if not m.is_active:
            add(m.updated_at, 'milestone', 'archived', f"Milestone archived: {m.name}", '', _who(m.updated_by))
        elif _changed_later(m.created_at, m.updated_at):
            add(m.updated_at, 'milestone', 'updated', f"Milestone updated: {m.name}",
                f"{m.get_status_display()} · {m.completion_percent or 0}% done", _who(m.updated_by))

    assignments = list(project.resource_assignments.select_related('milestone', 'created_by', 'updated_by'))
    identities = resource_identities(assignments)
    for a in assignments:
        name = resource_identity(a, identities)[1] or a.get_resource_type_display()
        where = a.milestone.name if a.milestone_id else 'project level'
        add(a.created_at, 'resource', 'added', f"Resource added: {name}",
            f"{a.get_resource_type_display()} · {where} · {_money(a.assigned_cost, currency)}", _who(a.created_by))
        if not a.is_active:
            add(a.updated_at, 'resource', 'removed', f"Resource deleted: {name}", where, _who(a.updated_by))
        elif _changed_later(a.created_at, a.updated_at):
            add(a.updated_at, 'resource', 'updated', f"Resource updated: {name}",
                f"{a.get_status_display()} · {where} · {_money(a.assigned_cost, currency)}", _who(a.updated_by))

    for e in project.expenses.select_related('created_by', 'milestone'):
        add(e.created_at, 'expense', 'created', f"Expense recorded: {e.expense_no or e.pk}",
            ' · '.join(x for x in (_money(e.amount, currency), e.get_category_display(),
                                    e.milestone.name if e.milestone_id else '') if x), _who(e.created_by))
    for p in ExpensePayment.objects.filter(expense__project=project).select_related('expense'):
        add(p.created_at, 'payment', 'paid', f"Expense paid: {p.expense.expense_no or p.expense_id}", _money(p.amount, currency))

    bills = VendorBill.objects.filter(Q(project=project) | Q(purchase_order__project=project)).select_related('vendor')
    for b in bills:
        add(getattr(b, 'created_at', None) or b.bill_date, 'bill', 'created', f"Vendor bill recorded: {b.bill_no}",
            ' · '.join(x for x in (_money(b.total_amount, currency), getattr(b.vendor, 'name', '')) if x))
    for p in OutgoingPayment.objects.filter(vendor_bill__in=bills).select_related('vendor_bill'):
        add(p.created_at, 'payment', 'paid', f"Vendor bill paid: {p.vendor_bill.bill_no}", _money(p.amount, currency))

    # Later changes the finance module logged (creations are already listed above).
    for log in FinancialAuditLog.objects.filter(project=project).exclude(action='created').select_related('performed_by'):
        what = log.get_entity_type_display() if hasattr(log, 'get_entity_type_display') else log.entity_type
        change = (f"{log.field_name}: {log.old_value or '—'} → {log.new_value or '—'}" if log.field_name else '')
        add(log.created_at, log.entity_type, log.action, f"{what} {log.get_action_display().lower()} (#{log.entity_id})",
            change, _who(log.performed_by))

    events.sort(key=lambda e: e['at'], reverse=True)
    return events


def build_internal_report(project, summary, resource_rows):
    """The internal project's financial report as an .xlsx: Summary, Milestones, Resources and
    Costs sheets. `summary` is the financial-summary payload for the project."""
    import io

    from django.utils import timezone
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    money = '#,##0.00'
    head_font = Font(bold=True, color='FFFFFF')
    head_fill = PatternFill('solid', fgColor='1F2937')
    currency = project.currency or 'INR'

    def header(ws, labels):
        ws.append(labels)
        for cell in ws[ws.max_row]:
            cell.font, cell.fill = head_font, head_fill
            cell.alignment = Alignment(vertical='center')

    def widths(ws, values):
        for i, w in enumerate(values, start=1):
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    ws.append(['Internal Project Report'])
    ws['A1'].font = Font(bold=True, size=14)
    pm = project.project_manager
    for label, value in (
        ('Project', f"{project.project_name} (#{project.pk})"),
        ('Department', project.department or '—'),
        ('Project Manager', _who(pm) or '—'),
        ('Status', project.get_status_display()),
        ('Period', f"{project.start_date:%d/%m/%Y} – {project.end_date:%d/%m/%Y}"),
        ('Currency', currency),
        ('Generated', timezone.localtime().strftime('%d/%m/%Y %H:%M')),
    ):
        ws.append([label, value])
    ws.append([])
    header(ws, ['Figure', 'Amount'])
    progress = summary.get('milestone_progress') or {}
    figures = (
        ('Approved Internal Budget', summary.get('approved_budget')),
        ('Total Resource Cost', summary.get('resource_cost')),
        ('Total Expenses', summary.get('expenses_amount')),
        ('Total Vendor Bills (paid)', summary.get('bills_amount')),
        ('Actual Cost', summary.get('actual_cost')),
        ('Remaining Budget', summary.get('remaining_budget')),
        ('Allocated to Milestones', summary.get('allocated_to_milestones')),
        ('Not Allocated', summary.get('unallocated_budget')),
    )
    for label, value in figures:
        ws.append([label, float(value or 0)])
        ws.cell(row=ws.max_row, column=2).number_format = money
    util = summary.get('utilization_percent')
    ws.append(['Budget Utilization %', float(util) / 100 if util is not None else None])
    ws.cell(row=ws.max_row, column=2).number_format = '0.00%'
    ws.append(['Milestones', f"{progress.get('completed', 0)} of {progress.get('total', 0)} completed"
                             f" · {progress.get('in_progress', 0)} in progress · {progress.get('not_started', 0)} not started"])
    avg = progress.get('average_progress')
    ws.append(['Average Milestone Progress', f"{avg}%" if avg is not None else '—'])
    widths(ws, (30, 48))

    ms = wb.create_sheet('Milestones')
    header(ms, ['#', 'Milestone', 'Status', 'Progress %', 'Start', 'End', 'Allocated Budget', 'Resources',
                'Resource Cost', 'Expenses', 'Vendor Bills', 'Actual Cost', 'Remaining', 'Used %'])
    for i, r in enumerate(summary.get('milestones') or [], start=1):
        ms.append([
            i, r['name'], r['status_display'], r['progress'],
            r['planned_start_date'].strftime('%d/%m/%Y') if r['planned_start_date'] else '',
            r['planned_end_date'].strftime('%d/%m/%Y') if r['planned_end_date'] else '',
            float(r['budget']), r['resource_count'], float(r['resource_cost']), float(r['expenses_amount']),
            float(r['bills_amount']), float(r['actual_cost']), float(r['remaining_budget']),
            float(r['used_percent']) / 100 if r['used_percent'] is not None else None,
        ])
        for col in (7, 9, 10, 11, 12, 13):
            ms.cell(row=ms.max_row, column=col).number_format = money
        ms.cell(row=ms.max_row, column=14).number_format = '0.0%'
    widths(ms, (5, 30, 14, 11, 12, 12, 16, 11, 15, 13, 13, 15, 15, 9))

    rs_ws = wb.create_sheet('Resources')
    header(rs_ws, ['Resource', 'Type', 'Milestone', 'Cost Rate / h', 'Hours', 'Total Cost', 'Start', 'End', 'Status', 'Counted'])
    for r in resource_rows:
        rs_ws.append([
            r.get('resource_name') or '', r.get('resource_type_display') or '', r.get('milestone_name') or 'Project level',
            float(r.get('cost_rate') or 0), float(r.get('working_hours') or 0), float(r.get('total_cost') or 0),
            r['start_date'].strftime('%d/%m/%Y') if r.get('start_date') else '',
            r['end_date'].strftime('%d/%m/%Y') if r.get('end_date') else '',
            r.get('status_display') or '', 'Yes' if r.get('counts_in_cost') else 'No (removed)',
        ])
        for col in (4, 6):
            rs_ws.cell(row=rs_ws.max_row, column=col).number_format = money
    widths(rs_ws, (28, 12, 22, 13, 9, 15, 12, 12, 12, 14))

    cs = wb.create_sheet('Costs')
    header(cs, ['Cost', 'Amount'])
    breakdown = summary.get('cost_breakdown') or {}
    for label, value in (
        ('Employees', breakdown.get('employee_cost')),
        ('Freelancers', breakdown.get('freelancer_cost')),
        ('Vendors / external', breakdown.get('vendor_resource_cost')),
        ('Expenses (excl. employee / freelancer categories)', summary.get('expenses_amount')),
        ('Vendor bills paid', summary.get('bills_amount')),
        ('Actual Cost', summary.get('actual_cost')),
    ):
        cs.append([label, float(value or 0)])
        cs.cell(row=cs.max_row, column=2).number_format = money
    by_gl = breakdown.get('by_gl_account') or []
    if by_gl:
        cs.append([])
        header(cs, ['Expenses by GL account', 'Amount'])
        for row in by_gl:
            cs.append([row['gl_account'], float(row['amount'] or 0)])
            cs.cell(row=cs.max_row, column=2).number_format = money
    widths(cs, (48, 16))

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def report_filename(project):
    import re

    from django.utils import timezone
    name = re.sub(r'[^A-Za-z0-9]+', '-', project.project_name or '').strip('-')[:60] or f"Project-{project.pk}"
    return f"{name}_Internal-Report_{timezone.localdate():%Y-%m-%d}.xlsx"


def milestone_progress(rows):
    """Milestone progress for the summary: counts by status and the average progress."""
    counts = {}
    for r in rows:
        counts[r['status']] = counts.get(r['status'], 0) + 1
    total = len(rows)
    return {
        "total": total,
        "completed": counts.get('completed', 0),
        "in_progress": counts.get('in_progress', 0),
        "not_started": counts.get('not_started', 0),
        "on_hold": counts.get('on_hold', 0),
        "cancelled": counts.get('cancelled', 0),
        "average_progress": round(sum(r['progress'] for r in rows) / total, 1) if total else None,
    }
