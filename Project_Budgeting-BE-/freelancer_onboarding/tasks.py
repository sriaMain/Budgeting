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
    except Exception:
        logger.exception(
            "Freelancer onboarding email '%s' failed to send to %s", template, recipients
        )


@shared_task
def send_freelancer_invited_notification(freelancer_id, raw_token):
    from .models import Freelancer
    freelancer = Freelancer.objects.filter(pk=freelancer_id).first()
    if not freelancer:
        return
    context = {
        **_base_context(freelancer),
        "secure_freelancer_url": build_onboarding_url(raw_token),
    }
    _send(
        "freelancer_invited.html",
        "Complete Your Freelancer Onboarding",
        _freelancer_recipients(freelancer),
        context,
    )
