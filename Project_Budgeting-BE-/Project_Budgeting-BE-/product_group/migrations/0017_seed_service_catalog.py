from django.db import migrations

# IT-services categories with their card icons. Added next to existing categories - nothing
# existing is renamed or removed, and admins can edit or archive these afterwards.
CATEGORIES = [
    ("Website & Web Application Development", "globe"),
    ("Mobile App Development", "smartphone"),
    ("AI & Automation", "bot"),
    ("SAP Services", "database"),
    ("Odoo Services", "boxes"),
    ("CRM & ERP Development", "workflow"),
    ("Cloud & DevOps", "cloud"),
    ("UI/UX Design", "palette"),
    ("IT Consulting", "lightbulb"),
    ("Maintenance & Support", "wrench"),
    ("API & System Integration", "plug"),
]

# Old billing_method -> new service_delivery_type.
BILLING_TO_DELIVERY = {"fixed": "fixed_price", "hourly": "hourly", "milestone": "milestone"}


def seed(apps, schema_editor):
    UnitOfMeasure = apps.get_model("product_group", "UnitOfMeasure")
    ProductGroup = apps.get_model("product_group", "ProductGroup")
    Product_Services = apps.get_model("product_group", "Product_Services")

    UnitOfMeasure.objects.get_or_create(code="fixed", defaults={"name": "Fixed Price", "category": "billing"})

    for name, icon in CATEGORIES:
        group = ProductGroup.objects.filter(product_group_name__iexact=name).first()
        if group is None:
            ProductGroup.objects.create(product_group_name=name, icon=icon)
        elif not group.icon:
            group.icon = icon
            group.save(update_fields=["icon"])

    for old, new in BILLING_TO_DELIVERY.items():
        Product_Services.objects.filter(
            product_type="service", billing_method=old, service_delivery_type=""
        ).update(service_delivery_type=new)


def unseed(apps, schema_editor):
    # Categories / the unit may already be in use, so they're left in place.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("product_group", "0016_service_catalog_fields"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
