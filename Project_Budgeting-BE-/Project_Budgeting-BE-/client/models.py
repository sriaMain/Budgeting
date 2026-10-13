from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from cloudinary.models import CloudinaryField
from phonenumber_field.modelfields import PhoneNumberField

from core.app_constants import CURRENCY_CHOICES
from core.countries import is_india

class CompanyTag(models.Model):

    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


gstin_validator = RegexValidator(
    regex=r"^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
    message="Enter a valid GSTIN (15 characters)."
)

pan_validator = RegexValidator(
    regex=r"^[A-Z]{5}\d{4}[A-Z]{1}$",
    message="Enter a valid PAN (10 characters, e.g. AAAAA9999A)."
)


class Company(models.Model):
    CLIENT_TYPE_CHOICES = [
        ("individual", "Individual"),
        ("company", "Company"),
        ("government", "Government"),
        ("other", "Other"),
    ]

    # draft -> submitted (maker, POST submit/) -> verified (approver, POST approve/).
    # A reviewer's change request moves it to changes_requested; resolving the last open
    # request returns it to draft. enhanced_review / review_due are compliance flags.
    KYC_STATUS_CHOICES = [
        ("draft", "Draft"),
        ("submitted", "Submitted - awaiting approval"),
        ("changes_requested", "Changes Requested"),
        ("verified", "Verified"),
        ("enhanced_review", "Enhanced Review"),
        ("review_due", "Review Due"),
    ]

    RISK_RATING_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]

    ONBOARDING_STEP_CHOICES = [
        ("intake", "Intake"),
        ("identity_kyc", "Identity & KYC"),
        ("compliance", "Compliance"),
        ("banking", "Banking"),
        ("commercials", "Commercials"),
        ("approved", "Approved"),
    ]

    BANKING_VERIFICATION_STATUS_CHOICES = [
        ("not_verified", "Not Verified"),
        ("documents_uploaded", "Documents Uploaded"),
        ("under_review", "Under Review"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
    ]

    SANCTIONS_SCREENING_STATUS_CHOICES = [
        ("not_checked", "Not Checked"),
        ("in_progress", "In Progress"),
        ("passed", "Passed"),
        ("failed", "Failed"),
    ]

    BENEFICIAL_OWNERSHIP_STATUS_CHOICES = [
        ("not_verified", "Not Verified"),
        ("verified", "Verified"),
        ("failed", "Failed"),
    ]

    TAX_RESIDENCY_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("verified", "Verified"),
        ("requires_review", "Requires Review"),
    ]

    ENHANCED_DUE_DILIGENCE_STATUS_CHOICES = [
        ("not_required", "Not Required"),
        ("required", "Required"),
        ("completed", "Completed"),
    ]

    PAYMENT_TERMS_CHOICES = [
        ("due_on_receipt", "Due on Receipt"),
        ("net_15", "Net 15"),
        ("net_30", "Net 30"),
        ("net_45", "Net 45"),
        ("net_60", "Net 60"),
        ("net_90", "Net 90"),
        ("custom", "Custom"),
    ]

    INVOICE_REQUIREMENTS_CHOICES = [
        ("standard", "Standard Invoice"),
        ("po_required", "Client PO Required"),
        ("other", "Other"),
    ]

    BILLING_FREQUENCY_CHOICES = [
        ("one_time", "One Time"),
        ("monthly", "Monthly"),
        ("milestone_based", "Milestone Based"),
        ("custom", "Custom"),
    ]

    # General Information

    company_name = models.CharField(max_length=255, unique=True)
    mobile_number = PhoneNumberField(
        unique=True,
        help_text="Enter mobile number with country code (e.g. +919876543210)"
    )
    email = models.EmailField(unique=True)
    # Primary contact person at the client (an individual client is their own contact).
    contact_person = models.CharField(max_length=150, blank=True)
    # Optional - not a mandatory field
    gstin = models.CharField(
        max_length=15,
        blank=True,
        validators=[gstin_validator]
    )

    # Address
    address1 = models.CharField(max_length=255, blank=True)
    address2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    tags = models.ManyToManyField(
        CompanyTag,
        related_name="companies",
        blank=True
    )

    # KYC
    client_type = models.CharField(max_length=20, choices=CLIENT_TYPE_CHOICES, default="company")
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default="INR")
    registration_no = models.CharField(
        max_length=50, blank=True,
        help_text="CIN / LLPIN / company registration number"
    )
    pan = models.CharField(max_length=10, blank=True, validators=[pan_validator])
    tax_id = models.CharField(
        max_length=50, blank=True,
        help_text="Overseas equivalent of GSTIN/PAN - VAT / EIN / Tax ID. No fixed format (varies by country)."
    )
    authorised_signatory_name = models.CharField(max_length=150, blank=True)
    authorised_signatory_role = models.CharField(max_length=100, blank=True)

    # Bank details. Identifiers are country-specific (core.countries.bank_config): India uses
    # the IFSC, other countries a local routing code (ABA / sort code / BSB / transit ...),
    # plus SWIFT / IBAN where they apply.
    bank_account_holder_name = models.CharField(max_length=150, blank=True)
    bank_name = models.CharField(max_length=150, blank=True)
    bank_account_number = models.CharField(max_length=34, blank=True)
    bank_ifsc_code = models.CharField(max_length=11, blank=True)
    bank_swift_code = models.CharField(max_length=11, blank=True)
    bank_iban = models.CharField(max_length=34, blank=True)
    bank_routing_code = models.CharField(
        max_length=34, blank=True,
        help_text="Local routing identifier outside India - ABA, sort code, BSB, transit number ...",
    )
    bank_account_type = models.CharField(max_length=20, blank=True)
    # Legacy single "IFSC / SWIFT / IBAN" field. Kept read-only: migration 0016 copied each
    # value into the matching field above and the forms no longer write it.
    bank_code = models.CharField(
        max_length=34, blank=True,
        help_text="Legacy IFSC / SWIFT / IBAN (read-only - see bank_ifsc_code / bank_swift_code / bank_iban / bank_routing_code)"
    )
    bank_branch = models.CharField(max_length=150, blank=True)
    bank_country = models.CharField(max_length=100, blank=True)
    bank_address = models.CharField(max_length=255, blank=True)
    banking_verification_status = models.CharField(
        max_length=20, choices=BANKING_VERIFICATION_STATUS_CHOICES, default="not_verified"
    )

    # Compliance
    sanctions_screening_status = models.CharField(
        max_length=20, choices=SANCTIONS_SCREENING_STATUS_CHOICES, default="not_checked"
    )
    beneficial_ownership_status = models.CharField(
        max_length=20, choices=BENEFICIAL_OWNERSHIP_STATUS_CHOICES, default="not_verified"
    )
    tax_residency_status = models.CharField(
        max_length=20, choices=TAX_RESIDENCY_STATUS_CHOICES, default="pending"
    )
    enhanced_due_diligence_status = models.CharField(
        max_length=20, choices=ENHANCED_DUE_DILIGENCE_STATUS_CHOICES, default="not_required"
    )
    compliance_remarks = models.TextField(blank=True)
    compliance_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="client_compliance_reviews",
    )
    compliance_reviewed_at = models.DateTimeField(null=True, blank=True)

    # Commercials
    payment_terms = models.CharField(max_length=20, choices=PAYMENT_TERMS_CHOICES, default="net_30")
    custom_payment_terms = models.CharField(max_length=150, blank=True)
    withholding_tax_applicable = models.BooleanField(default=False)
    withholding_tax_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    invoice_requirements = models.CharField(
        max_length=20, choices=INVOICE_REQUIREMENTS_CHOICES, default="standard"
    )
    po_required = models.BooleanField(default=False)
    billing_frequency = models.CharField(
        max_length=20, choices=BILLING_FREQUENCY_CHOICES, default="monthly"
    )
    billing_contact = models.CharField(max_length=150, blank=True)
    billing_email = models.EmailField(blank=True)
    commercial_remarks = models.TextField(blank=True)

    kyc_status = models.CharField(max_length=20, choices=KYC_STATUS_CHOICES, default="draft")
    risk_rating = models.CharField(max_length=10, choices=RISK_RATING_CHOICES, default="low")
    onboarding_step = models.CharField(max_length=20, choices=ONBOARDING_STEP_CHOICES, default="intake")
    is_active = models.BooleanField(default=True)

    # Final approval
    kyc_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="client_kyc_approvals",
    )
    kyc_verified_at = models.DateTimeField(null=True, blank=True)
    approval_remarks = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name

    @property
    def street_address(self):
        """Backward-compatible combined address for consumers (PDFs, listings)
        that only need a single display string."""
        return ", ".join(p for p in (self.address1, self.address2) if p)

    @property
    def jurisdiction(self):
        """'Indian' for India in any accepted spelling ('India', 'IN', 'india', 'Bharat' ...).
        A blank country stays 'Indian' - legacy rows were created before country was required."""
        country = (self.country or "").strip()
        return "Indian" if not country or is_india(country) else "Overseas"

    @property
    def is_project_ready(self):
        return self.onboarding_step == "approved" and self.kyc_status == "verified"

    def mask_account_number(self):
        if not self.bank_account_number or len(self.bank_account_number) < 4:
            return self.bank_account_number
        return "X" * (len(self.bank_account_number) - 4) + self.bank_account_number[-4:]

    def onboarding_state(self):
        """Required documents, submission issues, approval blockers and per-step statuses,
        evaluated together from one read of the client's documents (client/onboarding.py)."""
        from .onboarding import evaluate

        return evaluate(self)

    def get_step_status(self, step):
        """Returns 'pending' | 'in_progress' | 'completed' | 'requires_review' for one of the 6
        ONBOARDING_STEP_CHOICES keys. Always derived from stored fields/documents, never itself
        stored, so the stepper can never drift from the data it summarizes."""
        return self.onboarding_state().step_statuses.get(step, "pending")

    def get_approval_blockers(self):
        """Human-readable list of everything blocking Final Approval right now. Empty list means
        the client is ready to be approved (POST /client/<id>/approve/ re-checks it)."""
        return self.onboarding_state().approval_blockers

    def clean(self):
        if self.onboarding_step == "approved" and self.kyc_status != "verified":
            raise ValidationError({
                "onboarding_step": "A client cannot be marked Approved until KYC status is Verified."
            })

    def save(self, *args, **kwargs):
        # Automatic enhanced-review rule: high risk (unless Enhanced Due Diligence has already
        # been completed for it - spec section 9's "High Risk -> EDD Required" rule implies EDD
        # satisfies the risk, it doesn't block forever), failed sanctions screening, or an
        # overseas client with no current sanctions-screening document on file, must go through
        # enhanced review rather than resting in whatever status was last set manually. Kept in
        # sync with the approval blockers (client/onboarding.py), which use these same conditions
        # to decide if approval is even reachable - otherwise approval could set
        # kyc_status='verified' only for this method to downgrade it back on the very same write.
        if self.kyc_status == "verified":
            from .onboarding import needs_enhanced_review

            if needs_enhanced_review(self):
                self.kyc_status = "enhanced_review"

        super().save(*args, **kwargs)


class POC(models.Model):
    SALUTATION_CHOICES = [
        ("Mr.", "Mr."),
        ("Mrs.", "Mrs."),
        ("Ms.", "Ms."),
        ("Dr.", "Dr."),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='pocs')
    salutation = models.CharField(max_length=10, choices=SALUTATION_CHOICES, blank=True)
    first_name = models.CharField(max_length=100, blank=True)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    # Auto-derived from salutation/first/middle/last on save(); kept so
    # existing consumers that only display a POC's full name don't break.
    poc_name = models.CharField(max_length=150, blank=True, editable=False)
    designation = models.CharField(max_length=100)
    poc_mobile = PhoneNumberField(
        unique=True,
        help_text="Enter mobile number with country code (e.g. +919876543210)"
    )
    poc_email = models.EmailField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('company', 'first_name', 'last_name', 'poc_mobile', 'poc_email')

    def save(self, *args, **kwargs):
        self.poc_name = " ".join(
            part for part in (self.salutation, self.first_name, self.middle_name, self.last_name) if part
        ).strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.poc_name} ({self.company.company_name})"


class ClientDocument(models.Model):
    CATEGORY_CHOICES = [
        ("registration_certificate", "Registration Certificate"),
        ("tax_certificate", "Tax Certificate"),
        ("bank_proof", "Bank Proof"),
        ("authorised_signatory_id", "Authorised Signatory ID"),
        ("sanctions_screening", "Sanctions Screening"),
        ("gst_certificate", "GST Certificate"),
        ("pan_document", "PAN Document"),
        ("cin_llpin", "CIN / LLPIN"),
        ("w8ben_e", "W-8BEN-E"),
        ("beneficial_ownership_proof", "Beneficial Ownership Document"),
        ("tax_residency_certificate", "Tax Residency Document"),
        ("government_id", "Government Photo ID"),
        ("other", "Other Document"),
    ]

    STATUS_CHOICES = [
        ("uploaded", "Uploaded"),
        ("under_review", "Under Review"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
        ("expired", "Expired"),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='documents')

    file = CloudinaryField(
        "client_document",
        folder="client_documents",
        resource_type="raw",
        type="upload",
    )

    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    file_type = models.CharField(max_length=100)

    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES)
    is_required = models.BooleanField(default=False)
    # Stored status never becomes "expired" by itself - effective_document_status() derives it
    # from expiry_date on read (core/document_security.py).
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    expiry_date = models.DateField(null=True, blank=True)
    document_number = models.CharField(max_length=100, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_documents_uploaded',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_documents_verified',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.company.company_name})"


class ClientAuditLog(models.Model):
    """Tracks changes to a client's KYC/business-critical fields (status
    changes, risk-rating changes, document uploads, create/update/delete).
    Mirrors FreelancerAuditLog/FinancialAuditLog's shape, with one deliberate
    difference: unlike Freelancer (never hard-deleted), Company rows here
    CAN be hard-deleted, so the FK is SET_NULL (not CASCADE) and the
    company's name is snapshotted at write time - otherwise a "deleted"
    entry would itself be destroyed the instant the company row disappears,
    defeating the point of logging the deletion at all. Sensitive values
    (bank details) must be masked by the caller before being passed in -
    never store the raw value here."""

    ACTION_CHOICES = [
        ("created", "Client Created"),
        ("updated", "Client Updated"),
        ("kyc_status_changed", "KYC Status Changed"),
        ("risk_rating_changed", "Risk Rating Changed"),
        ("document_uploaded", "Document Uploaded"),
        ("deleted", "Client Deleted"),
        ("compliance_updated", "Compliance Updated"),
        ("banking_verified", "Banking Verified"),
        ("banking_rejected", "Banking Rejected"),
        ("commercials_completed", "Commercials Completed"),
        # Legacy: logged by the old approve endpoint before it validated anything.
        ("kyc_submitted", "KYC Submitted for Approval"),
        ("change_requested", "Changes Requested"),
        ("change_resolved", "Change Request Resolved"),
        ("project_ready_marked", "Marked Project Ready"),
        ("submitted_for_approval", "Submitted for Approval"),
        ("document_verified", "Document Verified"),
        ("document_rejected", "Document Rejected"),
        ("document_under_review", "Document Marked Under Review"),
        ("document_deleted", "Document Deleted"),
        ("document_replaced", "Document Replaced"),
        ("bank_account_viewed", "Bank Account Number Viewed"),
    ]

    company = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs'
    )
    company_name = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    field_name = models.CharField(max_length=100, blank=True)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_audit_logs',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.company_name and self.company_id:
            self.company_name = self.company.company_name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_action_display()} - {self.company_name}"


class ClientChangeRequest(models.Model):
    """Mirrors vendor_onboarding.VendorChangeRequest exactly - a reviewer flags a section as
    needing changes before the client can be approved. Resolution is explicit (an admin/manager
    marks it resolved) rather than a separately stored "needs changes" flag on Company: whether
    a client has open change requests is always a live query (get_approval_blockers() checks it),
    never duplicated state that could drift."""

    SECTION_CHOICES = [
        ("intake", "Intake"),
        ("identity_kyc", "Identity & KYC"),
        ("address", "Address"),
        ("compliance", "Compliance"),
        ("banking", "Banking"),
        ("commercials", "Commercials"),
        ("documents", "Documents"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("resolved", "Resolved"),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='change_requests')
    section = models.CharField(max_length=20, choices=SECTION_CHOICES)
    required_changes = models.TextField()
    comments = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='client_change_requests_made',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"{self.get_section_display()} change request for {self.company.company_name}"