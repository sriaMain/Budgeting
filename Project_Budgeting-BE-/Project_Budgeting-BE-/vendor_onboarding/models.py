from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from cloudinary.models import CloudinaryField

from accounts.models import Vendor
from .validators import (
    pan_validator, cin_validator, tan_validator, udyam_validator,
    ifsc_validator, mobile_validator, gstin_validator,
)


class VendorAccessToken(models.Model):
    """Secure link credential. The raw token is stored directly (same convention
    as accounts.PasswordResetOTP.token) because vendor-facing emails need to
    rebuild the same link at multiple points in the lifecycle - it cannot be a
    one-way hash. Security instead comes from length/entropy + expiry +
    revocation + rate limiting on the public endpoints."""

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='access_tokens')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_used_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vendor_tokens_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        from django.utils import timezone
        return self.is_active and self.expires_at > timezone.now()

    def __str__(self):
        return f"Token for {self.vendor.vendor_reference_no}"


class VendorAccessLog(models.Model):
    """Audit trail of every successful public-link access."""

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='access_logs')
    token = models.ForeignKey(VendorAccessToken, on_delete=models.SET_NULL, null=True, blank=True, related_name='access_logs')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    accessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-accessed_at']

    def __str__(self):
        return f"Access to {self.vendor.vendor_reference_no} @ {self.accessed_at}"


class VendorOnboardingProfile(models.Model):
    MSME_CATEGORY_CHOICES = [
        ('micro', 'Micro'),
        ('small', 'Small'),
        ('medium', 'Medium'),
    ]

    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name='onboarding_profile')

    company_code = models.CharField(max_length=50, blank=True)
    plant = models.CharField(max_length=50, blank=True)

    contact_person_name = models.CharField(max_length=150, blank=True)
    contact_person_designation = models.CharField(max_length=100, blank=True)

    gst_registered = models.BooleanField(default=False)
    gstin = models.CharField(max_length=15, blank=True, validators=[gstin_validator])

    msme_registered = models.BooleanField(default=False)
    udyam_number = models.CharField(max_length=30, blank=True, validators=[udyam_validator])
    msme_category = models.CharField(max_length=10, choices=MSME_CATEGORY_CHOICES, blank=True)

    # Registered office address
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    pin_code = models.CharField(max_length=20, blank=True)
    landmark = models.CharField(max_length=255, blank=True)

    vendor_introduction = models.TextField(blank=True)

    finance_manager_name = models.CharField(max_length=150, blank=True)
    finance_manager_email = models.EmailField(blank=True)
    finance_manager_mobile = models.CharField(max_length=15, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile for {self.vendor.name}"


class VendorKYC(models.Model):
    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name='kyc')

    country_of_tax_residence = models.CharField(max_length=100, blank=True)
    pan = models.CharField(max_length=10, blank=True, validators=[pan_validator])

    cin = models.CharField(max_length=21, blank=True, validators=[cin_validator])
    incorporation_date = models.DateField(null=True, blank=True)

    tan = models.CharField(max_length=10, blank=True, validators=[tan_validator])
    tan_mobile = models.CharField(max_length=15, blank=True, validators=[mobile_validator])

    epf_number = models.CharField(max_length=30, blank=True)
    esic_number = models.CharField(max_length=30, blank=True)
    esic_district = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"KYC for {self.vendor.name}"


class VendorBankDetail(models.Model):
    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name='bank_detail')

    bank_name = models.CharField(max_length=150, blank=True)
    account_holder_name = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=34, blank=True)
    ifsc_code = models.CharField(max_length=11, blank=True, validators=[ifsc_validator])

    bank_id = models.CharField(max_length=50, blank=True)
    bank_country_key = models.CharField(max_length=10, blank=True)
    bank_control_key = models.CharField(max_length=10, blank=True)
    branch = models.CharField(max_length=150, blank=True)
    region = models.CharField(max_length=100, blank=True)
    street = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def mask_account_number(self):
        if not self.account_number or len(self.account_number) < 4:
            return self.account_number
        return "X" * (len(self.account_number) - 4) + self.account_number[-4:]

    def __str__(self):
        return f"Bank detail for {self.vendor.name}"


class VendorProcurementDetail(models.Model):
    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name='procurement_detail')

    account_group = models.CharField(max_length=100, blank=True)
    purchasing_org = models.CharField(max_length=100, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    order_currency = models.CharField(max_length=3, blank=True)

    grouping_key = models.CharField(max_length=100, blank=True)
    partner_category = models.CharField(max_length=100, blank=True)
    incoterms_1 = models.CharField(max_length=100, blank=True)
    incoterms_2 = models.CharField(max_length=150, blank=True)
    reconciliation_account = models.CharField(max_length=100, blank=True)
    schema_group = models.CharField(max_length=100, blank=True)
    gr_based_invoice_verification = models.BooleanField(default=False)
    check_double_invoice = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Procurement detail for {self.vendor.name}"


class VendorDocument(models.Model):
    CATEGORY_CHOICES = [
        ('pan', 'PAN Document'),
        ('gst_certificate', 'GST Certificate'),
        ('cin_incorporation_certificate', 'CIN / Incorporation Certificate'),
        ('msme_udyam_certificate', 'UDYAM / MSME Certificate'),
        ('epf_certificate', 'EPF Certificate'),
        ('esic_certificate', 'ESIC Certificate'),
        ('bank_proof_cancelled_cheque', 'Bank Proof - Cancelled Cheque'),
        ('bank_proof_bank_statement', 'Bank Proof - Bank Statement'),
        ('bank_proof_bank_certificate', 'Bank Proof - Bank Certificate'),
        ('other', 'Other Document'),
    ]

    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('verified', 'Verified'),
    ]

    UPLOADED_BY_ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('vendor', 'Vendor'),
    ]

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='documents')

    file = CloudinaryField(
        "vendor_document",
        folder="vendor_documents",
        resource_type="raw",
        type="upload",
    )

    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    file_type = models.CharField(max_length=100)

    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES)
    is_required = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vendor_documents_uploaded',
    )
    uploaded_by_role = models.CharField(max_length=10, choices=UPLOADED_BY_ROLE_CHOICES, default='vendor')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name} ({self.vendor.name})"


class VendorChangeRequest(models.Model):
    SECTION_CHOICES = [
        ('vendor_details', 'Vendor Details'),
        ('kyv_compliance', 'KYV / Compliance'),
        ('bank_details', 'Bank Details'),
        ('business_procurement', 'Business / Procurement'),
        ('documents', 'Documents'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('resolved', 'Resolved'),
    ]

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='change_requests')
    section = models.CharField(max_length=30, choices=SECTION_CHOICES)
    required_changes = models.TextField()
    comments = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vendor_change_requests_made',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"{self.get_section_display()} change request for {self.vendor.name}"


class VendorSubmissionVersion(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveSmallIntegerField()
    snapshot = models.JSONField(default=dict)
    is_resubmission = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('vendor', 'version_number')
        ordering = ['version_number']

    def __str__(self):
        return f"{self.vendor.vendor_reference_no} v{self.version_number}"


class VendorApprovalWorkflowConfig(models.Model):
    """One row = one approval chain applicable to a (company_code, plant, vendor_type) scope.
    Any of the three left null/blank acts as a wildcard for that dimension."""

    name = models.CharField(max_length=150)
    company_code = models.CharField(max_length=50, blank=True, null=True)
    plant = models.CharField(max_length=50, blank=True, null=True)
    vendor_type = models.CharField(max_length=20, choices=Vendor.VENDOR_TYPE_CHOICES, blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_configs_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def specificity(self):
        """Higher = more specific match; used to pick the best-matching config."""
        return sum(1 for f in (self.company_code, self.plant, self.vendor_type) if f)

    def __str__(self):
        return self.name


class VendorApprovalLevel(models.Model):
    config = models.ForeignKey(VendorApprovalWorkflowConfig, on_delete=models.CASCADE, related_name='levels')
    level_order = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=150)

    approver_role = models.ForeignKey(
        'roles.Role', on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_approval_levels',
    )
    approver_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vendor_approval_levels',
    )

    class Meta:
        unique_together = ('config', 'level_order')
        ordering = ['level_order']

    def clean(self):
        if bool(self.approver_role_id) == bool(self.approver_user_id):
            raise ValidationError("Exactly one of approver_role or approver_user must be set.")

    def __str__(self):
        return f"{self.config.name} - Level {self.level_order} ({self.name})"


class VendorApprovalInstance(models.Model):
    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name='approval_instance')
    resolved_config = models.ForeignKey(VendorApprovalWorkflowConfig, on_delete=models.PROTECT, related_name='instances')

    current_level_order = models.PositiveSmallIntegerField(null=True, blank=True)

    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    last_action_at = models.DateTimeField(auto_now=True)

    def current_level(self):
        if self.current_level_order is None:
            return None
        return self.resolved_config.levels.filter(level_order=self.current_level_order).first()

    def __str__(self):
        return f"Approval instance for {self.vendor.name}"


class VendorApprovalHistory(models.Model):
    ACTION_CHOICES = [
        ('invited', 'Invited'),
        ('submitted', 'Submitted'),
        ('resubmitted', 'Resubmitted'),
        ('approved', 'Approved'),
        ('requested_changes', 'Requested Changes'),
    ]

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='approval_history')
    level_order = models.PositiveSmallIntegerField(null=True, blank=True)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vendor_approval_actions',
    )
    actor_role_snapshot = models.CharField(max_length=150, blank=True)

    action = models.CharField(max_length=25, choices=ACTION_CHOICES)
    previous_status = models.CharField(max_length=25, blank=True)
    new_status = models.CharField(max_length=25, blank=True)

    comments = models.TextField(blank=True)
    required_changes = models.TextField(blank=True)

    change_request = models.ForeignKey(
        VendorChangeRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name='history_entries',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Vendor approval history"
        ordering = ['created_at']

    def __str__(self):
        return f"{self.vendor.name}: {self.action} @ {self.created_at}"
