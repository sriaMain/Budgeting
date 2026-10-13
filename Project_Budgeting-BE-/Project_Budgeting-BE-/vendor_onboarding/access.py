"""Who may change a vendor, and when - one definition shared by the onboarding views,
the detail serializer's `permissions` payload and the legacy accounts vendor endpoints."""

# Statuses in which the onboarding data may still be edited (by the creator / an editor,
# or by the vendor through the self-service link).
EDITABLE_STATUSES = ("invited", "draft", "action_required")

# Internal vendor-master ("Vendor Summary") fields - unlike the rest of the profile, still
# editable by an internal user after the vendor is submitted or approved, and never exposed
# to or writable by the vendor portal.
VENDOR_MASTER_FIELDS = ("rating", "headcount", "manual_amount_spent")

# Either code lets a user edit; edit_own is limited to vendors they created.
EDIT_PERMISSION_CODES = ("vendor.edit_own", "vendor.edit_any")


def has_permission(user, code):
    return bool(user and user.is_authenticated and (user.is_superuser or user.has_role_permission(code)))


def is_editable_status(vendor):
    return vendor.status in EDITABLE_STATUSES


def can_edit_master_fields(vendor, user):
    """Edit rights regardless of the workflow status (edit_any, or edit_own on a vendor you created)."""
    if has_permission(user, "vendor.edit_any"):
        return True
    return vendor.created_by_id == getattr(user, "id", None) and has_permission(user, "vendor.edit_own")


def can_edit(vendor, user):
    """Edit rights for the onboarding data itself - also requires an editable status."""
    return is_editable_status(vendor) and can_edit_master_fields(vendor, user)
