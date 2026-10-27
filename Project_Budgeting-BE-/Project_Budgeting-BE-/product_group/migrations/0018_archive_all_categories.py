from django.db import migrations

# Categories (Product Groups) are no longer used: the Products & Services catalog and quotation
# lines work without them. Rows are archived, not deleted - products keep their old link, old
# quotations still show it, and vendor "product groups" stay readable. Reversible.


def archive_all(apps, schema_editor):
    ProductGroup = apps.get_model("product_group", "ProductGroup")
    ProductGroup.objects.filter(is_active=True).update(is_active=False)


def restore_all(apps, schema_editor):
    ProductGroup = apps.get_model("product_group", "ProductGroup")
    ProductGroup.objects.filter(is_active=False).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("product_group", "0017_seed_service_catalog"),
    ]

    operations = [
        migrations.RunPython(archive_all, restore_all),
    ]
