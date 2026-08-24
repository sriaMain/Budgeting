import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from .models import (
    EmployeeOnboardingRequest, EmployeeAccessToken, EmployeeAccessLog,
    EmployeeChangeRequest, EmployeeSubmissionVersion, EmployeeOnboardingHistory,
)


class InvalidTokenError(Exception):
    """Raised for any invalid/expired/revoked public access token. `reason` is
    either "expired" (the link used to work, ask HR to resend it) or "invalid"
    (never existed / was revoked - don't distinguish those two further)."""

    def __init__(self, message, reason="invalid"):
        self.reason = reason
        super().__init__(message)


def _role_name(user):
    if not user:
        return "Employee"
    role = user.roles.first() if hasattr(user, "roles") else None
    return role.role_name if role else ""


# --- Access tokens -----------------------------------------------------

def generate_access_token(request, created_by=None):
    """Deactivates any existing tokens and issues a fresh one. Returns the raw
    token string (also what's stored - see EmployeeAccessToken docstring)."""
    ttl_days = getattr(settings, "EMPLOYEE_ONBOARDING_TOKEN_TTL_DAYS", 30)
    with transaction.atomic():
        EmployeeAccessToken.objects.filter(request=request, is_active=True).update(is_active=False)
        raw_token = secrets.token_urlsafe(32)
        EmployeeAccessToken.objects.create(
            request=request,
            token=raw_token,
            expires_at=timezone.now() + timedelta(days=ttl_days),
            created_by=created_by,
        )
    return raw_token


def build_onboarding_url(raw_token):
    # settings.EMPLOYEE_PORTAL_URL is env-driven (EMPLOYEE_PORTAL_URL in .env)
    # - never hard-code a dev URL here. An employee opens this link from their
    # own computer/network, not the machine running the dev server.
    base = settings.EMPLOYEE_PORTAL_URL.rstrip("/")
    return f"{base}/employee-onboarding/{raw_token}"


def build_admin_review_url(request):
    base = settings.EMPLOYEE_PORTAL_URL.rstrip("/")
    return f"{base}/employee-onboarding/review/{request.account_id}"


def validate_public_token(raw_token, ip_address=None, user_agent=""):
    try:
        token = EmployeeAccessToken.objects.select_related("request", "request__account").get(token=raw_token)
    except EmployeeAccessToken.DoesNotExist:
        raise InvalidTokenError("Invalid onboarding link.", reason="invalid")

    if token.expires_at <= timezone.now():
        raise InvalidTokenError("This onboarding link has expired.", reason="expired")
    if not token.is_active:
        raise InvalidTokenError("This onboarding link is no longer active.", reason="invalid")

    token.last_used_at = timezone.now()
    token.save(update_fields=["last_used_at"])
    EmployeeAccessLog.objects.create(
        request=token.request, token=token, ip_address=ip_address, user_agent=(user_agent or "")[:255],
    )
    return token.request


EMPLOYMENT_FIELDS = (
    "employee_code", "department", "designation", "reporting_manager",
    "joining_date", "employment_type", "work_location", "pf_applicable",
)


def send_or_resend_invite(account, employment_data, created_by=None):
    """Admin 'Send Onboarding Invite' action. Idempotent: reuses the existing
    EmployeeOnboardingRequest for this account if one already exists (never
    creates a duplicate), only overwriting employment fields while the
    request is still editable so submitted/approved data is never clobbered.
    Always rotates the access token and returns (request, raw_token) - the
    caller is responsible for emailing raw_token, since it's never persisted."""
    # A blank employee_code means "auto-assign one" (see EmployeeInviteSerializer) -
    # never pass a blank value through to get_or_create/setattr, or a resend
    # with no employee_code supplied would blank out an already-assigned one.
    employment_data = dict(employment_data)
    provided_employee_code = employment_data.pop("employee_code", "") or ""

    with transaction.atomic():
        onboarding_request, created = EmployeeOnboardingRequest.objects.get_or_create(
            account=account,
            defaults={
                "created_by": created_by, "status": "invited",
                "employee_code": provided_employee_code or None,
                **employment_data,
            },
        )

        if created:
            if not onboarding_request.employee_code:
                onboarding_request.assign_employee_code()
                onboarding_request.save(update_fields=["employee_code"])
            EmployeeOnboardingHistory.objects.create(
                request=onboarding_request,
                actor=created_by,
                actor_role_snapshot=_role_name(created_by),
                action="invited",
                new_status="invited",
            )
        elif onboarding_request.status in ("invited", "draft", "action_required"):
            update_fields = []
            if provided_employee_code:
                onboarding_request.employee_code = provided_employee_code
                update_fields.append("employee_code")
            for field, value in employment_data.items():
                setattr(onboarding_request, field, value)
                update_fields.append(field)
            if update_fields:
                onboarding_request.save(update_fields=update_fields)

        raw_token = generate_access_token(onboarding_request, created_by=created_by)

    return onboarding_request, raw_token


def ensure_draft_status(onboarding_request):
    """An employee's first save after being invited (or after being asked for
    changes) moves the request into DRAFT. Idempotent no-op otherwise."""
    if onboarding_request.status in ("invited", "action_required"):
        onboarding_request.status = "draft"
        onboarding_request.save(update_fields=["status"])


# --- Snapshots / versions ------------------------------------------------

def _model_fields(instance, exclude=("id", "request", "created_at", "updated_at")):
    if not instance:
        return {}
    result = {}
    for field in instance._meta.fields:
        if field.name in exclude:
            continue
        value = getattr(instance, field.name)
        result[field.name] = str(value) if value is not None else None
    return result


def snapshot_employee(onboarding_request):
    personal = getattr(onboarding_request, "personal_detail", None)
    address = getattr(onboarding_request, "address_detail", None)
    statutory = getattr(onboarding_request, "statutory_detail", None)
    bank = getattr(onboarding_request, "bank_detail", None)
    emergency = getattr(onboarding_request, "emergency_contact", None)
    documents = list(
        onboarding_request.documents.values("id", "category", "file_name", "file_size", "status")
    )

    bank_fields = _model_fields(bank, exclude=("id", "request", "created_at", "updated_at", "account_number"))
    if bank:
        bank_fields["account_number_masked"] = bank.mask_account_number()

    return {
        "personal_detail": _model_fields(personal),
        "address_detail": _model_fields(address),
        "statutory_detail": _model_fields(statutory),
        "bank_detail": bank_fields,
        "emergency_contact": _model_fields(emergency),
        "documents": documents,
    }


def _next_version_number(onboarding_request):
    last = onboarding_request.versions.order_by("-version_number").first()
    return (last.version_number + 1) if last else 1


# --- Workflow transitions --------------------------------------------------

def submit_employee_onboarding(onboarding_request, actor=None):
    """Snapshots the submission, flips status, and writes a history row.
    `actor` is an Account when an admin fills+submits on the employee's
    behalf, or None for genuine employee self-service submission. There is no
    multi-level approval chain - a single Admin approval finishes the flow."""
    with transaction.atomic():
        previous_status = onboarding_request.status
        is_resubmission = onboarding_request.change_requests.exists()

        new_status = "resubmitted" if is_resubmission else "submitted"
        onboarding_request.status = new_status
        onboarding_request.submitted_at = timezone.now()
        onboarding_request.save(update_fields=["status", "submitted_at"])

        EmployeeChangeRequest.objects.filter(request=onboarding_request, status="open").update(
            status="resolved", resolved_at=timezone.now()
        )

        EmployeeSubmissionVersion.objects.create(
            request=onboarding_request,
            version_number=_next_version_number(onboarding_request),
            snapshot=snapshot_employee(onboarding_request),
            is_resubmission=is_resubmission,
        )

        EmployeeOnboardingHistory.objects.create(
            request=onboarding_request,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action=new_status,
            previous_status=previous_status,
            new_status=new_status,
        )


def apply_employee_approval(onboarding_request, actor, comments=""):
    with transaction.atomic():
        previous_status = onboarding_request.status
        onboarding_request.status = "approved"
        onboarding_request.approved_at = timezone.now()
        onboarding_request.save(update_fields=["status", "approved_at"])

        EmployeeOnboardingHistory.objects.create(
            request=onboarding_request,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action="approved",
            previous_status=previous_status,
            new_status="approved",
            comments=comments,
        )


def apply_employee_request_changes(onboarding_request, actor, section, field_name="", reason="", comments=""):
    with transaction.atomic():
        previous_status = onboarding_request.status
        onboarding_request.status = "action_required"
        onboarding_request.save(update_fields=["status"])

        change_request = EmployeeChangeRequest.objects.create(
            request=onboarding_request,
            section=section,
            field_name=field_name,
            reason=reason,
            comments=comments,
            requested_by=actor,
        )

        EmployeeOnboardingHistory.objects.create(
            request=onboarding_request,
            actor=actor,
            actor_role_snapshot=_role_name(actor),
            action="requested_changes",
            previous_status=previous_status,
            new_status="action_required",
            comments=comments,
            reason=reason,
            change_request=change_request,
        )

    return change_request
