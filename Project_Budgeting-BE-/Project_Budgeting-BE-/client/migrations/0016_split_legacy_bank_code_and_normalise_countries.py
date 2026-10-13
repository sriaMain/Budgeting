"""
Data migration for the Clients & KYC onboarding redesign.

1. The legacy `bank_code` ("IFSC / SWIFT / IBAN" in one box) is copied into the field it really
   is: an IFSC -> bank_ifsc_code, a SWIFT / BIC -> bank_swift_code, a valid IBAN -> bank_iban,
   anything else -> bank_routing_code. `bank_code` itself is left untouched (it stays as the
   read-only legacy value) and a target field that already holds a value is never overwritten,
   so the migration is idempotent and safe to re-run.
2. Free-text `country` / `bank_country` values are normalised to the canonical display name
   used everywhere else ("india" -> "India", "USA" -> "United States", "UK" -> "United
   Kingdom") via core.countries. Values that don't resolve to a country are kept exactly as typed.

Reverse is a no-op: nothing is deleted (every legacy bank value is still in bank_code, and the new
columns are dropped by reversing 0015), and a normalised country name means the same country.
"""
import re

from django.db import migrations

IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
SWIFT_RE = re.compile(r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$")
IBAN_SHAPE_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$")


def _iban_is_valid(value: str) -> bool:
    """ISO 13616 mod-97 check (kept inline so this migration never depends on later code)."""
    if not IBAN_SHAPE_RE.match(value):
        return False
    rearranged = value[4:] + value[:4]
    return int("".join(str(int(ch, 36)) for ch in rearranged)) % 97 == 1


def _classify_bank_code(raw: str):
    """-> (target field, value) for a legacy bank_code, or None when blank."""
    value = (raw or "").strip()
    if not value:
        return None
    compact = re.sub(r"\s", "", value).upper()
    if IFSC_RE.match(compact):
        return "bank_ifsc_code", compact
    if SWIFT_RE.match(compact):
        return "bank_swift_code", compact
    if _iban_is_valid(compact):
        return "bank_iban", compact
    return "bank_routing_code", value[:34]


def _country_normaliser():
    try:
        from core.countries import country_name, resolve_country
    except ImportError:  # pragma: no cover - core.countries moved; leave countries as they are
        return lambda value: value

    def normalise(value):
        code = resolve_country(value) if value else None
        return country_name(code) if code else value

    return normalise


def forwards(apps, schema_editor):
    Company = apps.get_model("client", "Company")
    normalise_country = _country_normaliser()
    fields = ("bank_code", "bank_ifsc_code", "bank_swift_code", "bank_iban", "bank_routing_code", "country", "bank_country")

    changed_rows = []
    for company in Company.objects.only("pk", *fields).iterator(chunk_size=500):
        changed = False

        target = _classify_bank_code(company.bank_code)
        if target is not None:
            field, value = target
            if not (getattr(company, field) or "").strip():
                setattr(company, field, value)
                changed = True

        for field in ("country", "bank_country"):
            current = getattr(company, field) or ""
            canonical = normalise_country(current)
            if canonical and canonical != current:
                setattr(company, field, canonical)
                changed = True

        if changed:
            changed_rows.append(company)

    # bulk_update writes only these columns (updated_at is left alone).
    Company.objects.bulk_update(
        changed_rows,
        ["bank_ifsc_code", "bank_swift_code", "bank_iban", "bank_routing_code", "country", "bank_country"],
        batch_size=200,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0015_onboarding_redesign"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
