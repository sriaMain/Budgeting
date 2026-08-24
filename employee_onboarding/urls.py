from django.urls import path

from . import views

urlpatterns = [
    path("choices/", views.EmployeeOnboardingChoicesView.as_view(), name="employee-onboarding-choices"),

    path("employees/", views.EmployeeOnboardingListView.as_view(), name="employee-onboarding-list"),
    path("employees/<int:account_id>/invite/", views.EmployeeSendInviteView.as_view(), name="employee-onboarding-invite"),
    path("employees/<int:account_id>/", views.EmployeeOnboardingDetailView.as_view(), name="employee-onboarding-detail"),

    path("employees/<int:account_id>/personal/", views.EmployeePersonalStepView.as_view(), name="employee-onboarding-personal"),
    path("employees/<int:account_id>/address/", views.EmployeeAddressStepView.as_view(), name="employee-onboarding-address"),
    path("employees/<int:account_id>/statutory/", views.EmployeeStatutoryStepView.as_view(), name="employee-onboarding-statutory"),
    path("employees/<int:account_id>/bank-detail/", views.EmployeeBankDetailStepView.as_view(), name="employee-onboarding-bank-detail"),
    path("employees/<int:account_id>/emergency-contact/", views.EmployeeEmergencyContactStepView.as_view(), name="employee-onboarding-emergency-contact"),

    path("employees/<int:account_id>/documents/", views.EmployeeDocumentListView.as_view(), name="employee-onboarding-documents"),
    path("employees/<int:account_id>/documents/<int:doc_id>/", views.EmployeeDocumentDetailView.as_view(), name="employee-onboarding-document-detail"),
    path("employees/<int:account_id>/documents/<int:doc_id>/download/", views.EmployeeDocumentDownloadView.as_view(), name="employee-onboarding-document-download"),

    path("employees/<int:account_id>/submit/", views.EmployeeSubmitView.as_view(), name="employee-onboarding-submit"),
    path("employees/<int:account_id>/approve/", views.EmployeeApproveView.as_view(), name="employee-onboarding-approve"),
    path("employees/<int:account_id>/request-changes/", views.EmployeeRequestChangesView.as_view(), name="employee-onboarding-request-changes"),
    path("employees/<int:account_id>/history/", views.EmployeeOnboardingHistoryView.as_view(), name="employee-onboarding-history"),
    path("employees/<int:account_id>/versions/", views.EmployeeSubmissionVersionListView.as_view(), name="employee-onboarding-versions"),

    # --- Developer email template preview (DEBUG only, see views.employee_email_preview) ---
    path("emails/preview/", views.employee_email_preview, name="employee-onboarding-email-preview-index"),
    path("emails/preview/<str:template_key>/", views.employee_email_preview, name="employee-onboarding-email-preview"),

    # --- Public, token-authenticated self-service portal (no login) ---
    path("public/choices/", views.EmployeePublicChoicesView.as_view(), name="employee-onboarding-public-choices"),
    path("public/<str:token>/", views.EmployeePublicDetailView.as_view(), name="employee-onboarding-public-detail"),
    path("public/<str:token>/identity/", views.EmployeePublicIdentityView.as_view(), name="employee-onboarding-public-identity"),
    path("public/<str:token>/personal/", views.EmployeePublicPersonalStepView.as_view(), name="employee-onboarding-public-personal"),
    path("public/<str:token>/address/", views.EmployeePublicAddressStepView.as_view(), name="employee-onboarding-public-address"),
    path("public/<str:token>/statutory/", views.EmployeePublicStatutoryStepView.as_view(), name="employee-onboarding-public-statutory"),
    path("public/<str:token>/bank-detail/", views.EmployeePublicBankDetailStepView.as_view(), name="employee-onboarding-public-bank-detail"),
    path("public/<str:token>/emergency-contact/", views.EmployeePublicEmergencyContactStepView.as_view(), name="employee-onboarding-public-emergency-contact"),
    path("public/<str:token>/documents/", views.EmployeePublicDocumentListView.as_view(), name="employee-onboarding-public-documents"),
    path("public/<str:token>/documents/<int:doc_id>/", views.EmployeePublicDocumentDetailView.as_view(), name="employee-onboarding-public-document-detail"),
    path("public/<str:token>/documents/<int:doc_id>/download/", views.EmployeePublicDocumentDownloadView.as_view(), name="employee-onboarding-public-document-download"),
    path("public/<str:token>/submit/", views.EmployeePublicSubmitView.as_view(), name="employee-onboarding-public-submit"),
]
