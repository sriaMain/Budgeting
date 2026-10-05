"""Vendor onboarding rules, progress and commercial summaries.

`vendor_requirement_issues()` is the single source of truth for what a vendor still needs:
submission (data + documents present) and approval (everything verified). The submit
validator, the approve endpoint, the 5-step stepper and the drawer's checklist all read it,
so they can never disagree. Nothing here is stored.
"""
import re
from datetime import date

from django.db.models import Count, Q, Sum

# The 5 vendor onboarding steps, in order.
VENDOR_ONBOARDING_STEPS = ("intake", "tax_kyc", "banking", "contract", "approved")

# VendorChangeRequest.section -> the step an open change request puts into "requires_review".
CHANGE_REQUEST_SECTION_TO_STEP = {
    "vendor_details": "intake",
    "kyv_compliance": "tax_kyc",
    "documents": "tax_kyc",
    "bank_details": "banking",
    "business_procurement": "contract",
}

INCORPORATED_VENDOR_TYPES = ("company", "llp")
# Individuals/proprietors sign for themselves - no separate signatory proof.
SIGNATORY_EXEMPT_VENDOR_TYPES = ("freelancer", "proprietorship")
BANK_PROOF_CATEGORIES = ("bank_proof_cancelled_cheque", "bank_proof_bank_statement", "bank_proof_bank_certificate")
# Contract documents don't count toward the KYC document cap.
NON_KYC_DOCUMENT_CATEGORIES = ("contract_document",)
MAX_VENDOR_KYC_DOCUMENTS = 8

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def _related(vendor, name):
    # Reverse one-to-ones raise RelatedObjectDoesNotExist (an AttributeError) when absent.
    return getattr(vendor, name, None)


def vendor_jurisdiction(vendor):
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    country = ((profile.country if profile else "") or (kyc.country_of_tax_residence if kyc else "")).strip().lower()
    return "Indian" if country in ("", "india", "in") else "Overseas"


def required_document_rules(vendor):
    """[(step, label, (categories...))] - one entry per required document, any category satisfies it."""
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    indian = vendor_jurisdiction(vendor) == "Indian"
    rules = []
    if indian:
        rules.append(("tax_kyc", "PAN Document", ("pan",)))
        if profile and profile.gst_registered:
            rules.append(("tax_kyc", "GST Certificate", ("gst_certificate",)))
        if vendor.vendor_type in INCORPORATED_VENDOR_TYPES:
            rules.append(("tax_kyc", "Certificate of Incorporation / CIN", ("cin_incorporation_certificate",)))
    else:
        rules.append(("tax_kyc", "Company Registration Document", ("registration_certificate", "cin_incorporation_certificate")))
        rules.append(("tax_kyc", "Tax Residency Document", ("tax_residency_certificate",)))
    if vendor.vendor_type and vendor.vendor_type not in SIGNATORY_EXEMPT_VENDOR_TYPES:
        rules.append(("tax_kyc", "Authorised Signatory Proof", ("authorised_signatory_proof",)))
    if profile and profile.msme_registered:
        rules.append(("intake", "UDYAM / MSME Certificate", ("msme_udyam_certificate",)))
    if kyc and kyc.epf_number:
        rules.append(("tax_kyc", "EPF Certificate", ("epf_certificate",)))
    if kyc and kyc.esic_number:
        rules.append(("tax_kyc", "ESIC Certificate", ("esic_certificate",)))
    rules.append(("banking", "Bank Letter / Cancelled Cheque" if indian else "Bank Letter", BANK_PROOF_CATEGORIES))
    return rules


def vendor_requirement_issues(vendor):
    """Everything outstanding, as [{key, step, stage, message}]:
    stage 'submission' = must be filled in / uploaded before submitting for review;
    stage 'approval'   = must be verified by an internal reviewer before final approval."""
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    bank = _related(vendor, "bank_detail")
    proc = _related(vendor, "procurement_detail")
    indian = vendor_jurisdiction(vendor) == "Indian"
    documents = list(vendor.documents.all())
    issues = []

    def need(key, step, message, stage="submission", kind="missing"):
        # kind "missing" = a label ("PAN"); "invalid" = a full sentence ("PAN format is invalid").
        issues.append({"key": key, "step": step, "stage": stage, "kind": kind, "message": message})

    # --- 1. Intake ---
    if not vendor.name:
        need("name", "intake", "Legal name")
    if not vendor.vendor_type:
        need("vendor_type", "intake", "Vendor type")
    if not vendor.email or not EMAIL_RE.match(vendor.email):
        need("email", "intake", "Contact email")
    if not profile or not profile.service_category:
        need("service_category", "intake", "Service category")
    if not profile or not profile.country:
        need("country", "intake", "Country")
    if not ((profile and profile.contact_person_name) or vendor.contact_person_name):
        need("contact_person_name", "intake", "Contact person")
    if not profile or not profile.address_line1:
        need("address_line1", "intake", "Registered address")
    if not profile or not profile.city:
        need("city", "intake", "City")
    if profile and profile.msme_registered:
        if not profile.udyam_number:
            need("udyam_number", "intake", "UDYAM number (MSME registered)")
        if not profile.msme_category:
            need("msme_category", "intake", "MSME category (MSME registered)")

    # --- 2. Tax & KYC ---
    if indian:
        if not kyc or not kyc.pan:
            need("pan", "tax_kyc", "PAN")
        elif not PAN_RE.match(kyc.pan):
            need("pan", "tax_kyc", "PAN format is invalid", kind="invalid")
        if profile and profile.gst_registered and not profile.gstin:
            need("gstin", "tax_kyc", "GSTIN (GST registered)")
        if vendor.vendor_type in INCORPORATED_VENDOR_TYPES:
            if not ((kyc and kyc.cin) or (profile and profile.registration_number)):
                need("cin", "tax_kyc", "CIN / LLPIN / registration number")
            if vendor.vendor_type == "company" and not (kyc and kyc.incorporation_date):
                need("incorporation_date", "tax_kyc", "Date of incorporation")
    else:
        if not kyc or not kyc.tax_id:
            need("tax_id", "tax_kyc", "VAT / EIN / Tax ID")
        if not kyc or not kyc.country_of_tax_residence:
            need("country_of_tax_residence", "tax_kyc", "Country of tax residence")
        has_bo_doc = any(d.category == "beneficial_ownership_proof" and d.status != "rejected" for d in documents)
        if not ((kyc and kyc.beneficial_ownership_details) or has_bo_doc):
            need("beneficial_ownership_details", "tax_kyc", "Beneficial ownership information")
    if kyc and kyc.tan and not kyc.tan_mobile:
        need("tan_mobile", "tax_kyc", "TAN associated mobile number")

    # --- 3. Banking ---
    for field, label in (("bank_name", "Bank name"), ("account_holder_name", "Account holder name"), ("account_number", "Account number")):
        if not bank or not getattr(bank, field):
            need(field, "banking", label)
    if indian:
        if not bank or not bank.ifsc_code:
            need("ifsc_code", "banking", "IFSC")
        elif not IFSC_RE.match(bank.ifsc_code):
            need("ifsc_code", "banking", "IFSC format is invalid", kind="invalid")
    else:
        if not bank or not (bank.swift_code or bank.iban):
            need("swift_code", "banking", "SWIFT or IBAN")
        if not bank or not bank.bank_country:
            need("bank_country", "banking", "Bank country")

    # --- 4. Contract ---
    if not proc or not proc.order_currency:
        need("order_currency", "contract", "Currency")
    if not proc or not proc.payment_terms:
        need("payment_terms", "contract", "Payment terms")
    elif proc.payment_terms == "custom" and not proc.custom_payment_terms:
        need("custom_payment_terms", "contract", "Custom payment terms")
    if not proc or not proc.billing_frequency:
        need("billing_frequency", "contract", "Billing frequency")
    if not proc or not proc.contract_start_date:
        need("contract_start_date", "contract", "Contract start date")
    if not proc or not proc.contract_end_date:
        need("contract_end_date", "contract", "Contract end date")
    elif proc.contract_start_date and proc.contract_end_date < proc.contract_start_date:
        need("contract_end_date", "contract", "Contract end date must be on or after the start date", kind="invalid")
    if proc and proc.withholding_tax_applicable and proc.withholding_tax_percentage is None:
        need("withholding_tax_percentage", "contract", "Withholding tax %")

    # --- Documents: present (submission) and verified (approval) ---
    for step, label, categories in required_document_rules(vendor):
        docs = [d for d in documents if d.category in categories]
        usable = [d for d in docs if d.status != "rejected"]
        key = f"document_{categories[0]}"
        if not usable:
            rejected = bool(docs)
            if rejected:
                need(key, step, f"{label} was rejected - upload a replacement", kind="invalid")
            else:
                need(key, step, label)
        elif not any(d.status == "verified" for d in usable):
            need(key, step, f"{label} must be verified", stage="approval", kind="invalid")

    # --- Approval-only checks (internal review) ---
    kyc_status = kyc.kyc_status if kyc else "draft"
    if kyc_status == "rejected":
        need("kyc_status", "tax_kyc", "KYC was rejected - blocking issue", stage="approval", kind="invalid")
    elif kyc_status != "verified":
        need("kyc_status", "tax_kyc", f"KYC status must be Verified (currently {kyc.get_kyc_status_display() if kyc else 'Draft'})", stage="approval", kind="invalid")
    if kyc and kyc.risk_rating == "high" and not kyc.compliance_remarks:
        need("compliance_remarks", "tax_kyc", "High-risk vendor: record the enhanced review in Compliance Remarks", stage="approval", kind="invalid")
    bank_status = bank.verification_status if bank else "not_verified"
    if bank_status == "rejected":
        need("bank_verification_status", "banking", "Bank verification was rejected - blocking issue", stage="approval", kind="invalid")
    elif bank_status != "verified":
        need("bank_verification_status", "banking", "Bank verification must be Verified", stage="approval", kind="invalid")
    if any(cr.status == "open" for cr in vendor.change_requests.all()):
        need("change_requests", "approved", "Open change requests must be resolved", stage="approval", kind="invalid")

    return issues


def compute_vendor_step_statuses(vendor, issues=None):
    """{step: 'pending' | 'in_progress' | 'completed' | 'requires_review' | 'failed'} for the 5 steps."""
    issues = vendor_requirement_issues(vendor) if issues is None else issues
    profile = _related(vendor, "onboarding_profile")
    kyc = _related(vendor, "kyc")
    bank = _related(vendor, "bank_detail")
    proc = _related(vendor, "procurement_detail")
    documents = list(vendor.documents.all())
    submission_gaps = {i["step"] for i in issues if i["stage"] == "submission"}

    started = {
        "intake": bool(profile and (profile.service_category or profile.address_line1 or profile.contact_person_name)),
        "tax_kyc": bool(kyc and (kyc.pan or kyc.tax_id or kyc.cin or kyc.country_of_tax_residence)),
        "banking": bool(bank and (bank.bank_name or bank.account_number)),
        "contract": bool(proc and (proc.payment_terms or proc.order_currency or proc.contract_number)),
    }
    statuses = {}
    for step in ("intake", "tax_kyc", "banking", "contract"):
        if step not in submission_gaps:
            statuses[step] = "completed"
        else:
            statuses[step] = "in_progress" if started[step] else "pending"

    step_doc_categories = {step: set() for step in VENDOR_ONBOARDING_STEPS}
    for step, _label, categories in required_document_rules(vendor):
        step_doc_categories[step].update(categories)
    rejected_doc_steps = {s for s, cats in step_doc_categories.items() if any(d.category in cats and d.status == "rejected" for d in documents)}

    if (kyc and kyc.kyc_status == "rejected") or "tax_kyc" in rejected_doc_steps:
        statuses["tax_kyc"] = "failed"
    elif kyc and kyc.kyc_status == "enhanced_review":
        statuses["tax_kyc"] = "requires_review"
    if (bank and bank.verification_status == "rejected") or "banking" in rejected_doc_steps:
        statuses["banking"] = "failed"

    if vendor.status == "approved":
        statuses["approved"] = "completed"
    elif vendor.status == "action_required":
        statuses["approved"] = "requires_review"
    elif vendor.status in ("submitted", "resubmitted", "approval_in_progress"):
        statuses["approved"] = "in_progress"
    else:
        statuses["approved"] = "pending"

    # An open change request always wins - the reviewer has flagged that step.
    for cr in vendor.change_requests.all():
        step = CHANGE_REQUEST_SECTION_TO_STEP.get(cr.section)
        if cr.status == "open" and step and statuses.get(step) != "failed":
            statuses[step] = "requires_review"
    return statuses


def summarize_vendor_onboarding(vendor):
    issues = vendor_requirement_issues(vendor)
    statuses = compute_vendor_step_statuses(vendor, issues)
    completed = sum(1 for s in VENDOR_ONBOARDING_STEPS if statuses[s] == "completed")
    current = next((s for s in VENDOR_ONBOARDING_STEPS if statuses[s] != "completed"), None)
    return {
        "step_statuses": statuses,
        "current_step": current,
        "completed_steps": completed,
        "total_steps": len(VENDOR_ONBOARDING_STEPS),
        "percent": round(completed * 100 / len(VENDOR_ONBOARDING_STEPS)),
        "jurisdiction": vendor_jurisdiction(vendor),
        "submission_issues": [i for i in issues if i["stage"] == "submission"],
        "approval_issues": [i for i in issues if i["stage"] == "approval"],
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
