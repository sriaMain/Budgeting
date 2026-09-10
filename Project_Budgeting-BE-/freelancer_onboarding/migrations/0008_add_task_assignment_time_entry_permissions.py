from django.db import migrations


def seed(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Freelancer Onboarding"
    )

    permissions = [
        ("freelancer_onboarding.task_assignment.view", "View Freelancer Task Assignment"),
        ("freelancer_onboarding.task_assignment.create", "Create Freelancer Task Assignment"),
        ("freelancer_onboarding.task_assignment.edit", "Edit Freelancer Task Assignment"),
        ("freelancer_onboarding.task_assignment.delete", "Delete Freelancer Task Assignment"),
        ("freelancer_onboarding.time_entry.view", "View Freelancer Time Entry"),
        ("freelancer_onboarding.time_entry.create", "Create Freelancer Time Entry"),
        ("freelancer_onboarding.time_entry.edit", "Edit Freelancer Time Entry"),
        ("freelancer_onboarding.time_entry.delete", "Delete Freelancer Time Entry"),
        ("freelancer_onboarding.time_entry.approve", "Approve/Reject Freelancer Time Entry"),
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
        ("freelancer_onboarding", "0007_add_task_assignment_time_entry"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
