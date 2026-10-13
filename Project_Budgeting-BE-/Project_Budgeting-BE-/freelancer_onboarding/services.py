import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from rest_framework.exceptions import ValidationError

from .models import Freelancer, FreelancerAccessToken, FreelancerAccessLog, FreelancerAuditLog

# Audit "who" for actions taken through the secure link (there is no user).
PORTAL_ACTOR = "Freelancer (portal)"


class InvalidTokenError(Exception):
    """Raised for any invalid/expired/revoked public access token. `reason` is
    "expired" (the link used to work, ask for a new one), "revoked" (switched off -
    `token` tells why) or "invalid" (never existed) - mirrors vendor_onboarding's
    InvalidTokenError."""

    def __init__(self, message, reason="invalid", token=None):
        self.reason = reason
        self.token = token
        super().__init__(message)


def _ttl_days():
    return getattr(settings, "FREELANCER_ONBOARDING_TOKEN_TTL_DAYS", 30)


# --------------------------------------------------------------------------- #
# Audit                                                                        #
# --------------------------------------------------------------------------- #

def log_audit(freelancer, action, *, user=None, actor_label="", field_name="", old_value="", new_value="", remarks=""):
    """Section 22 audit trail. Callers must never pass raw sensitive values (account
    numbers, tax / ID numbers, tokens) - mask them or describe the change instead."""
    authenticated = user is not None and getattr(user, "is_authenticated", False)
    FreelancerAuditLog.objects.create(
        freelancer=freelancer,
        action=action,
        field_name=(field_name or "")[:100],
        old_value=("" if old_value is None else str(old_value))[:255],
        new_value=("" if new_value is None else str(new_value))[:255],
        remarks=(remarks or "")[:2000],
        performed_by=user if authenticated else None,
        actor_label="" if authenticated else (actor_label or "")[:50],
    )


def _log_transition(freelancer, old_status, old_kyc, *, user=None, actor_label=""):
    if old_status != freelancer.status:
        log_audit(freelancer, "status_changed", user=user, actor_label=actor_label, field_name="status",
                  old_value=old_status, new_value=freelancer.status)
    if old_kyc != freelancer.kyc_status:
        log_audit(freelancer, "kyc_status_changed", user=user, actor_label=actor_label, field_name="kyc_status",
                  old_value=old_kyc, new_value=freelancer.kyc_status)


# --------------------------------------------------------------------------- #
# Secure link                                                                  #
# --------------------------------------------------------------------------- #

def revoke_access_tokens(freelancer, reason):
    """Switches off every active link. Returns how many were revoked."""
    return FreelancerAccessToken.objects.filter(freelancer=freelancer, is_active=True).update(
        is_active=False, revoked_at=timezone.now(), revoke_reason=reason,
    )


def generate_access_token(freelancer, created_by=None):
    """Deactivates any existing tokens and issues a fresh one. Returns the raw
    token string (also what's stored - see FreelancerAccessToken docstring)."""
    with transaction.atomic():
        revoke_access_tokens(freelancer, "reissued")
        raw_token = secrets.token_urlsafe(32)
        FreelancerAccessToken.objects.create(
            freelancer=freelancer,
            token=raw_token,
            expires_at=timezone.now() + timedelta(days=_ttl_days()),
            created_by=created_by,
        )
    return raw_token


def ensure_access_token(freelancer, created_by=None, min_days_left=7):
    """Reuses the newest active link (extending it when it has expired or expires within
    `min_days_left` days) or issues a new one. Returns the raw token."""
    token = freelancer.access_tokens.filter(is_active=True).order_by("-created_at").first()
    if token is None:
        return generate_access_token(freelancer, created_by=created_by)
    now = timezone.now()
    if token.expires_at < now + timedelta(days=min_days_left):
        token.expires_at = now + timedelta(days=_ttl_days())
        token.save(update_fields=["expires_at"])
    return token.token


def access_link_summary(freelancer):
    """Link status for the admin screen - never the token itself."""
    token = freelancer.access_tokens.order_by("-created_at").first()
    if token is None:
        return {"status": "none", "expires_at": None, "last_used_at": None, "created_at": None,
                "revoked_at": None, "revoke_reason": ""}
    if not token.is_active:
        state = "revoked"
    elif token.expires_at <= timezone.now():
        state = "expired"
    else:
        state = "active"
    return {
        "status": state,
        "expires_at": token.expires_at,
        "last_used_at": token.last_used_at,
        "created_at": token.created_at,
        "revoked_at": token.revoked_at,
        "revoke_reason": token.revoke_reason,
    }


def build_onboarding_url(raw_token):
    # settings.FREELANCER_PORTAL_URL is env-driven - never hard-code a dev URL
    # here. A freelancer opens this link from their own computer, not the
    # machine running the dev server.
    base = settings.FREELANCER_PORTAL_URL.rstrip("/")
    return f"{base}/freelancer-onboarding/{raw_token}"


def validate_public_token(raw_token, ip_address=None, user_agent=""):
    try:
        token = FreelancerAccessToken.objects.select_related("freelancer").get(token=raw_token)
    except FreelancerAccessToken.DoesNotExist:
        raise InvalidTokenError("Invalid onboarding link.", reason="invalid")

    if not token.is_active:
        raise InvalidTokenError("This onboarding link is no longer active.", reason="revoked", token=token)
    if token.expires_at <= timezone.now():
        raise InvalidTokenError("This onboarding link has expired.", reason="expired", token=token)

    token.last_used_at = timezone.now()
    token.save(update_fields=["last_used_at"])
    FreelancerAccessLog.objects.create(
        freelancer=token.freelancer, token=token, ip_address=ip_address, user_agent=(user_agent or "")[:255],
    )
    return token.freelancer


# --------------------------------------------------------------------------- #
# Onboarding workflow                                                          #
# --------------------------------------------------------------------------- #

def invite_freelancer(full_name, email, created_by, first_name="", middle_name="", last_name=""):
    """Admin 'Invite Freelancer' action: creates the bare-minimum freelancer
    row, issues the access token. Returns (freelancer, raw_token) - the caller
    is responsible for emailing raw_token."""
    with transaction.atomic():
        freelancer = Freelancer.objects.create(
            full_name=full_name, email=email, created_by=created_by, status="invited",
            first_name=first_name, middle_name=middle_name, last_name=last_name,
        )
        raw_token = generate_access_token(freelancer, created_by=created_by)
        log_audit(freelancer, "invite_resent", user=created_by, field_name="invite", new_value="Invitation sent")
    return freelancer, raw_token


def ensure_onboarding_status(freelancer):
    """A freelancer's first public save after being invited moves the record
    into ONBOARDING. Idempotent no-op otherwise - mirrors ensure_draft_status
    in vendor_onboarding."""
    if freelancer.status == "invited":
        freelancer.status = "onboarding"
        freelancer.save(update_fields=["status", "updated_at"])
        log_audit(freelancer, "status_changed", actor_label=PORTAL_ACTOR, field_name="status",
                  old_value="invited", new_value="onboarding")


def submit_onboarding(freelancer, *, user=None, actor_label=""):
    """completed = submitted, waiting for a reviewer. The secure link stays usable
    (read-only) so the freelancer can still see what they sent."""
    old_status, old_kyc = freelancer.status, freelancer.kyc_status
    freelancer.status = "completed"
    freelancer.kyc_status = "submitted"
    freelancer.submitted_at = timezone.now()
    freelancer.changes_requested_sections = []
    freelancer.save(update_fields=["status", "kyc_status", "submitted_at", "changes_requested_sections", "updated_at"])
    log_audit(freelancer, "submitted", user=user, actor_label=actor_label)
    _log_transition(freelancer, old_status, old_kyc, user=user, actor_label=actor_label)


def approve_onboarding(freelancer, reviewer, remarks=""):
    old_status, old_kyc = freelancer.status, freelancer.kyc_status
    freelancer.status = "active"
    freelancer.kyc_status = "verified"
    freelancer.reviewed_by = reviewer
    freelancer.reviewed_at = timezone.now()
    freelancer.review_remarks = remarks or ""
    freelancer.changes_requested_sections = []
    freelancer.save(update_fields=[
        "status", "kyc_status", "reviewed_by", "reviewed_at", "review_remarks", "changes_requested_sections", "updated_at",
    ])
    log_audit(freelancer, "approved", user=reviewer, remarks=remarks)
    _log_transition(freelancer, old_status, old_kyc, user=reviewer)
    if revoke_access_tokens(freelancer, "approved"):
        log_audit(freelancer, "token_revoked", user=reviewer, field_name="access_link", new_value="Onboarding approved")


def request_onboarding_changes(freelancer, reviewer, remarks, sections):
    """Sends the onboarding back to the freelancer. Returns the raw link token to email
    (the current link, extended if needed, or a new one)."""
    old_status, old_kyc = freelancer.status, freelancer.kyc_status
    freelancer.status = "changes_requested"
    freelancer.kyc_status = "changes_requested"
    freelancer.reviewed_by = reviewer
    freelancer.reviewed_at = timezone.now()
    freelancer.review_remarks = remarks
    freelancer.changes_requested_sections = list(sections)
    freelancer.save(update_fields=[
        "status", "kyc_status", "reviewed_by", "reviewed_at", "review_remarks", "changes_requested_sections", "updated_at",
    ])
    raw_token = ensure_access_token(freelancer, created_by=reviewer)
    log_audit(freelancer, "changes_requested", user=reviewer, field_name=", ".join(sections)[:100], remarks=remarks)
    _log_transition(freelancer, old_status, old_kyc, user=reviewer)
    return raw_token


def mark_under_review(freelancer, reviewer):
    """The first reviewer action on a submitted onboarding moves KYC to 'under_review'."""
    if freelancer.status == "completed" and freelancer.kyc_status == "submitted":
        freelancer.kyc_status = "under_review"
        freelancer.save(update_fields=["kyc_status", "updated_at"])
        log_audit(freelancer, "kyc_status_changed", user=reviewer, field_name="kyc_status",
                  old_value="submitted", new_value="under_review")


def apply_status_side_effects(freelancer, previous_status, user):
    """After an admin status change: closing a freelancer switches the link off; re-opening
    an offboarded / blocked one starts a fresh KYC cycle."""
    if freelancer.status == previous_status:
        return
    log_audit(freelancer, "status_changed", user=user, field_name="status",
              old_value=previous_status, new_value=freelancer.status)
    if freelancer.status in Freelancer.CLOSED_STATUSES:
        if revoke_access_tokens(freelancer, "closed"):
            log_audit(freelancer, "token_revoked", user=user, field_name="access_link",
                      new_value=f"Freelancer {freelancer.get_status_display().lower()}")
    elif freelancer.status == "onboarding" and previous_status in Freelancer.CLOSED_STATUSES:
        old_kyc = freelancer.kyc_status
        freelancer.kyc_status = "not_started"
        freelancer.submitted_at = None
        freelancer.save(update_fields=["kyc_status", "submitted_at", "updated_at"])
        if old_kyc != freelancer.kyc_status:
            log_audit(freelancer, "kyc_status_changed", user=user, field_name="kyc_status",
                      old_value=old_kyc, new_value=freelancer.kyc_status)


# --------------------------------------------------------------------------- #
# Capacity / time tracking (unchanged)                                         #
# --------------------------------------------------------------------------- #

def check_freelancer_capacity(freelancer, start_date, end_date, allocated_hours, exclude_assignment_id=None):
    """Non-blocking capacity check (Rules 9/10). An assignment's hours are a
    total over its whole date range, not a weekly figure, so this normalizes
    every overlapping assignment (and the candidate one) to an hours/week
    rate before comparing against Freelancer.hours_per_week - matching the
    spec's own "capacity = 40/week, allocated = 35, new = 15 -> over by 10"
    example. Returns a dict describing the result; it never raises, since
    over-allocation is something to flag to the admin, not block outright."""
    from .models import FreelancerProjectAssignment

    def weeks_in(start, end):
        if not start:
            return 1.0
        span_end = end or start
        days = max((span_end - start).days, 0) + 1
        return max(days / 7, 1.0)

    new_weeks = weeks_in(start_date, end_date)
    new_hours_per_week = float(allocated_hours) / new_weeks

    qs = FreelancerProjectAssignment.objects.filter(
        freelancer=freelancer, status__in=["planned", "active"],
    )
    if exclude_assignment_id:
        qs = qs.exclude(pk=exclude_assignment_id)

    existing_hours_per_week = 0.0
    for assignment in qs:
        other_end = assignment.end_date or assignment.start_date
        candidate_end = end_date or other_end
        overlaps = assignment.start_date <= candidate_end and start_date <= other_end
        if overlaps:
            existing_hours_per_week += float(assignment.allocated_hours) / weeks_in(
                assignment.start_date, assignment.end_date
            )

    total_hours_per_week = existing_hours_per_week + new_hours_per_week
    capacity = float(freelancer.hours_per_week) if freelancer.hours_per_week is not None else None
    is_over_allocated = capacity is not None and total_hours_per_week > capacity

    return {
        "capacity_hours_per_week": capacity,
        "existing_allocated_hours_per_week": round(existing_hours_per_week, 2),
        "requested_hours_per_week": round(new_hours_per_week, 2),
        "total_allocated_hours_per_week": round(total_hours_per_week, 2),
        "is_over_allocated": is_over_allocated,
        "over_allocated_by": round(total_hours_per_week - capacity, 2) if is_over_allocated else 0,
    }


def submit_time_entry(entry):
    """draft -> submitted (Rule 6/7 context: only the *next* step, approval,
    actually makes an entry count toward cost - this just moves it into the
    approver's queue)."""
    if entry.status != "draft":
        raise ValidationError("Only draft entries can be submitted.")
    entry.status = "submitted"
    entry.submitted_at = timezone.now()
    entry.save(update_fields=["status", "submitted_at"])
    return entry


def approve_time_entry(entry, reviewer):
    if entry.status != "submitted":
        raise ValidationError("Only submitted entries can be approved.")
    entry.status = "approved"
    entry.reviewed_by = reviewer
    entry.reviewed_at = timezone.now()
    entry.rejection_reason = ""
    entry.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    return entry


def reject_time_entry(entry, reviewer, reason=""):
    if entry.status != "submitted":
        raise ValidationError("Only submitted entries can be rejected.")
    entry.status = "rejected"
    entry.reviewed_by = reviewer
    entry.reviewed_at = timezone.now()
    entry.rejection_reason = reason
    entry.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    return entry
