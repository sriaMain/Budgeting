from django.db import migrations

NEW_CODES = [
    ("finances.payment.confirm", "Confirm / Fail / Cancel Invoice Payments"),
]


def seed_and_grant(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    category, _ = PermissionCategory.objects.get_or_create(
        permission_category_name="Finances"
    )
    for code, label in NEW_CODES:
        Permission.objects.get_or_create(
            code=code,
            defaults={"label": label, "category": category},
        )

    admin_role, _ = Role.objects.get_or_create(
        role_name="Admin",
        defaults={"description": "Full access to all modules."},
    )
    admin_role.permissions.add(*Permission.objects.filter(code__in=[c for c, _ in NEW_CODES]))
    _clear_permission_cache()


def _clear_permission_cache():
    """RBACUserMixin caches each user's permission codes for 6 hours and
    nothing invalidates it when a role gains a permission - drop the cached
    sets so Admins can confirm payments straight away."""
    try:
        from django.core.cache import cache
        if hasattr(cache, "delete_pattern"):
            cache.delete_pattern("user_permissions:*")
    except Exception:
        pass


def revoke(apps, schema_editor):
    Role = apps.get_model("roles", "Role")
    Permission = apps.get_model("roles", "Permission")

    try:
        admin_role = Role.objects.get(role_name="Admin")
    except Role.DoesNotExist:
        return
    admin_role.permissions.remove(*Permission.objects.filter(code__in=[c for c, _ in NEW_CODES]))
    _clear_permission_cache()


class Migration(migrations.Migration):
    dependencies = [
        ("finances", "0021_invoicepayment_status"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_and_grant, revoke),
    ]
