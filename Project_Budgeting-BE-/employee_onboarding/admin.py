from django.contrib import admin

from .models import (
    EmployeeOnboardingRequest, EmployeeAccessToken, EmployeeAccessLog,
    EmployeePersonalDetail, EmployeeAddressDetail, EmployeeStatutoryDetail,
    EmployeeBankDetail, EmployeeEmergencyContact, EmployeeDocument,
    EmployeeChangeRequest, EmployeeSubmissionVersion, EmployeeOnboardingHistory,
)


@admin.register(EmployeeOnboardingRequest)
class EmployeeOnboardingRequestAdmin(admin.ModelAdmin):
    list_display = ("employee_code", "account", "department", "designation", "status", "created_at")
    list_filter = ("status", "employment_type", "pf_applicable")
    search_fields = ("employee_code", "account__first_name", "account__last_name", "account__email")


@admin.register(EmployeeAccessToken)
class EmployeeAccessTokenAdmin(admin.ModelAdmin):
    list_display = ("request", "is_active", "expires_at", "last_used_at", "created_at")
    list_filter = ("is_active",)
    readonly_fields = ("token", "created_at")


@admin.register(EmployeeAccessLog)
class EmployeeAccessLogAdmin(admin.ModelAdmin):
    list_display = ("request", "ip_address", "accessed_at")
    readonly_fields = ("request", "token", "ip_address", "user_agent", "accessed_at")


@admin.register(EmployeePersonalDetail)
class EmployeePersonalDetailAdmin(admin.ModelAdmin):
    list_display = ("request", "personal_email", "mobile_number", "gender")


@admin.register(EmployeeAddressDetail)
class EmployeeAddressDetailAdmin(admin.ModelAdmin):
    list_display = ("request", "city", "state", "country", "pin_code")


@admin.register(EmployeeStatutoryDetail)
class EmployeeStatutoryDetailAdmin(admin.ModelAdmin):
    list_display = ("request", "pan", "aadhaar_number", "uan_number")


@admin.register(EmployeeBankDetail)
class EmployeeBankDetailAdmin(admin.ModelAdmin):
    list_display = ("request", "bank_name", "ifsc_code")


@admin.register(EmployeeEmergencyContact)
class EmployeeEmergencyContactAdmin(admin.ModelAdmin):
    list_display = ("request", "contact_name", "contact_number", "relationship")


@admin.register(EmployeeDocument)
class EmployeeDocumentAdmin(admin.ModelAdmin):
    list_display = ("request", "category", "file_name", "status", "uploaded_by_role", "uploaded_at")
    list_filter = ("category", "status", "uploaded_by_role")


@admin.register(EmployeeChangeRequest)
class EmployeeChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("request", "section", "field_name", "status", "requested_by", "requested_at", "resolved_at")
    list_filter = ("section", "status")


@admin.register(EmployeeSubmissionVersion)
class EmployeeSubmissionVersionAdmin(admin.ModelAdmin):
    list_display = ("request", "version_number", "is_resubmission", "created_at")
    readonly_fields = ("snapshot",)


@admin.register(EmployeeOnboardingHistory)
class EmployeeOnboardingHistoryAdmin(admin.ModelAdmin):
    list_display = ("request", "action", "previous_status", "new_status", "actor", "created_at")
    list_filter = ("action",)
