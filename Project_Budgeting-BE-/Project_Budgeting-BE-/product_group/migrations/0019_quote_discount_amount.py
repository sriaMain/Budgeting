from decimal import Decimal

from django.db import migrations, models

# Quotations get a whole-quote discount amount (taken off before tax, like invoices).
# Existing quotes get 0.00, so their totals don't change.


class Migration(migrations.Migration):
    dependencies = [
        ("product_group", "0018_archive_all_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="quote",
            name="discount_amount",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0.00"), db_default=Decimal("0.00"), max_digits=15),
        ),
    ]
