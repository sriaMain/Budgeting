"""
What the requesting user may do in Clients & KYC, from their role permission codes (roles app).

`user_permissions()` answers per user (GET /client/permissions/, used by the frontend before a
client exists); `record_permissions()` narrows it for one client's workflow state (the
`permissions` block of the client detail response). The API views enforce the same codes -
these flags only drive what the UI offers.
"""
from __future__ import annotations

from .onboarding import APPROVABLE_STATUSES, SUBMITTABLE_STATUSES

CLIENT_PERMISSION_CODES = {
    "view": "client.company.view",
    "create": "client.company.create",
    "edit": "client.company.edit",
    "delete": "client.company.delete",
    "approve": "client.company.approve",
    "request_changes": "client.request_changes",
    "edit_compliance": "client.compliance.edit",
    "edit_banking": "client.banking.edit",
    "edit_commercials": "client.commercial.edit",
    "view_documents": "client.document.view",
    "upload_documents": "client.document.upload",
    "delete_documents": "client.document.delete",
    "verify_documents": "client.document.verify",
    "view_audit_log": "client.audit_log.view",
    "view_unmasked_bank": "client.bank.view_unmasked",
}


def has_perm(user, code: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return bool(user.has_role_permission(code))


def user_permissions(user) -> dict:
    """{flag: bool} for every Clients & KYC permission (one permission-cache read)."""
    if not user or not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", True):
        return {flag: False for flag in CLIENT_PERMISSION_CODES}
    if getattr(user, "is_superuser", False):
        return {flag: True for flag in CLIENT_PERMISSION_CODES}
    getter = getattr(user, "get_rbac_permission_codes", None)
    if getter is None:
        return {flag: has_perm(user, code) for flag, code in CLIENT_PERMISSION_CODES.items()}
    codes = getter()
    return {flag: code.lower() in codes for flag, code in CLIENT_PERMISSION_CODES.items()}


def is_maker_locked(company, user=None, flags=None) -> bool:
    """A submitted client is frozen for makers until a reviewer approves it or requests changes;
    reviewers (client.company.approve) can still correct it."""
    if company.kyc_status != "submitted":
        return False
    can_approve = flags["approve"] if flags is not None else has_perm(user, "client.company.approve")
    return not can_approve


def record_permissions(company, flags: dict) -> dict:
    locked = is_maker_locked(company, flags=flags)
    perms = dict(flags)
    perms.update({
        "edit": flags["edit"] and not locked,
        "upload_documents": flags["upload_documents"] and not locked,
        "delete_documents": flags["delete_documents"] and not locked,
        "submit": flags["edit"] and not locked and company.kyc_status in SUBMITTABLE_STATUSES,
        "approve": flags["approve"] and company.kyc_status in APPROVABLE_STATUSES,
        "locked": locked,
    })
    return perms
