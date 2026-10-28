"""APIs AIRA HRMS calls on Project Budgeting (server-to-server, X-API-Key).

GET /api/v1/project-assignments/?employee_id=EMP00065
    The projects an AIRA employee is staffed on (Project > Resources), for the
    "My Projects" card on their AIRA dashboard.

GET /api/v1/resource-assignments/?resource_type=freelancer&project_id=12
    Every resource staffed on projects - employees, freelancers, vendors and
    external resources - for AIRA's resource / allocation views.
"""
import hmac

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed, Throttled
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Account, Vendor
from freelancer_onboarding.models import Freelancer
from Project.models import Project, ResourceAssignment

from .models import HrmsEmployee

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
STATUS_FILTERS = {'active', 'completed', 'on_hold', 'all'}
RESOURCE_TYPES = dict(ResourceAssignment.RESOURCE_TYPE_CHOICES)


class HasAiraApiKey(BasePermission):
    """X-API-Key must match one of settings.AIRA_INBOUND_API_KEYS (constant-time compare)."""

    def has_permission(self, request, view):
        sent = request.headers.get('X-API-Key', '')
        keys = getattr(settings, 'AIRA_INBOUND_API_KEYS', [])
        if sent and any(hmac.compare_digest(sent, key) for key in keys):
            return True
        raise AuthenticationFailed("Invalid or inactive API key.")


def _envelope(message, data=None, ok=True):
    return {"status": "success" if ok else "error", "message": message, "data": data}


def _assignments(status_filter):
    # Resources deleted from a project (is_active=False) or on an archived milestone are
    # never returned; 'removed' ones only with status=all.
    qs = (
        ResourceAssignment.objects
        .filter(is_active=True)
        .exclude(milestone__is_active=False)
        .select_related('project', 'milestone')
        .order_by('-start_date', '-id')
    )
    if status_filter in ('active', 'completed', 'on_hold'):
        return qs.filter(status=status_filter)
    if status_filter != 'all':
        return qs.exclude(status='removed')
    return qs


def _row(a):
    return {
        "assignment_id": a.id,
        "project_id": a.project.project_no,
        "project_name": a.project.project_name,
        "project_status": a.project.status,
        "project_status_display": a.project.get_status_display(),
        "project_start_date": a.project.start_date,
        "project_end_date": a.project.end_date,
        "assignment_start_date": a.start_date,
        "assignment_end_date": a.end_date,
        "assignment_status": a.status,
        "assignment_status_display": a.get_status_display(),
        "milestone_name": a.milestone.name if a.milestone_id else None,
        "updated_at": a.updated_at,
    }


def _page_data(count, page, page_size, results, **extra):
    return {
        **extra,
        "count": count,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-count // page_size)),
        "results": results,
    }


def employee_projects_data(employee, status_filter='', page=1, page_size=DEFAULT_PAGE_SIZE):
    """The `data` of GET /api/v1/project-assignments/ for one AIRA employee - also what
    tasks.push_employee_projects sends AIRA when that list changes."""
    # Assignments point at the Budgeting account linked to this AIRA employee.
    qs = ResourceAssignment.objects.none()
    if employee.account_id:
        qs = _assignments(status_filter).filter(resource_type='employee', resource_id=employee.account_id)
    count = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    return _page_data(count, page, page_size, [_row(a) for a in rows], employee_id=employee.employee_id)


class BadRequest(Exception):
    pass


class AiraApiView(APIView):
    authentication_classes = []
    permission_classes = [HasAiraApiKey]
    throttle_classes = [ScopedRateThrottle]

    def handle_exception(self, exc):
        # Same {"status","message","data"} envelope as AIRA's own API for every error.
        if isinstance(exc, BadRequest):
            return Response(_envelope(str(exc), ok=False), status=status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, AuthenticationFailed):
            return Response(_envelope("Invalid or inactive API key.", ok=False), status=status.HTTP_401_UNAUTHORIZED)
        if isinstance(exc, Throttled):
            return Response(_envelope("Rate limit reached. Try again later.", {"retry_after_seconds": exc.wait}, ok=False),
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        if isinstance(exc, APIException):
            return Response(_envelope(str(exc.detail), ok=False), status=exc.status_code)
        return super().handle_exception(exc)

    @staticmethod
    def _not_found(message):
        return Response(_envelope(message, ok=False), status=status.HTTP_404_NOT_FOUND)

    @staticmethod
    def _status_filter(params):
        status_filter = (params.get('status') or '').strip().lower()
        if status_filter and status_filter not in STATUS_FILTERS:
            raise BadRequest("status must be one of: active, completed, on_hold, all.")
        return status_filter

    @staticmethod
    def _paging(params):
        try:
            page = int(params.get('page', 1))
            page_size = int(params.get('page_size', DEFAULT_PAGE_SIZE))
        except ValueError:
            raise BadRequest("page and page_size must be whole numbers.")
        if page < 1 or not 1 <= page_size <= MAX_PAGE_SIZE:
            raise BadRequest(f"page must be 1 or more and page_size between 1 and {MAX_PAGE_SIZE}.")
        return page, page_size


class ProjectAssignmentsView(AiraApiView):
    throttle_scope = 'aira_project_assignments'

    def get(self, request):
        params = request.query_params
        employee_id = (params.get('employee_id') or '').strip()
        if not employee_id:
            raise BadRequest("employee_id is required.")
        status_filter = self._status_filter(params)
        page, page_size = self._paging(params)

        employee = HrmsEmployee.objects.filter(employee_id=employee_id).first()
        if employee is None:
            return self._not_found("Employee not found in Project Budgeting.")

        return Response(_envelope("Project assignments retrieved.",
                                  employee_projects_data(employee, status_filter, page, page_size)))


class ResourceAssignmentsView(AiraApiView):
    throttle_scope = 'aira_resource_assignments'

    @staticmethod
    def _resources(rows):
        """{(resource_type, resource_id): (code, name)} for one page, a query per resource type."""
        ids = {}
        for a in rows:
            if a.resource_type != 'external' and a.resource_id:
                ids.setdefault(a.resource_type, set()).add(a.resource_id)
        found = {}
        if ids.get('employee'):
            for acc in Account.objects.filter(pk__in=ids['employee']).select_related('hrms_employee'):
                hrms = getattr(acc, 'hrms_employee', None)
                name = (hrms.full_name if hrms and hrms.full_name else acc.display_name) or acc.username
                found[('employee', acc.pk)] = (hrms.employee_id if hrms else None, name)
        if ids.get('freelancer'):
            for f in Freelancer.objects.filter(pk__in=ids['freelancer']).only('id', 'freelancer_code', 'full_name'):
                found[('freelancer', f.pk)] = (f.freelancer_code or None, f.full_name)
        if ids.get('vendor'):
            for v in Vendor.objects.filter(pk__in=ids['vendor']).only('id', 'vendor_reference_no', 'name'):
                found[('vendor', v.pk)] = (v.vendor_reference_no or None, v.name)
        return found

    def get(self, request):
        params = request.query_params
        resource_type = (params.get('resource_type') or '').strip().lower()
        if resource_type and resource_type not in RESOURCE_TYPES:
            raise BadRequest("resource_type must be one of: employee, freelancer, vendor, external.")
        project_id = (params.get('project_id') or '').strip()
        if project_id and not project_id.isdigit():
            raise BadRequest("project_id must be a whole number.")
        status_filter = self._status_filter(params)
        page, page_size = self._paging(params)

        qs = _assignments(status_filter)
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if project_id:
            if not Project.objects.filter(pk=int(project_id)).exists():
                return self._not_found("Project not found in Project Budgeting.")
            qs = qs.filter(project_id=int(project_id))

        count = qs.count()
        rows = list(qs[(page - 1) * page_size: page * page_size])
        resources = self._resources(rows)
        results = []
        for a in rows:
            if a.resource_type == 'external':
                code, name = None, a.external_name or None
            else:
                code, name = resources.get((a.resource_type, a.resource_id), (None, None))
            results.append({
                "assignment_id": a.id,
                "resource_type": a.resource_type,
                "resource_type_display": RESOURCE_TYPES[a.resource_type],
                "resource_code": code,
                "resource_name": name,
                **{k: v for k, v in _row(a).items() if k != "assignment_id"},
            })

        return Response(_envelope("Resource assignments retrieved.", _page_data(count, page, page_size, results)))
