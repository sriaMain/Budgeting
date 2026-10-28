import logging
import uuid

import requests
from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.renderers import JSONRenderer

logger = logging.getLogger(__name__)

# Saves within this many seconds (one request touching several rows, or quick edits) collapse
# into a single push per employee, sent after they have all committed.
PUSH_DELAY_SECONDS = 5
# (connect, read) - in dev the task runs inside the user's request (eager Celery), so keep it short.
PUSH_TIMEOUT = (5, 10)


@shared_task
def sync_hrms_employees():
    """Scheduled pull from AIRA (see myproject/celery.py) so employee lists - Resources,
    Expenses, task assignees - stay current without anyone opening the HRMS Employees tab."""
    if not settings.HRMS_EMPLOYEES_API_URL or not settings.HRMS_API_KEY:
        return "skipped: HRMS not configured"

    from .services import sync_if_due

    run, ran = sync_if_due(triggered_by=None)
    if not ran:
        return "skipped: pulled recently"
    return f"{run.status}: {run.fetched_count} employees" + (f" ({run.error_message})" if run.error_message else "")


def queue_employee_push(account_ids):
    """Schedule push_employee_projects for each Budgeting account (see hrms_integration.signals)."""
    eager = getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False)  # myproject/celery.py reads CELERY_* settings
    for account_id in account_ids:
        # Eager mode runs right away, so a skipped duplicate would never be sent - no de-duplication there.
        if eager or cache.add(f"aira_push:{account_id}", 1, timeout=PUSH_DELAY_SECONDS):
            push_employee_projects.apply_async((account_id,), countdown=PUSH_DELAY_SECONDS)


def _retry_or_give_up(task, employee_id, reason):
    # Eager mode (dev runserver) runs inside the user's request: one try, never hold it up with retries.
    if task.request.is_eager or task.request.retries >= task.max_retries:
        logger.warning("AIRA push for %s failed: %s", employee_id, reason)
        return f"failed: {reason}"
    raise task.retry(countdown=60 * 2 ** task.request.retries)


@shared_task(bind=True, max_retries=5)
def push_employee_projects(self, account_id):
    """POST one AIRA employee's current project list (the same `data` as GET
    /api/v1/project-assignments/) to AIRA_ASSIGNMENT_WEBHOOK_URL. The list is read when the task
    runs, so a retry or a late delivery always carries the latest state; AIRA replaces what it
    holds for that employee_id when generated_at is newer."""
    url = settings.AIRA_ASSIGNMENT_WEBHOOK_URL
    if not url or not settings.AIRA_WEBHOOK_API_KEY:
        return "skipped: AIRA push not configured"

    from .external_api import MAX_PAGE_SIZE, employee_projects_data
    from .models import HrmsEmployee

    employee = HrmsEmployee.objects.filter(account_id=account_id).first()
    if employee is None:
        return "skipped: not an AIRA employee"

    body = JSONRenderer().render({
        "event": "employee.projects_changed",
        "event_id": str(uuid.uuid4()),
        "generated_at": timezone.now(),
        "employee_id": employee.employee_id,
        "data": employee_projects_data(employee, page_size=MAX_PAGE_SIZE),
    })
    try:
        response = requests.post(
            url,
            data=body,
            headers={'X-API-Key': settings.AIRA_WEBHOOK_API_KEY, 'Content-Type': 'application/json',
                     'Accept': 'application/json'},
            timeout=PUSH_TIMEOUT,
        )
    except requests.RequestException as exc:
        return _retry_or_give_up(self, employee.employee_id, exc.__class__.__name__)
    if response.status_code == 429 or response.status_code >= 500:
        return _retry_or_give_up(self, employee.employee_id, f"HTTP {response.status_code}")
    if response.status_code >= 400:
        # A request AIRA rejects (bad key, bad payload) fails the same way on every retry.
        logger.warning("AIRA push for %s rejected: HTTP %s", employee.employee_id, response.status_code)
        return f"failed: HTTP {response.status_code}"
    return f"sent: {employee.employee_id}"
