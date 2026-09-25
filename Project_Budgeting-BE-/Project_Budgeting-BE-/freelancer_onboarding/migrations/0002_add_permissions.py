from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Freelancer Onboarding"
    )

    permissions = [
        ("freelancer_onboarding.view", "View Freelancer Onboarding"),
        ("freelancer_onboarding.create", "Create Freelancer Onboarding"),
        ("freelancer_onboarding.edit", "Edit Freelancer Onboarding"),
        ("freelancer_onboarding.document.view", "View Freelancer Onboarding Document"),
        ("freelancer_onboarding.document.upload", "Upload Freelancer Onboarding Document"),
        ("freelancer_onboarding.document.delete", "Delete Freelancer Onboarding Document"),
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
        ("freelancer_onboarding", "0001_initial"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
