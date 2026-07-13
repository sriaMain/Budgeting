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

from Project.models import Project, ProjectBudget
from finances.models import Invoice, InvoicePayment, OutgoingPayment, Expense

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



class FinanceOverviewAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]    

    def get(self, request):
        section = request.query_params.get("section", "all")

        filters = {
            "from_date": request.query_params.get("from_date"),
            "to_date": request.query_params.get("to_date"),
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