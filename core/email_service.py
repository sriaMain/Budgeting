"""
Centralized email-sending entry point for new code.

    Controller / business logic -> send_email() -> Django mail API
        -> EMAIL_BACKEND (SMTP, or console in local DEBUG) -> Recipient

Existing call sites (accounts, product_group, Project, finances,
employee_onboarding, vendor_onboarding, freelancer_onboarding) already build
their own EmailMultiAlternatives/send_mail() calls and don't need to change -
they transport through whatever EMAIL_BACKEND is configured automatically.
This module just gives new code one obvious, minimal function to call
instead of duplicating that construction again.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags

logger = logging.getLogger("core.email")


def send_email(
    *,
    to,
    subject,
    html,
    text=None,
    from_email=None,
    cc=None,
    bcc=None,
    reply_to=None,
    attachments=None,
    fail_silently=False,
):
    """
    Send a single email. `to`/`cc`/`bcc`/`reply_to` accept either a string
    or a list of strings. `attachments` is an optional list of
    (filename, content, mimetype) tuples, same as Django's EmailMessage.attach().

    Raises on failure unless fail_silently=True (mirrors Django's own
    email API so callers can opt into the same semantics they already use
    elsewhere in this codebase).
    """
    def _as_list(value):
        if not value:
            return None
        return [value] if isinstance(value, str) else list(value)

    recipients = _as_list(to)
    if not recipients:
        raise ValueError("send_email() requires at least one recipient in `to`.")

    email = EmailMultiAlternatives(
        subject=subject,
        body=text or strip_tags(html),
        from_email=from_email or settings.DEFAULT_FROM_EMAIL,
        to=recipients,
        cc=_as_list(cc),
        bcc=_as_list(bcc),
        reply_to=_as_list(reply_to),
    )
    email.attach_alternative(html, "text/html")
    for attachment in attachments or []:
        email.attach(*attachment)

    try:
        email.send(fail_silently=False)
    except Exception:
        logger.exception("send_email() failed | to=%s | subject=%r", recipients, subject)
        if not fail_silently:
            raise
        return False
    return True
