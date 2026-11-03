"""API the helpdesk application calls on Project Budgeting (server-to-server, X-API-Key).

GET /api/v1/projects/?search=portal&status=development&client_id=3&updated_since=2026-10-01
    Projects for the helpdesk's project picker / ticket tagging: identifiers, client, status,
    engagement type, dates and project manager - no budgets, invoices or contacts.

GET /api/v1/projects/<project_id>/milestones/?status=in_progress,not_started
    The project's active milestones in their sequence, for the helpdesk's milestone picker once a
    project is chosen - no budget or billing amounts. Unknown project -> 404.

GET /api/v1/projects/<project_id>/resources/?milestone_id=17&resource_type=employee&status=active
    The people staffed on the project (Project > Resources) - employees, freelancers, vendors and
    external resources - for the helpdesk's assignee picker. No cost or billing rates.
"""
from datetime import datetime

from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response

from core.external_api import ApiKeyPermission, BadRequest, ExternalApiView, envelope, page_data
from hrms_integration.external_api import resource_identities, resource_identity

from .models import Milestone, Project, ResourceAssignment

STATUSES = dict(Project.STATUS_CHOICES)
MILESTONE_STATUSES = dict(Milestone.STATUS_CHOICES)
RESOURCE_STATUSES = dict(ResourceAssignment.STATUS_CHOICES)
RESOURCE_TYPES = dict(ResourceAssignment.RESOURCE_TYPE_CHOICES)


class HasHelpdeskApiKey(ApiKeyPermission):
    keys_setting = 'HELPDESK_INBOUND_API_KEYS'


def status_filter(params, allowed):
    """?status=a,b -> ['a', 'b'], each one of `allowed`; empty when not sent."""
    values = [v.strip().lower() for v in (params.get('status') or '').split(',') if v.strip()]
    if any(v not in allowed for v in values):
        raise BadRequest(f"status must be one or more (comma-separated) of: {', '.join(allowed)}.")
    return values


def project_row(p):
    manager = p.project_manager
    return {
        "project_id": p.project_no,
        "project_name": p.project_name,
        "client_id": p.client_id,
        "client_name": p.client.company_name if p.client_id else None,
        "status": p.status,
        "status_display": p.get_status_display(),
        "project_type": p.project_type,
        "project_type_display": p.get_project_type_display(),
        "engagement_type": p.engagement_type,
        "engagement_type_display": p.get_engagement_type_display() if p.engagement_type else None,
        "start_date": p.start_date,
        "end_date": p.end_date,
        "project_manager_name": (manager.display_name or manager.username) if manager else None,
        "created_at": p.created_at,
        "updated_at": p.modified_at,
    }


class HelpdeskProjectsView(ExternalApiView):
    permission_classes = [HasHelpdeskApiKey]
    throttle_scope = 'helpdesk_projects'

    @staticmethod
    def _int(params, name):
        value = (params.get(name) or '').strip()
        if not value:
            return None
        if not value.isdigit():
            raise BadRequest(f"{name} must be a whole number.")
        return int(value)

    @staticmethod
    def _updated_since(params):
        value = (params.get('updated_since') or '').strip()
        if not value:
            return None
        moment = parse_datetime(value.replace(' ', '+'))  # a bare '+' in a query string arrives as a space
        if moment is None:
            day = parse_date(value)
            if day is None:
                raise BadRequest("updated_since must be an ISO date (2026-10-01) or date-time (2026-10-01T09:30:00Z).")
            moment = timezone.make_aware(datetime(day.year, day.month, day.day))
        elif timezone.is_naive(moment):
            moment = timezone.make_aware(moment)
        return moment

    def get(self, request):
        params = request.query_params
        page, page_size = self._paging(params)
        project_id = self._int(params, 'project_id')
        client_id = self._int(params, 'client_id')
        statuses = status_filter(params, STATUSES)
        updated_since = self._updated_since(params)
        search = (params.get('search') or '').strip()

        qs = Project.objects.select_related('client', 'project_manager').order_by('project_name', 'project_no')
        if project_id is not None:
            qs = qs.filter(project_no=project_id)
        if client_id is not None:
            qs = qs.filter(client_id=client_id)
        if statuses:
            qs = qs.filter(status__in=statuses)
        if updated_since is not None:
            qs = qs.filter(modified_at__gte=updated_since)
        if search:
            qs = qs.filter(project_name__icontains=search)

        count = qs.count()
        rows = qs[(page - 1) * page_size: page * page_size]
        return Response(envelope("Projects retrieved.", page_data(count, page, page_size, [project_row(p) for p in rows])))


def milestone_row(m):
    return {
        "milestone_id": m.id,
        "milestone_name": m.name,
        "sequence": m.sequence,
        "status": m.status,
        "status_display": m.get_status_display(),
        "start_date": m.planned_start_date,
        "end_date": m.planned_end_date,
        "completion_percent": m.completion_percent,
        "updated_at": m.updated_at,
    }


class HelpdeskProjectMilestonesView(ExternalApiView):
    permission_classes = [HasHelpdeskApiKey]
    throttle_scope = 'helpdesk_projects'

    def get(self, request, project_id):
        params = request.query_params
        page, page_size = self._paging(params)
        statuses = status_filter(params, MILESTONE_STATUSES)
        project = Project.objects.filter(project_no=project_id).only('project_no', 'project_name').first()
        if project is None:
            return self._not_found("Project not found.")

        # Archived (soft-deleted) milestones are left out, as on Project Budgeting's own screens.
        qs = project.milestones.filter(is_active=True).order_by('sequence', 'id')
        if statuses:
            qs = qs.filter(status__in=statuses)
        count = qs.count()
        rows = qs[(page - 1) * page_size: page * page_size]
        return Response(envelope("Milestones retrieved.", page_data(
            count, page, page_size, [milestone_row(m) for m in rows],
            project_id=project.project_no, project_name=project.project_name,
        )))


def resource_row(a, identities):
    code, name = resource_identity(a, identities)
    return {
        "assignment_id": a.id,
        "resource_type": a.resource_type,
        "resource_type_display": RESOURCE_TYPES[a.resource_type],
        "resource_code": code,
        "resource_name": name,
        "role": a.role or None,
        "milestone_id": a.milestone_id,
        "milestone_name": a.milestone.name if a.milestone_id else None,
        "start_date": a.start_date,
        "end_date": a.end_date,
        "allocation_percent": a.allocation_percent,
        "status": a.status,
        "status_display": a.get_status_display(),
        "updated_at": a.updated_at,
    }


class HelpdeskProjectResourcesView(ExternalApiView):
    permission_classes = [HasHelpdeskApiKey]
    throttle_scope = 'helpdesk_projects'

    def get(self, request, project_id):
        params = request.query_params
        page, page_size = self._paging(params)
        statuses = status_filter(params, RESOURCE_STATUSES)
        resource_type = (params.get('resource_type') or '').strip().lower()
        if resource_type and resource_type not in RESOURCE_TYPES:
            raise BadRequest(f"resource_type must be one of: {', '.join(RESOURCE_TYPES)}.")
        milestone_id = HelpdeskProjectsView._int(params, 'milestone_id')
        project = Project.objects.filter(project_no=project_id).only('project_no', 'project_name').first()
        if project is None:
            return self._not_found("Project not found.")

        # Same rules as Project Budgeting's Resources tab and the AIRA API: deleted resources and
        # resources on an archived milestone are never returned; 'removed' ones only when asked for.
        qs = (
            project.resource_assignments.filter(is_active=True)
            .exclude(milestone__is_active=False)
            .select_related('milestone')
            # Project-level resources (no milestone) first, then by milestone sequence.
            .order_by(F('milestone__sequence').asc(nulls_first=True), 'start_date', 'id')
        )
        qs = qs.filter(status__in=statuses) if statuses else qs.exclude(status='removed')
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if milestone_id is not None:
            if not project.milestones.filter(pk=milestone_id, is_active=True).exists():
                return self._not_found("Milestone not found in this project.")
            qs = qs.filter(milestone_id=milestone_id)

        count = qs.count()
        rows = list(qs[(page - 1) * page_size: page * page_size])
        identities = resource_identities(rows)
        return Response(envelope("Resources retrieved.", page_data(
            count, page, page_size, [resource_row(a, identities) for a in rows],
            project_id=project.project_no, project_name=project.project_name,
        )))
