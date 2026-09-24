from django.db import migrations

# The full set granted this round: the 5 new codes, plus client.company.approve (existed since
# 0009/0010, Admin-only until now) - this round's explicit decision is that Manager should also
# be able to approve clients, alongside every other new section-edit/request-changes permission.
GRANTED_CODES = [
    "client.company.approve",
    "client.compliance.edit",
    "client.banking.edit",
    "client.commercial.edit",
    "client.document.verify",
    "client.request_changes",
]


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    permissions = Permission.objects.filter(code__in=GRANTED_CODES)

    for role_name in ("Admin", "Manager"):
        role, _ = Role.objects.get_or_create(
            role_name=role_name,
            defaults={"description": f"{'Full access to all modules.' if role_name == 'Admin' else 'Create/edit access without delete or full admin rights.'}"},
        )
        role.permissions.add(*permissions)


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    permissions = Permission.objects.filter(code__in=GRANTED_CODES)
    for role_name in ("Admin", "Manager"):
        try:
            role = Role.objects.get(role_name=role_name)
        except Role.DoesNotExist:
            continue
        role.permissions.remove(*permissions)


class Migration(migrations.Migration):
    dependencies = [
        ("client", "0012_add_client_deep_workflow_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
