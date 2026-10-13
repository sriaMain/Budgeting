"""
Freelancer KYC rules - one place that answers:

  * which documents a freelancer must upload (``required_documents``),
  * what must be complete before the onboarding can be submitted (``submission_issues``),
  * what a reviewer must have verified before approval (``approval_issues``),
  * how identity / tax / payout identifiers are validated and normalised.

The portal submit, the admin submit / approve endpoints and the detail serializers all
call these functions, so the frontend (which renders ``required_documents`` and the
``missing`` lists) and the backend always agree on the requirement set.

KYC country
-----------
The "KYC country" is the tax residency country, falling back to the country of residence
and then the permanent-address country. India (or an unknown country - a residence is
required before submission) uses the India rules: PAN, a masked-Aadhaar / passport /
driving-licence photo ID. Everyone else provides a passport and either Form W-8BEN
(W-9 for US persons) or a tax residency certificate.
"""
from __future__ import annotations

import datetime
import re
from functools import lru_cache
from urllib.parse import urlparse

from core import countries
from core.document_security import effective_document_status

STEP_KEYS = ("basic", "identity", "address", "banking", "professional", "documents")
STEP_LABELS = {
    "basic": "Basic Information",
    "identity": "Identity & KYC",
    "address": "Address",
    "banking": "Banking",
    "professional": "Professional",
    "documents": "KYC Documents",
}

_UNSET = object()

# --------------------------------------------------------------------------- #
# Countries                                                                    #
# --------------------------------------------------------------------------- #


def residence_code(freelancer):
    return countries.resolve_country(freelancer.country_of_residence or freelancer.permanent_country)


def kyc_country_code(freelancer):
    """Tax residency -> residence -> permanent address (alpha-2, or None when unknown)."""
    return countries.resolve_country(freelancer.tax_residency_country) or residence_code(freelancer)


def uses_india_rules(freelancer) -> bool:
    return kyc_country_code(freelancer) in (None, "IN")


def is_us_person(freelancer) -> bool:
    """US citizens and US residents file a W-9; everyone else a W-8BEN."""
    values = (
        freelancer.nationality,
        freelancer.country_of_residence or freelancer.permanent_country,
        freelancer.tax_residency_country,
    )
    return any(countries.resolve_country(v) == "US" for v in values if v)


def tax_rule(freelancer) -> dict:
    """The individual tax-ID rule for the KYC country (label, regex, example, required)."""
    if uses_india_rules(freelancer):
        return {**countries.tax_config("IN")["individual"], "required": True}
    return countries.tax_config(kyc_country_code(freelancer))["individual"]


# --------------------------------------------------------------------------- #
# Identifier validation                                                       #
# --------------------------------------------------------------------------- #

UPI_REGEX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-_]{1,255}@[A-Za-z][A-Za-z0-9.\-]{1,63}$")
_GENERIC_ID_REGEX = re.compile(r"^[A-Z0-9][A-Z0-9 \-/]{3,29}$")
_DRIVING_LICENCE_REGEX = re.compile(r"^[A-Z0-9][A-Z0-9 \-/]{4,24}$")
_PASSPORT_REGEX = re.compile(r"^[A-Z0-9]{6,12}$")
_INDIAN_PASSPORT_REGEX = re.compile(r"^[A-Z][0-9]{7}$")


def clean_id_document_number(id_type: str, raw: str, nationality: str = ""):
    """Returns (normalised value, error message or None).

    A masked Aadhaar is stored as "XXXXXXXX" + the last 4 digits - a full 12-digit
    Aadhaar number is refused so it is never stored.
    """
    value = (raw or "").strip()
    if not value:
        return "", None
    if id_type == "aadhaar_masked":
        compact = re.sub(r"[\s\-]", "", value).upper().replace("*", "X")
        if re.fullmatch(r"\d{12}", compact):
            return "", "For your privacy enter only the last 4 digits of your Aadhaar (masked Aadhaar), e.g. XXXX XXXX 1234."
        match = re.fullmatch(r"(?:X{8})?(\d{4})", compact)
        if not match:
            return "", "Enter the last 4 digits of your Aadhaar number, e.g. XXXX XXXX 1234."
        return "XXXXXXXX" + match.group(1), None
    if id_type == "passport":
        compact = re.sub(r"[\s\-]", "", value).upper()
        if countries.resolve_country(nationality) == "IN":
            if not _INDIAN_PASSPORT_REGEX.match(compact):
                return "", "Enter a valid Indian passport number - one letter followed by 7 digits (e.g. A1234567)."
        elif not _PASSPORT_REGEX.match(compact):
            return "", "Enter a valid passport number (6 to 12 letters and digits)."
        return compact, None
    value = re.sub(r"\s+", " ", value).upper()
    if id_type == "driving_licence":
        if not _DRIVING_LICENCE_REGEX.match(value):
            return "", "Enter a valid driving licence number."
        return value, None
    if not _GENERIC_ID_REGEX.match(value):
        return "", "Enter a valid ID document number (letters, digits, spaces, '-' or '/')."
    return value, None


def clean_tax_number(raw: str, freelancer):
    """Returns (normalised value, error or None, tax_type label) for the freelancer's KYC country.

    India: PAN of an individual (4th character 'P'). Elsewhere: the country's individual
    tax-ID rule from core.countries (generic and permissive where nothing is curated).
    """
    value = (raw or "").strip()
    if not value:
        return "", None, ""
    if uses_india_rules(freelancer):
        value = re.sub(r"\s+", "", value).upper()
        if not re.match(countries.PAN_REGEX, value):
            return "", "Enter a valid PAN (10 characters, e.g. ABCDE1234F).", "PAN"
        if value[3] != "P":
            return "", "Enter your personal PAN - the 4th character of an individual's PAN is 'P'.", "PAN"
        return value, None, "PAN"
    code = kyc_country_code(freelancer)
    value = re.sub(r"\s+", " ", value).upper()
    rule = countries.tax_config(code)["individual"]
    message = countries.validate_tax_id(value, code, "individual")
    return value, message, rule["label"]


def validate_upi_id(value: str):
    return None if UPI_REGEX.match((value or "").strip()) else "Enter a valid UPI ID (e.g. name@okhdfcbank)."


def is_linkedin_url(value: str) -> bool:
    host = (urlparse(value or "").hostname or "").lower()
    return host == "linkedin.com" or host.endswith(".linkedin.com")


@lru_cache(maxsize=1)
def _timezones() -> frozenset:
    try:
        import zoneinfo

        return frozenset(zoneinfo.available_timezones())
    except Exception:  # noqa: BLE001 - no tz database available: don't block saves
        return frozenset()


def is_valid_timezone(value: str) -> bool:
    zones = _timezones()
    return not zones or value in zones


def age_on(birth_date: datetime.date, today: datetime.date) -> int:
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


# --------------------------------------------------------------------------- #
# Documents                                                                    #
# --------------------------------------------------------------------------- #


def _documents(freelancer, documents):
    if documents is not None:
        return list(documents)
    if freelancer.pk is None:
        return []
    # .all() so a prefetch_related('documents') on list queries is reused.
    return list(freelancer.documents.all())


def _bank(freelancer, bank=_UNSET):
    if bank is not _UNSET:
        return bank
    if freelancer.pk is None:
        return None
    try:
        return freelancer.bank_detail
    except Exception:  # noqa: BLE001 - RelatedObjectDoesNotExist
        return None


_EPOCH = datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def _doc_order(doc):
    return (doc.uploaded_at or _EPOCH, doc.pk or 0)


def latest_documents(documents) -> dict:
    """Newest document per category."""
    latest = {}
    for doc in documents:
        prev = latest.get(doc.category)
        if prev is None or _doc_order(doc) > _doc_order(prev):
            latest[doc.category] = doc
    return latest


def document_state(doc) -> str:
    """'missing' | 'uploaded' | 'under_review' | 'verified' | 'rejected' | 'expired'."""
    if doc is None:
        return "missing"
    return effective_document_status(doc.status, doc.expiry_date)


def _present(doc) -> bool:
    return document_state(doc) not in ("missing", "rejected", "expired")


def _slot(key, label, required, *, tracks_expiry=False, help_text=""):
    return {"key": key, "label": label, "required": required, "tracks_expiry": tracks_expiry, "help_text": help_text}


def required_documents(freelancer, *, documents=None, bank=_UNSET) -> list:
    """Document slots for this freelancer, in display order, with `required` resolved."""
    latest = latest_documents(_documents(freelancer, documents))
    bank = _bank(freelancer, bank)
    slots = []
    if uses_india_rules(freelancer):
        slots += [
            _slot("pan", "PAN card", True, help_text="A clear copy of your PAN card."),
            _slot(
                "government_id", "Government photo ID", True, tracks_expiry=True,
                help_text="Masked Aadhaar (only the last 4 digits visible), passport or driving licence.",
            ),
        ]
    else:
        form = "W-9" if is_us_person(freelancer) else "W-8BEN"
        # Either the tax form or a tax residency certificate satisfies the tax requirement;
        # whichever is on file is the required one (the form when neither is).
        use_certificate = _present(latest.get("tax_residency_certificate")) and not _present(latest.get("tax_form"))
        slots += [
            _slot("government_id", "Passport", True, tracks_expiry=True, help_text="The photo page of your valid passport."),
            _slot(
                "tax_form", f"Form {form}", not use_certificate,
                help_text=(
                    "Signed IRS Form W-9 (US persons)." if form == "W-9"
                    else "Signed IRS Form W-8BEN - or upload a tax residency certificate instead."
                ),
            ),
            _slot(
                "tax_residency_certificate", "Tax residency certificate", use_certificate, tracks_expiry=True,
                help_text="Accepted instead of the tax form.",
            ),
        ]
    if bank is not None and bank.payment_method == "bank_transfer":
        slots.append(_slot(
            "bank_proof", "Bank proof", True,
            help_text="Cancelled cheque or a recent bank statement showing your name and account number.",
        ))
    slots += [
        _slot("address_proof", "Address proof", False, help_text="Utility bill, rental agreement or bank statement."),
        _slot("resume", "Resume / CV", False),
        _slot("other", "Other document", False),
    ]
    return slots


# --------------------------------------------------------------------------- #
# Submission / approval requirements                                           #
# --------------------------------------------------------------------------- #


def _issue(step, key, message):
    return {"step": step, "key": key, "message": message}


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip()) or value == []


def submission_issues(freelancer, *, bank=_UNSET, documents=None) -> list:
    """Everything still missing (or malformed) before the onboarding can be submitted."""
    f = freelancer
    bank = _bank(f, bank)
    docs = _documents(f, documents)
    issues = []

    def need(step, key, value, message):
        if _blank(value):
            issues.append(_issue(step, key, message))

    # Basic information
    need("basic", "first_name", f.first_name or f.full_name, "First name is required.")
    need("basic", "email", f.email, "Email address is required.")
    need("basic", "phone", f.phone, "Phone number is required.")
    need("basic", "date_of_birth", f.date_of_birth, "Date of birth is required.")
    need("basic", "nationality", f.nationality, "Nationality is required.")

    # Identity & KYC
    need("identity", "country_of_residence", f.country_of_residence, "Country of residence is required.")
    need("identity", "id_document_type", f.id_document_type, "Select the type of your government photo ID.")
    need("identity", "id_document_number", f.id_document_number, "ID document number is required.")
    need("identity", "tax_residency_country", f.tax_residency_country, "Tax residency country is required.")
    rule = tax_rule(f)
    tax_number = bank.tax_number if bank is not None else ""
    if rule.get("required") and _blank(tax_number):
        issues.append(_issue(
            "identity", "tax_number",
            "PAN is required for residents of India." if uses_india_rules(f) else f"{rule['label']} is required.",
        ))

    # Address
    _address_issues(issues, "permanent", f.permanent_country, f.permanent_address_line1, f.permanent_city,
                    f.permanent_state, f.permanent_pincode, required=True)
    # The current (temporary) address is optional - but once started it must be complete.
    temp_started = any(not _blank(v) for v in (f.temp_address_line1, f.temp_city, f.temp_pincode))
    if not f.temp_same_as_permanent and temp_started:
        _address_issues(issues, "temp", f.temp_country, f.temp_address_line1, f.temp_city,
                        f.temp_state, f.temp_pincode, required=True)
    if (f.emergency_contact_name or "").strip() and _blank(f.emergency_contact_phone):
        issues.append(_issue("address", "emergency_contact_phone", "Add a phone number for the emergency contact."))

    # Banking
    method = bank.payment_method if bank is not None else ""
    if not method:
        issues.append(_issue("banking", "payment_method", "Choose how you would like to be paid."))
    elif method == "bank_transfer":
        if _blank(bank.bank_country):
            issues.append(_issue("banking", "bank_country", "Bank country is required."))
        found = countries.validate_bank_details(
            {
                "account_holder_name": bank.account_holder_name, "account_number": bank.account_number,
                "ifsc_code": bank.ifsc_code, "routing_code": bank.routing_code, "swift_code": bank.swift_code,
                "iban": bank.iban, "bank_name": bank.bank_name,
            },
            bank.bank_country or f.residence_country, partial=False,
        )
        for key, message in found.items():
            issues.append(_issue("banking", key, message))
    elif method == "upi":
        need("banking", "upi_id", bank.upi_id, "UPI ID is required.")
    elif method == "paypal":
        need("banking", "paypal_email", bank.paypal_email, "PayPal email address is required.")
    elif method == "wise":
        need("banking", "wise_email", bank.wise_email, "Wise account email address is required.")

    # Professional
    need("professional", "professional_title", f.professional_title, "Professional title is required.")
    need("professional", "skills", f.skills, "Add at least one skill.")
    need("professional", "availability", f.availability, "Select your availability.")

    # Documents
    latest = latest_documents(docs)
    for slot in required_documents(f, documents=docs, bank=bank):
        if not slot["required"]:
            continue
        state = document_state(latest.get(slot["key"]))
        if state == "missing":
            message = f"{slot['label']} has not been uploaded."
        elif state == "rejected":
            message = f"{slot['label']} was rejected - upload a corrected document."
        elif state == "expired":
            message = f"{slot['label']} has expired - upload a current one."
        else:
            continue
        issues.append(_issue("documents", f"document:{slot['key']}", message))
    return issues


def _address_issues(issues, prefix, country, line1, city, state, postal_code, *, required):
    label = "permanent" if prefix == "permanent" else "current"
    if required:
        if _blank(country):
            issues.append(_issue("address", f"{prefix}_country", f"Country is required for the {label} address."))
        if _blank(line1):
            issues.append(_issue("address", f"{prefix}_address_line1", f"Address line 1 is required for the {label} address."))
        if _blank(city):
            issues.append(_issue("address", f"{prefix}_city", f"City is required for the {label} address."))
    code = countries.resolve_country(country)
    if not code:
        if country:
            issues.append(_issue("address", f"{prefix}_country", "Select a country from the list."))
        return
    if code == "IN" and required and _blank(state):
        issues.append(_issue("address", f"{prefix}_state", f"State is required for the {label} address."))
    postal = countries.postal_config(code)
    if not postal["has_postal_code"]:
        return
    if postal_code:
        message = countries.validate_postal_code(postal_code, country)
        if message:
            issues.append(_issue("address", f"{prefix}_pincode", message))
    elif postal["required"] and required:
        issues.append(_issue("address", f"{prefix}_pincode", f"{postal['label']} is required for the {label} address."))


def approval_issues(freelancer, *, bank=_UNSET, documents=None) -> list:
    """Submission requirements plus the reviewer's own checks (verified documents, bank, PAN)."""
    bank = _bank(freelancer, bank)
    docs = _documents(freelancer, documents)
    issues = submission_issues(freelancer, bank=bank, documents=docs)
    latest = latest_documents(docs)
    for slot in required_documents(freelancer, documents=docs, bank=bank):
        if not slot["required"]:
            continue
        if document_state(latest.get(slot["key"])) in ("uploaded", "under_review"):
            issues.append(_issue("documents", f"document:{slot['key']}", f"{slot['label']} has not been verified yet."))
    if bank is not None and bank.payment_method:
        if bank.payment_method == "bank_transfer" and bank.payment_status != "verified":
            issues.append(_issue("banking", "payment_status", "The bank account has not been verified yet."))
        elif bank.payment_status == "rejected":
            issues.append(_issue("banking", "payment_status", "The payout details were rejected by a reviewer."))
    if bank is not None and bank.tax_number:
        if uses_india_rules(freelancer) and bank.pan_verification_status != "verified":
            issues.append(_issue("identity", "pan_verification_status", "The PAN has not been verified yet."))
        elif bank.pan_verification_status == "rejected":
            issues.append(_issue("identity", "pan_verification_status", "The tax ID was rejected by a reviewer."))
    return issues


def step_completion(issues) -> dict:
    """{step: True when the step has no open issue} for the list cards."""
    open_steps = {issue["step"] for issue in issues}
    return {step: step not in open_steps for step in STEP_KEYS}
