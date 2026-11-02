"""APIs AIRA HRMS calls on Project Budgeting (server-to-server, X-API-Key).

GET /api/v1/project-assignments/?employee_id=EMP00065
    The projects an AIRA employee is staffed on (Project > Resources), for the
    "My Projects" card on their AIRA dashboard.

GET /api/v1/resource-assignments/?resource_type=freelancer&project_id=12
    Every resource staffed on projects - employees, freelancers, vendors and
    external resources - for AIRA's resource / allocation views.
"""
from rest_framework.response import Response

from accounts.models import Account, Vendor
from core.external_api import (
    DEFAULT_PAGE_SIZE, ApiKeyPermission, BadRequest, ExternalApiView, envelope as _envelope, page_data as _page_data,
)
from freelancer_onboarding.models import Freelancer
from Project.models import Project, ResourceAssignment

from .models import HrmsEmployee

STATUS_FILTERS = {'active', 'completed', 'on_hold', 'all'}
RESOURCE_TYPES = dict(ResourceAssignment.RESOURCE_TYPE_CHOICES)


class HasAiraApiKey(ApiKeyPermission):
    keys_setting = 'AIRA_INBOUND_API_KEYS'


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


def assignment_row(a):
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


def employee_assignments(employee, status_filter=''):
    """One AIRA employee's assignments - API 1 pages through these; tasks.push_employee_projects
    sends all of them."""
    # Assignments point at the Budgeting account linked to this AIRA employee.
    if not employee.account_id:
        return ResourceAssignment.objects.none()
    return _assignments(status_filter).filter(resource_type='employee', resource_id=employee.account_id)


def employee_projects_data(employee, status_filter='', page=1, page_size=DEFAULT_PAGE_SIZE):
    """The `data` of GET /api/v1/project-assignments/ for one AIRA employee."""
    qs = employee_assignments(employee, status_filter)
    count = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    account = employee.account if employee.account_id else None
    employee_name = employee.full_name or (account.display_name if account else '') or None
    return _page_data(count, page, page_size, [assignment_row(a) for a in rows],
                      employee_id=employee.employee_id, employee_name=employee_name)


class AiraApiView(ExternalApiView):
    # Same {"status","message","data"} envelope as AIRA's own API for every response.
    permission_classes = [HasAiraApiKey]

    @staticmethod
    def _status_filter(params):
        status_filter = (params.get('status') or '').strip().lower()
        if status_filter and status_filter not in STATUS_FILTERS:
            raise BadRequest("status must be one of: active, completed, on_hold, all.")
        return status_filter


class ProjectAssignmentsView(AiraApiView):
    throttle_scope = 'aira_project_assignments'

    def get(self, request):
        params = request.query_params
        employee_id = (params.get('employee_id') or '').strip()
        if not employee_id:
            raise BadRequest("employee_id is required.")
        status_filter = self._status_filter(params)
        page, page_size = self._paging(params)

        employee = HrmsEmployee.objects.select_related('account').filter(employee_id=employee_id).first()
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
                **{k: v for k, v in assignment_row(a).items() if k != "assignment_id"},
            })

        return Response(_envelope("Resource assignments retrieved.", _page_data(count, page, page_size, results)))
