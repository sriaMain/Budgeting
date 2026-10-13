"""
Adds client.bank.view_unmasked - reveal a client's full bank account number (GET
/client/<id>/bank-account/unmasked/, audit-logged) - and grants it to the roles that already
review client KYC (Admin and Manager hold client.company.approve / client.document.verify since
0013). Same seeding pattern as 0009 / 0013; reverse removes only the grants it made.
"""
from django.db import migrations

CODE = "client.bank.view_unmasked"
GRANTED_ROLES = ("Admin", "Manager")


def seed_and_grant(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    category, _ = PermissionCategory.objects.get_or_create(permission_category_name="Clients & KYC")
    permission, _ = Permission.objects.get_or_create(
        code=CODE,
        defaults={"label": "View Client Unmasked Bank Account", "category": category},
    )
    for role in Role.objects.filter(role_name__in=GRANTED_ROLES):
        role.permissions.add(permission)


def revoke(apps, schema_editor):
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    permission = Permission.objects.filter(code=CODE).first()
    if permission is None:
        return
    for role in Role.objects.filter(role_name__in=GRANTED_ROLES):
        role.permissions.remove(permission)


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0016_split_legacy_bank_code_and_normalise_countries"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_and_grant, revoke),
    ]
