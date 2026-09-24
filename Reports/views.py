from decimal import Decimal

from django.db.models import Sum, DecimalField, F, Count
from django.db.models.functions import Coalesce
from django.core.cache import cache
from django.utils import timezone
from dateutil.relativedelta import relativedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from Project.models import Project, ProjectBudget, Task, BudgetLine
from finances.models import Invoice, InvoicePayment, OutgoingPayment, Expense
from accounts.models import Account, Vendor
from freelancer_onboarding.models import Freelancer, FreelancerProjectAssignment

from .serializers import DashboardMetricsSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .services import (
    get_all_tab_data,
    get_financial_tab_data,
    get_project_tab_data,
    get_payment_tab_data,
    get_po_invoice_tab_data,
)


def _money_sum(queryset, amount_field, date_field=None, start=None, end=None):
    """Sum `amount_field` over `queryset`, optionally restricted to [start, end) on `date_field`."""
    if date_field is not None:
        queryset = queryset.filter(**{f"{date_field}__gte": start, f"{date_field}__lt": end})
    return queryset.aggregate(
        total=Coalesce(
            Sum(amount_field),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=15, decimal_places=2),
        )
    )["total"]


def _percent_change(current, previous):
    """Month-over-month % change. None when there's no baseline to compare against."""
    if not previous:
        return None
    return round(float((current - previous) / previous * 100), 2)


def _month_window(months_ago):
    first_of_this_month = timezone.now().date().replace(day=1)
    start = first_of_this_month - relativedelta(months=months_ago)
    end = start + relativedelta(months=1)
    return start, end


class DashboardMetricsAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 🔹 Cache (60 seconds)
        try:
            cached_data = cache.get("dashboard_metrics")
            if cached_data:
                return Response(cached_data)
        except Exception:
            cached_data = None

        # 1️⃣ Budget → ProjectBudget.total_budget (only active projects) — static snapshot, no trend
        total_budget = _money_sum(
            ProjectBudget.objects.filter(
                project__status__in=[
                    "planning",
                    "development",
                    "testing",
                    "uat",
                    "ready_for_deployment",
                    "deployed",
                ]
            ),
            "total_budget",
        )

        # 2️⃣ Invoiced → Invoice.total_amount (valid business statuses)
        invoiced_qs = Invoice.objects.filter(
            status__in=["Issued", "Partially Paid", "Paid", "Overdue"]
        )
        total_invoiced = _money_sum(invoiced_qs, "total_amount")

        # 3️⃣ Received → InvoicePayment.amount
        received_qs = InvoicePayment.objects.all()
        total_received = _money_sum(received_qs, "amount")

        # 4️⃣ Expenses → OutgoingPayment.amount (vendor bill payments) + Expense.amount (logged expenses)
        expenses_qs = OutgoingPayment.objects.all()
        logged_expenses_qs = Expense.objects.all()
        total_expenses = _money_sum(expenses_qs, "amount") + _money_sum(logged_expenses_qs, "amount")

        # 5️⃣ Profit → Received - Expenses
        profit = total_received - total_expenses

        # 🔹 Month-over-month % change for the flow metrics (budget is a snapshot, no baseline to diff)
        this_start, this_end = _month_window(0)
        last_start, last_end = _month_window(1)

        invoiced_this = _money_sum(invoiced_qs, "total_amount", "issue_date", this_start, this_end)
        invoiced_last = _money_sum(invoiced_qs, "total_amount", "issue_date", last_start, last_end)

        received_this = _money_sum(received_qs, "amount", "payment_date", this_start, this_end)
        received_last = _money_sum(received_qs, "amount", "payment_date", last_start, last_end)

        expenses_this = (
            _money_sum(expenses_qs, "amount", "payment_date", this_start, this_end)
            + _money_sum(logged_expenses_qs, "amount", "expense_date", this_start, this_end)
        )
        expenses_last = (
            _money_sum(expenses_qs, "amount", "payment_date", last_start, last_end)
            + _money_sum(logged_expenses_qs, "amount", "expense_date", last_start, last_end)
        )

        profit_this = received_this - expenses_this
        profit_last = received_last - expenses_last

        data = {
            "budget": {
                "value": total_budget,
                "change": None,
            },
            "invoiced": {
                "value": total_invoiced,
                "change": _percent_change(invoiced_this, invoiced_last),
            },
            "received": {
                "value": total_received,
                "change": _percent_change(received_this, received_last),
            },
            "expenses": {
                "value": total_expenses,
                "change": _percent_change(expenses_this, expenses_last),
            },
            "profit": {
                "value": profit,
                "change": _percent_change(profit_this, profit_last),
            },
        }

        serializer = DashboardMetricsSerializer(data)
        try:
            cache.set("dashboard_metrics", serializer.data, timeout=60)
        except Exception:
            pass

        return Response(serializer.data)


class DashboardOrgOverviewAPIView(APIView):
    """Revenue trend, project-status breakdown, and top projects by forecasted profit — Admin/Manager only."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.roles.filter(
            role_name__in=["Admin", "Manager", "Project Manager"]
        ).exists():
            return Response({"error": "Permission denied"}, status=403)

        cache_key = "dashboard_org_overview"
        try:
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data)
        except Exception:
            pass

        # 🔹 Revenue trend — last 6 months, invoiced vs received vs expenses
        months = []
        for months_ago in range(5, -1, -1):
            start, end = _month_window(months_ago)
            months.append({
                "month": start.strftime("%Y-%m"),
                "invoiced": _money_sum(
                    Invoice.objects.filter(status__in=["Issued", "Partially Paid", "Paid", "Overdue"]),
                    "total_amount", "issue_date", start, end,
                ),
                "received": _money_sum(InvoicePayment.objects.all(), "amount", "payment_date", start, end),
                "expenses": _money_sum(OutgoingPayment.objects.all(), "amount", "payment_date", start, end),
            })

        # 🔹 Project status breakdown
        project_status = list(
            Project.objects.values("status").annotate(count=Count("project_no")).order_by("-count")
        )

        # 🔹 Top 5 projects by forecasted profit (only projects with a budget set)
        top_projects_qs = (
            ProjectBudget.objects.filter(
                total_budget__isnull=False, bills_and_expenses__isnull=False, project__isnull=False
            )
            .annotate(computed_profit=F("total_budget") - F("bills_and_expenses"))
            .select_related("project")
            .order_by("-computed_profit")[:5]
        )
        top_projects = [
            {
                "project_no": pb.project.project_no,
                "project_name": pb.project.project_name,
                "total_budget": pb.total_budget,
                "bills_and_expenses": pb.bills_and_expenses,
                "forecasted_profit": pb.computed_profit,
            }
            for pb in top_projects_qs
        ]

        data = {
            "revenue_trend": months,
            "project_status": project_status,
            "top_projects": top_projects,
        }

        try:
            cache.set(cache_key, data, timeout=90)
        except Exception:
            pass

        return Response(data)


# Business rules driving the Project Health table below. Named constants
# (rather than inline literals) so they read as adjustable configuration -
# a real "configurable per tenant" version would move these into a settings
# row/admin screen; this keeps that door open without building the admin UI
# for it here.
PROJECT_HEALTH_RULES = {
    "critical_budget_ratio": 1.0,      # actual_cost / budget over this => Critical
    "at_risk_budget_ratio": 0.85,      # actual_cost / budget over this => At Risk
    "at_risk_days_to_deadline": 14,    # end_date within this many days...
    "at_risk_min_progress": 50,        # ...and completion % below this => At Risk
}

ACTIVE_PROJECT_STATUSES = [
    "planning", "development", "testing", "uat", "ready_for_deployment", "on_hold",
]


def _project_progress_pct(project):
    """% of this project's tasks marked completed. None when it has no tasks yet."""
    tasks = list(project.tasks.all())
    if not tasks:
        return None
    completed = sum(1 for t in tasks if t.status == "completed")
    return round(100 * completed / len(tasks))


def _project_health(budget_amount, actual_cost, progress_pct, end_date):
    """Returns (health, reason) per PROJECT_HEALTH_RULES above."""
    today = timezone.now().date()

    if budget_amount and budget_amount > 0:
        ratio = float(actual_cost) / float(budget_amount)
        if ratio > PROJECT_HEALTH_RULES["critical_budget_ratio"]:
            return "critical", "Budget exceeded"
        if ratio > PROJECT_HEALTH_RULES["at_risk_budget_ratio"]:
            return "at_risk", "Approaching budget limit"

    if end_date:
        days_left = (end_date - today).days
        if days_left < 0 and (progress_pct is None or progress_pct < 100):
            return "critical", "Past deadline"
        if (
            0 <= days_left <= PROJECT_HEALTH_RULES["at_risk_days_to_deadline"]
            and progress_pct is not None
            and progress_pct < PROJECT_HEALTH_RULES["at_risk_min_progress"]
        ):
            return "at_risk", "Deadline approaching with low progress"

    return "healthy", "On track"


class AdminDashboardOverviewAPIView(APIView):
    """
    Single consolidated payload for the redesigned Admin Dashboard's ERP-style
    sections (KPIs, budget control, project health, portfolio, receivables,
    resource utilisation, action center, recent activity) - one call instead
    of one per widget, per the "don't make one API call for every individual
    KPI" performance rule. Cached 90s, same pattern as
    DashboardOrgOverviewAPIView above. Admin/Manager/PM only.
    """

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.roles.filter(
            role_name__in=["Admin", "Manager", "Project Manager"]
        ).exists():
            return Response({"error": "Permission denied"}, status=403)

        cache_key = "admin_dashboard_overview"
        try:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            pass

        project_health_rows = self._project_health_table()

        data = {
            "kpis": self._kpis(),
            "portfolio": self._portfolio(),
            "project_health": project_health_rows,
            "budget_control": self._budget_control(),
            "receivables": self._receivables(),
            "resource_utilization": self._resource_utilization(),
            "action_center": self._action_center(project_health_rows),
            "recent_activity": self._recent_activity(),
            "freelancers": self._freelancer_stats(),
        }

        try:
            cache.set(cache_key, data, timeout=90)
        except Exception:
            pass

        return Response(data)

    # ---------------------------------------------------------------
    # KPI strip: Total Revenue / Total Cost / Gross Profit / Margin % /
    # Outstanding / Active Projects / Budget Utilization
    # ---------------------------------------------------------------
    def _kpis(self):
        active_project_count = Project.objects.filter(status__in=ACTIVE_PROJECT_STATUSES).count()

        total_budget = _money_sum(
            ProjectBudget.objects.filter(project__status__in=ACTIVE_PROJECT_STATUSES), "total_budget"
        )

        invoiced_qs = Invoice.objects.exclude(status="Cancelled")
        total_revenue = _money_sum(invoiced_qs, "total_amount")

        total_cost = _money_sum(OutgoingPayment.objects.all(), "amount") + _money_sum(
            Expense.objects.all(), "amount"
        )

        gross_profit = total_revenue - total_cost
        margin_percent = round(float(gross_profit / total_revenue * 100), 1) if total_revenue else None

        outstanding = _money_sum(invoiced_qs.exclude(status="Paid"), "balance_amount")

        # Utilisation scoped to active projects only, on the same "real
        # logged Expense spend" basis as the Budget Control section below.
        active_expense_spend = _money_sum(
            Expense.objects.filter(project__status__in=ACTIVE_PROJECT_STATUSES), "amount"
        )
        budget_utilization = (
            round(float(active_expense_spend / total_budget * 100), 1) if total_budget else None
        )

        return {
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "gross_profit": gross_profit,
            "margin_percent": margin_percent,
            "outstanding": outstanding,
            "active_projects": active_project_count,
            "budget_utilization": budget_utilization,
            "budget": total_budget,
            "actual_spend": active_expense_spend,
        }

    # ---------------------------------------------------------------
    # Project portfolio summary
    # ---------------------------------------------------------------
    def _portfolio(self):
        qs = Project.objects.all()
        return {
            "active": qs.filter(status__in=ACTIVE_PROJECT_STATUSES).count(),
            "fixed": qs.filter(engagement_type="fixed").count(),
            "time_and_material": qs.filter(engagement_type="time_and_material").count(),
            "internal": qs.filter(project_type="internal").count(),
            "delayed": qs.filter(
                status__in=ACTIVE_PROJECT_STATUSES, end_date__lt=timezone.now().date()
            ).count(),
            "completed": qs.filter(status="deployed").count(),
        }

    # ---------------------------------------------------------------
    # Freelancer stats (Business Partner enhancement, Section 20) - counts
    # only, no cost breakdown by individual freelancer and no PAN/bank data
    # anywhere near this payload.
    # ---------------------------------------------------------------
    def _freelancer_stats(self):
        qs = Freelancer.objects.filter(is_archived=False)
        now = timezone.now()

        freelancer_cost_this_month = _money_sum(
            Expense.objects.filter(
                freelancer__isnull=False,
                expense_date__year=now.year,
                expense_date__month=now.month,
            ),
            "amount",
        )

        return {
            "total": qs.count(),
            "active": qs.filter(status="active").count(),
            "available": qs.filter(availability="available").count(),
            "assigned": qs.filter(
                id__in=FreelancerProjectAssignment.objects.filter(status="active").values("freelancer_id")
            ).distinct().count(),
            "pending_onboarding": qs.filter(status="onboarding").count(),
            "cost_this_month": freelancer_cost_this_month,
        }

    # ---------------------------------------------------------------
    # Project health table (Section 8) - actual cost is real logged Expense
    # spend only (ProjectBudget.actual_expenses), not live labor cost, to
    # keep this a cheap per-project computation across a whole table.
    # ---------------------------------------------------------------
    def _project_health_table(self):
        projects = (
            Project.objects.select_related("client", "project_manager", "budget")
            .prefetch_related("tasks")
            .filter(status__in=ACTIVE_PROJECT_STATUSES)
            .order_by("-created_at")[:25]
        )

        rows = []
        for project in projects:
            budget_obj = getattr(project, "budget", None)
            budget_amount = (
                budget_obj.total_budget if budget_obj and budget_obj.total_budget else Decimal("0.00")
            )
            actual_cost = budget_obj.actual_expenses if budget_obj else Decimal("0.00")
            revenue = _money_sum(project.invoice_set.exclude(status="Cancelled"), "total_amount")
            margin = revenue - actual_cost
            progress = _project_progress_pct(project)
            health, reason = _project_health(budget_amount, actual_cost, progress, project.end_date)

            rows.append({
                "project_no": project.project_no,
                "project_name": project.project_name,
                "client_name": getattr(project.client, "company_name", None),
                "engagement_type": project.engagement_type,
                "manager_name": project.project_manager.get_full_name() if project.project_manager else None,
                "budget": budget_amount,
                "actual_cost": actual_cost,
                "revenue": revenue,
                "margin": margin,
                "progress": progress,
                "health": health,
                "health_reason": reason,
                "status": project.status,
            })
        return rows

    # ---------------------------------------------------------------
    # Budget Control Center - same GL-account rollup as
    # Project.BudgetLineSummaryAPIView, reused here for the dashboard.
    # ---------------------------------------------------------------
    def _budget_control(self):
        lines = BudgetLine.objects.select_related("gl_account").all()
        by_account = {}
        for line in lines:
            acc = line.gl_account
            entry = by_account.setdefault(acc.id, {
                "gl_account": acc.id,
                "gl_account_code": acc.code,
                "gl_account_name": acc.name,
                "planned_amount": Decimal("0.00"),
                "actual_amount": Decimal("0.00"),
            })
            entry["planned_amount"] += line.planned_amount or Decimal("0.00")
            entry["actual_amount"] += line.actual_amount

        results = []
        for entry in by_account.values():
            entry["variance"] = entry["planned_amount"] - entry["actual_amount"]
            results.append(entry)
        results.sort(key=lambda r: r["gl_account_code"])
        return results

    # ---------------------------------------------------------------
    # Accounts Receivable
    # ---------------------------------------------------------------
    def _receivables(self):
        today = timezone.now().date()
        week_end = today + timezone.timedelta(days=7)
        month_start = today.replace(day=1)

        open_invoices = Invoice.objects.exclude(status__in=["Paid", "Cancelled"]).select_related("client")

        total_outstanding = _money_sum(open_invoices, "balance_amount")
        due_this_week = _money_sum(
            open_invoices.filter(due_date__gte=today, due_date__lte=week_end), "balance_amount"
        )
        overdue = _money_sum(open_invoices.filter(due_date__lt=today), "balance_amount")
        paid_this_month = _money_sum(
            InvoicePayment.objects.filter(payment_date__gte=month_start), "amount"
        )

        invoice_rows = [
            {
                "id": inv.id,
                "invoice_no": inv.invoice_no,
                "client_name": getattr(inv.client, "company_name", None),
                "issue_date": inv.issue_date,
                "due_date": inv.due_date,
                "amount": inv.total_amount,
                "outstanding": inv.balance_amount,
                "status": inv.status,
            }
            for inv in open_invoices.order_by("due_date")[:15]
        ]

        return {
            "summary": {
                "total_outstanding": total_outstanding,
                "due_this_week": due_this_week,
                "overdue": overdue,
                "paid_this_month": paid_this_month,
            },
            "invoices": invoice_rows,
        }

    # ---------------------------------------------------------------
    # Resource utilisation - employees only for now (consumed/allocated
    # Task hours); T&M ResourceAssignment coverage can be added the same
    # way once needed.
    # ---------------------------------------------------------------
    def _resource_utilization(self):
        results = []
        employees = Account.objects.filter(assigned_tasks__isnull=False).distinct()[:15]
        for emp in employees:
            tasks = emp.assigned_tasks.all()
            allocated = sum((t.allocated_hours or Decimal("0")) for t in tasks)
            if allocated <= 0:
                continue
            consumed = sum((t.consumed_hours or Decimal("0")) for t in tasks)
            pct = min(100, round(float(consumed / allocated * 100)))
            results.append({
                "name": emp.get_full_name() or emp.username,
                "allocation_percent": pct,
            })
        results.sort(key=lambda r: -r["allocation_percent"])
        return results[:8]

    # ---------------------------------------------------------------
    # Action Center - "needs attention" counts, each with somewhere to go.
    # ---------------------------------------------------------------
    def _action_center(self, project_health_rows):
        items = []

        overdue_count = Invoice.objects.filter(status="Overdue").count()
        if overdue_count:
            items.append({
                "type": "invoices_overdue",
                "label": f"{overdue_count} invoice{'s' if overdue_count != 1 else ''} overdue",
                "count": overdue_count,
                "link": "/reports",
            })

        over_budget_count = sum(
            1 for line in BudgetLine.objects.select_related("gl_account").all()
            if line.is_over_budget
        )
        if over_budget_count:
            items.append({
                "type": "budgets_exceeded",
                "label": f"{over_budget_count} budget line{'s' if over_budget_count != 1 else ''} over budget",
                "count": over_budget_count,
                "link": "/projects",
            })

        # Freelancers have no formal approval gate like vendors do - "onboarding"
        # status is the closest proxy for "needs someone's attention".
        pending_freelancers = Freelancer.objects.filter(status="onboarding").count()
        if pending_freelancers:
            items.append({
                "type": "freelancer_approvals",
                "label": f"{pending_freelancers} freelancer{'s' if pending_freelancers != 1 else ''} in onboarding",
                "count": pending_freelancers,
                "link": "/contacts",
            })

        pending_vendors = Vendor.objects.filter(
            status__in=["submitted", "resubmitted", "approval_in_progress"]
        ).count()
        if pending_vendors:
            items.append({
                "type": "vendor_approvals",
                "label": f"{pending_vendors} vendor approval{'s' if pending_vendors != 1 else ''} pending",
                "count": pending_vendors,
                "link": "/vendors/approvals",
            })

        at_risk_count = sum(1 for row in project_health_rows if row["health"] in ("at_risk", "critical"))
        if at_risk_count:
            items.append({
                "type": "projects_at_risk",
                "label": f"{at_risk_count} project{'s' if at_risk_count != 1 else ''} at risk or critical",
                "count": at_risk_count,
                "link": "/projects",
            })

        return items

    # ---------------------------------------------------------------
    # Recent Activity - a lightweight feed built from existing timestamped
    # records (Invoice/Expense/Task), not a full audit-log system.
    # ---------------------------------------------------------------
    def _recent_activity(self):
        events = []

        for inv in Invoice.objects.select_related("created_by").order_by("-created_at")[:5]:
            events.append({
                "user": inv.created_by.get_full_name() if inv.created_by else "System",
                "action": "created invoice",
                "object": inv.invoice_no,
                "time": inv.created_at,
                "link": f"/reports",
            })
        for exp in Expense.objects.select_related("created_by").order_by("-created_at")[:5]:
            events.append({
                "user": exp.created_by.get_full_name() if exp.created_by else "System",
                "action": "logged expense",
                "object": exp.expense_no,
                "time": exp.created_at,
                "link": None,
            })
        for task in Task.objects.select_related("created_by").order_by("-created_at")[:5]:
            events.append({
                "user": task.created_by.get_full_name() if task.created_by else "System",
                "action": "created task",
                "object": task.title,
                "time": task.created_at,
                "link": "/task-management",
            })

        events.sort(key=lambda e: e["time"], reverse=True)
        return events[:12]


class FinanceOverviewAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]    

    def get(self, request):
        section = request.query_params.get("section", "all")

        filters = {
            "from_date": request.query_params.get("date_from"),
            "to_date": request.query_params.get("date_to"),
            "client": request.query_params.get("client"),
            "project": request.query_params.get("project"),
        }

        if section == "all":
            data = get_all_tab_data(filters)

        elif section == "financial_reports":
            data = get_financial_tab_data(filters)

        elif section == "project_reports":
            data = get_project_tab_data(filters)

        elif section == "payment_reports":
            data = get_payment_tab_data(filters)

        elif section == "po_invoice_reports":
            data = get_po_invoice_tab_data(filters)

        else:
            return Response(
                {"error": "Invalid section"},
                status=400
            )

        return Response(data)   
    

from Reports.services import generate_financial_excel
from Project.models import Project
from django.http import HttpResponse
from finances.models import Invoice, Expense

class FinancialReportExport(APIView):
    """
    Export financial report as Excel
    Filters:
    - project_id (required)
    - date_from (YYYY-MM-DD)
    - date_to (YYYY-MM-DD)
    - status (optional: PAID / PENDING)
    """

    def get(self, request):
        project_id = request.GET.get("project_id")
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")
        status = request.GET.get("status")

        if not project_id or not date_from or not date_to:
            return HttpResponse(
                "project_id, date_from, date_to are required",
                status=400
            )

        project = Project.objects.get(id=project_id)

        invoices = Invoice.objects.filter(
            project=project,
            created_at__date__range=[date_from, date_to]
        )

        if status:
            invoices = invoices.filter(status=status)

        expenses = Expense.objects.filter(
            project=project,
            created_at__date__range=[date_from, date_to]
        )

        wb = generate_financial_excel(
            project=project,
            invoices=invoices,
            expenses=expenses,
            date_from=date_from,
            date_to=date_to
        )

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="financial_report_project_{project.id}.xlsx"'
        )

        wb.save(response)
        return response

from django.http import HttpResponse
from .export_utils import generate_excel_from_data, generate_pdf_from_data
from .services import get_all_tab_data, get_financial_tab_data, get_project_tab_data, get_payment_tab_data, get_po_invoice_tab_data

class ReportExportAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request, section):
        print(f"ReportExportAPIView HIT! section={section}")
        filters = {
            "from_date": request.query_params.get("date_from"),
            "to_date": request.query_params.get("date_to"),
            "status": request.query_params.get("status"),
        }
        fmt = request.query_params.get("export_format", "excel")

        if section == "all":
            data_res = get_all_tab_data(filters)
        elif section == "financial":
            data_res = get_financial_tab_data(filters)
        elif section == "project":
            data_res = get_project_tab_data(filters)
        elif section == "payment":
            data_res = get_payment_tab_data(filters)
        elif section == "po-invoice":
            data_res = get_po_invoice_tab_data(filters)
        else:
            return Response({"error": "Invalid section"}, status=400)

        if fmt == "pdf":
            output = generate_pdf_from_data(data_res, section)
            response = HttpResponse(output, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="report_{section}.pdf"'
        else:
            output = generate_excel_from_data(data_res, section)
            response = HttpResponse(output, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename="report_{section}.xlsx"'

        return response