from django.conf import settings
from django.db import models


class HrmsEmployee(models.Model):
    """Local mirror of one employee from the HRMS external employees API.

    HRMS only ever returns *active* employees - an exited employee is simply
    absent from the list. So `is_active_in_hrms` means "present in the most
    recent successful sync", and flipping it to False is what triggers the
    automatic access revocation (see services.sync_employees).

    Eligibility and the Budgeting roles live entirely here/in Account.roles -
    HRMS has no concept of either. `hrms_role` is HRMS's own label, shown for
    reference only and never mapped to a Budgeting Role.
    """

    REVOKE_REASON_CHOICES = [
        ('hrms_missing', 'Missing from HRMS sync'),
        ('manual', 'Revoked manually'),
    ]

    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    full_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True, db_index=True)
    department = models.CharField(max_length=150, blank=True)
    designation = models.CharField(max_length=150, blank=True)
    hrms_role = models.CharField(max_length=150, blank=True)
    branch = models.CharField(max_length=150, blank=True)

    is_active_in_hrms = models.BooleanField(default=True, db_index=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    removed_from_hrms_at = models.DateTimeField(null=True, blank=True)

    is_eligible = models.BooleanField(default=False, db_index=True)
    account = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='hrms_employee',
    )
    access_granted_at = models.DateTimeField(null=True, blank=True)
    access_granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='hrms_access_granted',
    )
    access_revoked_at = models.DateTimeField(null=True, blank=True)
    access_revoked_reason = models.CharField(max_length=20, choices=REVOKE_REASON_CHOICES, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['full_name', 'employee_id']

    def __str__(self):
        return f"{self.full_name} ({self.employee_id})"


class HrmsSyncRun(models.Model):
    """Audit row for every Refresh click - who ran it, what changed, and why it failed."""

    STATUS_CHOICES = [
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='running')
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='hrms_sync_runs',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    fetched_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    returned_count = models.PositiveIntegerField(default=0)
    removed_count = models.PositiveIntegerField(default=0)
    access_revoked_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"HRMS sync #{self.pk} ({self.status})"
