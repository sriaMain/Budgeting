"""Stores every vendor country as its canonical display name ("india" / "IN" / "Bharat" ->
"India", "USA" / "US" -> "United States"), the format the onboarding forms and validators now
use (core.countries). Values that don't resolve to a country are left exactly as they are.

Only rows whose value actually changes are written. Reversing is a no-op: the canonical name
means the same country as the original spelling, so nothing needs to be restored.
"""
from django.db import migrations

# (model, field) pairs holding a country.
COUNTRY_FIELDS = (
    ("VendorOnboardingProfile", "country"),
    ("VendorKYC", "country_of_tax_residence"),
    ("VendorBankDetail", "bank_country"),
)


def normalize_countries(apps, schema_editor):
    try:
        from core.countries import normalize_country_value, resolve_country
    except ImportError:  # the shared country module is gone - leave the data alone
        return

    for model_name, field in COUNTRY_FIELDS:
        model = apps.get_model("vendor_onboarding", model_name)
        changed = []
        for row in model.objects.exclude(**{field: ""}).only("pk", field).iterator(chunk_size=500):
            value = getattr(row, field) or ""
            if not resolve_country(value):
                continue  # unknown free text - keep it for a person to fix
            canonical = normalize_country_value(value)
            if canonical and canonical != value:
                setattr(row, field, canonical)
                changed.append(row)
        if changed:
            model.objects.bulk_update(changed, [field], batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ("vendor_onboarding", "0010_country_aware_onboarding"),
    ]

    operations = [
        migrations.RunPython(normalize_countries, migrations.RunPython.noop),
    ]
