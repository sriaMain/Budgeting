from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Employee Onboarding"
    )

    permissions = [
        ("employee_onboarding.view", "View Employee Onboarding"),
        ("employee_onboarding.invite", "Send Employee Onboarding Invite"),
        ("employee_onboarding.edit", "Edit Employee Onboarding"),
        ("employee_onboarding.document.view", "View Employee Onboarding Document"),
        ("employee_onboarding.document.upload", "Upload Employee Onboarding Document"),
        ("employee_onboarding.document.delete", "Delete Employee Onboarding Document"),
        ("employee_onboarding.approve", "Approve Employee Onboarding"),
        ("employee_onboarding.request_changes", "Request Employee Onboarding Changes"),
        ("employee_onboarding.approval_history.view", "View Employee Onboarding History"),
    ]

    for code, label in permissions:
        Permission.objects.get_or_create(
            code=code,
            defaults={"label": label, "category": category},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("employee_onboarding", "0001_initial"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
