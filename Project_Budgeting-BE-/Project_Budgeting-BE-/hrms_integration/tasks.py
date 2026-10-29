import logging
import threading
from collections import namedtuple

import requests
from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.renderers import JSONRenderer

logger = logging.getLogger(__name__)

# Changes to one employee within this many seconds (one request touching several rows, or quick
# edits) collapse into a single push, sent after they have all committed.
PUSH_DELAY_SECONDS = 5
PUSH_TIMEOUT_SECONDS = 10
# Retries after the first try, AIRA's back-off: 1, 2, 4, 8, 16 minutes.
PUSH_MAX_RETRIES = 5

PushResult = namedtuple('PushResult', 'outcome detail payload response')


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


def push_configured():
    return bool(settings.AIRA_WEBHOOK_URL and settings.AIRA_PUSH_API_KEY)


def render_push(employee):
    """AIRA's push body: the employee's COMPLETE current list (removed assignments included),
    never a diff - an empty list means no projects."""
    from .external_api import assignment_row, employee_assignments

    return JSONRenderer().render({
        "event": "employee.projects_changed",
        "employee_id": employee.employee_id,
        # Stamped before the list is read, so a later sent_at always carries data at least as
        # new - AIRA keeps the push with the newest sent_at per employee.
        "sent_at": timezone.now(),
        "projects": [assignment_row(a) for a in employee_assignments(employee, 'all')],
    })


def send_push(employee):
    """One push attempt. outcome: sent | failed (400 / 401 / other 4xx - never retried) |
    retry (429, 5xx, timeout, network). The key is never logged."""
    payload = render_push(employee)
    try:
        response = requests.post(
            settings.AIRA_WEBHOOK_URL,
            data=payload,
            headers={'X-API-Key': settings.AIRA_PUSH_API_KEY, 'Content-Type': 'application/json',
                     'Accept': 'application/json'},
            timeout=PUSH_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return PushResult('retry', exc.__class__.__name__, payload, None)
    code = response.status_code
    if 200 <= code < 300:
        return PushResult('sent', f"HTTP {code}", payload, response)
    if code == 429 or code >= 500:
        return PushResult('retry', f"HTTP {code}", payload, response)
    if code == 401:
        logger.error("AIRA push: HTTP 401, AIRA_PUSH_API_KEY is wrong or inactive - not retrying")
    else:
        logger.error("AIRA push for %s: HTTP %s, body rejected - not retrying: %s",
                     employee.employee_id, code, response.text[:500])
    return PushResult('failed', f"HTTP {code}", payload, response)


def push_account(account_id):
    if not push_configured():
        return PushResult('skipped', "AIRA push not configured", None, None)
    from .models import HrmsEmployee

    employee = HrmsEmployee.objects.filter(account_id=account_id).first()
    if employee is None:
        return PushResult('skipped', "not an AIRA employee", None, None)
    return send_push(employee)


@shared_task(bind=True, max_retries=PUSH_MAX_RETRIES)
def push_employee_projects(self, account_id):
    """Worker path (production). Every retry re-reads the list, so it always sends the latest."""
    result = push_account(account_id)
    if result.outcome == 'retry':
        if not self.request.is_eager and self.request.retries < self.max_retries:
            raise self.retry(countdown=60 * 2 ** self.request.retries)
        logger.warning("AIRA push for account %s gave up: %s", account_id, result.detail)
    return f"{result.outcome}: {result.detail}"


def _schedule(delay, fn, *args):
    timer = threading.Timer(delay, fn, args)
    timer.daemon = True
    timer.start()


def _dev_push(account_id, attempt=0):
    """Dev path (eager Celery, no worker): the worker's delay and back-off on a timer thread, so
    the user's request never waits for AIRA."""
    try:
        result = push_account(account_id)
    except Exception:
        logger.exception("AIRA push for account %s crashed", account_id)
        return
    finally:
        connection.close()  # this thread's own connection
    if result.outcome == 'retry':
        if attempt < PUSH_MAX_RETRIES:
            _schedule(60 * 2 ** attempt, _dev_push, account_id, attempt + 1)
        else:
            logger.warning("AIRA push for account %s gave up: %s", account_id, result.detail)


def _claim(account_id):
    """True if no push for this employee is waiting - one waiting push reads every change made
    before it runs."""
    try:
        return cache.add(f"aira_push:{account_id}", 1, timeout=PUSH_DELAY_SECONDS)
    except Exception:
        return True  # cache down: push again rather than lose the change


def queue_employee_push(account_ids):
    """Schedule a push for each Budgeting account (see hrms_integration.signals)."""
    eager = getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False)  # myproject/celery.py reads CELERY_* settings
    for account_id in account_ids:
        if not _claim(account_id):
            continue
        if eager:
            _schedule(PUSH_DELAY_SECONDS, _dev_push, account_id)
        else:
            push_employee_projects.apply_async((account_id,), countdown=PUSH_DELAY_SECONDS)
