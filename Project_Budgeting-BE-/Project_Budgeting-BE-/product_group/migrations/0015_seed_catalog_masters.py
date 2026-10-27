from decimal import Decimal

from django.db import migrations

# Same codes quotation / invoice lines already store, so documents keep their unit values.
UNITS = [
    ("pieces", "Pieces", "unit"),
    ("hours", "Hours", "time"),
    ("days", "Days", "time"),
    ("minutes", "Minutes", "time"),
    ("months", "Months", "time"),
    ("milestone", "Milestone", "billing"),
    ("period", "Period", "billing"),
]

# The rates the quotation tax dropdown already offers (0 / 5 / 10 / 18 %).
TAXES = [
    ("No Tax", Decimal("0.00")),
    ("Tax 5%", Decimal("5.00")),
    ("Tax 10%", Decimal("10.00")),
    ("Tax 18%", Decimal("18.00")),
]

PERMISSIONS = [
    ("catalog.view", "View Products & Services"),
    ("catalog.manage", "Create / Edit / Archive Products & Services"),
    ("catalog.accounting.view", "View & Edit Product Accounting Settings"),
]
# Admin gets everything; Manager keeps the catalog editing it already had on the Modules screen.
ROLE_GRANTS = {
    "Admin": ["catalog.view", "catalog.manage", "catalog.accounting.view"],
    "Manager": ["catalog.view", "catalog.manage"],
}


def _clear_permission_cache():
    try:
        from django.core.cache import cache
        if hasattr(cache, "delete_pattern"):
            cache.delete_pattern("user_permissions:*")
    except Exception:
        pass


def seed(apps, schema_editor):
    UnitOfMeasure = apps.get_model("product_group", "UnitOfMeasure")
    Tax = apps.get_model("product_group", "Tax")
    PermissionCategory = apps.get_model("roles", "PermissionCategory")
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")

    for code, name, category in UNITS:
        UnitOfMeasure.objects.get_or_create(code=code, defaults={"name": name, "category": category})
    for name, rate in TAXES:
        Tax.objects.get_or_create(name=name, defaults={"rate": rate, "scope": "both"})

    category, _ = PermissionCategory.objects.get_or_create(permission_category_name="Products & Services")
    for code, label in PERMISSIONS:
        Permission.objects.get_or_create(code=code, defaults={"label": label, "category": category})
    for role_name, codes in ROLE_GRANTS.items():
        role = Role.objects.filter(role_name=role_name).first()
        if role is not None:
            role.permissions.add(*Permission.objects.filter(code__in=codes))
    _clear_permission_cache()


def unseed(apps, schema_editor):
    # Units / taxes may already be referenced by products, so only the permissions are removed.
    Permission = apps.get_model("roles", "Permission")
    Role = apps.get_model("roles", "Role")
    perms = Permission.objects.filter(code__in=[c for c, _ in PERMISSIONS])
    for role in Role.objects.filter(role_name__in=ROLE_GRANTS):
        role.permissions.remove(*perms)
    perms.delete()
    _clear_permission_cache()


class Migration(migrations.Migration):
    dependencies = [
        ("product_group", "0014_catalog_fields_uom_tax"),
        ("roles", "0002_add_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
