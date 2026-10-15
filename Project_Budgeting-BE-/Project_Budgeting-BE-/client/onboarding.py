"""
Client onboarding rules (Clients & KYC).

One place answers, for a Company:
  - which KYC documents it needs (document_slots) and the state of each one,
  - what still blocks the maker's "Submit for approval" (submission_issues),
  - what still blocks the approver's "Approve" (approval_blockers),
  - the per-step status shown on the onboarding step cards (step_statuses).

The rules depend on the client's jurisdiction (India vs overseas - core.countries) and client
type (individual vs business). Everything is evaluated from ONE read of the client's documents
and change requests, so list endpoints can prefetch `documents` / `change_requests` and avoid
per-row queries. Nothing here writes to the database.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import phonenumbers

from core import countries as rules
from core.document_security import document_counts_as_present, effective_document_status

# Wizard steps - the frontend uses the same keys to jump to the step that has a problem.
STEP_BASIC = "basic"
STEP_IDENTITY = "identity"
STEP_ADDRESS = "address"
STEP_BANKING = "banking"
STEP_COMMERCIALS = "commercials"
STEP_DOCUMENTS = "documents"

# The maker can submit from these statuses ...
SUBMITTABLE_STATUSES = ("draft", "changes_requested", "review_due", "enhanced_review")
# ... and the approver can approve from these. "draft" covers clients created before the
# maker's submit step existed.
APPROVABLE_STATUSES = ("submitted", "draft", "review_due", "enhanced_review")

REGISTRATION_REQUIRED_TYPES = ("company", "government")

# canonical bank key (core.countries.validate_bank_details) -> Company field
BANK_FIELD_MAP = {
    "account_holder_name": "bank_account_holder_name",
    "account_number": "bank_account_number",
    "ifsc_code": "bank_ifsc_code",
    "routing_code": "bank_routing_code",
    "swift_code": "bank_swift_code",
    "iban": "bank_iban",
    "bank_name": "bank_name",
}

# Documents that evidence identity (drive the legacy "Identity & KYC" step card).
IDENTITY_DOCUMENT_CATEGORIES = {
    "pan_document", "gst_certificate", "registration_certificate", "cin_llpin", "authorised_signatory_id",
    "government_id", "tax_certificate", "w8ben_e", "tax_residency_certificate",
}


def is_indian(company) -> bool:
    return company.jurisdiction == "Indian"


def is_individual(company) -> bool:
    return company.client_type == "individual"


def tax_entity(company) -> str:
    return "individual" if is_individual(company) else "business"


def registration_required(client_type: str) -> bool:
    return client_type in REGISTRATION_REQUIRED_TYPES


# --------------------------------------------------------------------------- #
# Documents                                                                    #
# --------------------------------------------------------------------------- #

# KYC documents are collected but never mandatory: no slot blocks submission or approval.
# Set to True to enforce the per-slot "required" rules below again.
KYC_DOCUMENTS_MANDATORY = False

# Submitting a client approves it straight away (Verified + project-ready): there is no separate
# reviewer approval step, so the reviewer checklist (documents verified, sanctions, beneficial
# ownership, tax residency, bank verified) never blocks. Set to False to restore maker/checker.
AUTO_APPROVE_ON_SUBMIT = True


@dataclass(frozen=True)
class DocumentSlot:
    category: str
    label: str
    required: bool
    tracks_expiry: bool = False
    help_text: str = ""
    # Other categories that satisfy this slot (e.g. a legacy "CIN / LLPIN" upload for the
    # incorporation certificate, or a W-8BEN-E instead of a tax certificate).
    alternates: tuple = ()
    # Produced by the compliance reviewer rather than the client: never blocks the maker's
    # submission, but (when required) must be on file and verified before approval.
    reviewer_only: bool = False

    @property
    def accepts(self) -> tuple:
        return (self.category, *self.alternates)


def document_slots(company) -> list[DocumentSlot]:
    """Every document slot shown for this client, required ones first."""
    indian = is_indian(company)
    individual = is_individual(company)
    slots: list[DocumentSlot] = []

    def add(category, label, required, **kwargs):
        slots.append(DocumentSlot(category, label, bool(required) and KYC_DOCUMENTS_MANDATORY, **kwargs))

    if indian:
        add("pan_document", "PAN card", True, help_text="Copy of the PAN card or PAN allotment letter.")
        if not individual:
            add("gst_certificate", "GST registration certificate", bool((company.gstin or "").strip()),
                help_text="Required when a GSTIN is entered.")
            add("registration_certificate", "Certificate of incorporation (CIN / LLPIN)",
                registration_required(company.client_type), alternates=("cin_llpin",))
            add("authorised_signatory_id", "Authorised signatory photo ID", True, tracks_expiry=True,
                help_text="Passport, driving licence or another government photo ID of the signatory.")
        add("bank_proof", "Bank proof (cancelled cheque or bank letter)", True)
        if not individual:
            add("beneficial_ownership_proof", "Beneficial ownership declaration", False)
        add("tax_residency_certificate", "Tax residency certificate", False, tracks_expiry=True)
        add("sanctions_screening", "Sanctions screening report", False, reviewer_only=True,
            help_text="Uploaded by the compliance reviewer.")
    else:
        if individual:
            add("government_id", "Government photo ID (passport / national ID)", True, tracks_expiry=True)
        else:
            add("registration_certificate", "Certificate of incorporation / business registration", True)
            add("tax_certificate", "Tax registration certificate or W-8BEN-E", True, tracks_expiry=True,
                alternates=("w8ben_e",), help_text="VAT / EIN / TIN registration certificate, or a signed W-8BEN-E.")
            add("authorised_signatory_id", "Authorised signatory photo ID", True, tracks_expiry=True,
                help_text="Passport or national ID of the person signing for the client.")
        add("tax_residency_certificate", "Tax residency certificate (TRC)", True, tracks_expiry=True,
            help_text="Issued by the client's tax authority for the current year.")
        add("bank_proof", "Bank proof (bank letter or statement)", True)
        if not individual:
            add("beneficial_ownership_proof", "Beneficial ownership declaration", False)
        add("sanctions_screening", "Sanctions screening report", True, reviewer_only=True,
            help_text="Uploaded and verified by the compliance reviewer before approval.")
    add("other", "Other supporting document", False)
    slots.sort(key=lambda s: (not s.required, s.reviewer_only))
    return slots


def required_categories(company) -> set:
    return {s.category for s in document_slots(company) if s.required}


def _documents(company) -> list:
    """All of the client's documents (served from the prefetch cache when the caller prefetched)."""
    if not company.pk:
        return []
    return list(company.documents.all())


def slot_document(slot: DocumentSlot, documents):
    """The document shown in a slot: the newest upload of the slot's own category, else the newest
    upload of an alternate category (the frontend applies the same rule)."""
    primary = [d for d in documents if d.category == slot.category]
    pool = primary or [d for d in documents if d.category in slot.alternates]
    return max(pool, key=lambda d: (d.uploaded_at, d.pk)) if pool else None


def slot_states(company, documents=None) -> list[dict]:
    documents = _documents(company) if documents is None else documents
    states = []
    for slot in document_slots(company):
        doc = slot_document(slot, documents)
        states.append({
            "category": slot.category,
            "label": slot.label,
            "required": slot.required,
            "tracks_expiry": slot.tracks_expiry,
            "help_text": slot.help_text,
            "accepts": list(slot.accepts),
            "reviewer_only": slot.reviewer_only,
            # missing | uploaded | under_review | verified | rejected | expired
            "status": effective_document_status(doc.status, doc.expiry_date) if doc else "missing",
            "document_id": doc.pk if doc else None,
            "expiry_date": doc.expiry_date.isoformat() if doc and doc.expiry_date else None,
        })
    return states


def has_current_document(company, category: str, documents=None) -> bool:
    documents = _documents(company) if documents is None else documents
    return any(d.category == category and document_counts_as_present(d.status, d.expiry_date) for d in documents)


# --------------------------------------------------------------------------- #
# Submission (maker)                                                           #
# --------------------------------------------------------------------------- #

def _phone_is_valid(value) -> bool:
    if not value:
        return False
    try:
        number = value if isinstance(value, phonenumbers.PhoneNumber) else phonenumbers.parse(str(value), None)
    except phonenumbers.NumberParseException:
        return False
    return phonenumbers.is_valid_number(number)


def _blank(value) -> bool:
    return not (str(value).strip() if value is not None else "")


def submission_issues(company, slots=None) -> list[dict]:
    """Everything the maker still has to provide before "Submit for approval".

    Each issue is {step, field, message}; `step` is a wizard step key and `field` the Company
    field (or document category) to highlight. Compliance review fields are not the maker's job
    and are checked at approval instead.
    """
    issues: list[dict] = []

    def add(step, field, message):
        issues.append({"step": step, "field": field, "message": message})

    country = (company.country or "").strip()
    code = rules.resolve_country(country)
    individual = is_individual(company)

    # Basic information
    if _blank(company.company_name):
        add(STEP_BASIC, "company_name", "Legal name is required.")
    if not country:
        add(STEP_BASIC, "country", "Country is required.")
    elif not code:
        add(STEP_BASIC, "country", "Select the client's country from the list.")
    if _blank(company.email):
        add(STEP_BASIC, "email", "Email is required.")
    if not _phone_is_valid(company.mobile_number):
        add(STEP_BASIC, "mobile_number", "A valid phone number with its country dialing code is required.")
    if company.currency not in rules.BILLING_CURRENCIES:
        add(STEP_BASIC, "currency", "Select the billing currency.")

    # Identity & KYC
    if is_indian(company):
        pan = (company.pan or "").strip().upper()
        gstin = (company.gstin or "").strip().upper()
        if not pan:
            add(STEP_IDENTITY, "pan", "PAN is required.")
        elif not re.match(rules.PAN_REGEX, pan):
            add(STEP_IDENTITY, "pan", "Enter a valid PAN (10 characters, e.g. AAAAA9999A).")
        if gstin:
            if not re.match(rules.GSTIN_REGEX, gstin):
                add(STEP_IDENTITY, "gstin", "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5).")
            elif pan and gstin[2:12] != pan:
                add(STEP_IDENTITY, "gstin", "The GSTIN doesn't match the PAN (characters 3-12 of a GSTIN are the PAN).")
    elif code:
        entity = tax_entity(company)
        rule = rules.tax_config(code)[entity]
        tax_id = (company.tax_id or "").strip()
        if not tax_id:
            if rule["required"]:
                add(STEP_IDENTITY, "tax_id", f"{rule['label']} is required.")
        else:
            message = rules.validate_tax_id(tax_id, code, entity)
            if message:
                add(STEP_IDENTITY, "tax_id", message)
    if registration_required(company.client_type) and _blank(company.registration_no):
        add(STEP_IDENTITY, "registration_no", "Registration number (CIN / LLPIN / company number) is required.")
    if not individual and _blank(company.authorised_signatory_name):
        add(STEP_IDENTITY, "authorised_signatory_name", "Authorised signatory name is required.")

    # Address
    if _blank(company.address1):
        add(STEP_ADDRESS, "address1", "Address line 1 is required.")
    if _blank(company.city):
        add(STEP_ADDRESS, "city", "City is required.")
    if code:
        postal = rules.postal_config(code)
        postal_code = (company.postal_code or "").strip()
        if postal["has_postal_code"]:
            if not postal_code:
                if postal["required"]:
                    add(STEP_ADDRESS, "postal_code", f"{postal['label']} is required.")
            else:
                message = rules.validate_postal_code(postal_code, code)
                if message:
                    add(STEP_ADDRESS, "postal_code", message)

    # Banking
    _bank_issues(company, add)

    # Commercials
    if _blank(company.billing_contact):
        add(STEP_COMMERCIALS, "billing_contact", "Billing contact is required.")
    if _blank(company.billing_email):
        add(STEP_COMMERCIALS, "billing_email", "Billing email is required.")
    if company.payment_terms == "custom" and _blank(company.custom_payment_terms):
        add(STEP_COMMERCIALS, "custom_payment_terms", "Describe the custom payment terms.")
    if company.withholding_tax_applicable and company.withholding_tax_percentage is None:
        add(STEP_COMMERCIALS, "withholding_tax_percentage", "Withholding tax % is required when withholding tax applies.")

    # KYC documents (missing, rejected or expired required documents block submission)
    slots = slot_states(company) if slots is None else slots
    for state in slots:
        if not state["required"] or state["reviewer_only"]:
            continue
        if state["status"] == "missing":
            add(STEP_DOCUMENTS, state["category"], f"{state['label']} is missing.")
        elif state["status"] == "rejected":
            add(STEP_DOCUMENTS, state["category"], f"{state['label']} was rejected - upload a corrected document.")
        elif state["status"] == "expired":
            add(STEP_DOCUMENTS, state["category"], f"{state['label']} has expired - upload a current document.")
    return issues


def bank_country_code(company) -> str:
    """The bank's country (falls back to the client's country; India when both are blank)."""
    return rules.resolve_country(company.bank_country) or rules.resolve_country(company.country) or "IN"


def _bank_issues(company, add) -> None:
    bank_country = (company.bank_country or "").strip()
    if bank_country and not rules.resolve_country(bank_country):
        add(STEP_BANKING, "bank_country", "Select the bank's country from the list.")
        return
    code = bank_country_code(company)
    data = {key: (getattr(company, field) or "") for key, field in BANK_FIELD_MAP.items()}
    data["_has_saved_account_number"] = bool(company.bank_account_number)
    for key, message in rules.validate_bank_details(data, code, partial=False).items():
        add(STEP_BANKING, BANK_FIELD_MAP.get(key, key), message)
    account_type = (company.bank_account_type or "").strip()
    if account_type:
        allowed = [value for value, _ in (rules.bank_config(code).get("account_types") or [])]
        if account_type not in allowed:
            add(STEP_BANKING, "bank_account_type", "Select a valid account type for the bank's country.")


# --------------------------------------------------------------------------- #
# Approval (checker)                                                           #
# --------------------------------------------------------------------------- #

def needs_enhanced_review(company, documents=None) -> bool:
    """High risk without completed EDD, failed sanctions screening, or an overseas client with no
    current sanctions-screening document. Company.save() moves a verified client with any of these
    into enhanced review, so approval_blockers() must block on the same conditions."""
    if company.risk_rating == "high" and company.enhanced_due_diligence_status != "completed":
        return True
    if company.sanctions_screening_status == "failed":
        return True
    if (KYC_DOCUMENTS_MANDATORY and not is_indian(company) and company.pk
            and not has_current_document(company, "sanctions_screening", documents)):
        return True
    return False


def approval_blockers(company, *, issues: list, slots: list, open_change_requests: bool) -> list[str]:
    if AUTO_APPROVE_ON_SUBMIT:
        # Only the submission requirements (required fields) remain.
        return [issue["message"] for issue in issues]
    blockers: list[str] = []
    if company.kyc_status == "changes_requested":
        blockers.append("Changes were requested - resolve them and resubmit the client.")

    blockers.extend(issue["message"] for issue in issues)

    for state in slots:
        if not state["required"]:
            continue
        if state["status"] in ("uploaded", "under_review"):
            blockers.append(f"{state['label']} must be verified by a reviewer.")
        elif state["reviewer_only"] and state["status"] == "missing":
            blockers.append(f"{state['label']} must be uploaded by the compliance reviewer.")
        elif state["reviewer_only"] and state["status"] in ("rejected", "expired"):
            blockers.append(f"{state['label']} is {state['status']} - upload a current report.")

    if company.sanctions_screening_status == "failed":
        blockers.append("Sanctions screening failed - the client cannot be approved.")
    elif company.sanctions_screening_status != "passed":
        blockers.append("Sanctions screening must be passed.")
    if not is_individual(company) and company.beneficial_ownership_status != "verified":
        blockers.append("Beneficial ownership must be verified.")
    if company.tax_residency_status != "verified":
        blockers.append("Tax residency must be verified.")
    if company.risk_rating == "high" and company.enhanced_due_diligence_status != "completed":
        blockers.append("Enhanced due diligence must be completed for a high-risk client.")

    if company.banking_verification_status == "rejected":
        blockers.append("The bank account was rejected by the reviewer - update the bank details.")
    elif company.banking_verification_status != "verified":
        blockers.append("The bank account must be verified by a reviewer.")

    if open_change_requests:
        blockers.append("Open change requests must be resolved.")
    return blockers


# --------------------------------------------------------------------------- #
# Step cards (list page / approval summary)                                    #
# --------------------------------------------------------------------------- #

def step_statuses(company, issues: list, slots: list) -> dict:
    """'pending' | 'in_progress' | 'completed' | 'requires_review' for each ONBOARDING_STEP_CHOICES key."""
    by_step: dict = {}
    for issue in issues:
        by_step.setdefault(issue["step"], []).append(issue)
    statuses = {}

    if not by_step.get(STEP_BASIC) and not by_step.get(STEP_ADDRESS):
        statuses["intake"] = "completed"
    else:
        statuses["intake"] = "in_progress" if any([company.company_name, company.email, company.country]) else "pending"

    identity_slots = [s for s in slots if s["required"] and s["category"] in IDENTITY_DOCUMENT_CATEGORIES]
    identity_doc_issues = [i for i in by_step.get(STEP_DOCUMENTS, []) if i["field"] in IDENTITY_DOCUMENT_CATEGORIES]
    if any(s["status"] == "rejected" for s in identity_slots):
        statuses["identity_kyc"] = "requires_review"
    elif not by_step.get(STEP_IDENTITY) and not identity_doc_issues:
        statuses["identity_kyc"] = "completed"
    else:
        touched = any([company.pan, company.gstin, company.tax_id, company.registration_no, company.authorised_signatory_name]) or any(
            s["status"] != "missing" for s in slots if s["category"] in IDENTITY_DOCUMENT_CATEGORIES
        )
        statuses["identity_kyc"] = "in_progress" if touched else "pending"

    if company.sanctions_screening_status == "failed":
        statuses["compliance"] = "requires_review"
    else:
        edd_ok = company.risk_rating != "high" or company.enhanced_due_diligence_status == "completed"
        bo_ok = is_individual(company) or company.beneficial_ownership_status == "verified"
        if company.sanctions_screening_status == "passed" and bo_ok and company.tax_residency_status == "verified" and edd_ok:
            statuses["compliance"] = "completed"
        else:
            touched = (
                company.sanctions_screening_status != "not_checked"
                or company.beneficial_ownership_status != "not_verified"
                or company.tax_residency_status != "pending"
            )
            statuses["compliance"] = "in_progress" if touched else "pending"

    bank_slot = next((s for s in slots if s["category"] == "bank_proof"), None)
    bank_proof_status = bank_slot["status"] if bank_slot else "missing"
    if company.banking_verification_status == "rejected" or bank_proof_status == "rejected":
        statuses["banking"] = "requires_review"
    elif (
        not by_step.get(STEP_BANKING)
        and company.banking_verification_status == "verified"
        and (not KYC_DOCUMENTS_MANDATORY or bank_proof_status in ("uploaded", "under_review", "verified"))
    ):
        statuses["banking"] = "completed"
    else:
        touched = any([company.bank_name, company.bank_account_number, company.bank_account_holder_name, company.bank_iban])
        statuses["banking"] = "in_progress" if touched else "pending"

    if not by_step.get(STEP_COMMERCIALS):
        statuses["commercials"] = "completed"
    else:
        statuses["commercials"] = "in_progress" if (company.billing_contact or company.billing_email) else "pending"

    statuses["approved"] = "completed" if company.is_project_ready else "pending"
    return statuses


# --------------------------------------------------------------------------- #
# Everything at once                                                           #
# --------------------------------------------------------------------------- #

@dataclass
class OnboardingState:
    slots: list
    submission_issues: list
    approval_blockers: list
    step_statuses: dict

    @property
    def required_documents(self) -> list:
        return [s for s in self.slots if s["required"]]


def evaluate(company) -> OnboardingState:
    documents = _documents(company)
    slots = slot_states(company, documents)
    issues = submission_issues(company, slots=slots)
    open_requests = bool(company.pk) and any(cr.status == "open" for cr in company.change_requests.all())
    blockers = approval_blockers(company, issues=issues, slots=slots, open_change_requests=open_requests)
    return OnboardingState(
        slots=slots,
        submission_issues=issues,
        approval_blockers=blockers,
        step_statuses=step_statuses(company, issues, slots),
    )
