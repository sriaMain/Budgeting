from django.db import migrations

NEW_CODES = [
    "client.company.view",
    "client.company.create",
    "client.company.edit",
    "client.company.delete",
    "client.company.approve",
    "client.document.view",
    "client.document.upload",
    "client.document.delete",
    "client.audit_log.view",
]


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )
    admin_role.permissions.add(*Permission.objects.filter(code__in=NEW_CODES))


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return
    admin_role.permissions.remove(*Permission.objects.filter(code__in=NEW_CODES))


class Migration(migrations.Migration):
    dependencies = [
        ("client", "0009_add_client_kyc_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
