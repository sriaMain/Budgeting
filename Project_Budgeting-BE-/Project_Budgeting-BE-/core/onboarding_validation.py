"""
DRF-facing validation helpers built on core.countries, used by the client, vendor and
freelancer serializers so the same country rules are enforced no matter which form (or
direct API call) the data comes from.

Each helper takes the serializer's attrs plus a mapping from the canonical key to the
module's own field name, collects {field: message} errors and returns them; callers raise
serializers.ValidationError(errors) once, so the client sees every problem at once.
"""
from __future__ import annotations

import re

from . import countries

PHONE_ERROR = "Enter a valid phone number with its country dialing code."


def _value(attrs, instance, field):
    if field in attrs:
        return attrs.get(field)
    return getattr(instance, field, None) if instance is not None else None


def normalize_country_fields(attrs: dict, *fields: str) -> None:
    """Store every country as its canonical display name ('india' -> 'India', 'US' -> 'United States')."""
    for f in fields:
        if f in attrs and attrs[f]:
            attrs[f] = countries.normalize_country_value(attrs[f])


def check_country(attrs: dict, field: str, errors: dict) -> None:
    value = attrs.get(field)
    if value and not countries.resolve_country(value):
        errors[field] = "Select a country from the list."


def clean_phone(attrs: dict, field: str, errors: dict, country=None) -> None:
    """Normalises attrs[field] to E.164 in place, or records an error."""
    raw = attrs.get(field)
    if raw in (None, ""):
        return
    try:
        attrs[field] = countries.normalize_phone(str(raw), default_country=country)
    except countries.PhoneValidationError as exc:
        errors[field] = str(exc)


def clean_postal_code(attrs: dict, field: str, country, errors: dict) -> None:
    if field not in attrs or not attrs.get(field):
        return
    attrs[field] = countries.normalize_postal_code(attrs[field], country)
    message = countries.validate_postal_code(attrs[field], country)
    if message:
        errors[field] = message


def clean_tax_id(attrs: dict, field: str, country, errors: dict, entity: str = "business") -> None:
    if field not in attrs or not attrs.get(field):
        return
    attrs[field] = re.sub(r"\s+", " ", str(attrs[field]).strip()).upper()
    message = countries.validate_tax_id(attrs[field], country, entity)
    if message:
        errors[field] = message


# canonical bank key -> module field name
DEFAULT_BANK_FIELDS = {
    "account_holder_name": "account_holder_name",
    "account_number": "account_number",
    "ifsc_code": "ifsc_code",
    "routing_code": "routing_code",
    "swift_code": "swift_code",
    "iban": "iban",
    "bank_name": "bank_name",
}


def clean_bank_details(attrs: dict, country, errors: dict, *, instance=None, field_map=None,
                       partial: bool = True, has_saved_account_number: bool = False) -> None:
    """Normalises bank identifiers in attrs and validates them for the bank's country.

    Fields not present in attrs are taken from `instance`, so a PATCH of just the IFSC is
    still checked against the saved country. With partial=True (drafts) only malformed values
    are rejected; required-field checks happen at submission.
    """
    field_map = {**DEFAULT_BANK_FIELDS, **(field_map or {})}
    for key, field in field_map.items():
        if field in attrs and isinstance(attrs[field], str):
            attrs[field] = countries.normalize_bank_value(key, attrs[field])

    data = {}
    for key, field in field_map.items():
        if field in attrs:
            data[key] = attrs.get(field) or ""
        elif key != "account_number":
            # Untouched values are validated too, except the write-only account number.
            data[key] = (_value(attrs, instance, field) or "") if instance is not None else ""
    data["_has_saved_account_number"] = has_saved_account_number
    found = countries.validate_bank_details(data, country, partial=partial)
    for key, message in found.items():
        field = field_map.get(key, key)
        # Only report errors for fields the caller sent, plus required-field errors on submit.
        if field in attrs or not partial:
            errors[field] = message


def confirm_account_number(initial_data, account_field: str, confirm_field: str, errors: dict) -> None:
    """When the form sends a confirmation value, it must match the account number."""
    if not hasattr(initial_data, "get"):
        return
    confirm = initial_data.get(confirm_field)
    if confirm in (None, ""):
        return
    account = initial_data.get(account_field) or ""
    if countries.normalize_bank_value("account_number", str(confirm)) != countries.normalize_bank_value("account_number", str(account)):
        errors[confirm_field] = "Account numbers do not match."
