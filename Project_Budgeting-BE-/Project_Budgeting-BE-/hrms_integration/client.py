"""Thin client for the HRMS external employees API.

GET {HRMS_EMPLOYEES_API_URL}?page=N&page_size=100 with an X-API-Key header (the list), and
GET {HRMS_EMPLOYEES_API_URL}{employee_id}/ for one employee (AIRA ExternalEmployeeDetailView).
The key is a secret - it is only ever read from settings and never logged
or echoed back in an error message.
"""
import logging
from urllib.parse import quote

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PAGE_SIZE = 100  # HRMS maximum - keeps a full sync well inside the 120 requests/hour limit
MAX_PAGES = 200  # Guards against a malformed total_pages looping forever


class HrmsError(Exception):
    """Any failure fetching the employee list. The message is safe to show an admin."""


class HrmsConfigError(HrmsError):
    pass


class HrmsAuthError(HrmsError):
    pass


class HrmsRateLimitError(HrmsError):
    pass


class HrmsNotFound(HrmsError):
    """The detail endpoint doesn't know this employee_id (HTTP 404)."""


def _fetch_page(session, url, page):
    try:
        response = session.get(
            url,
            params={'page': page, 'page_size': PAGE_SIZE},
            timeout=settings.HRMS_API_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("HRMS request failed on page %s: %s", page, exc.__class__.__name__)
        raise HrmsError("Could not reach HRMS. Check the connection and try again.") from exc

    if response.status_code == 401:
        raise HrmsAuthError("HRMS rejected the API key (missing, invalid or revoked).")
    if response.status_code == 429:
        raise HrmsRateLimitError("HRMS rate limit reached (120 requests/hour). Try again later.")
    if response.status_code != 200:
        logger.warning("HRMS returned HTTP %s on page %s", response.status_code, page)
        raise HrmsError(f"HRMS returned an unexpected response (HTTP {response.status_code}).")

    try:
        body = response.json()
        data = body['data']
        results = data['results']
        if body.get('status') != 'success' or not isinstance(results, list):
            raise ValueError
        return data, results
    except (ValueError, KeyError, TypeError) as exc:
        raise HrmsError("HRMS returned a response in an unexpected format.") from exc


def fetch_active_employees():
    """Returns every active employee across all pages, or raises HrmsError.

    All-or-nothing on purpose: the sync treats "absent from this list" as
    "revoke access", so a partial list must never be returned - a failure
    on page 3 would otherwise revoke everyone on pages 3+.
    """
    url = settings.HRMS_EMPLOYEES_API_URL
    api_key = settings.HRMS_API_KEY
    if not url or not api_key:
        raise HrmsConfigError("HRMS integration is not configured (HRMS_EMPLOYEES_API_URL / HRMS_API_KEY).")

    employees = []
    with requests.Session() as session:
        session.headers.update({'X-API-Key': api_key, 'Accept': 'application/json'})

        page = 1
        expected_count = None
        while True:
            data, results = _fetch_page(session, url, page)
            if expected_count is None:
                expected_count = data.get('count')
            employees.extend(results)

            total_pages = data.get('total_pages') or 1
            if page >= total_pages or not results:
                break
            page += 1
            if page > MAX_PAGES:
                raise HrmsError("HRMS reported more pages than expected; sync aborted.")

    if isinstance(expected_count, int) and len(employees) != expected_count:
        # The list changed mid-fetch (or pagination is off) - retrying is safer
        # than revoking based on an inconsistent snapshot.
        raise HrmsError(
            f"HRMS returned {len(employees)} employees but reported {expected_count}. "
            "The list may have changed during the refresh - please try again."
        )
    return employees


def _employee_from_body(body):
    """The employee object from a detail response: {"status": "success", "data": {...}}.
    Tolerates data wrapping it as data.employee or data.results[0]."""
    if not isinstance(body, dict) or body.get('status') not in (None, 'success'):
        raise ValueError
    data = body.get('data', body)
    if isinstance(data, dict) and isinstance(data.get('employee'), dict):
        data = data['employee']
    elif isinstance(data, dict) and isinstance(data.get('results'), list):
        data = data['results'][0] if data['results'] else None
    if not isinstance(data, dict) or not data.get('employee_id'):
        raise ValueError
    return data


def fetch_employee(employee_id):
    """One employee from the AIRA detail endpoint. Raises HrmsNotFound for an unknown id,
    or HrmsError for any other failure (same messages as the list fetch)."""
    url = settings.HRMS_EMPLOYEES_API_URL
    api_key = settings.HRMS_API_KEY
    if not url or not api_key:
        raise HrmsConfigError("HRMS integration is not configured (HRMS_EMPLOYEES_API_URL / HRMS_API_KEY).")
    detail_url = f"{url.rstrip('/')}/{quote(str(employee_id), safe='')}/"
    try:
        response = requests.get(
            detail_url,
            headers={'X-API-Key': api_key, 'Accept': 'application/json'},
            timeout=settings.HRMS_API_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("HRMS detail request failed: %s", exc.__class__.__name__)
        raise HrmsError("Could not reach HRMS. Check the connection and try again.") from exc

    if response.status_code == 404:
        # Only AIRA's own JSON "not found" means the employee is gone. An HTML 404 is the web
        # server saying the route doesn't exist (endpoint not deployed / wrong URL) - treating
        # that as "employee left" would wrongly revoke their access.
        if 'json' in (response.headers.get('Content-Type') or '').lower():
            raise HrmsNotFound("HRMS no longer lists this employee.")
        logger.warning("HRMS detail endpoint returned a non-API 404 (route missing?)")
        raise HrmsError(
            "AIRA's employee-detail endpoint isn't available (HTTP 404 from the server, not the API). "
            "Check that external/employees/<employee_id>/ is deployed on AIRA and HRMS_EMPLOYEES_API_URL is correct."
        )
    if response.status_code == 401:
        raise HrmsAuthError("HRMS rejected the API key (missing, invalid or revoked).")
    if response.status_code == 429:
        raise HrmsRateLimitError("HRMS rate limit reached. Try again later.")
    if response.status_code != 200:
        logger.warning("HRMS detail returned HTTP %s", response.status_code)
        raise HrmsError(f"HRMS returned an unexpected response (HTTP {response.status_code}).")
    try:
        return _employee_from_body(response.json())
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        raise HrmsError("HRMS returned an employee in an unexpected format.") from exc
