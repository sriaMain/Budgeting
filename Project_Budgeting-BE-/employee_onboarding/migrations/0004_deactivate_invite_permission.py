from django.db import migrations


def deactivate(apps, schema_editor):
    """Employee onboarding is self-service to create (unlike vendor
    onboarding), so 'employee_onboarding.invite' is no longer checked or
    assignable from Manage Roles - deactivate instead of delete so any
    existing role assignments aren't lost."""
    Permission = apps.get_model("roles", "Permission")
    Permission.objects.filter(code="employee_onboarding.invite").update(is_active=False)


def reactivate(apps, schema_editor):
    Permission = apps.get_model("roles", "Permission")
    Permission.objects.filter(code="employee_onboarding.invite").update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("employee_onboarding", "0003_employeecodesequence_and_more"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(deactivate, reactivate),
    ]
