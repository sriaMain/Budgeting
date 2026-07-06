from decimal import Decimal

from django.db.models import Sum, DecimalField
from django.db.models.functions import Coalesce
from django.core.cache import cache

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from Project.models import ProjectBudget
from finances.models import Invoice, InvoicePayment, OutgoingPayment, ExpensePayment

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


from django.db.models import Case, When, F

class DashboardMetricsAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 🔹 Cache (60 seconds) - User specific to prevent data leakage
        cache_key = f"dashboard_metrics:{request.user.id}"
        try:
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data)
        except Exception:
            cached_data = None

        # 1️⃣ Budget → ProjectBudget.total_budget (only active projects, with fallback to quote total)
        total_budget_qs = ProjectBudget.objects.filter(
            project__status__in=[
                "planning",
                "development",
                "testing",
                "uat",
                "ready_for_deployment",
                "deployed",
            ]
        )
        is_admin_or_manager = request.user.is_superuser or request.user.roles.filter(role_name__in=["Admin", "Manager", "Project Manager"]).exists()
        if not is_admin_or_manager:
            total_budget_qs = total_budget_qs.filter(project__project_manager=request.user)

        budget_aggregate = total_budget_qs.annotate(
            resolved_budget=Case(
                When(total_budget__isnull=False, then=F("total_budget")),
                When(project__created_from_quotation__total_amount__isnull=False, then=F("project__created_from_quotation__total_amount")),
                default=Decimal("0.00")
            )
        ).aggregate(
            total_budget=Coalesce(
                Sum("resolved_budget"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            )
        )
        total_budget = budget_aggregate["total_budget"]

        total_forecasted_profit = Decimal("0.00")
        for pb in total_budget_qs:
            val = pb.forecasted_profit
            if val is not None:
                total_forecasted_profit += val

        # 2️⃣ Invoiced → Invoice.total_amount (valid business statuses)
        invoiced_qs = Invoice.objects.filter(
            status__in=["Issued", "Partially Paid", "Paid", "Overdue"]
        )
        if not is_admin_or_manager:
            invoiced_qs = invoiced_qs.filter(project__project_manager=request.user)

        total_invoiced = invoiced_qs.aggregate(
            total=Coalesce(
                Sum("total_amount"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            )
        )["total"]

        # 3️⃣ Received → InvoicePayment.amount
        received_qs = InvoicePayment.objects.all()
        if not is_admin_or_manager:
            received_qs = received_qs.filter(invoice__project__project_manager=request.user)

        total_received = received_qs.aggregate(
            total=Coalesce(
                Sum("amount"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            )
        )["total"]

        # 4️⃣ Expenses → OutgoingPayment.amount + ExpensePayment.amount
        expenses_qs = OutgoingPayment.objects.all()
        expense_payments_qs = ExpensePayment.objects.all()
        if not is_admin_or_manager:
            expenses_qs = expenses_qs.filter(vendor_bill__purchase_order__project__project_manager=request.user)
            expense_payments_qs = expense_payments_qs.filter(expense__project__project_manager=request.user)

        total_outgoing = expenses_qs.aggregate(
            total=Coalesce(
                Sum("amount"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            )
        )["total"]

        total_expense_pmts = expense_payments_qs.aggregate(
            total=Coalesce(
                Sum("amount"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            )
        )["total"]

        total_expenses = total_outgoing + total_expense_pmts

        # 5️⃣ Profit → Received - Expenses
        profit = (total_received or Decimal("0.00")) - (total_expenses or Decimal("0.00"))

        data = {
            "budget": {
                "value": total_budget,
                "change": 0,
            },
            "invoiced": {
                "value": total_invoiced,
                "change": 0,
            },
            "received": {
                "value": total_received,
                "change": 0,
            },
            "expenses": {
                "value": total_expenses,
                "change": 0,
            },
            "profit": {
                "value": profit,
                "change": 0,
            },
            "forecasted_profit": {
                "value": total_forecasted_profit,
                "change": 0,
            },
        }

        serializer = DashboardMetricsSerializer(data)
        try:
            cache.set(cache_key, serializer.data, timeout=60)
        except Exception:
            pass

        return Response(serializer.data)



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
            "user": request.user,
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
            "user": request.user,
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
