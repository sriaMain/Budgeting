from django.contrib import admin

from .models import (
    VendorAccessToken, VendorAccessLog,
    VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail,
    VendorDocument, VendorChangeRequest, VendorSubmissionVersion,
    VendorApprovalWorkflowConfig, VendorApprovalLevel, VendorApprovalInstance, VendorApprovalHistory,
)


@admin.register(VendorAccessToken)
class VendorAccessTokenAdmin(admin.ModelAdmin):
    list_display = ("vendor", "is_active", "expires_at", "last_used_at", "created_at")
    list_filter = ("is_active",)
    readonly_fields = ("token", "created_at")


@admin.register(VendorAccessLog)
class VendorAccessLogAdmin(admin.ModelAdmin):
    list_display = ("vendor", "ip_address", "accessed_at")
    readonly_fields = ("vendor", "token", "ip_address", "user_agent", "accessed_at")


@admin.register(VendorOnboardingProfile)
class VendorOnboardingProfileAdmin(admin.ModelAdmin):
    list_display = ("vendor", "gst_registered", "msme_registered", "city", "state")


@admin.register(VendorKYC)
class VendorKYCAdmin(admin.ModelAdmin):
    list_display = ("vendor", "pan", "cin", "tan")


@admin.register(VendorBankDetail)
class VendorBankDetailAdmin(admin.ModelAdmin):
    list_display = ("vendor", "bank_name", "ifsc_code")


@admin.register(VendorProcurementDetail)
class VendorProcurementDetailAdmin(admin.ModelAdmin):
    list_display = ("vendor", "purchasing_org", "payment_terms", "order_currency")


@admin.register(VendorDocument)
class VendorDocumentAdmin(admin.ModelAdmin):
    list_display = ("vendor", "category", "file_name", "status", "uploaded_by_role", "uploaded_at")
    list_filter = ("category", "status", "uploaded_by_role")


@admin.register(VendorChangeRequest)
class VendorChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("vendor", "section", "status", "requested_by", "requested_at", "resolved_at")
    list_filter = ("section", "status")


@admin.register(VendorSubmissionVersion)
class VendorSubmissionVersionAdmin(admin.ModelAdmin):
    list_display = ("vendor", "version_number", "is_resubmission", "created_at")
    readonly_fields = ("snapshot",)


@admin.register(VendorApprovalWorkflowConfig)
class VendorApprovalWorkflowConfigAdmin(admin.ModelAdmin):
    list_display = ("name", "company_code", "plant", "vendor_type", "is_active")


@admin.register(VendorApprovalLevel)
class VendorApprovalLevelAdmin(admin.ModelAdmin):
    list_display = ("config", "level_order", "name", "approver_role", "approver_user")


@admin.register(VendorApprovalInstance)
class VendorApprovalInstanceAdmin(admin.ModelAdmin):
    list_display = ("vendor", "resolved_config", "current_level_order", "started_at", "completed_at")


@admin.register(VendorApprovalHistory)
class VendorApprovalHistoryAdmin(admin.ModelAdmin):
    list_display = ("vendor", "action", "previous_status", "new_status", "actor", "created_at")
    list_filter = ("action",)
