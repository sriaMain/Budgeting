from django.contrib import admin

from .models import HrmsEmployee, HrmsSyncRun


@admin.register(HrmsEmployee)
class HrmsEmployeeAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'full_name', 'email', 'department', 'is_active_in_hrms', 'is_eligible', 'account')
    list_filter = ('is_active_in_hrms', 'is_eligible', 'department', 'branch')
    search_fields = ('employee_id', 'full_name', 'email')
    readonly_fields = [f.name for f in HrmsEmployee._meta.fields]


@admin.register(HrmsSyncRun)
class HrmsSyncRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'status', 'triggered_by', 'started_at', 'fetched_count', 'removed_count', 'access_revoked_count')
    list_filter = ('status',)
    readonly_fields = [f.name for f in HrmsSyncRun._meta.fields]
