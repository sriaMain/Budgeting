"""Vendor onboarding audit trail - one helper so every write site logs the same way."""
import logging

logger = logging.getLogger(__name__)


def log_vendor_audit(vendor, action, user=None, *, field_name="", old_value="", new_value="", remarks="", actor_label=""):
    """Never raises - an audit write must not fail the business action it records.
    Pass `user=None, actor_label="vendor"` for self-service portal actions."""
    from .models import VendorAuditLog

    try:
        authenticated = user is not None and getattr(user, "is_authenticated", False)
        VendorAuditLog.objects.create(
            vendor=vendor,
            vendor_name=vendor.name or "",
            action=action,
            field_name=field_name[:100],
            old_value="" if old_value is None else str(old_value),
            new_value="" if new_value is None else str(new_value),
            remarks=remarks or "",
            performed_by=user if authenticated else None,
            performed_by_label=actor_label,
        )
    except Exception:
        logger.exception("Failed to write vendor audit log (%s) for vendor %s", action, getattr(vendor, "id", None))


def changed_fields(instance, validated_data, masked=("account_number",)):
    """[(field, old, new)] for fields a partial update actually changes (masked values never logged raw)."""
    changes = []
    for field, new in validated_data.items():
        old = getattr(instance, field, None) if instance is not None else None
        if old == new:
            continue
        if field in masked:
            old, new = ("(on file)" if old else ""), "(updated)"
        changes.append((field, old, new))
    return changes
