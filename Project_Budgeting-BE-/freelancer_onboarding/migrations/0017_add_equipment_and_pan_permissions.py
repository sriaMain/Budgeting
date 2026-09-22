from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Freelancer Onboarding"
    )

    permissions = [
        ("freelancer_onboarding.equipment.view", "View Freelancer Equipment"),
        ("freelancer_onboarding.equipment.edit", "Edit Freelancer Equipment"),
        ("freelancer_onboarding.bank_detail.view_pan_unmasked", "View Freelancer PAN (unmasked)"),
        ("freelancer_onboarding.audit_log.view", "View Freelancer Activity Log"),
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
        ("freelancer_onboarding", "0016_freelancercodesequence_freelancer_alternate_phone_and_more"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
