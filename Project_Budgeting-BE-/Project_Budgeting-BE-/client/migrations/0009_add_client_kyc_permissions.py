from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Clients & KYC"
    )

    permissions = [
        ("client.company.view", "View Clients"),
        ("client.company.create", "Create Clients"),
        ("client.company.edit", "Edit Clients"),
        ("client.company.delete", "Delete Clients"),
        ("client.company.approve", "Approve Client Onboarding"),
        ("client.document.view", "View Client Documents"),
        ("client.document.upload", "Upload Client Documents"),
        ("client.document.delete", "Delete Client Documents"),
        ("client.audit_log.view", "View Client Activity Log"),
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
        ("client", "0008_company_authorised_signatory_name_and_more"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
