from django.db import migrations


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )

    freelancer_permissions = Permission.objects.filter(code__startswith="freelancer_onboarding.")
    admin_role.permissions.add(*freelancer_permissions)


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return

    freelancer_permissions = Permission.objects.filter(code__startswith="freelancer_onboarding.")
    admin_role.permissions.remove(*freelancer_permissions)


class Migration(migrations.Migration):
    dependencies = [
        ("freelancer_onboarding", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
