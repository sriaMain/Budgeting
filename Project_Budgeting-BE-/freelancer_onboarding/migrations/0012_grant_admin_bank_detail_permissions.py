from django.db import migrations

NEW_PREFIX = "freelancer_onboarding.bank_detail."


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )
    admin_role.permissions.add(*Permission.objects.filter(code__startswith=NEW_PREFIX))


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return
    admin_role.permissions.remove(*Permission.objects.filter(code__startswith=NEW_PREFIX))


class Migration(migrations.Migration):
    dependencies = [
        ("freelancer_onboarding", "0011_add_bank_detail_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
