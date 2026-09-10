from django.conf import settings
from django.db import models
from cloudinary.models import CloudinaryField

from core.app_constants import CURRENCY_CHOICES


class Freelancer(models.Model):
    """A lightweight freelancer record - intentionally NOT a Vendor. Vendor
    onboarding carries KYC/GST/bank-detail fields and a multi-level approval
    workflow that doesn't fit a simple, no-approval freelancer profile."""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('invited', 'Invited'),
        ('onboarding', 'Onboarding'),
        ('completed', 'Completed'),
        ('active', 'Active'),
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

    # Availability
    availability = models.CharField(max_length=25, choices=AVAILABILITY_CHOICES, blank=True)
    preferred_start_date = models.DateField(null=True, blank=True)

    # Payment Details
    payment_method = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default='INR')
    rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    # Deliberately NOT editable=False - a DRF ModelSerializer with
    # editable=False would silently drop this from PATCH (same gotcha noted
    # on Vendor.last_saved_step).
    last_saved_step = models.PositiveSmallIntegerField(default=1)

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
