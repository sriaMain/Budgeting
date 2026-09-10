import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

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
