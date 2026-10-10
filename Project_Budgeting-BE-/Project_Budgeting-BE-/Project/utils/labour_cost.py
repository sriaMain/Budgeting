"""
Labour cost from task allocated hours (Task.allocated_hours - includes
approved extra hours, which raise the task's allocation).

Employees and freelancers are costed on the hours allocated to the tasks
assigned to them, not on the planned hours of their ResourceAssignment or the
time they log:

    cost      = task allocated hours x cost rate of the task's assignee
    assignee  = Task.assigned_to (employee), else the task's active
                FreelancerTaskAssignment (freelancer)
    cost rate = the assignee's ResourceAssignment.cost_rate on the task's milestone,
                else on the project (assignment without a milestone),
                else accounts.Account.charges_per_hour (employees) or the hourly
                cost rate snapshot of their FreelancerProjectAssignment (freelancers),
                else 0 (reported back as unrated hours - also used for unassigned tasks)

Assignments with a flat cost_amount, and vendor / external resources (they
aren't task assignees), keep their assigned cost. A resource with a flat-fee
assignment isn't costed again for their tasks.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.utils import timezone

ZERO = Decimal("0.00")
TASK_COSTED_TYPES = ('employee', 'freelancer')


def is_task_costed(assignment):
    """True when the assignment's cost comes from task allocated hours rather than assigned_cost."""
    return assignment.resource_type in TASK_COSTED_TYPES and assignment.cost_amount is None


@dataclass
class LabourCost:
    cost: Decimal = ZERO
    freelancer_cost: Decimal = ZERO  # part of cost
    hours: Decimal = ZERO
    unrated_hours: Decimal = ZERO

    def add(self, line):
        self.cost += line.cost
        self.hours += line.hours
        if line.unrated:
            self.unrated_hours += line.hours
        if line.is_freelancer:
            self.freelancer_cost += line.cost

    def rounded(self):
        q = Decimal("0.01")
        return LabourCost(
            cost=self.cost.quantize(q),
            freelancer_cost=self.freelancer_cost.quantize(q),
            hours=self.hours.quantize(q),
            unrated_hours=self.unrated_hours.quantize(q),
        )


@dataclass
class TaskLabour:
    """Labour cost of one task."""
    task_id: int
    title: str
    assignee: str
    is_freelancer: bool
    hours: Decimal
    rate: Decimal
    cost: Decimal
    unrated: bool  # no assignee or no rate - hours not costed
    date: date      # due date, else creation date - the month the cost falls in


def task_labour_lines(project, milestone=None):
    """
    One TaskLabour per task of a project - only those of `milestone` when
    given, else every task except those on archived milestones.
    """
    from accounts.models import Account
    from freelancer_onboarding.models import FreelancerTaskAssignment
    from Project.models import Task

    tasks = Task.objects.filter(project=project)
    if milestone is not None:
        tasks = tasks.filter(milestone=milestone)
    else:
        tasks = tasks.exclude(milestone__is_active=False)
    rows = list(tasks.values_list(
        'id', 'title', 'assigned_to_id', 'milestone_id', 'allocated_hours', 'due_date', 'created_at'
    ))
    if not rows:
        return []

    task_freelancer, freelancer_rates = {}, {}
    freelancer_tasks = (
        FreelancerTaskAssignment.objects
        .filter(task__in=tasks).exclude(status='cancelled')
        .values_list(
            'task_id', 'freelancer_id', 'freelancer__full_name',
            'project_assignment__pricing_model_snapshot', 'project_assignment__cost_rate_snapshot',
        )
    )
    for task_id, freelancer_id, name, pricing_model, cost_rate in freelancer_tasks:
        task_freelancer[task_id] = (freelancer_id, name)
        # The project assignment's rate snapshot is the freelancer's cost - only an hourly one prices hours
        if pricing_model == 'hourly' and cost_rate:
            freelancer_rates[task_id] = cost_rate

    rates, flat = {}, set()
    assignments = (
        project.resource_assignments
        .filter(is_active=True, resource_type__in=TASK_COSTED_TYPES)
        .exclude(status='removed')
        .values_list('resource_type', 'resource_id', 'milestone_id', 'cost_rate', 'cost_amount')
    )
    for resource_type, resource_id, milestone_id, cost_rate, cost_amount in assignments:
        key = ((resource_type, resource_id), milestone_id)
        if cost_amount is not None:
            flat.add(key)
        elif cost_rate:
            rates[key] = cost_rate

    user_ids = {user_id for _, _, user_id, *_ in rows if user_id}
    accounts = {
        pk: (charges, name)
        for pk, charges, name in Account.objects.filter(id__in=user_ids)
        .values_list('id', 'charges_per_hour', 'username')
    }

    lines = []
    for task_id, title, user_id, milestone_id, allocated, due_date, created_at in rows:
        hours = allocated or ZERO
        if user_id:
            assignee, name = ('employee', user_id), accounts.get(user_id, (None, ''))[1]
        elif task_id in task_freelancer:
            freelancer_id, name = task_freelancer[task_id]
            assignee = ('freelancer', freelancer_id)
        else:
            assignee, name = None, ''

        if assignee and ((assignee, milestone_id) in flat or (assignee, None) in flat):
            rate, unrated = ZERO, False  # flat-fee assignment already carries this person's cost
        else:
            rate = assignee and (
                rates.get((assignee, milestone_id))
                or rates.get((assignee, None))
                or (accounts.get(assignee[1], (None,))[0] if assignee[0] == 'employee'
                    else freelancer_rates.get(task_id))
            ) or ZERO
            unrated = not rate

        lines.append(TaskLabour(
            task_id=task_id,
            title=title,
            assignee=name,
            is_freelancer=bool(assignee) and assignee[0] == 'freelancer',
            hours=hours,
            rate=rate,
            cost=hours * rate,
            unrated=unrated,
            date=due_date or timezone.localtime(created_at).date(),
        ))
    return lines


def allocated_labour_cost(project, milestone=None):
    """Total labour cost of a project's tasks (see task_labour_lines for the scope)."""
    total = LabourCost()
    for line in task_labour_lines(project, milestone):
        total.add(line)
    return total.rounded()
