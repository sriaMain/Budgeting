"""Vendor Summary fields (headcount, rating, manual_amount_spent) on VendorOnboardingProfile.

State-only: the shared database already has these columns - they were created by the
`backend` (KYC) branch's vendor_onboarding migrations 0008/0009. This migration only
brings this branch's model state in line, so `migrate` runs no SQL and `makemigrations`
stops proposing to add them again. When the KYC branch is merged, replace this with its
0006-0009 (or add a merge migration).
"""
import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vendor_onboarding", "0005_grant_admin_vendor_permissions"),
    ]

    state_operations = [
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

    operations = [
        migrations.SeparateDatabaseAndState(state_operations=state_operations, database_operations=[]),
    ]
