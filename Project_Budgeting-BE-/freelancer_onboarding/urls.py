from django.urls import path

from . import views

urlpatterns = [
    path("choices/", views.FreelancerChoicesView.as_view(), name="freelancer-onboarding-choices"),

    path("freelancers/", views.FreelancerListCreateView.as_view(), name="freelancer-onboarding-list-create"),
    path("freelancers/invite/", views.FreelancerInviteView.as_view(), name="freelancer-onboarding-invite"),
    path("freelancers/<int:pk>/", views.FreelancerDetailView.as_view(), name="freelancer-onboarding-detail"),
    path("freelancers/<int:pk>/resend-invite/", views.FreelancerResendInviteView.as_view(), name="freelancer-onboarding-resend-invite"),

    path("freelancers/<int:pk>/documents/", views.FreelancerDocumentListView.as_view(), name="freelancer-onboarding-documents"),
    path("freelancers/<int:pk>/documents/<int:doc_id>/", views.FreelancerDocumentDetailView.as_view(), name="freelancer-onboarding-document-detail"),
    path("freelancers/<int:pk>/documents/<int:doc_id>/download/", views.FreelancerDocumentDownloadView.as_view(), name="freelancer-onboarding-document-download"),

    # --- Developer email template preview (DEBUG only, see views.freelancer_email_preview) ---
    path("emails/preview/", views.freelancer_email_preview, name="freelancer-onboarding-email-preview-index"),
    path("emails/preview/<str:template_key>/", views.freelancer_email_preview, name="freelancer-onboarding-email-preview"),

    # --- Public, token-authenticated self-service portal (no login) ---
    path("public/choices/", views.FreelancerPublicChoicesView.as_view(), name="freelancer-onboarding-public-choices"),
    path("public/<str:token>/", views.FreelancerPublicDetailView.as_view(), name="freelancer-onboarding-public-detail"),
    path("public/<str:token>/update/", views.FreelancerPublicUpdateView.as_view(), name="freelancer-onboarding-public-update"),
    path("public/<str:token>/documents/", views.FreelancerPublicDocumentListView.as_view(), name="freelancer-onboarding-public-documents"),
    path("public/<str:token>/documents/<int:doc_id>/", views.FreelancerPublicDocumentDetailView.as_view(), name="freelancer-onboarding-public-document-detail"),
    path("public/<str:token>/documents/<int:doc_id>/download/", views.FreelancerPublicDocumentDownloadView.as_view(), name="freelancer-onboarding-public-document-download"),
    path("public/<str:token>/submit/", views.FreelancerPublicSubmitView.as_view(), name="freelancer-onboarding-public-submit"),
]
