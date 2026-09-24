from django.urls import path
from .views import (
    CompanyListCreateAPIView,
    ClientDropdownAPIView,
    CompanyDetailAPIView,
    CompanyTagListCreateAPIView,
    CompanyTagDetailAPIView,
    PointOfContactListCreateAPIView,
    PointOfContactDetailAPIView,
    CompanyPOCListView,
    # AllPOCsWithCompanyAPIView,
    CountryCodeAPIView,
    ClientDocumentListCreateView,
    ClientDocumentDetailView,
    ClientDocumentDownloadView,
    ClientDocumentVerifyView,
    ClientAuditLogListView,
    ClientChangeRequestListCreateView,
    ClientChangeRequestResolveView,
    ClientSubmitForApprovalView,
)

urlpatterns = [
    # companies
    path("client/", CompanyListCreateAPIView.as_view(), name="company-list-create"),
    path("client/dropdown/", ClientDropdownAPIView.as_view(), name="client-dropdown"),
    path("client/<int:pk>/", CompanyDetailAPIView.as_view(), name="company-detail"),
    path("country-codes/", CountryCodeAPIView.as_view(), name="country-codes"),


    # company tags
    path("company-tags/", CompanyTagListCreateAPIView.as_view(), name="companytag-list-create"),
    path("company-tags/<int:pk>/", CompanyTagDetailAPIView.as_view(), name="companytag-detail"),

    path("pocs/", PointOfContactListCreateAPIView.as_view(), name="poc-list-create"),
    path("pocs/<int:pk>/", PointOfContactDetailAPIView.as_view(), name="poc-detail"),

    # URL for getting POCs by company or all companies (company_id is optional)
    path("client/pocs/", CompanyPOCListView.as_view(), name="all-company-poc-list"),
    path("client/<int:company_id>/pocs/", CompanyPOCListView.as_view(), name="company-poc-list"),

    # KYC documents
    path("client/<int:pk>/documents/", ClientDocumentListCreateView.as_view(), name="client-document-list-create"),
    path("client/<int:pk>/documents/<int:doc_id>/", ClientDocumentDetailView.as_view(), name="client-document-detail"),
    path("client/<int:pk>/documents/<int:doc_id>/download/", ClientDocumentDownloadView.as_view(), name="client-document-download"),
    path("client/<int:pk>/documents/<int:doc_id>/verify/", ClientDocumentVerifyView.as_view(), name="client-document-verify"),

    # audit trail
    path("client/<int:pk>/audit-logs/", ClientAuditLogListView.as_view(), name="client-audit-log-list"),

    # change requests + final approval
    path("client/<int:pk>/change-requests/", ClientChangeRequestListCreateView.as_view(), name="client-change-request-list-create"),
    path("client/<int:pk>/change-requests/<int:cr_id>/resolve/", ClientChangeRequestResolveView.as_view(), name="client-change-request-resolve"),
    path("client/<int:pk>/submit-for-approval/", ClientSubmitForApprovalView.as_view(), name="client-submit-for-approval"),
]
