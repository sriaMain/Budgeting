import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vendor_onboarding", "0008_vendoronboardingprofile_headcount_rating"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendoronboardingprofile",
            name="manual_amount_spent",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=15,
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
    ]
