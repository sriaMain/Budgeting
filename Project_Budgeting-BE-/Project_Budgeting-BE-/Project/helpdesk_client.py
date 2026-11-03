"""Thin client for the helpdesk application's tasks API - Project Details > Tasks and Task
Management list the helpdesk's tasks (tasks are created and assigned in the helpdesk, not here).

GET {HELPDESK_TASKS_API_URL}?project_id=5&page=N&page_size=100 with an X-API-Key header;
without project_id the helpdesk returns every task linked to a Project Budgeting project.
The key is a secret - it is only ever read from settings and never logged or echoed back in
an error message.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PAGE_SIZE = 100
MAX_PAGES = 50  # Guards against a malformed total_pages looping forever (5,000 tasks)


class HelpdeskError(Exception):
    """Any failure fetching tasks. The message is safe to show a user."""


class HelpdeskConfigError(HelpdeskError):
    pass


def _fetch_page(session, url, project_id, page):
    params = {'page': page, 'page_size': PAGE_SIZE}
    if project_id is not None:
        params['project_id'] = project_id
    try:
        response = session.get(
            url,
            params=params,
            timeout=settings.HELPDESK_API_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("Helpdesk tasks request failed on page %s: %s", page, exc.__class__.__name__)
        raise HelpdeskError("Could not reach the helpdesk. Check the connection and try again.") from exc

    if response.status_code in (401, 403):
        raise HelpdeskError("The helpdesk rejected the API key (missing, invalid or revoked).")
    if response.status_code == 400:
        raise HelpdeskError("The helpdesk refused the request as invalid (HTTP 400).")
    if response.status_code == 404:
        raise HelpdeskError("The helpdesk tasks API wasn't found (HTTP 404). Check HELPDESK_TASKS_API_URL.")
    if response.status_code == 429:
        raise HelpdeskError("Helpdesk rate limit reached. Try again later.")
    if response.status_code != 200:
        logger.warning("Helpdesk tasks API returned HTTP %s on page %s", response.status_code, page)
        raise HelpdeskError(f"The helpdesk returned an unexpected response (HTTP {response.status_code}).")

    try:
        body = response.json()
        # A Frappe whitelisted method's return value can arrive wrapped as {"message": {...}}.
        if 'data' not in body and isinstance(body.get('message'), dict):
            body = body['message']
        data = body['data']
        results = data['results']
        if body.get('status') != 'success' or not isinstance(results, list):
            raise ValueError
        return data, results
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise HelpdeskError("The helpdesk returned tasks in an unexpected format.") from exc


def _web_url(value):
    # Rendered as a link in Project Budgeting - anything but http(s) (javascript: etc.) is dropped.
    value = (value or '').strip() if isinstance(value, str) else ''
    return value if value.lower().startswith(('http://', 'https://')) else None


def _project_id(value):
    value = str(value if value is not None else '').strip()
    return int(value) if value.isdigit() else (value or None)


def task_row(t):
    return {
        "task_id": t.get('task_id'),
        "project_id": _project_id(t.get('project_id')),
        "project_name": t.get('project_name') or None,
        "subject": t.get('subject') or '',
        "status": t.get('status') or '',
        "priority": t.get('priority') or '',
        "progress": t.get('progress') or 0,
        "milestone_id": t.get('milestone_id') or None,
        "milestone_name": t.get('milestone_name') or None,
        "assignment_id": t.get('assignment_id') or None,
        "resource_type": t.get('resource_type') or None,
        "resource_code": t.get('resource_code') or t.get('hrms_employee_id') or None,
        "resource_name": t.get('resource_name') or t.get('hrms_employee_name') or None,
        "start_date": t.get('start_date') or None,
        "end_date": t.get('end_date') or None,
        "completed_on": t.get('completed_on') or None,
        "created_at": t.get('created_at') or None,
        "updated_at": t.get('updated_at') or None,
        "url": _web_url(t.get('url')),
    }


def fetch_tasks(project_id=None):
    """Every helpdesk task (all pages) as task_row dicts - on one project, or on every Project
    Budgeting project when project_id is None - and the helpdesk's time zone, or raises
    HelpdeskError."""
    url = settings.HELPDESK_TASKS_API_URL
    api_key = settings.HELPDESK_API_KEY
    if not url or not api_key:
        raise HelpdeskConfigError("Helpdesk tasks aren't connected yet (HELPDESK_TASKS_API_URL / HELPDESK_API_KEY).")

    tasks, time_zone = [], None
    with requests.Session() as session:
        session.headers.update({'X-API-Key': api_key, 'Accept': 'application/json'})
        page = 1
        while True:
            data, results = _fetch_page(session, url, project_id, page)
            time_zone = time_zone or data.get('time_zone')
            # Only this project's tasks, even if the helpdesk ever ignored the project_id filter.
            tasks.extend(task_row(t) for t in results if isinstance(t, dict) and (
                project_id is None or str(t.get('project_id')) == str(project_id)))
            try:
                total_pages = int(data.get('total_pages') or 1)
            except (TypeError, ValueError):
                total_pages = 1
            if page >= total_pages or not results:
                break
            page += 1
            if page > MAX_PAGES:
                raise HelpdeskError("The helpdesk reported more pages than expected.")
    return tasks, time_zone
