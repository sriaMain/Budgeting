"""Backfills the KYC fields added in 0020 on existing freelancers. Additive only:

* country_of_residence <- the permanent-address country (canonical name), when that
  country is recognised and no residence is set. permanent_country itself is untouched.
* kyc_status 'submitted' for freelancers already in 'completed' (they submitted under the
  old flow and are now "pending review"). submitted_at stays empty - the real time is unknown.

Nothing is overwritten; reversing is a no-op (0020's reversal drops the columns).
"""
from django.db import migrations


def _canonical_country(value):
    try:
        from core.countries import normalize_country_value, resolve_country
    except Exception:  # noqa: BLE001 - shared helpers unavailable: skip the backfill
        return ""
    return normalize_country_value(value) if resolve_country(value) else ""


def backfill(apps, schema_editor):
    Freelancer = apps.get_model("freelancer_onboarding", "Freelancer")

    rows = Freelancer.objects.filter(country_of_residence="").exclude(permanent_country="")
    for freelancer in rows.only("id", "permanent_country").iterator():
        country = _canonical_country(freelancer.permanent_country)
        if country:
            Freelancer.objects.filter(pk=freelancer.pk, country_of_residence="").update(country_of_residence=country)

    Freelancer.objects.filter(status="completed", kyc_status="not_started").update(kyc_status="submitted")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("freelancer_onboarding", "0020_kyc_review_workflow"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
