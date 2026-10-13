from django.db import migrations

# New permission codes for the freelancer review workflow.
NEW_PERMISSIONS = [
    ("freelancer_onboarding.freelancer.approve", "Approve Freelancer Onboarding"),
    ("freelancer_onboarding.freelancer.request_changes", "Request Changes to Freelancer Onboarding"),
    ("freelancer_onboarding.document.verify", "Verify Freelancer KYC Documents, Bank & PAN"),
    ("freelancer_onboarding.identity.view_unmasked", "View Freelancer ID Document Number (unmasked)"),
]
NEW_CODES = [code for code, _ in NEW_PERMISSIONS]

# Only roles that already exist are granted to - nothing is created here.
#   Admin   - every new code
#   Manager - review: approve, request changes, verify documents / bank / PAN
ROLE_GRANTS = {
    "Admin": NEW_CODES,
    "Manager": [
        "freelancer_onboarding.freelancer.approve",
        "freelancer_onboarding.freelancer.request_changes",
        "freelancer_onboarding.document.verify",
    ],
}


def grant(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    category, _ = PermissionCategory.objects.get_or_create(permission_category_name="Freelancer Onboarding")
    for code, label in NEW_PERMISSIONS:
        Permission.objects.get_or_create(code=code, defaults={"label": label, "category": category})

    for role_name, codes in ROLE_GRANTS.items():
        role = Role.objects.filter(role_name=role_name).first()
        if role:
            role.permissions.add(*Permission.objects.filter(code__in=codes))

    _clear_permission_cache(Role)


def revoke(apps, schema_editor):
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")
    for role_name, codes in ROLE_GRANTS.items():
        role = Role.objects.filter(role_name=role_name).first()
        if role:
            role.permissions.remove(*Permission.objects.filter(code__in=codes))
    Permission.objects.filter(code__in=NEW_CODES).delete()
    _clear_permission_cache(Role)


def _clear_permission_cache(Role):
    # Role permissions are cached per user for 6h (roles.models get_rbac_permission_codes) and a
    # migration's M2M changes don't invalidate that - clear it so the grants apply immediately.
    from django.core.cache import cache

    try:
        user_ids = set()
        for role in Role.objects.filter(role_name__in=list(ROLE_GRANTS)):
            user_ids.update(role.users.values_list("id", flat=True))
        cache.delete_many([f"user_permissions:{uid}" for uid in user_ids])
    except Exception:  # noqa: BLE001
        pass  # cache unavailable - entries expire on their own


class Migration(migrations.Migration):
    dependencies = [
        ("freelancer_onboarding", "0021_backfill_kyc_fields"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
