"""Statuses that move on their own.

Resource assignments: an Active / On Hold assignment whose end date has passed becomes Completed.
Completed assignments still count at their assigned cost (only Removed ones don't), so this never
changes a money figure.

Milestones follow their resources (On Hold, Cancelled and Completed milestones are left alone):
    Not Started -> In Progress  when its first (non-removed) resource assignment has started
    Not Started / In Progress -> Completed  when every non-removed assignment is Completed
A milestone with no resources keeps the status it has. Nothing ever moves a milestone backwards.

apply_status_rules() runs from the Celery beat task Project.tasks.auto_update_statuses (hourly), and
- so the screens are right even without a worker - when the Resources / Milestones tabs load, after
a resource is added / edited / removed, and before AIRA or the helpdesk read assignments.
"""
import logging

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.utils import timezone

from .models import Milestone, ResourceAssignment

logger = logging.getLogger(__name__)

OPEN_ASSIGNMENT_STATUSES = ('active', 'on_hold')
AUTO_MILESTONE_STATUSES = ('not_started', 'in_progress')


def assignment_has_ended(end_date, status, today=None):
    """True if an assignment with this end date / status should be Completed now."""
    today = today or timezone.localdate()
    return bool(end_date) and end_date < today and status in OPEN_ASSIGNMENT_STATUSES


def complete_ended_assignments(project=None, today=None):
    """Mark ended Active / On Hold assignments Completed. Saved one by one so AIRA HRMS hears about
    each change (hrms_integration.signals). Returns how many changed."""
    today = today or timezone.localdate()
    qs = ResourceAssignment.objects.filter(is_active=True, status__in=OPEN_ASSIGNMENT_STATUSES, end_date__lt=today)
    if project is not None:
        qs = qs.filter(project=project)
    changed = 0
    for assignment in qs:
        assignment.status = 'completed'
        try:
            assignment.save(update_fields=['status', 'updated_at'])
        except ValidationError:
            # An old record that no longer passes today's checks: still complete it, then tell
            # AIRA the way the save signal would have.
            ResourceAssignment.objects.filter(pk=assignment.pk).update(status='completed', updated_at=timezone.now())
            if assignment.resource_type == 'employee' and assignment.resource_id:
                from hrms_integration.signals import queue_push
                queue_push([assignment.resource_id])
        changed += 1
    return changed


def sync_milestone_statuses(project=None, today=None):
    """Move milestones along with their resources (see the module doc). Returns
    {'in_progress': [ids], 'completed': [ids]}."""
    today = today or timezone.localdate()
    milestones = Milestone.objects.filter(is_active=True, status__in=AUTO_MILESTONE_STATUSES)
    if project is not None:
        milestones = milestones.filter(project=project)
    current = dict(milestones.values_list('id', 'status'))
    moved = {'in_progress': [], 'completed': []}
    if not current:
        return moved

    stats = (
        ResourceAssignment.objects.filter(is_active=True, milestone_id__in=current.keys())
        .exclude(status='removed')
        .values('milestone_id')
        .annotate(
            total=Count('id'),
            done=Count('id', filter=Q(status='completed')),
            started=Count('id', filter=Q(start_date__lte=today)),
        )
    )
    for row in stats:
        if row['total'] and row['done'] == row['total']:
            moved['completed'].append(row['milestone_id'])
        elif row['started'] and current[row['milestone_id']] == 'not_started':
            moved['in_progress'].append(row['milestone_id'])

    # A direct update: Milestone.save() re-runs the budget check, which an older milestone may not
    # pass - a status move must never fail on that. (AIRA doesn't show milestone status.)
    now = timezone.now()
    for new_status, ids in moved.items():
        if ids:
            Milestone.objects.filter(pk__in=ids).update(status=new_status, updated_at=now)
    return moved


def apply_status_rules(project=None, today=None):
    """Assignments first (a newly Completed one can complete its milestone), then milestones.
    Never raises - a status refresh must not break the screen or API that triggered it."""
    try:
        assignments = complete_ended_assignments(project, today)
        milestones = sync_milestone_statuses(project, today)
        return {'assignments_completed': assignments, **{f'milestones_{k}': v for k, v in milestones.items()}}
    except Exception:  # noqa: BLE001
        logger.exception("Automatic status update failed (project %s)", getattr(project, 'pk', 'all'))
        return None
