"""API the helpdesk application calls on Project Budgeting (server-to-server, X-API-Key).

GET /api/v1/projects/?search=portal&status=development&client_id=3&updated_since=2026-10-01
    Projects for the helpdesk's project picker / ticket tagging: identifiers, client, status,
    engagement type, dates and project manager - no budgets, invoices or contacts.
"""
from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response

from core.external_api import ApiKeyPermission, BadRequest, ExternalApiView, envelope, page_data

from .models import Project

STATUSES = dict(Project.STATUS_CHOICES)


class HasHelpdeskApiKey(ApiKeyPermission):
    keys_setting = 'HELPDESK_INBOUND_API_KEYS'


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
    def _statuses(params):
        values = [v.strip().lower() for v in (params.get('status') or '').split(',') if v.strip()]
        unknown = [v for v in values if v not in STATUSES]
        if unknown:
            raise BadRequest(f"status must be one or more (comma-separated) of: {', '.join(STATUSES)}.")
        return values

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
        statuses = self._statuses(params)
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
