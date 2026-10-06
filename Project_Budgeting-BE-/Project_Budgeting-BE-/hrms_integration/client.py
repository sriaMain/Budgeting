"""Thin client for the HRMS external employees API.

GET {HRMS_EMPLOYEES_API_URL}?page=N&page_size=100 with an X-API-Key header.
The key is a secret - it is only ever read from settings and never logged
or echoed back in an error message.
"""
import logging

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
