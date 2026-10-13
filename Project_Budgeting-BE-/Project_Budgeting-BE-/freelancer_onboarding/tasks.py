import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from .services import build_onboarding_url

logger = logging.getLogger(__name__)


def _base_context(freelancer):
    """Variables shared by every Freelancer Onboarding email. Deliberately
    never includes the raw access token - only the fully-built portal URL."""
    return {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        # Blank unless COMPANY_EMAIL is set in .env - the template falls back
        # to "contact the person or team who invited you" when empty, same
        # convention as COMPANY_LOGO_URL's text-only fallback.
        "company_email": settings.COMPANY_EMAIL,
        "freelancer_name": freelancer.full_name,
        "freelancer_email": freelancer.email,
    }


def _freelancer_recipients(freelancer):
    return [freelancer.email] if freelancer.email else []


def _send(template, subject, recipients, context):
    if not recipients:
        return
    html_message = render_to_string(f"emails/freelancer_onboarding/{template}", context)
    plain_message = strip_tags(html_message)
    email = EmailMultiAlternatives(
        subject=subject,
        body=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    email.attach_alternative(html_message, "text/html")
    try:
        # Not fail_silently: we want the exception logged below - the
        # Freelancer row is untouched either way, and the admin can always
        # use "Resend Invitation" once the underlying issue is fixed.
        email.send(fail_silently=False)
    except Exception as exc:
        # No addresses in the log - the template name and error class are enough to triage.
        logger.error(
            "Freelancer onboarding email '%s' failed to send (%s)", template, exc.__class__.__name__
        )


@shared_task
def send_freelancer_invited_notification(freelancer_id, raw_token):
    from .models import Freelancer, FreelancerAccessToken
    freelancer = Freelancer.objects.filter(pk=freelancer_id).first()
    if not freelancer:
        return
    # Looked up from the token row itself (not recomputed from the TTL
    # setting) so the displayed date can never drift from the real
    # expiry Freelancer.is_valid() actually checks.
    token_row = FreelancerAccessToken.objects.filter(token=raw_token).first()
    context = {
        **_base_context(freelancer),
        "secure_freelancer_url": build_onboarding_url(raw_token),
        "token_expires_at": token_row.expires_at if token_row else None,
    }
    _send(
        "freelancer_invited.html",
        "Complete Your Freelancer Onboarding",
        _freelancer_recipients(freelancer),
        context,
    )


@shared_task
def send_freelancer_changes_requested_notification(freelancer_id, raw_token):
    """The reviewer sent the onboarding back: remarks, the steps to revisit and the link."""
    from .kyc import STEP_LABELS
    from .models import Freelancer, FreelancerAccessToken
    freelancer = Freelancer.objects.filter(pk=freelancer_id).first()
    if not freelancer:
        return
    token_row = FreelancerAccessToken.objects.filter(token=raw_token).first()
    context = {
        **_base_context(freelancer),
        "secure_freelancer_url": build_onboarding_url(raw_token),
        "token_expires_at": token_row.expires_at if token_row else None,
        "review_remarks": freelancer.review_remarks,
        "sections": [STEP_LABELS.get(key, key) for key in (freelancer.changes_requested_sections or [])],
    }
    _send(
        "freelancer_changes_requested.html",
        "Action Needed: Update Your Freelancer Onboarding",
        _freelancer_recipients(freelancer),
        context,
    )


@shared_task
def send_freelancer_approved_notification(freelancer_id):
    from .models import Freelancer
    freelancer = Freelancer.objects.filter(pk=freelancer_id).first()
    if not freelancer:
        return
    _send(
        "freelancer_approved.html",
        "Your Freelancer Onboarding Is Approved",
        _freelancer_recipients(freelancer),
        _base_context(freelancer),
    )
