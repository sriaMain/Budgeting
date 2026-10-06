from django.contrib import admin
from .models import ClientAuditLog, ClientDocument, Company, CompanyTag, POC
admin.site.register(Company)
admin.site.register(CompanyTag)
admin.site.register(POC)


@admin.register(ClientDocument)
class ClientDocumentAdmin(admin.ModelAdmin):
    list_display = ("company", "category", "file_name", "status", "uploaded_at")
    list_filter = ("category", "status")


@admin.register(ClientAuditLog)
class ClientAuditLogAdmin(admin.ModelAdmin):
    list_display = ("company_name", "action", "performed_by", "created_at")
    list_filter = ("action",)
    readonly_fields = [f.name for f in ClientAuditLog._meta.fields]