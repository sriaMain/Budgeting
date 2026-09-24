from django.db import models
from django.conf import settings


class Notification(models.Model):
    """
    In-app notification shown in the header bell (see core/notifications.py
    for the notify() helper that creates these, and the existing email
    Celery tasks in vendor_onboarding/freelancer_onboarding/tasks.py this
    runs alongside as a second channel for the same events).
    """

    CATEGORY_CHOICES = [
        ("vendor_approval", "Vendor Approval"),
        ("freelancer", "Freelancer"),
        ("task", "Task"),
        ("project", "Project"),
        ("finance", "Finance"),
        ("general", "General"),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="general")
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    # Frontend route to open when clicked, e.g. "/vendors/approvals" or
    # "/projects/42". Left blank when there's nowhere specific to send them.
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.recipient} - {self.title}"


class CallCenter(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class ProfitCenter(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class GLAccount(models.Model):
    """
    Chart-of-accounts entry, kept in the same shape (code + name + type) as
    the accounting structure currently maintained in Odoo, with an
    odoo_account_id slot so entries can be matched/synced once the
    planned accounting platform integration is built.
    """

    ACCOUNT_TYPE_CHOICES = [
        ("income", "Income"),
        ("expense", "Expense"),
        ("asset", "Asset"),
        ("liability", "Liability"),
        ("equity", "Equity"),
    ]

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES, blank=True)
    odoo_account_id = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.name}"
