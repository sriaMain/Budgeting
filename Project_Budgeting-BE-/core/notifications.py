"""
Single entry point for creating in-app notifications (core.models.Notification),
shown in the header bell on the frontend. Call this alongside the existing
email Celery tasks (vendor_onboarding/freelancer_onboarding/tasks.py etc.) at
the same trigger points - one event, two channels - rather than duplicating
"who gets told about this" logic a third time.

Usage:
    from core.notifications import notify
    notify(some_account, "Vendor submitted for approval", link="/vendors/approvals")
    notify([acc1, acc2], "New request", category="vendor_approval", link=f"/vendors/{vendor.id}")
"""

from .models import Notification


def notify(recipients, title, message="", category="general", link=""):
    """
    Create a Notification for each recipient. `recipients` may be a single
    Account instance, or any iterable of them (None entries are skipped, so
    callers don't need to filter out e.g. a vendor with no assigned approver).
    """
    if recipients is None:
        return []

    if hasattr(recipients, "pk"):
        recipients = [recipients]

    to_create = [
        Notification(
            recipient=account,
            title=title,
            message=message,
            category=category,
            link=link,
        )
        for account in recipients
        if account is not None
    ]
    if not to_create:
        return []

    return Notification.objects.bulk_create(to_create)
