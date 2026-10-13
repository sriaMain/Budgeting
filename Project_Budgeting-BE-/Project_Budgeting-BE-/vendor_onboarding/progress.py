"""Vendor onboarding rules, progress and commercial summaries.

`vendor_requirement_issues()` is the single source of truth for what a vendor still needs:
submission (data + documents present and well-formed) and approval (everything verified).
The submit validator, the approve endpoint, the onboarding wizard (admin drawer, full page and
vendor portal), the step cards and the progress percentage all read it, so they can never
disagree. Nothing here is stored.

Rules are country-aware: Indian vendors keep the statutory set (PAN / GSTIN / CIN-LLPIN / TAN /
EPF / ESIC / UDYAM, IFSC banking); every other country uses core.countries - the tax identifier
per country and entity (business vs individual), the postal-code format and the bank routing
rules of the bank's country.
"""
import re
from datetime import date

from django.db.models import Count, Q, Sum

from core import countries as country_rules
from core.document_security import document_counts_as_present, effective_document_status

from .validators import CIN_REGEX, GSTIN_REGEX, LLPIN_REGEX, PAN_REGEX, TAN_REGEX, UDYAM_REGEX

# The onboarding steps, in order - the same steps the onboarding wizard shows. The wizard's last
# step ("Review & Submit") is "approved" here: it completes when the vendor is approved.
VENDOR_ONBOARDING_STEPS = ("basic", "kyc", "address", "banking", "commercial", "documents", "approved")
STEP_TITLES = {
    "basic": "Basic Information",
    "kyc": "Identity & KYC",
    "address": "Address",
    "banking": "Banking",
    "commercial": "Commercial",
    "documents": "KYC Documents",
    "approved": "Review & Approval",
}

# VendorChangeRequest.section -> the steps an open change request puts into "requires_review".
CHANGE_REQUEST_SECTION_TO_STEPS = {
    "vendor_details": ("basic", "address"),
    "kyv_compliance": ("kyc",),
    "documents": ("documents",),
    "bank_details": ("banking",),
    "business_procurement": ("commercial",),
}

INCORPORATED_VENDOR_TYPES = ("company", "llp")
# Vendor types that are a natural person (tax ID / documents of an individual).
INDIVIDUAL_VENDOR_TYPES = ("freelancer", "proprietorship")
# Individuals/proprietors sign for themselves - no separate signatory proof.
SIGNATORY_EXEMPT_VENDOR_TYPES = INDIVIDUAL_VENDOR_TYPES
BANK_PROOF_CATEGORIES = ("bank_proof_cancelled_cheque", "bank_proof_bank_statement", "bank_proof_bank_certificate")
# Contract and miscellaneous documents don't count toward the KYC document cap.
NON_KYC_DOCUMENT_CATEGORIES = ("contract_document", "other")
MAX_VENDOR_KYC_DOCUMENTS = 8
# Documents whose validity ends (the upload form asks for an expiry date).
EXPIRY_TRACKED_CATEGORIES = (
    "government_id", "registration_certificate", "tax_residency_certificate", "tax_form", "authorised_signatory_proof",
)

# Order currencies the commercial step offers (finance can price and convert these).
ONBOARDING_CURRENCIES = ("INR", "USD", "EUR", "GBP", "AED", "SGD")
PAYMENT_TERM_CHOICES = (
    ("due_on_receipt", "Due on Receipt"), ("net_15", "Net 15"), ("net_30", "Net 30"), ("net_45", "Net 45"),
    ("net_60", "Net 60"), ("net_90", "Net 90"), ("custom", "Custom"),
)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PAN_RE = re.compile(PAN_REGEX)
GSTIN_RE = re.compile(GSTIN_REGEX)
CIN_RE = re.compile(CIN_REGEX)
LLPIN_RE = re.compile(LLPIN_REGEX)
TAN_RE = re.compile(TAN_REGEX)
UDYAM_RE = re.compile(UDYAM_REGEX)

# A PAN's 4th character is the holder type; these vendor types must match it.
PAN_HOLDER_TYPES = {"company": "C", "llp": "F", "partnership": "F", "freelancer": "P", "proprietorship": "P"}
PAN_HOLDER_LABELS = {
    "C": "a company", "F": "a firm / LLP", "P": "an individual", "H": "a Hindu undivided family", "A": "an association of persons",
    "T": "a trust", "B": "a body of individuals", "L": "a local authority", "J": "an artificial juridical person", "G": "a government body",
}


def _related(vendor, name):
    # Reverse one-to-ones raise RelatedObjectDoesNotExist (an AttributeError) when absent.
    return getattr(vendor, name, None)


def vendor_entity(vendor_type):
    """'individual' for a natural person (freelancer / proprietor), otherwise 'business'."""
    return "individual" if vendor_type in INDIVIDUAL_VENDOR_TYPES else "business"


def pan_vendor_type_mismatch(pan, vendor_type):
    """A user-facing message when a well-formed PAN's holder type contradicts the vendor type, else None."""
    pan = (pan or "").strip().upper()
    expected = PAN_HOLDER_TYPES.get(vendor_type or "")
    if not expected or not PAN_RE.match(pan) or pan[3] == expected:
        return None
    holder = PAN_HOLDER_LABELS.get(pan[3], "another kind of holder")
    return f"This PAN belongs to {holder} (4th letter {pan[3]}), which doesn't match the vendor type - check the PAN or the vendor type."


def cin_is_valid(value, vendor_type):
    """A company needs a CIN; an LLP may give its LLPIN (or a CIN); anything else accepts either."""
    value = (value or "").strip().upper()
    if vendor_type == "company":
        return bool(CIN_RE.match(value))
    return bool(CIN_RE.match(value) or LLPIN_RE.match(value))


def vendor_country_code(vendor):
    """ISO alpha-2 of the vendor's country (falling back to its country of tax residence), or None."""
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    return (country_rules.resolve_country(profile.country if profile else "")
            or country_rules.resolve_country(kyc.country_of_tax_residence if kyc else ""))


def vendor_is_indian(vendor):
    """India keeps the statutory rule set. A vendor with no country at all is treated as Indian
    (records created before the country was collected); unrecognised free text is not."""
    code = vendor_country_code(vendor)
    if code:
        return code == "IN"
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    raw = ((profile.country if profile else "") or (kyc.country_of_tax_residence if kyc else "") or "").strip()
    return not raw


def vendor_jurisdiction(vendor):
    return "Indian" if vendor_is_indian(vendor) else "Overseas"


def bank_country_code(vendor, bank=None):
    """The bank's country; a blank bank country defaults to the vendor's country."""
    bank = bank if bank is not None else _related(vendor, "bank_detail")
    code = country_rules.resolve_country(bank.bank_country) if bank and bank.bank_country else None
    return code or vendor_country_code(vendor) or ("IN" if vendor_is_indian(vendor) else None)


def required_document_rules(vendor):
    """[{key, label, categories, group}] - one entry per required document; any of `categories`
    satisfies it. `group` is the wizard group the slot is shown in ('kyc' or 'banking')."""
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    indian = vendor_is_indian(vendor)
    business = vendor_entity(vendor.vendor_type) == "business"
    rules = []

    def rule(label, *categories, group="kyc"):
        rules.append({"key": categories[0], "label": label, "categories": categories, "group": group})

    if indian:
        rule("PAN Card", "pan")
        if profile and profile.gst_registered:
            rule("GST Registration Certificate", "gst_certificate")
        if vendor.vendor_type in INCORPORATED_VENDOR_TYPES:
            rule("Certificate of Incorporation / LLP Certificate", "cin_incorporation_certificate")
        if profile and profile.msme_registered:
            rule("UDYAM / MSME Certificate", "msme_udyam_certificate")
        if kyc and kyc.epf_number:
            rule("EPF Registration Certificate", "epf_certificate")
        if kyc and kyc.esic_number:
            rule("ESIC Registration Certificate", "esic_certificate")
    else:
        if business:
            rule("Company Registration Document", "registration_certificate", "cin_incorporation_certificate")
        else:
            rule("Government ID (Passport / National ID)", "government_id")
        rule("Tax Residency Document", "tax_residency_certificate")
    if vendor.vendor_type and vendor.vendor_type not in SIGNATORY_EXEMPT_VENDOR_TYPES:
        rule("Authorised Signatory Proof", "authorised_signatory_proof")
    rule("Bank Proof (cancelled cheque, bank letter or statement)" if indian else "Bank Letter / Bank Statement",
         *BANK_PROOF_CATEGORIES, group="banking")
    return rules


def count_kyc_documents(documents, exclude_ids=()):
    """Documents counted toward MAX_VENDOR_KYC_DOCUMENTS: rejected documents, contract /
    miscellaneous documents and a document being replaced don't count."""
    return sum(
        1 for d in documents
        if d.category not in NON_KYC_DOCUMENT_CATEGORIES and d.status != "rejected" and d.id not in exclude_ids
    )


def _phone_ok(value, country):
    try:
        country_rules.normalize_phone(value, default_country=country or "IN")
    except country_rules.PhoneValidationError:
        return False
    return True


def vendor_requirement_issues(vendor):
    """Everything outstanding, as [{key, step, stage, kind, message}]:
    stage 'submission' = must be filled in / uploaded before submitting for review;
    stage 'approval'   = must be verified by an internal reviewer before final approval.
    `key` is the form field the issue belongs to (or document_<category>)."""
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    bank = _related(vendor, "bank_detail")
    proc = _related(vendor, "procurement_detail")
    code = vendor_country_code(vendor)
    indian = vendor_is_indian(vendor)
    entity = vendor_entity(vendor.vendor_type)
    documents = list(vendor.documents.all())
    issues = []

    def need(key, step, message, stage="submission", kind="missing"):
        # kind "missing" = a label ("PAN"); "invalid" = a full sentence ("PAN format is invalid").
        issues.append({"key": key, "step": step, "stage": stage, "kind": kind, "message": message})

    # --- Basic information ---
    if not (vendor.first_name or vendor.name or "").strip():
        need("first_name", "basic", "Legal name")
    if not vendor.vendor_type:
        need("vendor_type", "basic", "Vendor type")
    if not vendor.email:
        need("email", "basic", "Contact email")
    elif not EMAIL_RE.match(vendor.email):
        need("email", "basic", "Contact email is not a valid email address", kind="invalid")
    if vendor.phone and not _phone_ok(vendor.phone, code):
        need("phone", "basic", "Phone number is not valid - include the country dialing code", kind="invalid")
    if not profile or not profile.service_category:
        need("service_category", "basic", "Service category")
    raw_country = (profile.country if profile else "") or ""
    if not raw_country.strip():
        need("country", "basic", "Country")
    elif not country_rules.resolve_country(raw_country):
        need("country", "basic", "Country is not recognised - select it from the list", kind="invalid")
    if not ((profile and profile.contact_person_name) or vendor.contact_person_name):
        need("contact_person_name", "basic", "Contact person")
    if profile and profile.finance_manager_mobile and not _phone_ok(profile.finance_manager_mobile, code):
        need("finance_manager_mobile", "basic", "Finance manager mobile is not a valid phone number", kind="invalid")

    # --- Identity & KYC ---
    if indian:
        pan = (kyc.pan if kyc else "") or ""
        if not pan:
            need("pan", "kyc", "PAN")
        elif not PAN_RE.match(pan):
            need("pan", "kyc", "PAN format is invalid (e.g. ABCDE1234F)", kind="invalid")
        else:
            mismatch = pan_vendor_type_mismatch(pan, vendor.vendor_type)
            if mismatch:
                need("pan", "kyc", mismatch, kind="invalid")
        if profile and profile.gst_registered:
            if not profile.gstin:
                need("gstin", "kyc", "GSTIN (GST registered)")
            elif not GSTIN_RE.match(profile.gstin):
                need("gstin", "kyc", "GSTIN format is invalid (e.g. 22AAAAA0000A1Z5)", kind="invalid")
            elif PAN_RE.match(pan) and profile.gstin[2:12] != pan:
                need("gstin", "kyc", "GSTIN does not match the PAN (characters 3-12 of a GSTIN are the PAN)", kind="invalid")
        if vendor.vendor_type in INCORPORATED_VENDOR_TYPES:
            label = "CIN" if vendor.vendor_type == "company" else "LLPIN / CIN"
            cin = (kyc.cin if kyc else "") or ""
            if not cin and not (profile and profile.registration_number):
                need("cin", "kyc", label)
            elif cin and not cin_is_valid(cin, vendor.vendor_type):
                need("cin", "kyc", f"{label} format is invalid", kind="invalid")
            if not (kyc and kyc.incorporation_date):
                need("incorporation_date", "kyc", "Date of incorporation")
        if kyc and kyc.tan:
            if not TAN_RE.match(kyc.tan):
                need("tan", "kyc", "TAN format is invalid (e.g. ABCD12345E)", kind="invalid")
            if not kyc.tan_mobile:
                need("tan_mobile", "kyc", "Mobile number linked to the TAN")
        if profile and profile.msme_registered:
            if not profile.udyam_number:
                need("udyam_number", "kyc", "UDYAM registration number (MSME registered)")
            elif not UDYAM_RE.match(profile.udyam_number):
                need("udyam_number", "kyc", "UDYAM number format is invalid (e.g. UDYAM-MH-01-0000001)", kind="invalid")
            if not profile.msme_category:
                need("msme_category", "kyc", "MSME category")
    else:
        residence = (kyc.country_of_tax_residence if kyc else "") or ""
        tax_country = country_rules.resolve_country(residence) or code
        if not residence.strip():
            need("country_of_tax_residence", "kyc", "Country of tax residence")
        elif not country_rules.resolve_country(residence):
            need("country_of_tax_residence", "kyc", "Country of tax residence is not recognised", kind="invalid")
        if tax_country:
            rule = country_rules.tax_config(tax_country)[entity]
            tax_id = (kyc.tax_id if kyc else "") or ""
            if not tax_id:
                if rule["required"]:
                    need("tax_id", "kyc", rule["label"])
            else:
                message = country_rules.validate_tax_id(tax_id, tax_country, entity)
                if message:
                    need("tax_id", "kyc", message.rstrip("."), kind="invalid")
        if entity == "business":
            has_bo_doc = any(
                d.category == "beneficial_ownership_proof" and document_counts_as_present(d.status, d.expiry_date)
                for d in documents
            )
            if not ((kyc and (kyc.beneficial_ownership_details or "").strip()) or has_bo_doc):
                need("beneficial_ownership_details", "kyc", "Beneficial ownership details (or a beneficial ownership document)")

    # --- Address ---
    if not profile or not (profile.address_line1 or "").strip():
        need("address_line1", "address", "Address line 1")
    if not profile or not (profile.city or "").strip():
        need("city", "address", "City / town")
    if code:
        postal = country_rules.postal_config(code)
        pin = (profile.pin_code if profile else "") or ""
        if postal["has_postal_code"]:
            if not pin:
                if postal["required"]:
                    need("pin_code", "address", postal["label"])
            else:
                message = country_rules.validate_postal_code(pin, code)
                if message:
                    need("pin_code", "address", message.rstrip("."), kind="invalid")

    # --- Banking (rules of the bank's country; blank = the vendor's country) ---
    if bank and bank.bank_country and not country_rules.resolve_country(bank.bank_country):
        need("bank_country", "banking", "Bank country is not recognised - select it from the list", kind="invalid")
    bank_code = bank_country_code(vendor, bank)
    if bank_code:
        data = {
            key: (getattr(bank, key, "") or "") if bank else ""
            for key in ("account_holder_name", "account_number", "ifsc_code", "routing_code", "swift_code", "iban", "bank_name")
        }
        data["_has_saved_account_number"] = bool(data["account_number"])
        routing = country_rules.bank_config(bank_code).get("routing") or {}
        labels = {
            "account_holder_name": "Account holder name", "bank_name": "Bank name", "account_number": "Account number",
            "ifsc_code": routing.get("label") or "IFSC code", "routing_code": routing.get("label") or "Bank routing code",
            "swift_code": "SWIFT / BIC", "iban": "IBAN",
        }
        for field, message in country_rules.validate_bank_details(data, bank_code, partial=False).items():
            if data.get(field):
                need(field, "banking", message.rstrip("."), kind="invalid")
            else:
                need(field, "banking", labels.get(field, field.replace("_", " ").capitalize()))

    # --- Commercial ---
    if not proc or not proc.order_currency:
        need("order_currency", "commercial", "Order currency")
    if not proc or not proc.payment_terms:
        need("payment_terms", "commercial", "Payment terms")
    elif proc.payment_terms == "custom" and not proc.custom_payment_terms:
        need("custom_payment_terms", "commercial", "Custom payment terms")
    if not proc or not proc.billing_frequency:
        need("billing_frequency", "commercial", "Billing frequency")
    if not proc or not proc.contract_start_date:
        need("contract_start_date", "commercial", "Contract start date")
    if not proc or not proc.contract_end_date:
        need("contract_end_date", "commercial", "Contract end date")
    elif proc.contract_start_date and proc.contract_end_date < proc.contract_start_date:
        need("contract_end_date", "commercial", "Contract end date must be on or after the start date", kind="invalid")
    if proc and proc.withholding_tax_applicable and proc.withholding_tax_percentage is None:
        need("withholding_tax_percentage", "commercial", "Withholding tax %")

    # --- Documents: present (submission) and verified (approval) ---
    for rule in required_document_rules(vendor):
        docs = [d for d in documents if d.category in rule["categories"]]
        usable = [d for d in docs if document_counts_as_present(d.status, d.expiry_date)]
        key = f"document_{rule['key']}"
        if not usable:
            if docs:
                latest = max(docs, key=lambda d: (d.uploaded_at, d.id))
                state = effective_document_status(latest.status, latest.expiry_date)
                need(key, "documents",
                     f"{rule['label']} has expired - upload a current one" if state == "expired"
                     else f"{rule['label']} was rejected - upload a replacement", kind="invalid")
            else:
                need(key, "documents", rule["label"])
        elif not any(d.status == "verified" for d in usable):
            need(key, "documents", f"{rule['label']} must be verified", stage="approval", kind="invalid")

    # --- Approval-only checks (internal review) ---
    kyc_status = kyc.kyc_status if kyc else "draft"
    if kyc_status == "rejected":
        need("kyc_status", "kyc", "KYC was rejected - blocking issue", stage="approval", kind="invalid")
    elif kyc_status != "verified":
        need("kyc_status", "kyc", f"KYC status must be Verified (currently {kyc.get_kyc_status_display() if kyc else 'Draft'})",
             stage="approval", kind="invalid")
    if kyc and kyc.risk_rating == "high" and not kyc.compliance_remarks:
        need("compliance_remarks", "kyc", "High-risk vendor: record the enhanced review in Compliance Remarks", stage="approval", kind="invalid")
    bank_status = bank.verification_status if bank else "not_verified"
    if bank_status == "rejected":
        need("bank_verification_status", "banking", "Bank verification was rejected - blocking issue", stage="approval", kind="invalid")
    elif bank_status != "verified":
        need("bank_verification_status", "banking", "Bank account must be verified by a reviewer", stage="approval", kind="invalid")
    if any(cr.status == "open" for cr in vendor.change_requests.all()):
        need("change_requests", "approved", "Open change requests must be resolved", stage="approval", kind="invalid")

    return issues


def compute_vendor_step_statuses(vendor, issues=None):
    """{step: 'pending' | 'in_progress' | 'completed' | 'requires_review' | 'failed'}.

    A step is completed when it has no submission issue. Internal review results (KYC status,
    bank verification) are approval issues, not step states, so the vendor portal and the admin
    views see the same steps and the same percentage."""
    issues = vendor_requirement_issues(vendor) if issues is None else issues
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    bank = _related(vendor, "bank_detail")
    proc = _related(vendor, "procurement_detail")
    submission_gaps = {i["step"] for i in issues if i["stage"] == "submission"}

    started = {
        "basic": bool(vendor.vendor_type or vendor.email or (profile and (profile.service_category or profile.country))),
        "kyc": bool((kyc and (kyc.pan or kyc.tax_id or kyc.cin or kyc.country_of_tax_residence))
                    or (profile and (profile.gstin or profile.udyam_number))),
        "address": bool(profile and (profile.address_line1 or profile.city or profile.pin_code)),
        "banking": bool(bank and (bank.bank_name or bank.account_number or bank.ifsc_code or bank.iban or bank.routing_code)),
        "commercial": bool(proc and (proc.payment_terms or proc.order_currency or proc.contract_number or proc.billing_frequency)),
        # .all() reuses the list view's prefetch.
        "documents": bool(vendor.pk) and len(vendor.documents.all()) > 0,
    }
    statuses = {}
    for step in VENDOR_ONBOARDING_STEPS[:-1]:
        if step not in submission_gaps:
            statuses[step] = "completed"
        else:
            statuses[step] = "in_progress" if started[step] else "pending"

    # A rejected or expired required document fails the documents step.
    if any(i["step"] == "documents" and i["stage"] == "submission" and i["kind"] == "invalid" for i in issues):
        statuses["documents"] = "failed"

    if vendor.status == "approved":
        statuses["approved"] = "completed"
    elif vendor.status == "action_required":
        statuses["approved"] = "requires_review"
    elif vendor.status in ("submitted", "resubmitted", "approval_in_progress"):
        statuses["approved"] = "in_progress"
    else:
        statuses["approved"] = "pending"

    # An open change request wins - the reviewer has flagged that step.
    for cr in vendor.change_requests.all():
        if cr.status != "open":
            continue
        for step in CHANGE_REQUEST_SECTION_TO_STEPS.get(cr.section, ()):
            if statuses.get(step) != "failed":
                statuses[step] = "requires_review"
    return statuses


def summarize_vendor_onboarding(vendor, internal=True):
    """The one onboarding summary (and the one percentage) every view shows.

    `internal=False` (vendor portal) leaves out the internal approval checks - the steps,
    percentage and submission issues are identical either way."""
    issues = vendor_requirement_issues(vendor)
    statuses = compute_vendor_step_statuses(vendor, issues)
    completed = sum(1 for s in VENDOR_ONBOARDING_STEPS if statuses[s] == "completed")
    current = next((s for s in VENDOR_ONBOARDING_STEPS if statuses[s] != "completed"), None)
    code = vendor_country_code(vendor)
    return {
        "step_statuses": statuses,
        "current_step": current,
        "completed_steps": completed,
        "total_steps": len(VENDOR_ONBOARDING_STEPS),
        "percent": round(completed * 100 / len(VENDOR_ONBOARDING_STEPS)),
        "jurisdiction": vendor_jurisdiction(vendor),
        "country_code": code or ("IN" if vendor_is_indian(vendor) else None),
        "entity": vendor_entity(vendor.vendor_type),
        "submission_issues": [i for i in issues if i["stage"] == "submission"],
        "approval_issues": [i for i in issues if i["stage"] == "approval"] if internal else [],
        "required_documents": [
            {"key": r["key"], "label": r["label"], "categories": list(r["categories"]), "group": r["group"]}
            for r in required_document_rules(vendor)
        ],
        "kyc_documents": {"count": count_kyc_documents(vendor.documents.all()), "limit": MAX_VENDOR_KYC_DOCUMENTS},
    }


def current_financial_year_start(today=None):
    """Indian financial year: 1 April - 31 March."""
    today = today or date.today()
    return date(today.year if today.month >= 4 else today.year - 1, 4, 1)


def build_vendor_financials(vendor_ids):
    """{vendor_id: summary} for the given vendors in 4 grouped queries (no per-vendor N+1).
    Draft/cancelled POs are excluded - they aren't committed spend."""
    from finances.models import PurchaseOrder, VendorBill

    vendor_ids = list(vendor_ids)
    if not vendor_ids:
        return {}
    fy_start = current_financial_year_start()
    committed_pos = PurchaseOrder.objects.filter(vendor_id__in=vendor_ids).exclude(status__in=("draft", "cancelled"))

    summary = {
        vid: {
            "po_count": 0, "po_total": "0", "latest_po_no": None, "latest_po_issue_date": None,
            "billed_total": "0", "paid_total": "0", "outstanding_total": "0", "pending_bills": 0,
            "fy_spend": "0", "fy_start": fy_start.isoformat(), "po_consumption_percent": None,
        }
        for vid in vendor_ids
    }

    for row in committed_pos.values("vendor_id").annotate(total=Sum("total_amount"), count=Count("id")):
        summary[row["vendor_id"]].update(po_total=str(row["total"] or 0), po_count=row["count"])

    for row in committed_pos.order_by("vendor_id", "-issue_date", "-id").values("vendor_id", "po_no", "issue_date"):
        s = summary[row["vendor_id"]]
        if s["latest_po_no"] is None:
            s["latest_po_no"] = row["po_no"]
            s["latest_po_issue_date"] = row["issue_date"].isoformat() if row["issue_date"] else None

    bills = VendorBill.objects.filter(vendor_id__in=vendor_ids)
    for row in bills.values("vendor_id").annotate(
        billed=Sum("total_amount"), paid=Sum("paid_amount"), outstanding=Sum("balance_amount"),
        pending=Count("id", filter=~Q(status="paid")),
    ):
        summary[row["vendor_id"]].update(
            billed_total=str(row["billed"] or 0), paid_total=str(row["paid"] or 0),
            outstanding_total=str(row["outstanding"] or 0), pending_bills=row["pending"],
        )

    for row in bills.filter(bill_date__gte=fy_start).values("vendor_id").annotate(spend=Sum("total_amount")):
        summary[row["vendor_id"]]["fy_spend"] = str(row["spend"] or 0)

    for s in summary.values():
        po_total = float(s["po_total"])
        if po_total > 0:
            s["po_consumption_percent"] = min(100, round(float(s["billed_total"]) * 100 / po_total))
    return summary
