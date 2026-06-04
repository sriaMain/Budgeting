from django.urls import path
from .views import DashboardMetricsAPIView, FinanceOverviewAPIView, ReportExportAPIView

urlpatterns = [
    path("dashboard/metrics/",DashboardMetricsAPIView.as_view(),name="dashboard-metrics"),
    path("finance/overview/",FinanceOverviewAPIView.as_view(),name="all-tab-data"),
    path("reports/<str:section>/export/",ReportExportAPIView.as_view(),name="report-export"),
]
# GET /api/finance/overview/?section=all
# GET /api/finance/overview/?section=financial_reports
# GET /api/finance/overview/?section=project_reports
# GET /api/finance/overview/?section=payment_reports
# GET /api/finance/overview/?section=po_invoice_reports