import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from accounts.models import Vendor
from .models import (
    VendorAccessToken, VendorAccessLog, VendorChangeRequest,
    VendorSubmissionVersion, VendorApprovalWorkflowConfig, VendorApprovalInstance,
    VendorApprovalHistory,
)


class InvalidTokenError(Exception):
    """Raised for any invalid/expired/revoked public access token. `reason` is
    either "expired" (the link used to work, tell the vendor to ask for a new
    one) or "invalid" (never existed / was revoked - don't distinguish those
    two further, no benefit to the vendor and it's a smaller surface to leak)."""

    def __init__(self, message, reason="invalid"):
        self.reason = reason
        super().__init__(message)


def resolve_approval_chain(company_code=None, plant=None, vendor_type=None):
    """Most-specific-match-wins resolution over active configs."""
    candidates = VendorApprovalWorkflowConfig.objects.filter(is_active=True).prefetch_related("levels")

    best = None
    for config in candidates:
        if config.company_code and config.company_code != company_code:
            continue
        if config.plant and config.plant != plant:
            continue
        if config.vendor_type and config.vendor_type != vendor_type:
            continue
        if best is None or config.specificity() > best.specificity():
            best = config

    return best


def _role_name(user):
    if not user:
        return "Vendor"
    role = user.roles.first() if hasattr(user, "roles") else None
    return role.role_name if role else ""


# --- Access tokens -----------------------------------------------------

def generate_access_token(vendor, created_by=None):
    """Deactivates any existing tokens and issues a fresh one. Returns the raw
    token string (also what's stored - see VendorAccessToken docstring)."""
    ttl_days = getattr(settings, "VENDOR_ONBOARDING_TOKEN_TTL_DAYS", 90)
    with transaction.atomic():
        VendorAccessToken.objects.filter(vendor=vendor, is_active=True).update(is_active=False)
        raw_token = secrets.token_urlsafe(32)
        VendorAccessToken.objects.create(
            vendor=vendor,
            token=raw_token,
            expires_at=timezone.now() + timedelta(days=ttl_days),
            created_by=created_by,
        )
    return raw_token


def build_onboarding_url(raw_token):
    # settings.VENDOR_PORTAL_URL is env-driven (VENDOR_PORTAL_URL in .env) -
    # never hard-code a dev URL here. A vendor opens this link from their own
    # computer/network, not the machine running the dev server.
    base = settings.VENDOR_PORTAL_URL.rstrip("/")
    return f"{base}/vendor-onboarding/{raw_token}"


def build_admin_review_url(vendor):
    # Same frontend app/deployment as the vendor portal (VENDOR_PORTAL_URL),
    # just an authenticated admin route instead of the public token route.
    base = settings.VENDOR_PORTAL_URL.rstrip("/")
    return f"{base}/vendors/{vendor.id}"


def validate_public_token(raw_token, ip_address=None, user_agent=""):
    try:
        token = VendorAccessToken.objects.select_related("vendor").get(token=raw_token)
    except VendorAccessToken.DoesNotExist:
        raise InvalidTokenError("Invalid onboarding link.", reason="invalid")

    if token.expires_at <= timezone.now():
        raise InvalidTokenError("This onboarding link has expired.", reason="expired")
    if not token.is_active:
        raise InvalidTokenError("This onboarding link is no longer active.", reason="invalid")

    token.last_used_at = timezone.now()
    token.save(update_fields=["last_used_at"])
    VendorAccessLog.objects.create(
        vendor=token.vendor, token=token, ip_address=ip_address, user_agent=(user_agent or "")[:255],
    )
    return token.vendor


def raise_vendor_request(validated_data, created_by):
    """Admin 'Raise Vendor Request' action: creates the bare-minimum vendor
    row, assigns its reference number, issues the access token, and logs the
    'invited' history event. Returns (vendor, raw_token) - the caller is
    responsible for emailing raw_token, since it's never persisted."""
    with transaction.atomic():
        vendor = Vendor.objects.create(created_by=created_by, status="invited", **validated_data)
        vendor.assign_reference_number()
        vendor.save(update_fields=["vendor_reference_no"])
        raw_token = generate_access_token(vendor, created_by=created_by)
        VendorApprovalHistory.objects.create(
            vendor=vendor,
            actor=created_by,
            actor_role_snapshot=_role_name(created_by),
            action="invited",
            new_status="invited",
        )
    return vendor, raw_token


def ensure_draft_status(vendor):
    """A vendor's first save after being invited (or after being asked for
    changes) moves the request into DRAFT. Idempotent no-op otherwise."""
    if vendor.status in ("invited", "action_required"):
        vendor.status = "draft"
        vendor.save(update_fields=["status"])


# --- Snapshots / versions ------------------------------------------------

def _model_fields(instance, exclude=("id", "vendor", "created_at", "updated_at")):
    if not instance:
        return {}
    result = {}
    for field in instance._meta.fields:
        if field.name in exclude:
            continue
        value = getattr(instance, field.name)
        result[field.name] = str(value) if value is not None else None
    return result


def snapshot_vendor(vendor):
    profile = getattr(vendor, "onboarding_profile", None)
    kyc = getattr(vendor, "kyc", None)
    bank = getattr(vendor, "bank_detail", None)
    procurement = getattr(vendor, "procurement_detail", None)
    documents = list(
        vendor.documents.values("id", "category", "file_name", "file_size", "status")
    )

    bank_fields = _model_fields(bank, exclude=("id", "vendor", "created_at", "updated_at", "account_number"))
    if bank:
        bank_fields["account_number_masked"] = bank.mask_account_number()

    return {
        "profile": _model_fields(profile),
        "kyc": _model_fields(kyc),
        "bank_detail": bank_fields,
        "procurement_detail": _model_fields(procurement),
        "documents": documents,
    }


def _next_version_number(vendor):
    last = vendor.versions.order_by("-version_number").first()
    return (last.version_number + 1) if last else 1


# --- Workflow transitions --------------------------------------------------

def submit_vendor_for_approval(vendor, actor=None):
    """Resolves the approval chain (first submission only), creates/reuses the
    approval instance, snapshots the submission, flips status, and writes a
    history row. `actor` is an Account when an admin fills+submits on the
    vendor's behalf, or None for genuine vendor self-service submission."""
    profile = getattr(vendor, "onboarding_profile", None)
    company_code = (profile.company_code if profile else "") or vendor.company_code
    plant = (profile.plant if profile else "") or vendor.plant

    with transaction.atomic():
        previous_status = vendor.status
        is_resubmission = vendor.change_requests.exists()

        if hasattr(vendor, "approval_instance"):
            instance = vendor.approval_instance
        else:
            config = resolve_approval_chain(company_code, plant, vendor.vendor_type)
            if not config or not config.levels.exists():
                raise ValueError(
                    "No approval workflow is configured for this vendor's company code / plant / vendor type."
                )
            instance = VendorApprovalInstance.objects.create(
                vendor=vendor,
                resolved_config=config,
                current_level_order=config.levels.order_by("level_order").first().level_order,
            )

        new_status = "resubmitted" if is_resubmission else "submitted"
        vendor.status = new_status
        vendor.submitted_at = timezone.now()
        vendor.save(update_fields=["status", "submitted_at"])

        VendorChangeRequest.objects.filter(vendor=vendor, status="open").update(
            status="resolved", resolved_at=timezone.now()
        )

        VendorSubmissionVersion.objects.create(
            vendor=vendor,
            version_number=_next_version_number(vendor),
            snapshot=snapshot_vendor(vendor),
            is_resubmission=is_resubmission,
        )

        VendorApprovalHistory.objects.create(
            vendor=vendor,
            level_order=instance.current_level_order,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action=new_status,
            previous_status=previous_status,
            new_status=new_status,
        )

    return instance


def apply_approval_action(vendor, actor, comments=""):
    with transaction.atomic():
        instance = VendorApprovalInstance.objects.select_for_update().get(vendor=vendor)
        previous_status = vendor.status

        levels = list(instance.resolved_config.levels.order_by("level_order"))
        current_index = next(
            (i for i, lvl in enumerate(levels) if lvl.level_order == instance.current_level_order), None
        )
        if current_index is None:
            raise ValueError("Vendor is not currently awaiting approval at any configured level.")

        acted_level_order = instance.current_level_order

        if current_index + 1 < len(levels):
            instance.current_level_order = levels[current_index + 1].level_order
            vendor.status = "approval_in_progress"
            vendor_save_fields = ["status"]
        else:
            instance.current_level_order = None
            instance.completed_at = timezone.now()
            vendor.status = "approved"
            vendor.approved_at = timezone.now()
            vendor_save_fields = ["status", "approved_at"]

        instance.save(update_fields=["current_level_order", "completed_at", "last_action_at"])
        vendor.save(update_fields=vendor_save_fields)

        VendorApprovalHistory.objects.create(
            vendor=vendor,
            level_order=acted_level_order,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action="approved",
            previous_status=previous_status,
            new_status=vendor.status,
            comments=comments,
        )

    return instance


def apply_request_changes_action(vendor, actor, section, required_changes, comments=""):
    with transaction.atomic():
        instance = getattr(vendor, "approval_instance", None)
        previous_status = vendor.status
        acted_level_order = instance.current_level_order if instance else None

        vendor.status = "action_required"
        vendor.save(update_fields=["status"])
        if instance:
            instance.save(update_fields=["last_action_at"])

        change_request = VendorChangeRequest.objects.create(
            vendor=vendor,
            section=section,
            required_changes=required_changes,
            comments=comments,
            requested_by=actor,
        )

        VendorApprovalHistory.objects.create(
            vendor=vendor,
            level_order=acted_level_order,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action="requested_changes",
            previous_status=previous_status,
            new_status="action_required",
            comments=comments,
            required_changes=required_changes,
            change_request=change_request,
        )

    return change_request


def user_is_authorized_for_level(user, level):
    if level is None:
        return False
    # Matches the superuser bypass already used everywhere else in this app
    # (HasPermissionCode, vendor_onboarding._can_edit) - also covers the
    # common gap where a level's approver_user/approver_role was never
    # explicitly assigned (e.g. the seeded default config), which would
    # otherwise leave a vendor stuck with no one able to act on it.
    if user.is_superuser:
        return True
    if level.approver_user_id:
        return level.approver_user_id == user.id
    if level.approver_role_id:
        return level.approver_role in user.roles.all()
    return False
