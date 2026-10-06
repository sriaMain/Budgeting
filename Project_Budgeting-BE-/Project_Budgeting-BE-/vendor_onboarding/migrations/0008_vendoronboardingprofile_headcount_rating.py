import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vendor_onboarding", "0007_vendor_verify_permission_and_role_grants"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendoronboardingprofile",
            name="headcount",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="vendoronboardingprofile",
            name="rating",
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(5),
                ],
            ),
        ),
    ]
