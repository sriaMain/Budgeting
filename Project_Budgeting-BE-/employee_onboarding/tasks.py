import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from .services import build_onboarding_url

logger = logging.getLogger(__name__)

# (label, background, text color) per status - keep in sync with the status
# badges used across the admin UI. No "rejected" entry exists on purpose -
# there is no reject workflow.
STATUS_BADGES = {
    "submitted": ("SUBMITTED", "#dbeafe", "#1d4ed8"),
    "action_required": ("ACTION REQUIRED", "#fef3c7", "#b45309"),
    "resubmitted": ("RESUBMITTED", "#e0e7ff", "#4338ca"),
    "approved": ("APPROVED", "#dcfce7", "#15803d"),
}


def _badge(status_key):
    label, bg, color = STATUS_BADGES.get(status_key, (status_key.upper().replace("_", " "), "#f3f4f6", "#374151"))
    return {"status_label": label, "status_bg": bg, "status_color": color}


def _base_context(onboarding_request):
    """Variables shared by every Employee Onboarding email. Deliberately never
    includes the raw access token - only the fully-built portal URL."""
    account = onboarding_request.account
    return {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "employee_name": account.display_name or account.username,
        "employee_email": account.email,
        "employee_id": onboarding_request.employee_code,
        "designation": onboarding_request.designation,
        "joining_date": _format_date(onboarding_request.joining_date),
    }


def _format_date(value):
    return value.strftime("%d %b %Y") if value else ""


def _format_dt(value):
    return value.strftime("%d %b %Y, %I:%M %p") if value else ""


def _employee_recipients(onboarding_request):
    email = onboarding_request.account.email
    return [email] if email else []


def _admin_recipients(onboarding_request):
    if onboarding_request.created_by and onboarding_request.created_by.email:
        return [onboarding_request.created_by.email]
    return []


def _send(template, subject, recipients, context):
    if not recipients:
        return
    html_message = render_to_string(f"emails/employee_onboarding/{template}", context)
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
        # onboarding request and its data are untouched either way, and HR can
        # always use "Send Onboarding Invite" again once the issue is fixed.
        email.send(fail_silently=False)
    except Exception:
        logger.exception(
            "Employee onboarding email '%s' failed to send to %s", template, recipients
        )


@shared_task
def send_employee_invited_notification(request_id, raw_token):
    from .models import EmployeeOnboardingRequest
    onboarding_request = EmployeeOnboardingRequest.objects.select_related("account").filter(pk=request_id).first()
    if not onboarding_request:
        return
    context = {
        **_base_context(onboarding_request),
        "secure_employee_url": build_onboarding_url(raw_token),
    }
    _send(
        "employee_invited.html",
        f"Employee Onboarding Invitation – {context['employee_name']}",
        _employee_recipients(onboarding_request),
        context,
    )


@shared_task
def send_employee_submitted_notification(request_id):
    from .models import EmployeeOnboardingRequest
    onboarding_request = EmployeeOnboardingRequest.objects.select_related("account", "created_by").filter(pk=request_id).first()
    if not onboarding_request:
        return
    context = {
        **_base_context(onboarding_request),
        **_badge("submitted"),
        "extra_label": "Submitted On",
        "extra_value": _format_dt(onboarding_request.submitted_at),
    }
    _send(
        "employee_submitted.html",
        f"Employee Onboarding Submitted – {context['employee_name']}",
        _admin_recipients(onboarding_request),
        context,
    )


@shared_task
def send_employee_resubmitted_notification(request_id):
    from .models import EmployeeOnboardingRequest
    onboarding_request = EmployeeOnboardingRequest.objects.select_related("account", "created_by").filter(pk=request_id).first()
    if not onboarding_request:
        return
    context = {
        **_base_context(onboarding_request),
        **_badge("resubmitted"),
        "extra_label": "Resubmitted On",
        "extra_value": _format_dt(onboarding_request.submitted_at),
    }
    _send(
        "employee_resubmitted.html",
        f"Employee Onboarding Resubmitted – {context['employee_name']}",
        _admin_recipients(onboarding_request),
        context,
    )


@shared_task
def send_employee_approved_notification(request_id):
    from .models import EmployeeOnboardingRequest
    onboarding_request = EmployeeOnboardingRequest.objects.select_related("account").filter(pk=request_id).first()
    if not onboarding_request:
        return
    context = {
        **_base_context(onboarding_request),
        **_badge("approved"),
    }
    _send(
        "employee_approved.html",
        f"Employee Onboarding Approved – {context['employee_name']}",
        _employee_recipients(onboarding_request),
        context,
    )


@shared_task
def send_employee_request_changes_notification(request_id, change_request_id):
    from .models import EmployeeOnboardingRequest, EmployeeChangeRequest
    onboarding_request = EmployeeOnboardingRequest.objects.select_related("account").filter(pk=request_id).first()
    if not onboarding_request:
        return

    change_request = EmployeeChangeRequest.objects.filter(pk=change_request_id).first()
    if not change_request:
        return

    token = onboarding_request.current_token()
    context = {
        **_base_context(onboarding_request),
        **_badge("action_required"),
        "section": change_request.get_section_display(),
        "field": change_request.field_name,
        "reason": change_request.reason,
        "comments": change_request.comments,
        "secure_employee_url": build_onboarding_url(token.token) if token else "",
    }
    _send(
        "employee_request_changes.html",
        f"Action Required – Employee Onboarding Update | {context['employee_name']}",
        _employee_recipients(onboarding_request),
        context,
    )
