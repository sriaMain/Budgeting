import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from rest_framework.exceptions import ValidationError

from .models import Freelancer, FreelancerAccessToken, FreelancerAccessLog


class InvalidTokenError(Exception):
    """Raised for any invalid/expired/revoked public access token. `reason` is
    either "expired" (the link used to work, ask for a new one) or "invalid"
    (never existed / was revoked) - mirrors vendor_onboarding's InvalidTokenError."""

    def __init__(self, message, reason="invalid"):
        self.reason = reason
        super().__init__(message)


def generate_access_token(freelancer, created_by=None):
    """Deactivates any existing tokens and issues a fresh one. Returns the raw
    token string (also what's stored - see FreelancerAccessToken docstring)."""
    ttl_days = getattr(settings, "FREELANCER_ONBOARDING_TOKEN_TTL_DAYS", 30)
    with transaction.atomic():
        FreelancerAccessToken.objects.filter(freelancer=freelancer, is_active=True).update(is_active=False)
        raw_token = secrets.token_urlsafe(32)
        FreelancerAccessToken.objects.create(
            freelancer=freelancer,
            token=raw_token,
            expires_at=timezone.now() + timedelta(days=ttl_days),
            created_by=created_by,
        )
    return raw_token


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

    if token.expires_at <= timezone.now():
        raise InvalidTokenError("This onboarding link has expired.", reason="expired")
    if not token.is_active:
        raise InvalidTokenError("This onboarding link is no longer active.", reason="invalid")

    token.last_used_at = timezone.now()
    token.save(update_fields=["last_used_at"])
    FreelancerAccessLog.objects.create(
        freelancer=token.freelancer, token=token, ip_address=ip_address, user_agent=(user_agent or "")[:255],
    )
    return token.freelancer


def invite_freelancer(full_name, email, created_by):
    """Admin 'Invite Freelancer' action: creates the bare-minimum freelancer
    row, issues the access token. Returns (freelancer, raw_token) - the caller
    is responsible for emailing raw_token, since it's never persisted."""
    with transaction.atomic():
        freelancer = Freelancer.objects.create(
            full_name=full_name, email=email, created_by=created_by, status="invited",
        )
        raw_token = generate_access_token(freelancer, created_by=created_by)
    return freelancer, raw_token


def ensure_onboarding_status(freelancer):
    """A freelancer's first public save after being invited moves the record
    into ONBOARDING. Idempotent no-op otherwise - mirrors ensure_draft_status
    in vendor_onboarding/employee_onboarding."""
    if freelancer.status == "invited":
        freelancer.status = "onboarding"
        freelancer.save(update_fields=["status"])


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
