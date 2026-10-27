from celery import shared_task
from django.conf import settings


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
