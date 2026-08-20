from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Vendor Onboarding"
    )

    permissions = [
        ("vendor.create", "Create Vendor"),
        ("vendor.view", "View Vendor"),
        ("vendor.edit_own", "Edit Own Vendor"),
        ("vendor.edit_any", "Edit Any Vendor"),
        ("vendor.delete", "Delete Vendor"),
        ("vendor.submit", "Submit Vendor For Approval"),
        ("vendor.document.upload", "Upload Vendor Document"),
        ("vendor.document.view", "View Vendor Document"),
        ("vendor.document.delete", "Delete Vendor Document"),
        ("vendor.bank.view_unmasked", "View Unmasked Vendor Bank Details"),
        ("vendor.approve", "Approve Vendor"),
        ("vendor.request_changes", "Request Vendor Changes"),
        ("vendor.approval_history.view", "View Vendor Approval History"),
        ("vendor.approval_config.view", "View Vendor Approval Configuration"),
        ("vendor.approval_config.manage", "Manage Vendor Approval Configuration"),
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
        ("vendor_onboarding", "0003_seed_default_approval_config"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
