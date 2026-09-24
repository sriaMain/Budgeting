from django.contrib import admin
from .models import CallCenter, ProfitCenter, GLAccount, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "recipient", "category", "is_read", "created_at")
    list_filter = ("category", "is_read")
    search_fields = ("title", "message", "recipient__username", "recipient__email")


@admin.register(CallCenter)
class CallCenterAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")


@admin.register(ProfitCenter)
class ProfitCenterAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")


@admin.register(GLAccount)
class GLAccountAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "account_type", "is_active")
    search_fields = ("code", "name")
    list_filter = ("account_type", "is_active")
