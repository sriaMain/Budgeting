from django.db import migrations

CODES = [
    "employee_onboarding.view",
    "employee_onboarding.edit",
    "employee_onboarding.document.view",
    "employee_onboarding.document.upload",
    "employee_onboarding.document.delete",
    "employee_onboarding.approve",
    "employee_onboarding.request_changes",
    "employee_onboarding.approval_history.view",
]


def deactivate(apps, schema_editor):
    """Employee onboarding is managed manually via the existing create form,
    not gated by role permissions like vendor onboarding - deactivate the
    remaining codes (employee_onboarding.invite was already deactivated in
    0004) so the whole 'Employee Onboarding' category drops out of Manage
    Roles' Available Permissions list. Deactivated rather than deleted so
    existing role assignments aren't lost."""
    Permission = apps.get_model("roles", "Permission")
    Permission.objects.filter(code__in=CODES).update(is_active=False)


def reactivate(apps, schema_editor):
    Permission = apps.get_model("roles", "Permission")
    Permission.objects.filter(code__in=CODES).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("employee_onboarding", "0004_deactivate_invite_permission"),
    ]

    operations = [
        migrations.RunPython(deactivate, reactivate),
    ]
