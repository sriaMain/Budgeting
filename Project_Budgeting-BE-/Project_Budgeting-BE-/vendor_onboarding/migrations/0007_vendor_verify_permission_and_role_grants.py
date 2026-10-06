from django.db import migrations

# Role mapping agreed for vendor onboarding (the app's existing roles):
#   Admin   - everything (already has every vendor.* code; also gets the new vendor.verify)
#   Manager - "Finance Manager": create / edit / verify / request changes / approve / send email, no delete
#   Employee - "Delivery Lead": view, create drafts, edit own drafts, documents; no approval
MANAGER_CODES = [
    "vendor.view", "vendor.create", "vendor.edit_own", "vendor.edit_any", "vendor.submit",
    "vendor.verify", "vendor.approve", "vendor.request_changes",
    "vendor.document.upload", "vendor.document.view", "vendor.document.delete",
    "vendor.bank.view_unmasked", "vendor.approval_history.view",
]
EMPLOYEE_CODES = [
    "vendor.view", "vendor.create", "vendor.edit_own",
    "vendor.document.upload", "vendor.document.view", "vendor.document.delete",
    "vendor.approval_history.view",
]


def grant(apps, schema_editor):
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    category, _ = PermissionCategory.objects.get_or_create(permission_category_name="Vendor Onboarding")
    verify, _ = Permission.objects.get_or_create(
        code="vendor.verify",
        defaults={"label": "Verify Vendor KYC, Banking & Documents", "category": category},
    )

    admin = Role.objects.filter(role_name="Admin").first()
    if admin:
        admin.permissions.add(verify)
    # Only existing roles are granted to - nothing is created here.
    for role_name, codes in (("Manager", MANAGER_CODES), ("Employee", EMPLOYEE_CODES)):
        role = Role.objects.filter(role_name=role_name).first()
        if role:
            role.permissions.add(*Permission.objects.filter(code__in=codes))

    _clear_permission_cache(Role)


def _clear_permission_cache(Role):
    # Role permissions are cached per user for 6h (roles.models get_rbac_permission_codes) and a
    # migration's M2M changes don't invalidate that - clear it so the grants apply immediately.
    from django.core.cache import cache

    try:
        user_ids = set()
        for role in Role.objects.filter(role_name__in=("Admin", "Manager", "Employee")):
            user_ids.update(role.users.values_list("id", flat=True))
        cache.delete_many([f"user_permissions:{uid}" for uid in user_ids])
    except Exception:
        pass  # cache unavailable - entries expire on their own


def revoke(apps, schema_editor):
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")
    for role_name, codes in (("Manager", MANAGER_CODES), ("Employee", EMPLOYEE_CODES)):
        role = Role.objects.filter(role_name=role_name).first()
        if role:
            role.permissions.remove(*Permission.objects.filter(code__in=codes))
    Permission.objects.filter(code="vendor.verify").delete()
    _clear_permission_cache(Role)


class Migration(migrations.Migration):
    dependencies = [
        ("vendor_onboarding", "0006_vendor_onboarding_kyc_contract_review"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
