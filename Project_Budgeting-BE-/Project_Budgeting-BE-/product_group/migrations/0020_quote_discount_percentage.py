from decimal import ROUND_HALF_UP, Decimal

import django.core.validators
from django.db import migrations, models

# The quotation discount is entered as a % (Quote.discount_amount is now worked out from it).
# A quote already given a discount amount keeps it, as the matching %.


def amount_to_percentage(apps, schema_editor):
    Quote = apps.get_model("product_group", "Quote")
    for quote in Quote.objects.filter(discount_amount__gt=0, sub_total__gt=0):
        pct = (quote.discount_amount * 100 / quote.sub_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        Quote.objects.filter(pk=quote.pk).update(discount_percentage=min(pct, Decimal("100.00")))


class Migration(migrations.Migration):
    dependencies = [
        ("product_group", "0019_quote_discount_amount"),
    ]

    operations = [
        migrations.AddField(
            model_name="quote",
            name="discount_percentage",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0.00"), db_default=Decimal("0.00"), max_digits=5,
                validators=[django.core.validators.MinValueValidator(Decimal("0")),
                            django.core.validators.MaxValueValidator(Decimal("100"))]),
        ),
        migrations.RunPython(amount_to_percentage, migrations.RunPython.noop),
    ]
