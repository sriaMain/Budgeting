from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Clients & KYC"
    )

    permissions = [
        ("client.compliance.edit", "Edit Client Compliance"),
        ("client.banking.edit", "Edit Client Banking"),
        ("client.commercial.edit", "Edit Client Commercials"),
        ("client.document.verify", "Verify Client Documents"),
        ("client.request_changes", "Request Client Changes"),
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
        ("client", "0011_clientdocument_remarks_clientdocument_verified_at_and_more"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
