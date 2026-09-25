from django.db import migrations

NEW_PREFIXES = (
    "freelancer_onboarding.task_assignment.",
    "freelancer_onboarding.time_entry.",
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
        ("freelancer_onboarding", "0008_add_task_assignment_time_entry_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
