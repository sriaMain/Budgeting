from django.urls import path

from . import views

urlpatterns = [
    path("choices/", views.VendorOnboardingChoicesView.as_view(), name="vendor-onboarding-choices"),
    path("summary/", views.VendorRequestSummaryView.as_view(), name="vendor-onboarding-summary"),

    path("vendors/", views.VendorOnboardingListCreateView.as_view(), name="vendor-onboarding-list-create"),
    path("vendors/raise/", views.VendorRaiseRequestView.as_view(), name="vendor-onboarding-raise"),
    path("vendors/<int:pk>/", views.VendorOnboardingDetailView.as_view(), name="vendor-onboarding-detail"),
    path("vendors/<int:pk>/resend-invite/", views.VendorResendInviteView.as_view(), name="vendor-onboarding-resend-invite"),
    path("vendors/<int:pk>/archive/", views.VendorArchiveView.as_view(), name="vendor-onboarding-archive"),
    path("vendors/<int:pk>/unarchive/", views.VendorUnarchiveView.as_view(), name="vendor-onboarding-unarchive"),

    path("vendors/<int:pk>/profile/", views.VendorProfileStepView.as_view(), name="vendor-onboarding-profile"),
    path("vendors/<int:pk>/kyc/", views.VendorKYCStepView.as_view(), name="vendor-onboarding-kyc"),
    path("vendors/<int:pk>/bank-detail/", views.VendorBankDetailStepView.as_view(), name="vendor-onboarding-bank-detail"),
    path("vendors/<int:pk>/bank-detail/unmasked/", views.VendorBankDetailUnmaskedView.as_view(), name="vendor-onboarding-bank-detail-unmasked"),
    path("vendors/<int:pk>/procurement-detail/", views.VendorProcurementStepView.as_view(), name="vendor-onboarding-procurement-detail"),

    path("vendors/<int:pk>/documents/", views.VendorDocumentListView.as_view(), name="vendor-onboarding-documents"),
    path("vendors/<int:pk>/documents/<int:doc_id>/", views.VendorDocumentDetailView.as_view(), name="vendor-onboarding-document-detail"),
    path("vendors/<int:pk>/documents/<int:doc_id>/download/", views.VendorDocumentDownloadView.as_view(), name="vendor-onboarding-document-download"),

    path("vendors/<int:pk>/submit/", views.VendorSubmitForApprovalView.as_view(), name="vendor-onboarding-submit"),
    path("vendors/<int:pk>/approve/", views.VendorApproveView.as_view(), name="vendor-onboarding-approve"),
    path("vendors/<int:pk>/request-changes/", views.VendorRequestChangesView.as_view(), name="vendor-onboarding-request-changes"),
    path("vendors/<int:pk>/approval-history/", views.VendorApprovalHistoryView.as_view(), name="vendor-onboarding-approval-history"),
    path("vendors/<int:pk>/versions/", views.VendorSubmissionVersionListView.as_view(), name="vendor-onboarding-versions"),

    path("approvals/queue/", views.VendorApprovalQueueView.as_view(), name="vendor-onboarding-approval-queue"),

    path("approval-config/", views.VendorApprovalConfigListCreateView.as_view(), name="vendor-approval-config-list-create"),
    path("approval-config/resolve/", views.VendorApprovalConfigResolveView.as_view(), name="vendor-approval-config-resolve"),
    path("approval-config/<int:pk>/", views.VendorApprovalConfigDetailView.as_view(), name="vendor-approval-config-detail"),
    path("approval-config/<int:config_id>/levels/", views.VendorApprovalLevelListCreateView.as_view(), name="vendor-approval-level-list-create"),
    path("approval-config/<int:config_id>/levels/<int:level_id>/", views.VendorApprovalLevelDetailView.as_view(), name="vendor-approval-level-detail"),

    # --- Developer email template preview (DEBUG only, see views.vendor_email_preview) ---
    path("emails/preview/", views.vendor_email_preview, name="vendor-onboarding-email-preview-index"),
    path("emails/preview/<str:template_key>/", views.vendor_email_preview, name="vendor-onboarding-email-preview"),

    # --- Public, token-authenticated self-service portal (no login) ---
    path("public/choices/", views.VendorPublicChoicesView.as_view(), name="vendor-onboarding-public-choices"),
    path("public/<str:token>/", views.VendorPublicDetailView.as_view(), name="vendor-onboarding-public-detail"),
    path("public/<str:token>/identity/", views.VendorPublicIdentityView.as_view(), name="vendor-onboarding-public-identity"),
    path("public/<str:token>/profile/", views.VendorPublicProfileStepView.as_view(), name="vendor-onboarding-public-profile"),
    path("public/<str:token>/kyc/", views.VendorPublicKYCStepView.as_view(), name="vendor-onboarding-public-kyc"),
    path("public/<str:token>/bank-detail/", views.VendorPublicBankDetailStepView.as_view(), name="vendor-onboarding-public-bank-detail"),
    path("public/<str:token>/procurement-detail/", views.VendorPublicProcurementStepView.as_view(), name="vendor-onboarding-public-procurement-detail"),
    path("public/<str:token>/documents/", views.VendorPublicDocumentListView.as_view(), name="vendor-onboarding-public-documents"),
    path("public/<str:token>/documents/<int:doc_id>/", views.VendorPublicDocumentDetailView.as_view(), name="vendor-onboarding-public-document-detail"),
    path("public/<str:token>/documents/<int:doc_id>/download/", views.VendorPublicDocumentDownloadView.as_view(), name="vendor-onboarding-public-document-download"),
    path("public/<str:token>/submit/", views.VendorPublicSubmitView.as_view(), name="vendor-onboarding-public-submit"),
]
