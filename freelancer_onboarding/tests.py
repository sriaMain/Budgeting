from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from Project.models import Project, Task

from .models import (
    Freelancer, FreelancerRateCard, FreelancerProjectAssignment, FreelancerTaskAssignment,
    FreelancerTimeEntry,
)
from .serializers import (
    FreelancerRateCardSerializer, FreelancerProjectAssignmentSerializer,
    FreelancerTaskAssignmentSerializer, FreelancerTimeEntrySerializer,
)
from .services import (
    check_freelancer_capacity, submit_time_entry, approve_time_entry, reject_time_entry,
)

Account = get_user_model()


def make_freelancer(**kwargs):
    defaults = dict(full_name="Kumar", email="kumar@example.com", status="active", hours_per_week=40)
    defaults.update(kwargs)
    return Freelancer.objects.create(**defaults)


def make_project(**kwargs):
    defaults = dict(
        project_name=f"Test Project {date.today().isoformat()}-{Project.objects.count()}",
        project_type="internal",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    defaults.update(kwargs)
    return Project.objects.create(**defaults)


def make_task(project, **kwargs):
    defaults = dict(title=f"Task {Task.objects.count()}", allocated_hours=40)
    defaults.update(kwargs)
    return Task.objects.create(project=project, **defaults)


class RateCardSnapshotTests(TestCase):
    """Rules 4 and 5: an assignment snapshots the freelancer's rate at
    creation time, and that snapshot must never change even if the
    freelancer's rate card changes afterwards."""

    def setUp(self):
        self.user = Account.objects.create_user(username="admin", email="admin@example.com", password="x")
        self.freelancer = make_freelancer()
        self.project = make_project()
        self.rate_card = FreelancerRateCard.objects.create(
            freelancer=self.freelancer, pricing_model="hourly",
            cost_rate=800, billing_rate=1500, currency="INR",
            effective_from=date(2026, 1, 1),
        )

    def test_assignment_snapshots_current_rate(self):
        serializer = FreelancerProjectAssignmentSerializer(
            data={
                "freelancer": self.freelancer.id, "project": self.project.project_no,
                "start_date": "2026-02-01", "end_date": "2026-02-28", "allocated_hours": "80",
            },
            context={"request": type("Req", (), {"user": self.user})()},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        assignment = serializer.save()

        self.assertEqual(assignment.cost_rate_snapshot, 800)
        self.assertEqual(assignment.billing_rate_snapshot, 1500)
        self.assertEqual(assignment.pricing_model_snapshot, "hourly")

    def test_rate_change_does_not_alter_past_assignment(self):
        serializer = FreelancerProjectAssignmentSerializer(
            data={
                "freelancer": self.freelancer.id, "project": self.project.project_no,
                "start_date": "2026-02-01", "end_date": "2026-02-28", "allocated_hours": "80",
            },
            context={"request": type("Req", (), {"user": self.user})()},
        )
        serializer.is_valid()
        assignment = serializer.save()

        # Freelancer's rate goes up from 800 -> 1000/hour.
        self.rate_card.is_active = False
        self.rate_card.effective_to = date(2026, 2, 28)
        self.rate_card.save()
        FreelancerRateCard.objects.create(
            freelancer=self.freelancer, pricing_model="hourly",
            cost_rate=1000, billing_rate=1800, currency="INR",
            effective_from=date(2026, 3, 1),
        )

        assignment.refresh_from_db()
        self.assertEqual(assignment.cost_rate_snapshot, 800, "historical assignment cost must not change")
        self.assertEqual(assignment.billing_rate_snapshot, 1500)


class RateCardOverlapTests(TestCase):
    """Rule 3: only one active rate card of a given pricing_model may cover
    any given date."""

    def setUp(self):
        self.freelancer = make_freelancer()
        FreelancerRateCard.objects.create(
            freelancer=self.freelancer, pricing_model="hourly",
            cost_rate=800, billing_rate=1500, currency="INR",
            effective_from=date(2026, 1, 1), effective_to=date(2026, 6, 30),
        )

    def test_overlapping_active_rate_rejected(self):
        serializer = FreelancerRateCardSerializer(data={
            "freelancer": self.freelancer.id, "pricing_model": "hourly",
            "cost_rate": "900", "billing_rate": "1600", "currency": "INR",
            "effective_from": "2026-04-01",
        })
        self.assertFalse(serializer.is_valid())

    def test_non_overlapping_rate_accepted(self):
        serializer = FreelancerRateCardSerializer(data={
            "freelancer": self.freelancer.id, "pricing_model": "hourly",
            "cost_rate": "900", "billing_rate": "1600", "currency": "INR",
            "effective_from": "2026-07-01",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_different_pricing_model_does_not_conflict(self):
        serializer = FreelancerRateCardSerializer(data={
            "freelancer": self.freelancer.id, "pricing_model": "fixed",
            "cost_rate": "50000", "billing_rate": "90000", "currency": "INR",
            "effective_from": "2026-03-01",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)


class CapacityCheckTests(TestCase):
    """Rules 9/10: over-allocation must be detected and reported, but not
    hard-blocked, matching the spec's own worked example (40/week capacity,
    35 already allocated, +15 new -> over by 10)."""

    def setUp(self):
        self.freelancer = make_freelancer(hours_per_week=40)
        self.project_a = make_project()
        self.project_b = make_project()

    def test_no_warning_within_capacity(self):
        FreelancerProjectAssignment.objects.create(
            freelancer=self.freelancer, project=self.project_a,
            start_date=date(2026, 3, 1), end_date=date(2026, 3, 7), allocated_hours=25,
        )
        result = check_freelancer_capacity(self.freelancer, date(2026, 3, 1), date(2026, 3, 7), 10)
        self.assertFalse(result["is_over_allocated"])

    def test_warning_when_over_capacity(self):
        FreelancerProjectAssignment.objects.create(
            freelancer=self.freelancer, project=self.project_a,
            start_date=date(2026, 3, 1), end_date=date(2026, 3, 7), allocated_hours=35,
        )
        result = check_freelancer_capacity(self.freelancer, date(2026, 3, 1), date(2026, 3, 7), 15)
        self.assertTrue(result["is_over_allocated"])
        self.assertEqual(result["over_allocated_by"], 10)

    def test_non_overlapping_assignments_do_not_stack(self):
        FreelancerProjectAssignment.objects.create(
            freelancer=self.freelancer, project=self.project_a,
            start_date=date(2026, 1, 1), end_date=date(2026, 1, 31), allocated_hours=160,
        )
        # A different month - shouldn't count against March capacity.
        result = check_freelancer_capacity(self.freelancer, date(2026, 3, 1), date(2026, 3, 7), 30)
        self.assertFalse(result["is_over_allocated"])


class TaskAssignmentTests(TestCase):
    """Task assignments must resolve to a project_assignment the freelancer
    already holds for that task's project (auto-resolved, or validated when
    given explicitly), and cost/billing must come from that assignment's
    frozen rate snapshot - a task assignment has no rate of its own."""

    def setUp(self):
        self.user = Account.objects.create_user(username="admin2", email="admin2@example.com", password="x")
        self.freelancer = make_freelancer()
        self.project = make_project()
        self.task = make_task(self.project, allocated_hours=40)
        FreelancerRateCard.objects.create(
            freelancer=self.freelancer, pricing_model="hourly",
            cost_rate=800, billing_rate=1500, currency="INR", effective_from=date(2026, 1, 1),
        )
        self.project_assignment = FreelancerProjectAssignment.objects.create(
            freelancer=self.freelancer, project=self.project,
            start_date=date(2026, 1, 1), allocated_hours=100,
            cost_rate_snapshot=800, billing_rate_snapshot=1500, currency_snapshot="INR",
        )

    def test_auto_resolves_project_assignment(self):
        serializer = FreelancerTaskAssignmentSerializer(
            data={"freelancer": self.freelancer.id, "task": self.task.id, "allocated_hours": "20"},
            context={"request": type("Req", (), {"user": self.user})()},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        assignment = serializer.save()
        self.assertEqual(assignment.project_assignment_id, self.project_assignment.id)

    def test_rejects_task_without_a_project_assignment(self):
        other_project = make_project()
        other_task = make_task(other_project)
        serializer = FreelancerTaskAssignmentSerializer(
            data={"freelancer": self.freelancer.id, "task": other_task.id, "allocated_hours": "10"},
            context={"request": type("Req", (), {"user": self.user})()},
        )
        self.assertFalse(serializer.is_valid())


class TimeEntryApprovalTests(TestCase):
    """Rules 6/7: only approved entries count toward actual cost/billing;
    draft/submitted/rejected entries must not."""

    def setUp(self):
        self.user = Account.objects.create_user(username="admin3", email="admin3@example.com", password="x")
        self.freelancer = make_freelancer()
        self.project = make_project()
        self.task = make_task(self.project, allocated_hours=40)
        self.project_assignment = FreelancerProjectAssignment.objects.create(
            freelancer=self.freelancer, project=self.project,
            start_date=date(2026, 1, 1), allocated_hours=100,
            cost_rate_snapshot=800, billing_rate_snapshot=1500, currency_snapshot="INR",
        )
        self.task_assignment = FreelancerTaskAssignment.objects.create(
            freelancer=self.freelancer, task=self.task, project_assignment=self.project_assignment,
            allocated_hours=20,
        )

    def test_draft_and_submitted_do_not_count_as_actual(self):
        FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=5, status="draft",
        )
        entry2 = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 6), hours=3, status="draft",
        )
        submit_time_entry(entry2)
        self.assertEqual(entry2.status, "submitted")
        self.assertEqual(self.task_assignment.actual_hours, 0)
        self.assertIsNone(self.task_assignment.cost)

    def test_approved_entry_counts_toward_cost_and_billing(self):
        entry = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=10,
            is_billable=True, status="draft",
        )
        submit_time_entry(entry)
        approve_time_entry(entry, reviewer=self.user)

        self.assertEqual(self.task_assignment.actual_hours, 10)
        self.assertEqual(self.task_assignment.cost, 8000)  # 10h * 800
        self.assertEqual(self.task_assignment.billing_amount, 15000)  # 10h * 1500

    def test_rejected_entry_does_not_count(self):
        entry = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=10, status="draft",
        )
        submit_time_entry(entry)
        reject_time_entry(entry, reviewer=self.user, reason="Wrong hours")
        self.assertEqual(entry.status, "rejected")
        self.assertEqual(self.task_assignment.actual_hours, 0)

    def test_non_billable_hours_excluded_from_billing_not_cost(self):
        entry = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=10,
            is_billable=False, status="draft",
        )
        submit_time_entry(entry)
        approve_time_entry(entry, reviewer=self.user)

        self.assertEqual(self.task_assignment.actual_hours, 10)
        self.assertEqual(self.task_assignment.cost, 8000)
        self.assertEqual(self.task_assignment.billing_amount, 0)

    def test_cannot_approve_a_draft_entry_directly(self):
        entry = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=10, status="draft",
        )
        with self.assertRaises(Exception):
            approve_time_entry(entry, reviewer=self.user)

    def test_hours_computed_from_start_end_time(self):
        serializer = FreelancerTimeEntrySerializer(data={
            "task_assignment": self.task_assignment.id, "date": "2026-01-05",
            "start_time": "09:00", "end_time": "13:30", "break_minutes": 30,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["hours"], 4)  # 4.5h - 0.5h break

    def test_approved_entry_is_immutable(self):
        entry = FreelancerTimeEntry.objects.create(
            task_assignment=self.task_assignment, date=date(2026, 1, 5), hours=10, status="draft",
        )
        submit_time_entry(entry)
        approve_time_entry(entry, reviewer=self.user)

        serializer = FreelancerTimeEntrySerializer(entry, data={"hours": "99"}, partial=True)
        self.assertFalse(serializer.is_valid())
