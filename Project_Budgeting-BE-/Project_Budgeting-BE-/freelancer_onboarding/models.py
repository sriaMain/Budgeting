from datetime import date

from django.conf import settings
from django.db import models, transaction
from cloudinary.models import CloudinaryField

from core.app_constants import CURRENCY_CHOICES


class Freelancer(models.Model):
    """A lightweight freelancer record - intentionally NOT a Vendor. Vendor
    onboarding carries GST/company KYC and a multi-level approval workflow;
    a freelancer is an individual with a single-step review: invite ->
    onboarding (secure link) -> completed (submitted, pending review) ->
    approve (active) or request changes (changes_requested -> resubmit).
    The KYC rules (required documents, PAN for India residents, ...) live in
    freelancer_onboarding/kyc.py.

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
        # The reviewer sent the onboarding back to the freelancer (see review_remarks).
        ('changes_requested', 'Changes Requested'),
        # Stored value kept as 'completed' for existing rows/integrations; it means the
        # freelancer has submitted and the record is waiting for a reviewer.
        ('completed', 'Submitted - Pending Review'),
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('blocked', 'Blocked'),
        # Added for project-staffing visibility (business partner enhancement)
        # - the original 7 values above are unchanged so existing onboarding
        # transitions (ensure_onboarding_status, etc.) keep working as-is.
        ('available', 'Available'),
        ('assigned', 'Assigned'),
        ('on_hold', 'On Hold'),
        ('offboarded', 'Offboarded'),
    ]

    # The secure link may change data only in these statuses.
    PORTAL_EDITABLE_STATUSES = ('invited', 'onboarding', 'changes_requested')
    # Onboarding not yet approved - only submit / approve / request-changes move it on.
    WORKFLOW_STATUSES = ('draft', 'invited', 'onboarding', 'changes_requested', 'completed')
    # Statuses an approved (or legacy, pre-approval-workflow) freelancer moves between.
    APPROVED_STATUSES = ('active', 'available', 'assigned', 'on_hold', 'inactive')
    CLOSED_STATUSES = ('offboarded', 'blocked')
    SUBMITTABLE_STATUSES = ('draft', 'invited', 'onboarding', 'changes_requested')

    KYC_STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
        ('changes_requested', 'Changes Requested'),
    ]

    ID_DOCUMENT_TYPE_CHOICES = [
        ('passport', 'Passport'),
        ('national_id', 'National ID Card'),
        ('driving_licence', 'Driving Licence'),
        ('aadhaar_masked', 'Aadhaar (masked)'),
        ('other', 'Other Government Photo ID'),
    ]

    AVAILABILITY_CHOICES = [
        ('available', 'Available'),
        ('partially_available', 'Partially Available'),
        ('not_available', 'Not Available'),
    ]

    # Validated by the serializers (not a DB constraint): rows created before this list
    # existed hold free text such as "Male".
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('non_binary', 'Non-binary'),
        ('other', 'Other'),
        ('prefer_not_to_say', 'Prefer not to say'),
    ]

    # Human-readable identifier (FRL-0001, FRL-0002, ...) - assigned once,
    # automatically, the first time a freelancer is saved (see save() /
    # assign_freelancer_code() below). Sequential, not year-scoped, per the
    # business requirement's own examples.
    freelancer_code = models.CharField(
        max_length=20, unique=True, null=True, blank=True, editable=False, db_index=True
    )

    # Basic Details
    full_name = models.CharField(max_length=150)
    # Entered separately on the forms; full_name is kept as "First Middle Last"
    # (see save()) because the rest of the app shows and searches by it.
    # Blank on records created before these fields existed.
    first_name = models.CharField(max_length=100, blank=True, default="")
    middle_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100, blank=True, default="")
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    alternate_phone = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    profile_photo = CloudinaryField(
        "freelancer_profile_photo", folder="freelancer_profile_photos",
        resource_type="image", type="upload", null=True, blank=True,
    )
    location = models.CharField(max_length=150, blank=True)
    # Country display names (core.countries.normalize_country_value), like every other
    # country column in the onboarding modules.
    nationality = models.CharField(max_length=100, blank=True)

    # Identity & KYC
    # Where the freelancer lives: drives the PAN rule, the required documents, the phone
    # dialling default and the W-8BEN / W-9 choice. Kept separate from permanent_country
    # (a permanent address can be a family home in another country) and backfilled from it
    # by migration 0021; when blank, permanent_country is used (see residence_country).
    country_of_residence = models.CharField(max_length=100, blank=True)
    id_document_type = models.CharField(max_length=20, choices=ID_DOCUMENT_TYPE_CHOICES, blank=True)
    # Never returned in full by the default serializers - masked, with a separately
    # permissioned reveal endpoint. A masked Aadhaar is stored as "XXXXXXXX1234".
    id_document_number = models.CharField(max_length=50, blank=True)
    tax_residency_country = models.CharField(max_length=100, blank=True)

    # Review workflow
    kyc_status = models.CharField(max_length=20, choices=KYC_STATUS_CHOICES, default='not_started')
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancers_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    # Shown to the freelancer while status is 'changes_requested'.
    review_remarks = models.TextField(blank=True)
    # Wizard step keys the reviewer asked the freelancer to revisit.
    changes_requested_sections = models.JSONField(default=list, blank=True)

    # Permanent Address
    permanent_address_line1 = models.CharField(max_length=255, blank=True)
    permanent_address_line2 = models.CharField(max_length=255, blank=True)
    permanent_city = models.CharField(max_length=100, blank=True)
    permanent_state = models.CharField(max_length=100, blank=True)
    permanent_country = models.CharField(max_length=100, blank=True)
    permanent_pincode = models.CharField(max_length=20, blank=True)

    # Temporary Address - temp_same_as_permanent just records the user's
    # checkbox choice at save time (copy-on-submit); the temp_* fields below
    # still hold their own values so every other query/report can read a
    # freelancer's temporary address the same way regardless of how it got
    # there, without needing to resolve the permanent address every time.
    temp_same_as_permanent = models.BooleanField(default=False)
    temp_address_line1 = models.CharField(max_length=255, blank=True)
    temp_address_line2 = models.CharField(max_length=255, blank=True)
    temp_city = models.CharField(max_length=100, blank=True)
    temp_state = models.CharField(max_length=100, blank=True)
    temp_country = models.CharField(max_length=100, blank=True)
    temp_pincode = models.CharField(max_length=20, blank=True)

    # Emergency Contact
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    emergency_contact_relationship = models.CharField(max_length=100, blank=True)

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

    # Visible to whoever can see the freelancer profile.
    notes = models.TextField(blank=True)
    # Staff-only - kept as a separate field (rather than overloading `notes`)
    # so a future permission gate can restrict it without touching `notes`.
    internal_remarks = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.full_name} ({self.get_status_display()})"

    @property
    def residence_country(self):
        """Country of residence, falling back to the permanent address country."""
        return self.country_of_residence or self.permanent_country

    def mask_id_document_number(self):
        value = self.id_document_number or ""
        if not value:
            return ""
        if self.id_document_type == "aadhaar_masked":
            return f"XXXX XXXX {value[-4:]}"
        if len(value) <= 4:
            return "X" * len(value)
        return "X" * (len(value) - 4) + value[-4:]

    @staticmethod
    def build_name(first_name, middle_name, last_name):
        return " ".join(
            part for part in ((first_name or "").strip(), (middle_name or "").strip(), (last_name or "").strip()) if part
        )

    def save(self, *args, **kwargs):
        if (self.first_name or "").strip():
            self.full_name = self.build_name(self.first_name, self.middle_name, self.last_name)
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new and not self.freelancer_code:
            self.assign_freelancer_code()
            super().save(update_fields=['freelancer_code'])

    def assign_freelancer_code(self):
        """Atomically assigns FRL-0001, FRL-0002, ... the first time a
        freelancer is saved - same convention as accounts.Vendor
        .assign_reference_number(), but sequential (no year segment), per the
        business requirement's own examples. Called from save() itself
        (rather than from each creation call site, as the Vendor/Employee
        precedents do) so every creation path - manual add, invite, or any
        future one - gets a code with no risk of a missed call site."""
        if self.freelancer_code:
            return self.freelancer_code
        with transaction.atomic():
            seq, _ = FreelancerCodeSequence.objects.select_for_update().get_or_create(pk=1)
            seq.last_number += 1
            seq.save(update_fields=['last_number'])
            self.freelancer_code = f"FRL-{seq.last_number:04d}"
        return self.freelancer_code


class FreelancerCodeSequence(models.Model):
    """Singleton counter backing Freelancer.assign_freelancer_code()."""

    last_number = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Last freelancer code: {self.last_number}"


class FreelancerAccessToken(models.Model):
    """Secure link credential - same convention as VendorAccessToken /
    EmployeeAccessToken: the raw token is stored directly (not hashed)
    because the invite email needs to rebuild the same link on resend.
    Security comes from entropy + expiry + revocation + rate limiting."""

    REVOKE_REASON_CHOICES = [
        ('reissued', 'Replaced by a newer link'),
        ('approved', 'Onboarding approved'),
        ('closed', 'Freelancer offboarded or blocked'),
        ('manual', 'Revoked by an administrator'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='access_tokens')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.CharField(max_length=20, choices=REVOKE_REASON_CHOICES, blank=True)

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
        ('pan', 'PAN Card'),
        ('government_id', 'Government Photo ID'),
        ('address_proof', 'Address Proof'),
        ('bank_proof', 'Bank Proof'),
        ('tax_form', 'Tax Form (W-8BEN / W-9)'),
        ('tax_residency_certificate', 'Tax Residency Certificate'),
        ('other', 'Other Document'),
    ]

    # Uploading never verifies a document - only a reviewer (document verify endpoint) does.
    # "expired" is derived from expiry_date on read (core.document_security).
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('under_review', 'Under Review'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
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
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    expiry_date = models.DateField(null=True, blank=True)
    document_number = models.CharField(max_length=100, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_documents_uploaded',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_documents_verified',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    # Reviewer's note - required when rejecting; shown to the freelancer.
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ['-uploaded_at', '-id']

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
    allocation_percent = models.PositiveIntegerField(default=100)
    # Planned quantity for the budgeting formula (Cost Rate x Planned Units):
    # days for a 'daily' rate card, hours for 'hourly', months for a
    # 'retainer'/monthly arrangement, or the agreed lump sum count (1) for a
    # 'fixed'/project-based card. Left blank when the PM hasn't estimated
    # this yet - planned_freelancer_cost then has nothing to multiply from.
    planned_units = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Rate snapshot - see class docstring. Populated server-side in
    # FreelancerProjectAssignmentSerializer.create(), either auto-pulled from
    # the freelancer's active rate card (default) or, when the caller passes
    # an explicit cost_rate/billing_rate, from that override instead - either
    # way this is a point-in-time snapshot, never touched again after create.
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

    @property
    def planned_freelancer_cost(self):
        """Cost Rate x Planned Units (Section 13's formula) - not stored, so
        it always reflects the current planned_units even if edited later."""
        if self.cost_rate_snapshot is None or self.planned_units is None:
            return None
        return self.cost_rate_snapshot * self.planned_units

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

    # payment_status is the reviewer's verification of the payout details (bank account or
    # UPI / PayPal / Wise identifier). It is set only through the bank-detail verify
    # endpoint and drops back to 'pending' whenever those details change.
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
        ('on_hold', 'On Hold'),
    ]

    PAN_VERIFICATION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]

    freelancer = models.OneToOneField(Freelancer, on_delete=models.CASCADE, related_name='bank_detail')

    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    verification_remarks = models.TextField(blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_bank_details_verified',
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    # Tax identity - "tax_number" stays a generic label (not "pan") since a
    # freelancer isn't necessarily India-based; the PAN Document upload
    # (FreelancerDocument category='pan') is the India-specific piece.
    # tax_type is set by the serializers from the tax country ("PAN", "SSN / ITIN", ...).
    tax_type = models.CharField(max_length=50, blank=True)
    tax_number = models.CharField(max_length=50, blank=True)
    # Distinct from payment_status (which covers the whole bank/KYC record) -
    # PAN can be verified independently of whether banking details are.
    pan_verification_status = models.CharField(
        max_length=20, choices=PAN_VERIFICATION_STATUS_CHOICES, default='pending'
    )
    pan_verification_remarks = models.TextField(blank=True)

    # Bank account (payment_method='bank_transfer'). Identifiers follow the bank country's
    # rules in core.countries: India uses ifsc_code, other countries routing_code
    # (ABA / sort code / BSB / transit ...), SWIFT and IBAN where applicable.
    bank_country = models.CharField(max_length=100, blank=True)
    account_holder_name = models.CharField(max_length=150, blank=True)
    bank_name = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=34, blank=True)
    ifsc_code = models.CharField(max_length=11, blank=True)
    routing_code = models.CharField(max_length=30, blank=True)
    swift_code = models.CharField(max_length=11, blank=True)
    iban = models.CharField(max_length=34, blank=True)
    branch_name = models.CharField(max_length=150, blank=True)
    bank_address = models.CharField(max_length=255, blank=True)
    account_type = models.CharField(max_length=20, blank=True)

    # Non-bank payout identifiers (payment_method upi / paypal / wise).
    upi_id = models.CharField(max_length=100, blank=True)
    paypal_email = models.EmailField(blank=True)
    wise_email = models.EmailField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def mask_account_number(self):
        if not self.account_number or len(self.account_number) < 4:
            return self.account_number
        return "X" * (len(self.account_number) - 4) + self.account_number[-4:]

    def mask_tax_number(self):
        """Masks a PAN-shaped tax number as ABCDE****F (Section 7's example);
        for a non-PAN-shaped tax_number, falls back to the same
        first-5/last-1-visible convention so it degrades gracefully."""
        value = self.tax_number
        if not value or len(value) < 6:
            return value
        return f"{value[:5]}{'*' * (len(value) - 6)}{value[-1:]}"

    def __str__(self):
        return f"Bank detail for {self.freelancer.full_name}"


class FreelancerEquipment(models.Model):
    """Laptop/equipment tracking - optional satellite table, same
    OneToOne-per-freelancer shape as FreelancerBankDetail. Never required:
    a freelancer who brings their own equipment (the common case) can have
    no row here at all, or a row with just `ownership` set."""

    OWNERSHIP_CHOICES = [
        ('freelancer_owned', 'Freelancer Owned'),
        ('company_provided', 'Company Provided'),
        ('client_provided', 'Client Provided'),
        ('other', 'Other'),
    ]

    CONDITION_CHOICES = [
        ('new', 'New'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('damaged', 'Damaged'),
    ]

    freelancer = models.OneToOneField(Freelancer, on_delete=models.CASCADE, related_name='equipment')

    ownership = models.CharField(max_length=20, choices=OWNERSHIP_CHOICES, blank=True)

    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    processor = models.CharField(max_length=100, blank=True)
    ram = models.CharField(max_length=50, blank=True)
    storage = models.CharField(max_length=50, blank=True)
    operating_system = models.CharField(max_length=100, blank=True)
    # Only meaningful when ownership='company_provided'.
    asset_id = models.CharField(max_length=100, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    return_date = models.DateField(null=True, blank=True)
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, blank=True)
    remarks = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Equipment for {self.freelancer.full_name}"


class FreelancerAuditLog(models.Model):
    """Tracks changes to a freelancer's sensitive/business-critical fields
    (Section 22): rate changes, bank-detail updates, PAN verification
    changes, status changes, project assignment create/remove. No generic
    audit/history framework exists elsewhere in this codebase to extend, so
    this is deliberately scoped to Freelancer alone rather than a new
    app-wide system. Sensitive values (bank/PAN) are stored already-masked -
    never the raw value - so the log itself is safe to display broadly."""

    ACTION_CHOICES = [
        ('rate_changed', 'Pay Rate Changed'),
        ('bank_detail_updated', 'Bank Details Updated'),
        ('pan_verification_changed', 'PAN Verification Changed'),
        ('status_changed', 'Status Changed'),
        ('project_assigned', 'Project Assigned'),
        ('project_removed', 'Project Removed'),
        ('submitted', 'Onboarding Submitted'),
        ('approved', 'Onboarding Approved'),
        ('changes_requested', 'Changes Requested'),
        ('document_uploaded', 'Document Uploaded'),
        ('document_replaced', 'Document Replaced'),
        ('document_deleted', 'Document Deleted'),
        ('document_verified', 'Document Verified'),
        ('document_rejected', 'Document Rejected'),
        ('document_under_review', 'Document Marked Under Review'),
        ('kyc_status_changed', 'KYC Status Changed'),
        ('token_revoked', 'Onboarding Link Revoked'),
        ('invite_resent', 'Invitation Sent'),
    ]

    freelancer = models.ForeignKey(Freelancer, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    field_name = models.CharField(max_length=100, blank=True)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)
    # Free-text reason (rejection reason, requested changes) - never a sensitive value.
    remarks = models.TextField(blank=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='freelancer_audit_logs',
    )
    # Who acted when there is no user - e.g. "Freelancer (portal)" for the secure link.
    actor_label = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.freelancer.full_name}: {self.get_action_display()} @ {self.created_at}"
