from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Freelancer Onboarding"
    )

    permissions = [
        ("freelancer_onboarding.bank_detail.view", "View Freelancer Bank Detail (masked)"),
        ("freelancer_onboarding.bank_detail.edit", "Edit Freelancer Bank Detail"),
        ("freelancer_onboarding.bank_detail.view_unmasked", "View Freelancer Bank Detail (unmasked)"),
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
        ("freelancer_onboarding", "0010_add_bank_detail_and_pan_document_category"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
