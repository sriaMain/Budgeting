import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from .services import build_onboarding_url, build_admin_review_url

logger = logging.getLogger(__name__)

# (label, background, text color) per status - keep in sync with the status
# badges used across the admin UI. No "rejected" entry exists on purpose -
# there is no reject workflow.
STATUS_BADGES = {
    "submitted": ("SUBMITTED", "#dbeafe", "#1d4ed8"),
    "action_required": ("ACTION REQUIRED", "#fef3c7", "#b45309"),
    "resubmitted": ("RESUBMITTED", "#e0e7ff", "#4338ca"),
    "approval_in_progress": ("APPROVAL IN PROGRESS", "#ffedd5", "#c2410c"),
    "approved": ("APPROVED", "#dcfce7", "#15803d"),
}


def _badge(status_key):
    label, bg, color = STATUS_BADGES.get(status_key, (status_key.upper().replace("_", " "), "#f3f4f6", "#374151"))
    return {"status_label": label, "status_bg": bg, "status_color": color}


def _base_context(vendor):
    """Variables shared by every Vendor Onboarding email. Deliberately never
    includes the raw access token - only the fully-built portal URL."""
    return {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "vendor_name": vendor.name,
        "vendor_contact_name": vendor.contact_person_name or vendor.name,
        "vendor_email": vendor.email,
        "vendor_type": vendor.get_vendor_type_display(),
        "vendor_reference": vendor.vendor_reference_no,
    }


def _format_dt(value):
    return value.strftime("%d %b %Y, %I:%M %p") if value else ""


def _level_recipients(level):
    if not level:
        return []
    if level.approver_user and level.approver_user.email:
        return [level.approver_user.email]
    if level.approver_role:
        return list(
            level.approver_role.users.filter(email__isnull=False)
            .exclude(email="")
            .values_list("email", flat=True)
        )
    return []


def _vendor_recipients(vendor):
    return [vendor.email] if vendor.email else []


def _admin_recipients(vendor):
    if vendor.created_by and vendor.created_by.email:
        return [vendor.created_by.email]
    return []


def _send(template, subject, recipients, context):
    if not recipients:
        return
    html_message = render_to_string(f"emails/vendor_onboarding/{template}", context)
    plain_message = strip_tags(html_message)
    email = EmailMultiAlternatives(
        subject=subject,
        body=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    email.attach_alternative(html_message, "text/html")
    try:
        # Not fail_silently: we want the exception so it's logged below - the
        # Vendor row and its data are untouched either way, and the admin can
        # always use "Resend Invitation" once the underlying issue is fixed.
        email.send(fail_silently=False)
    except Exception:
        logger.exception(
            "Vendor onboarding email '%s' failed to send to %s", template, recipients
        )


@shared_task
def send_vendor_invited_notification(vendor_id, raw_token):
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor:
        return
    context = {
        **_base_context(vendor),
        "secure_vendor_url": build_onboarding_url(raw_token),
    }
    _send(
        "vendor_invited.html",
        f"Vendor Onboarding Request – {vendor.vendor_reference_no}",
        _vendor_recipients(vendor),
        context,
    )


@shared_task
def send_vendor_submitted_notification(vendor_id):
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor or not hasattr(vendor, "approval_instance"):
        return
    level = vendor.approval_instance.current_level()
    context = {
        **_base_context(vendor),
        **_badge("submitted"),
        "level": level,
        "extra_label": "Submitted On",
        "extra_value": _format_dt(vendor.submitted_at),
        "admin_review_url": build_admin_review_url(vendor),
    }
    _send(
        "vendor_submitted_for_approval.html",
        f"Vendor Onboarding Submitted – {vendor.vendor_reference_no} | {vendor.name}",
        _level_recipients(level),
        context,
    )


@shared_task
def send_vendor_approval_advanced_notification(vendor_id):
    """Internal notice to the NEXT approver that a stage was cleared."""
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor or not hasattr(vendor, "approval_instance"):
        return
    level = vendor.approval_instance.current_level()
    context = {
        **_base_context(vendor),
        **_badge("approval_in_progress"),
        "level": level,
        "admin_review_url": build_admin_review_url(vendor),
    }
    _send(
        "vendor_stage_approved_next_level.html",
        f"Vendor {vendor.vendor_reference_no} awaiting your approval",
        _level_recipients(level),
        context,
    )


@shared_task
def send_vendor_approval_in_progress_notification(vendor_id):
    """Optional vendor-facing notice that their request cleared a stage and
    moved on to the next approval level. Only fires for multi-level chains -
    a single-level chain goes straight from submitted to approved."""
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor:
        return
    context = {
        **_base_context(vendor),
        **_badge("approval_in_progress"),
    }
    _send(
        "vendor_approval_in_progress.html",
        f"Vendor Onboarding Under Review – {vendor.vendor_reference_no}",
        _vendor_recipients(vendor),
        context,
    )


@shared_task
def send_vendor_approved_notification(vendor_id):
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor:
        return
    context = {
        **_base_context(vendor),
        **_badge("approved"),
        "extra_label": "Approved On",
        "extra_value": _format_dt(vendor.approved_at),
    }
    recipients = _vendor_recipients(vendor) + [
        r for r in _admin_recipients(vendor) if r not in _vendor_recipients(vendor)
    ]
    _send(
        "vendor_fully_approved.html",
        f"Vendor Onboarding Approved – {vendor.vendor_reference_no} | {vendor.name}",
        recipients,
        context,
    )


@shared_task
def send_vendor_request_changes_notification(vendor_id, change_request_id):
    from accounts.models import Vendor
    from .models import VendorChangeRequest
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor:
        return

    # Show every still-open change request, not just the one that triggered
    # this send - if an admin requested changes to more than one section
    # before the vendor resubmits, the vendor should see all of them at once.
    open_requests = list(
        VendorChangeRequest.objects.filter(vendor=vendor, status="open").order_by("requested_at")
    )
    if not open_requests:
        single = VendorChangeRequest.objects.filter(pk=change_request_id).first()
        open_requests = [single] if single else []

    change_requests = [
        {
            "section_display": cr.get_section_display(),
            "required_changes": cr.required_changes,
            "comments": cr.comments,
        }
        for cr in open_requests
    ]

    token = vendor.current_token()
    context = {
        **_base_context(vendor),
        **_badge("action_required"),
        "change_requests": change_requests,
        "secure_vendor_url": build_onboarding_url(token.token) if token else "",
    }
    _send(
        "vendor_request_changes.html",
        f"Action Required – Vendor Onboarding Update Required | {vendor.vendor_reference_no}",
        _vendor_recipients(vendor),
        context,
    )


@shared_task
def send_vendor_resubmitted_notification(vendor_id):
    from accounts.models import Vendor
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor or not hasattr(vendor, "approval_instance"):
        return
    level = vendor.approval_instance.current_level()
    context = {
        **_base_context(vendor),
        **_badge("resubmitted"),
        "level": level,
        "extra_label": "Resubmitted On",
        "extra_value": _format_dt(vendor.submitted_at),
        "admin_review_url": build_admin_review_url(vendor),
    }
    _send(
        "vendor_resubmitted.html",
        f"Vendor Onboarding Resubmitted – {vendor.vendor_reference_no} | {vendor.name}",
        _level_recipients(level),
        context,
    )
