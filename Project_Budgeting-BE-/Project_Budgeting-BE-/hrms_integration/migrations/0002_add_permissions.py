from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="HRMS Integration"
    )

    permissions = [
        ("hrms.employees.view", "View HRMS Employees"),
        ("hrms.employees.sync", "Refresh HRMS Employee List"),
        ("hrms.employees.manage_access", "Grant / Revoke Budgeting Access for HRMS Employees"),
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
        ("hrms_integration", "0001_initial"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
