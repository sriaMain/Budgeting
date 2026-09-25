from django.db import migrations

NEW_PREFIXES = (
    "freelancer_onboarding.rate_card.",
    "freelancer_onboarding.contract.",
    "freelancer_onboarding.assignment.",
)


def grant(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )

    for prefix in NEW_PREFIXES:
        admin_role.permissions.add(*Permission.objects.filter(code__startswith=prefix))


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return

    for prefix in NEW_PREFIXES:
        admin_role.permissions.remove(*Permission.objects.filter(code__startswith=prefix))


class Migration(migrations.Migration):
    dependencies = [
        ("freelancer_onboarding", "0005_add_rate_card_contract_assignment_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
