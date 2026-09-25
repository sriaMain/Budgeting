from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from cloudinary.models import CloudinaryField

from .validators import (
    pan_validator, aadhaar_validator, uan_validator, ifsc_validator, mobile_validator,
)


class EmployeeOnboardingRequest(models.Model):
    """The master onboarding row - doubles as both the invite/status record and
    the employment-details container, the same way Vendor doubles as both the
    onboarding request and the master vendor record. Unlike Vendor, the
    identity itself (Account) already exists before this row is created."""

    EMPLOYMENT_TYPE_CHOICES = [
        ('full_time', 'Full-Time'),
        ('part_time', 'Part-Time'),
        ('contract', 'Contract'),
        ('intern', 'Intern'),
    ]

    STATUS_CHOICES = [
        ('invited', 'Invited'),
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('action_required', 'Action Required'),
        ('resubmitted', 'Resubmitted'),
        ('approved', 'Approved'),
    ]

    account = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='onboarding_request',
    )

    # --- Employment details (admin-owned, not employee-editable) ---
    # null=True/blank=True so a brand-new request can exist for the brief
    # instant before assign_employee_code() fills it in - same convention as
    # accounts.Vendor.vendor_reference_no, which is also auto-assigned right
    # after creation rather than passed in up front.
    employee_code = models.CharField(max_length=30, unique=True, null=True, blank=True, db_index=True)
    department = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    reporting_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='direct_reports',
    )
    joining_date = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, blank=True)
    work_location = models.CharField(max_length=150, blank=True)
    pf_applicable = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='invited', db_index=True)
    last_saved_step = models.PositiveSmallIntegerField(default=1)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_onboarding_requests_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def current_token(self):
        return self.access_tokens.filter(is_active=True).order_by('-created_at').first()

    def assign_employee_code(self):
        """Atomically assigns EMP-<year>-<seq> the first time a request is
        saved without one - mirrors accounts.Vendor.assign_reference_number()."""
        if self.employee_code:
            return self.employee_code
        year = (self.created_at or timezone.now()).year
        with transaction.atomic():
            seq, _ = EmployeeCodeSequence.objects.select_for_update().get_or_create(year=year)
            seq.last_number += 1
            seq.save(update_fields=['last_number'])
            self.employee_code = f"EMP-{year}-{seq.last_number:06d}"
        return self.employee_code

    def __str__(self):
        return f"Onboarding for {self.account.display_name or self.account.username} ({self.employee_code})"


class EmployeeCodeSequence(models.Model):
    year = models.PositiveIntegerField(unique=True)
    last_number = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.year}: {self.last_number}"


class EmployeePersonalDetail(models.Model):
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Other'),
    ]

    request = models.OneToOneField(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='personal_detail')

    middle_name = models.CharField(max_length=100, blank=True)
    personal_email = models.EmailField(blank=True)
    alternate_email = models.EmailField(blank=True)
    mobile_number = models.CharField(max_length=15, blank=True, validators=[mobile_validator])
    alternate_mobile = models.CharField(max_length=15, blank=True, validators=[mobile_validator])
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True)
    marital_status = models.CharField(max_length=20, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)
    nationality = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Personal detail for {self.request.employee_code}"


class EmployeeAddressDetail(models.Model):
    request = models.OneToOneField(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='address_detail')

    current_address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    pin_code = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Address detail for {self.request.employee_code}"


class EmployeeStatutoryDetail(models.Model):
    request = models.OneToOneField(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='statutory_detail')

    pan = models.CharField(max_length=10, blank=True, validators=[pan_validator])
    aadhaar_number = models.CharField(max_length=12, blank=True, validators=[aadhaar_validator])
    uan_number = models.CharField(max_length=12, blank=True, validators=[uan_validator])
    tan = models.CharField(max_length=10, blank=True)
    esic_number = models.CharField(max_length=30, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Statutory detail for {self.request.employee_code}"


class EmployeeBankDetail(models.Model):
    request = models.OneToOneField(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='bank_detail')

    account_holder_name = models.CharField(max_length=150, blank=True)
    bank_name = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=34, blank=True)
    ifsc_code = models.CharField(max_length=11, blank=True, validators=[ifsc_validator])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def mask_account_number(self):
        if not self.account_number or len(self.account_number) < 4:
            return self.account_number
        return "X" * (len(self.account_number) - 4) + self.account_number[-4:]

    def __str__(self):
        return f"Bank detail for {self.request.employee_code}"


class EmployeeEmergencyContact(models.Model):
    request = models.OneToOneField(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='emergency_contact')

    contact_name = models.CharField(max_length=150, blank=True)
    contact_number = models.CharField(max_length=15, blank=True, validators=[mobile_validator])
    relationship = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Emergency contact for {self.request.employee_code}"


class EmployeeDocument(models.Model):
    CATEGORY_CHOICES = [
        ('pan', 'PAN Card'),
        ('aadhaar', 'Aadhaar Card'),
        ('bank_proof', 'Bank Proof / Cancelled Cheque'),
        ('photo', 'Passport-size Photo'),
        ('education_certificate', 'Highest Education Certificate'),
        ('experience_certificate', 'Experience Certificate'),
        ('passport', 'Passport'),
        ('driving_license', 'Driving License'),
        ('esic', 'ESIC Document'),
        ('other', 'Other Document'),
    ]

    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('verified', 'Verified'),
    ]

    UPLOADED_BY_ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('employee', 'Employee'),
    ]

    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='documents')

    file = CloudinaryField(
        "employee_document",
        folder="employee_documents",
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
        related_name='employee_documents_uploaded',
    )
    uploaded_by_role = models.CharField(max_length=10, choices=UPLOADED_BY_ROLE_CHOICES, default='employee')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name} ({self.request.employee_code})"


class EmployeeAccessToken(models.Model):
    """Secure link credential - raw token stored directly (same convention as
    VendorAccessToken) so onboarding emails can rebuild the same link at
    multiple points in the lifecycle. Security comes from length/entropy +
    expiry + revocation + rate limiting on the public endpoints, not secrecy
    of storage."""

    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='access_tokens')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_used_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_tokens_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        from django.utils import timezone
        return self.is_active and self.expires_at > timezone.now()

    def __str__(self):
        return f"Token for {self.request.employee_code}"


class EmployeeAccessLog(models.Model):
    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='access_logs')
    token = models.ForeignKey(EmployeeAccessToken, on_delete=models.SET_NULL, null=True, blank=True, related_name='access_logs')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    accessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-accessed_at']

    def __str__(self):
        return f"Access to {self.request.employee_code} @ {self.accessed_at}"


class EmployeeChangeRequest(models.Model):
    SECTION_CHOICES = [
        ('personal_details', 'Personal Details'),
        ('address', 'Address'),
        ('statutory_details', 'Statutory Details'),
        ('bank_details', 'Bank Details'),
        ('emergency_contact', 'Emergency Contact'),
        ('documents', 'Documents'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('resolved', 'Resolved'),
    ]

    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='change_requests')
    section = models.CharField(max_length=30, choices=SECTION_CHOICES)
    field_name = models.CharField(max_length=100, blank=True)
    reason = models.TextField()
    comments = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_change_requests_made',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"{self.get_section_display()} change request for {self.request.employee_code}"


class EmployeeSubmissionVersion(models.Model):
    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveSmallIntegerField()
    snapshot = models.JSONField(default=dict)
    is_resubmission = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('request', 'version_number')
        ordering = ['version_number']

    def __str__(self):
        return f"{self.request.employee_code} v{self.version_number}"


class EmployeeOnboardingHistory(models.Model):
    ACTION_CHOICES = [
        ('invited', 'Invited'),
        ('submitted', 'Submitted'),
        ('resubmitted', 'Resubmitted'),
        ('approved', 'Approved'),
        ('requested_changes', 'Requested Changes'),
    ]

    request = models.ForeignKey(EmployeeOnboardingRequest, on_delete=models.CASCADE, related_name='history')

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_onboarding_actions',
    )
    actor_role_snapshot = models.CharField(max_length=150, blank=True)

    action = models.CharField(max_length=25, choices=ACTION_CHOICES)
    previous_status = models.CharField(max_length=25, blank=True)
    new_status = models.CharField(max_length=25, blank=True)

    comments = models.TextField(blank=True)
    reason = models.TextField(blank=True)

    change_request = models.ForeignKey(
        EmployeeChangeRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name='history_entries',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Employee onboarding history"
        ordering = ['created_at']

    def __str__(self):
        return f"{self.request.employee_code}: {self.action} @ {self.created_at}"
