"""Push an employee's project list to AIRA HRMS when it changes (tasks.push_employee_projects).

An employee's list changes when they are added to / edited on / removed from a project's
Resources, or when a project or milestone they are on changes something AIRA shows. Nothing
runs unless AIRA_WEBHOOK_URL and AIRA_PUSH_API_KEY are set.
"""
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from Project.models import Milestone, Project, ResourceAssignment

# What GET /api/v1/project-assignments/ shows from a project / milestone.
PROJECT_FIELDS = ('project_name', 'start_date', 'end_date', 'status')
MILESTONE_FIELDS = ('name', 'is_active')


def _enabled():
    return bool(settings.AIRA_WEBHOOK_URL and settings.AIRA_PUSH_API_KEY)


def _queue(account_ids):
    ids = {i for i in account_ids if i}
    if not ids:
        return
    from .tasks import queue_employee_push

    # After commit, so the task reads saved data; robust so a push problem never fails the save.
    transaction.on_commit(lambda: queue_employee_push(ids), robust=True)


def _shown_fields_changed(model, instance, fields):
    if not instance.pk:
        return False
    old = model.objects.filter(pk=instance.pk).values(*fields).first()
    return old is not None and any(old[f] != getattr(instance, f) for f in fields)


def _assigned_employees(**filters):
    return ResourceAssignment.objects.filter(resource_type='employee', is_active=True, **filters) \
        .values_list('resource_id', flat=True)


@receiver(pre_save, sender=ResourceAssignment)
def remember_previous_employee(sender, instance, **kwargs):
    # A resource can be switched to someone else on edit - the previous employee's list changes too.
    instance._aira_previous_employee = None
    if _enabled() and instance.pk:
        instance._aira_previous_employee = (
            ResourceAssignment.objects.filter(pk=instance.pk, resource_type='employee')
            .values_list('resource_id', flat=True).first()
        )


@receiver(post_save, sender=ResourceAssignment)
@receiver(post_delete, sender=ResourceAssignment)
def push_assignment_change(sender, instance, **kwargs):
    if not _enabled():
        return
    ids = [getattr(instance, '_aira_previous_employee', None)]
    if instance.resource_type == 'employee':
        ids.append(instance.resource_id)
    _queue(ids)


@receiver(pre_save, sender=Project)
def remember_project_change(sender, instance, **kwargs):
    instance._aira_shown_fields_changed = _enabled() and _shown_fields_changed(Project, instance, PROJECT_FIELDS)


@receiver(post_save, sender=Project)
def push_project_change(sender, instance, **kwargs):
    if getattr(instance, '_aira_shown_fields_changed', False):
        _queue(_assigned_employees(project=instance))


@receiver(pre_save, sender=Milestone)
def remember_milestone_change(sender, instance, **kwargs):
    instance._aira_shown_fields_changed = _enabled() and _shown_fields_changed(Milestone, instance, MILESTONE_FIELDS)


@receiver(post_save, sender=Milestone)
def push_milestone_change(sender, instance, **kwargs):
    if getattr(instance, '_aira_shown_fields_changed', False):
        _queue(_assigned_employees(milestone=instance))
