from django.db import models, transaction
from django.utils import timezone
from datetime import timedelta
import uuid
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
import random
from roles.models import RBACUserMixin# from rbac.models import RBACUserMixin
from cloudinary_storage.storage import MediaCloudinaryStorage

from core.app_constants import CURRENCY_CHOICES


class Account(AbstractUser, RBACUserMixin):
    email = models.EmailField(unique=True, null=True, blank=True, db_index=True)
    position = models.CharField(max_length=100, blank=True)
    modules = models.ManyToManyField(
        'product_group.Product_Services',
        related_name='accounts',
        blank=True
    )
    charges_per_hour = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    currency = models.CharField(
        max_length=3,
        choices=CURRENCY_CHOICES,
        default="INR"
    )
    profile_picture = models.ImageField(
        upload_to="profile_pictures/",
        null=True,
        blank=True,
        storage=MediaCloudinaryStorage()
    )
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    is_active =models.BooleanField(default=True)
    # languages =models.CharField(max_length=100, blank=True)
    languages = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["first_name", "last_name"]

    @property
    def display_name(self):
        return f"{self.first_name} {self.last_name}".strip()


    def __str__(self):
        return f"{self.get_full_name()} ({self.email or self.username})"


class PasswordResetOTP(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='password_reset_otps'
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    token = models.UUIDField(default=uuid.uuid4, editable=False)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'created_at']),
        ]

    def expired(self, minutes=2):
        return timezone.now() > self.created_at + timedelta(minutes=minutes)

    def mark_used(self):
        self.is_used = True
        self.save(update_fields=['is_used'])

    def set_code(self, raw_code: str):
        self.code_hash = make_password(raw_code)

    def verify_code(self, raw_code: str):
        if self.is_used or self.expired():
            return False
        ok = check_password(raw_code, self.code_hash)
        if ok:
            self.is_verified = True
            self.save(update_fields=['is_verified'])
            # Don't mark as used here - only mark used when password is actually reset
        return ok

    @classmethod
    def active_qs_for_user(cls, user):
        expiry_seconds = getattr(settings, 'PASSWORD_RESET_OTP_EXPIRY_SECONDS', 30)
        cutoff = timezone.now() - timedelta(seconds=expiry_seconds)
        return cls.objects.filter(
            user=user,
            is_used=False,
            created_at__gt=cutoff
        )

    @classmethod
    def create_for_user(cls, user, length=6):
        raw = ''.join(str(random.randint(0, 9)) for _ in range(length))
        obj = cls(user=user)
        obj.set_code(raw)
        obj.save()
        return obj, raw





class Vendor(models.Model):
    """The single Vendor table doubles as both the onboarding request and the
    eventual master record - there is no separate request model. A row is
    created as soon as an admin raises a vendor request (status='invited'),
    and is gated out of general vendor pickers (accounts.views.VendorListCreateView,
    finances' PO/Bill vendor lookups) until status='approved', so an
    in-progress onboarding request can't be selected as a real vendor before
    it's actually approved."""

    VENDOR_TYPE_CHOICES = [
        ('freelancer', 'Individual / Freelancer'),
        ('company', 'Company'),
        ('partnership', 'Partnership'),
        ('proprietorship', 'Proprietorship'),
        ('llp', 'LLP'),
        ('government', 'Government'),
        ('non_profit', 'Non-Profit'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('invited', 'Invited'),
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('action_required', 'Action Required'),
        ('resubmitted', 'Resubmitted'),
        ('approval_in_progress', 'Approval In Progress'),
        ('approved', 'Approved'),
    ]

    name = models.CharField(max_length=255, unique=True)
    vendor_type = models.CharField(max_length=20, choices=VENDOR_TYPE_CHOICES)

    product_groups = models.ManyToManyField(
        'product_group.ProductGroup',
        related_name='vendors',
        blank=True
    )

    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # --- Vendor Onboarding workflow fields (backend-managed except last_saved_step) ---
    vendor_reference_no = models.CharField(
        max_length=20, unique=True, null=True, blank=True, editable=False, db_index=True
    )
    contact_person_name = models.CharField(max_length=150, blank=True)
    company_code = models.CharField(max_length=50, blank=True)
    plant = models.CharField(max_length=50, blank=True)
    internal_requester = models.CharField(max_length=150, blank=True)
    initial_comments = models.TextField(blank=True)
    status = models.CharField(
        max_length=25, choices=STATUS_CHOICES, default='approved', db_index=True
    )
    # Client-writable (the wizard advances this every step) - not part of the
    # "backend-managed" group above, so it must NOT be editable=False, or DRF
    # silently treats it as read_only and drops it from every PATCH payload.
    last_saved_step = models.PositiveSmallIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        editable=False,
        related_name='vendors_created',
    )
    submitted_at = models.DateTimeField(null=True, blank=True, editable=False)
    approved_at = models.DateTimeField(null=True, blank=True, editable=False)
    # Hides a request from the default Vendor Requests list/tabs without
    # deleting it - the record and its full approval history stay intact and
    # remain viewable with the "show archived" filter. Purely a visibility
    # flag; does not affect status or block any workflow action.
    is_archived = models.BooleanField(default=False, db_index=True)

    def __str__(self):
        return self.name

    def assign_reference_number(self):
        """Atomically assigns VR-<year>-<seq> the first time a vendor is saved."""
        if self.vendor_reference_no:
            return self.vendor_reference_no
        year = (self.created_at or timezone.now()).year
        with transaction.atomic():
            seq, _ = VendorReferenceSequence.objects.select_for_update().get_or_create(year=year)
            seq.last_number += 1
            seq.save(update_fields=['last_number'])
            self.vendor_reference_no = f"VR-{year}-{seq.last_number:06d}"
        return self.vendor_reference_no

    def current_token(self):
        return self.access_tokens.filter(is_active=True).order_by('-created_at').first()


class VendorReferenceSequence(models.Model):
    year = models.PositiveIntegerField(unique=True)
    last_number = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.year}: {self.last_number}"
