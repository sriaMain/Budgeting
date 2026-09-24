from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Freelancer Onboarding"
    )

    permissions = [
        ("freelancer_onboarding.rate_card.view", "View Freelancer Rate Card"),
        ("freelancer_onboarding.rate_card.create", "Create Freelancer Rate Card"),
        ("freelancer_onboarding.rate_card.edit", "Edit Freelancer Rate Card"),
        ("freelancer_onboarding.rate_card.delete", "Delete Freelancer Rate Card"),
        ("freelancer_onboarding.contract.view", "View Freelancer Contract"),
        ("freelancer_onboarding.contract.create", "Create Freelancer Contract"),
        ("freelancer_onboarding.contract.edit", "Edit Freelancer Contract"),
        ("freelancer_onboarding.contract.delete", "Delete Freelancer Contract"),
        ("freelancer_onboarding.assignment.view", "View Freelancer Project Assignment"),
        ("freelancer_onboarding.assignment.create", "Create Freelancer Project Assignment"),
        ("freelancer_onboarding.assignment.edit", "Edit Freelancer Project Assignment"),
        ("freelancer_onboarding.assignment.delete", "Delete Freelancer Project Assignment"),
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
        ("freelancer_onboarding", "0004_add_rate_card_contract_assignment"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
