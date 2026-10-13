from django.contrib import admin
from .models import ClientAuditLog, ClientChangeRequest, ClientDocument, Company, CompanyTag, POC


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("company_name", "client_type", "country", "kyc_status", "onboarding_step", "risk_rating", "is_active")
    list_filter = ("kyc_status", "onboarding_step", "client_type", "risk_rating", "is_active")
    search_fields = ("company_name", "email")
    # The legacy single bank identifier is read-only (copied into the per-type fields by 0016).
    readonly_fields = ("bank_code", "kyc_verified_by", "kyc_verified_at", "compliance_reviewed_by", "compliance_reviewed_at")


admin.site.register(CompanyTag)
admin.site.register(POC)


@admin.register(ClientDocument)
class ClientDocumentAdmin(admin.ModelAdmin):
    list_display = ("company", "category", "file_name", "status", "expiry_date", "uploaded_at")
    list_filter = ("category", "status")


@admin.register(ClientChangeRequest)
class ClientChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("company", "section", "status", "requested_by", "requested_at", "resolved_at")
    list_filter = ("section", "status")


@admin.register(ClientAuditLog)
class ClientAuditLogAdmin(admin.ModelAdmin):
    list_display = ("company_name", "action", "performed_by", "created_at")
    list_filter = ("action",)
    readonly_fields = [f.name for f in ClientAuditLog._meta.fields]
