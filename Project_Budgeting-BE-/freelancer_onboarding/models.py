from datetime import date

from django.conf import settings
from django.db import models
from cloudinary.models import CloudinaryField

from core.app_constants import CURRENCY_CHOICES


class Freelancer(models.Model):
    """A lightweight freelancer record - intentionally NOT a Vendor. Vendor
    onboarding carries KYC/GST/bank-detail fields and a multi-level approval
    workflow that doesn't fit a simple, no-approval freelancer profile.

    This is also this codebase's closest thing to a "Business Partner"
    record for a freelancer - there is no unifying BusinessPartner table
    (Client/Vendor/Employee are three other independent models), so rather
    than duplicate identity data in a new table, this row IS the freelancer's
    canonical record. Anything that needs to reference "a freelancer" from
    another app (e.g. Project.poc_type/poc_id) follows the same
    type-tag-plus-id convention already used for Employee/Vendor references.
    """

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('invited', 'Invited'),
        ('onboarding', 'Onboarding'),
        ('completed', 'Completed'),
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('blocked', 'Blocked'),
    ]

    AVAILABILITY_CHOICES = [
        ('available', 'Available'),
        ('partially_available', 'Partially Available'),
        ('not_available', 'Not Available'),
    ]

    # Basic Details
    full_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    location = models.CharField(max_length=150, blank=True)

    # Professional Details
    professional_title = models.CharField(max_length=150, blank=True)
    skills = models.TextField(blank=True)
    years_of_experience = models.PositiveSmallIntegerField(null=True, blank=True)
    portfolio_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)

    # Availability & Capacity - hours_per_week doubles as "Maximum Capacity"
    # (the spec's own over-allocation example expresses capacity as
    # hours/week, so a separate field would just duplicate this one).
    availability = models.CharField(max_length=25, choices=AVAILABILITY_CHOICES, blank=True)
    preferred_start_date = models.DateField(null=True, blank=True)
    available_until = models.DateField(null=True, blank=True)
    hours_per_day = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    hours_per_week = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    notice_period_days = models.PositiveSmallIntegerField(null=True, blank=True)
    timezone = models.CharField(max_length=50, blank=True)

    # Payment Details
    payment_method = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default='INR')
    rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    # Deliberately NOT editable=False - a DRF ModelSerializer with
    # editable=False would silently drop this from PATCH (same gotcha noted
    # on Vendor.last_saved_step).
    last_saved_step = models.PositiveSmallIntegerField(default=1)
    # Hides a freelancer from the default Freelancers list/tabs without
    # deleting it - purely a visibility flag, independent of the onboarding
    # `status` workflow state (mirrors Vendor.is_archived).
    is_archived = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.full_name} ({self.get_status_display()})"


class FreelancerAccessToken(models.Model):
    """Secure link credential - same convention as VendorAccessToken /
    EmployeeAccessToken: the raw token is stored directly (not hashed)
    because the invite email needs to rebuild the same link on resend.
    Security comes from entropy + expiry + revocation + rate limiting."""

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='access_tokens')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_used_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_tokens_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        from django.utils import timezone
        return self.is_active and self.expires_at > timezone.now()

    def __str__(self):
        return f"Token for {self.freelancer.full_name}"


class FreelancerAccessLog(models.Model):
    """Audit trail of every successful public-link access."""

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='access_logs')
    token = models.ForeignKey(FreelancerAccessToken, on_delete=models.SET_NULL, null=True, blank=True, related_name='access_logs')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    accessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-accessed_at']

    def __str__(self):
        return f"Access to {self.freelancer.full_name} @ {self.accessed_at}"


class FreelancerDocument(models.Model):
    CATEGORY_CHOICES = [
        ('resume', 'Resume'),
        ('pan', 'PAN Document'),
        ('other', 'Other Document'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='documents')

    file = CloudinaryField(
        "freelancer_document",
        folder="freelancer_documents",
        resource_type="raw",
        type="upload",
    )

    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    file_type = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_documents_uploaded',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name} ({self.freelancer.full_name})"


class FreelancerRateCard(models.Model):
    """A freelancer can have several of these over time (Rule 2), but only
    one active card per pricing_model may cover a given date (Rule 3) -
    enforced in FreelancerRateCardSerializer.validate(), not here, since the
    check needs to compare against sibling rows at write time."""

    PRICING_MODEL_CHOICES = [
        ('hourly', 'Hourly'),
        ('daily', 'Daily'),
        ('fixed', 'Fixed Price'),
        ('milestone', 'Milestone'),
        ('retainer', 'Retainer'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='rate_cards')

    pricing_model = models.CharField(max_length=20, choices=PRICING_MODEL_CHOICES)
    cost_rate = models.DecimalField(max_digits=12, decimal_places=2)
    billing_rate = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default='INR')

    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    minimum_billable_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    overtime_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    weekend_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_rate_cards_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_from']

    @property
    def margin(self):
        return self.billing_rate - self.cost_rate

    @property
    def is_current(self):
        today = date.today()
        return self.is_active and self.effective_from <= today and (
            self.effective_to is None or self.effective_to >= today
        )

    def __str__(self):
        return f"{self.freelancer.full_name} - {self.get_pricing_model_display()} ({self.currency} {self.billing_rate})"


class FreelancerContract(models.Model):
    CONTRACT_TYPE_CHOICES = [
        ('freelancer', 'Freelancer'),
        ('independent_contractor', 'Independent Contractor'),
        ('consultant', 'Consultant'),
        ('agency', 'Agency'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('terminated', 'Terminated'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='contracts')

    contract_type = models.CharField(max_length=30, choices=CONTRACT_TYPE_CHOICES, default='freelancer')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    payment_terms = models.CharField(max_length=100, blank=True)
    notice_period_days = models.PositiveSmallIntegerField(null=True, blank=True)
    nda_signed = models.BooleanField(default=False)
    agreement_signed = models.BooleanField(default=False)

    document = CloudinaryField(
        "freelancer_contract", folder="freelancer_contracts", resource_type="raw",
        type="upload", null=True, blank=True,
    )
    document_name = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_contracts_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.freelancer.full_name} contract ({self.get_status_display()})"


class FreelancerProjectAssignment(models.Model):
    """Links a Freelancer to a Project.Project. Cost/billing rate fields are
    a SNAPSHOT taken from the freelancer's active rate card at creation time
    (Rule 4) and never touched again after that (Rule 5) - a later change to
    the freelancer's rate card must not alter this or any past assignment."""

    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='project_assignments')
    project = models.ForeignKey('Project.Project', on_delete=models.CASCADE, related_name='freelancer_assignments')
    rate_card = models.ForeignKey(
        FreelancerRateCard, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assignments',
    )

    role = models.CharField(max_length=150, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    allocated_hours = models.DecimalField(max_digits=8, decimal_places=2)

    # Rate snapshot - see class docstring. Populated server-side in
    # FreelancerProjectAssignmentSerializer.create(), never via client input.
    pricing_model_snapshot = models.CharField(max_length=20, blank=True)
    cost_rate_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    billing_rate_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency_snapshot = models.CharField(max_length=10, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_assignments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def margin(self):
        if self.billing_rate_snapshot is None or self.cost_rate_snapshot is None:
            return None
        return self.billing_rate_snapshot - self.cost_rate_snapshot

    def __str__(self):
        return f"{self.freelancer.full_name} on {self.project.project_name}"


class FreelancerTaskAssignment(models.Model):
    """A freelancer's allocation on one Project.Task. Deliberately separate
    from Task.assigned_to (a single Account FK, employee-only) rather than
    changing that field's meaning - this keeps existing employee task
    assignment untouched (Rule 14) while letting a freelancer additionally
    work a task. Cost/billing use the parent FreelancerProjectAssignment's
    rate snapshot rather than carrying their own, since a task assignment
    only exists within a project the freelancer is already assigned to."""

    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='task_assignments')
    task = models.ForeignKey('Project.Task', on_delete=models.CASCADE, related_name='freelancer_assignments')
    project_assignment = models.ForeignKey(
        FreelancerProjectAssignment, on_delete=models.CASCADE, related_name='task_assignments',
    )

    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    allocated_hours = models.DecimalField(max_digits=8, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_task_assignments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['freelancer', 'task'], name='unique_freelancer_per_task'),
        ]

    @property
    def actual_hours(self):
        """Rule 6/7: only approved entries count as actual work."""
        total = self.time_entries.filter(status='approved').aggregate(total=models.Sum('hours'))['total']
        return total or 0

    @property
    def billable_hours(self):
        total = self.time_entries.filter(status='approved', is_billable=True).aggregate(
            total=models.Sum('hours')
        )['total']
        return total or 0

    @property
    def remaining_hours(self):
        return max(self.allocated_hours - self.actual_hours, 0)

    @property
    def cost(self):
        rate = self.project_assignment.cost_rate_snapshot
        return (self.actual_hours * rate) if rate is not None else None

    @property
    def billing_amount(self):
        rate = self.project_assignment.billing_rate_snapshot
        return (self.billable_hours * rate) if rate is not None else None

    def __str__(self):
        return f"{self.freelancer.full_name} on task '{self.task.title}'"


class FreelancerTimeEntry(models.Model):
    """A freelancer has no login, so entries here are logged by an admin/PM
    on their behalf (see FreelancerTimeEntry views - no public/token-authed
    endpoint exists for this in Phase 2). Only 'approved' entries ever count
    toward actual cost/billing (Rules 6-7) - draft/submitted/rejected ones
    are visible for review but financially inert."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    task_assignment = models.ForeignKey(
        FreelancerTaskAssignment, on_delete=models.CASCADE, related_name='time_entries',
    )

    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    break_minutes = models.PositiveSmallIntegerField(default=0, blank=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    is_billable = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_time_entries_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_time_entries_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.task_assignment.freelancer.full_name} - {self.date} ({self.hours}h, {self.status})"


class FreelancerBankDetail(models.Model):
    """KYC + banking details for paying a freelancer - mirrors
    vendor_onboarding's VendorKYC/VendorBankDetail split (same field names,
    same account-number masking convention), collapsed into one table since
    a freelancer's KYC surface is much smaller than a vendor's (no CIN/TAN/
    EPF/ESIC - individuals, not registered companies)."""

    PAYMENT_METHOD_CHOICES = [
        ('bank_transfer', 'Bank Transfer'),
        ('upi', 'UPI'),
        ('paypal', 'PayPal'),
        ('wise', 'Wise'),
        ('other', 'Other'),
    ]

    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('on_hold', 'On Hold'),
    ]

    freelancer = models.OneToOneField(Freelancer, on_delete=models.CASCADE, related_name='bank_detail')

    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')

    # Tax identity - "tax_number" stays a generic label (not "pan") since a
    # freelancer isn't necessarily India-based; the PAN Document upload
    # (FreelancerDocument category='pan') is the India-specific piece.
    tax_type = models.CharField(max_length=50, blank=True)
    tax_number = models.CharField(max_length=50, blank=True)

    account_holder_name = models.CharField(max_length=150, blank=True)
    bank_name = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=34, blank=True)
    ifsc_code = models.CharField(max_length=11, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def mask_account_number(self):
        if not self.account_number or len(self.account_number) < 4:
            return self.account_number
        return "X" * (len(self.account_number) - 4) + self.account_number[-4:]

    def __str__(self):
        return f"Bank detail for {self.freelancer.full_name}"
