from django.db import migrations


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )

    vendor_permissions = Permission.objects.filter(code__startswith="vendor.")
    admin_role.permissions.add(*vendor_permissions)


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return

    vendor_permissions = Permission.objects.filter(code__startswith="vendor.")
    admin_role.permissions.remove(*vendor_permissions)


class Migration(migrations.Migration):
    dependencies = [
        ("vendor_onboarding", "0004_add_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
