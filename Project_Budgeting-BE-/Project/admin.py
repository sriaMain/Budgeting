from django.contrib import admin

# Register your models here.
from .models import Project, ProjectBudget, BudgetLine, Milestone, ResourceAssignment, Task, Timesheet, TimesheetEntry
admin.site.register(Project)
admin.site.register(ProjectBudget)
admin.site.register(Task)
admin.site.register(Timesheet)
admin.site.register(TimesheetEntry)


@admin.register(BudgetLine)
class BudgetLineAdmin(admin.ModelAdmin):
    list_display = ("description", "gl_account", "budget", "planned_amount", "actual_amount", "variance")
    list_filter = ("gl_account",)
    search_fields = ("description", "gl_account__code", "gl_account__name")
    autocomplete_fields = ("gl_account",)


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "sequence", "status", "budget_amount", "billing_amount", "is_active")
    list_filter = ("status", "is_active")
    search_fields = ("name", "project__project_name")


@admin.register(ResourceAssignment)
class ResourceAssignmentAdmin(admin.ModelAdmin):
    list_display = ("project", "resource_type", "resource_id", "role", "status", "cost_rate", "billing_rate", "is_active")
    list_filter = ("resource_type", "status", "is_active")
    search_fields = ("project__project_name", "role")