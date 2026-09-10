from django.urls import path

from . import views

urlpatterns = [
    path("choices/", views.FreelancerChoicesView.as_view(), name="freelancer-onboarding-choices"),

    path("freelancers/", views.FreelancerListCreateView.as_view(), name="freelancer-onboarding-list-create"),
    path("freelancers/invite/", views.FreelancerInviteView.as_view(), name="freelancer-onboarding-invite"),
    path("freelancers/<int:pk>/", views.FreelancerDetailView.as_view(), name="freelancer-onboarding-detail"),
    path("freelancers/<int:pk>/resend-invite/", views.FreelancerResendInviteView.as_view(), name="freelancer-onboarding-resend-invite"),
    path("freelancers/<int:pk>/archive/", views.FreelancerArchiveView.as_view(), name="freelancer-onboarding-archive"),
    path("freelancers/<int:pk>/unarchive/", views.FreelancerUnarchiveView.as_view(), name="freelancer-onboarding-unarchive"),

    path("freelancers/<int:pk>/documents/", views.FreelancerDocumentListView.as_view(), name="freelancer-onboarding-documents"),
    path("freelancers/<int:pk>/documents/<int:doc_id>/", views.FreelancerDocumentDetailView.as_view(), name="freelancer-onboarding-document-detail"),
    path("freelancers/<int:pk>/documents/<int:doc_id>/download/", views.FreelancerDocumentDownloadView.as_view(), name="freelancer-onboarding-document-download"),

    # --- Rate Card / Contract / Project Assignment (Phase 1 of Freelancer Management) ---
    path("freelancers/<int:pk>/rate-cards/", views.FreelancerRateCardListCreateView.as_view(), name="freelancer-rate-card-list-create"),
    path("freelancers/<int:pk>/rate-cards/<int:rate_id>/", views.FreelancerRateCardDetailView.as_view(), name="freelancer-rate-card-detail"),
    path("freelancers/<int:pk>/contracts/", views.FreelancerContractListCreateView.as_view(), name="freelancer-contract-list-create"),
    path("freelancers/<int:pk>/contracts/<int:contract_id>/", views.FreelancerContractDetailView.as_view(), name="freelancer-contract-detail"),
    path("freelancers/<int:pk>/capacity-check/", views.FreelancerCapacityCheckView.as_view(), name="freelancer-capacity-check"),
    path("assignments/", views.FreelancerProjectAssignmentListCreateView.as_view(), name="freelancer-assignment-list-create"),
    path("assignments/<int:pk>/", views.FreelancerProjectAssignmentDetailView.as_view(), name="freelancer-assignment-detail"),

    # --- Task Assignment / Time Tracking (Phase 2 of Freelancer Management) ---
    path("task-assignments/", views.FreelancerTaskAssignmentListCreateView.as_view(), name="freelancer-task-assignment-list-create"),
    path("task-assignments/<int:pk>/", views.FreelancerTaskAssignmentDetailView.as_view(), name="freelancer-task-assignment-detail"),
    path("time-entries/", views.FreelancerTimeEntryListCreateView.as_view(), name="freelancer-time-entry-list-create"),
    path("time-entries/<int:pk>/", views.FreelancerTimeEntryDetailView.as_view(), name="freelancer-time-entry-detail"),
    path("time-entries/<int:pk>/submit/", views.FreelancerTimeEntrySubmitView.as_view(), name="freelancer-time-entry-submit"),
    path("time-entries/<int:pk>/approve/", views.FreelancerTimeEntryApproveView.as_view(), name="freelancer-time-entry-approve"),
    path("time-entries/<int:pk>/reject/", views.FreelancerTimeEntryRejectView.as_view(), name="freelancer-time-entry-reject"),

    # --- Bank / KYC details (Phase 3 of Freelancer Management) ---
    path("freelancers/<int:pk>/bank-detail/", views.FreelancerBankDetailView.as_view(), name="freelancer-bank-detail"),
    path("freelancers/<int:pk>/bank-detail/unmasked/", views.FreelancerBankDetailUnmaskedView.as_view(), name="freelancer-bank-detail-unmasked"),

    # --- Developer email template preview (DEBUG only, see views.freelancer_email_preview) ---
    path("emails/preview/", views.freelancer_email_preview, name="freelancer-onboarding-email-preview-index"),
    path("emails/preview/<str:template_key>/", views.freelancer_email_preview, name="freelancer-onboarding-email-preview"),

    # --- Public, token-authenticated self-service portal (no login) ---
    path("public/choices/", views.FreelancerPublicChoicesView.as_view(), name="freelancer-onboarding-public-choices"),
    path("public/<str:token>/", views.FreelancerPublicDetailView.as_view(), name="freelancer-onboarding-public-detail"),
    path("public/<str:token>/update/", views.FreelancerPublicUpdateView.as_view(), name="freelancer-onboarding-public-update"),
    path("public/<str:token>/bank-detail/", views.FreelancerPublicBankDetailView.as_view(), name="freelancer-onboarding-public-bank-detail"),
    path("public/<str:token>/documents/", views.FreelancerPublicDocumentListView.as_view(), name="freelancer-onboarding-public-documents"),
    path("public/<str:token>/documents/<int:doc_id>/", views.FreelancerPublicDocumentDetailView.as_view(), name="freelancer-onboarding-public-document-detail"),
    path("public/<str:token>/documents/<int:doc_id>/download/", views.FreelancerPublicDocumentDownloadView.as_view(), name="freelancer-onboarding-public-document-download"),
    path("public/<str:token>/submit/", views.FreelancerPublicSubmitView.as_view(), name="freelancer-onboarding-public-submit"),
]
