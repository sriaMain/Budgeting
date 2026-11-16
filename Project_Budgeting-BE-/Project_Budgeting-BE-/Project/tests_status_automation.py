"""Automatic statuses (Project/status_automation.py): ended resource assignments become Completed,
milestones follow their resources. Dates are relative to today so the tests don't age."""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from Project.models import Milestone, ResourceAssignment
from Project.status_automation import apply_status_rules, complete_ended_assignments, sync_milestone_statuses
from Project.tasks import auto_update_statuses
from Project.tests_resources import ResourceTabBase

D = Decimal


class StatusAutomationBase(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.past = self.today - timedelta(days=10)
        self.yesterday = self.today - timedelta(days=1)
        self.later = self.today + timedelta(days=30)

    def reload(self, *objs):
        for o in objs:
            o.refresh_from_db()


class EndedAssignmentTests(StatusAutomationBase):
    def test_ended_active_and_on_hold_become_completed_when_the_tab_loads(self):
        ended = self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)
        paused = self.assign(self.bob, self.m1, self.past - timedelta(days=20), self.past, status='on_hold')
        running = self.assign(self.alice, self.m2, self.past, self.later)
        ends_today = self.assign(self.bob, self.m2, self.past, self.today)
        removed = self.assign(self.bob, self.m1, self.past - timedelta(days=40), self.past - timedelta(days=30), status='removed')
        open_ended = self.assign(resource_type='external', resource_id=None, external_name='Ext', milestone=self.m2,
                                 start=self.past, end=None)
        rows = {r['id']: r['status'] for r in self.table()['results']}
        self.assertEqual(rows[ended.pk], 'completed')
        self.assertEqual(rows[paused.pk], 'completed')
        self.assertEqual(rows[running.pk], 'active')
        self.assertEqual(rows[ends_today.pk], 'active')  # still on its last day
        self.assertEqual(rows[removed.pk], 'removed')    # never revived or completed
        self.assertEqual(rows[open_ended.pk], 'active')  # no end date, never ends on its own

    def test_completed_still_counts_in_cost(self):
        self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)  # 500 x 10
        self.assign(self.bob, self.m1, self.past, self.later, cost_amount=D("700"))
        data = self.table()
        self.assertEqual(D(str(data['filtered']['total_cost'])), D("5700.00"))
        self.reload(self.m1)
        self.assertEqual(self.m1.resource_cost, D("5700.00"))

    def test_saving_with_a_past_end_date_stores_completed(self):
        payload = {"resource_type": "employee", "resource_id": self.alice.pk, "milestone": self.m1.pk,
                   "cost_rate": "500", "working_hours": "10",
                   "start_date": str(self.past - timedelta(days=5)), "end_date": str(self.yesterday)}
        resp = self.api.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['status'], 'completed')
        # Asking for Active on an ended assignment still gives Completed...
        resp = self.api.patch(f"{self.url}{resp.data['id']}/", {"status": "active"}, format="json")
        self.assertEqual(resp.data['status'], 'completed')
        # ...but extending the end date lets it be Active again.
        resp = self.api.patch(f"{self.url}{resp.data['id']}/", {"status": "active", "end_date": str(self.later)}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], 'active')

    def test_today_can_be_passed_in(self):
        a = self.assign(self.alice, self.m1, self.past, self.later)
        self.assertEqual(complete_ended_assignments(self.project, today=self.later), 0)  # ends that day
        self.assertEqual(complete_ended_assignments(self.project, today=self.later + timedelta(days=1)), 1)
        self.reload(a)
        self.assertEqual(a.status, 'completed')

    @override_settings(AIRA_WEBHOOK_URL="http://aira.test/hook", AIRA_PUSH_API_KEY="test-key")
    def test_aira_is_told_about_an_auto_completed_employee(self):
        a = self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)
        with mock.patch('hrms_integration.tasks.queue_employee_push') as push, \
                self.captureOnCommitCallbacks(execute=True):
            complete_ended_assignments(self.project)
        pushed = set().union(*(set(c.args[0]) for c in push.call_args_list))
        self.assertIn(a.resource_id, pushed)

    def test_beat_task_runs_every_project(self):
        a = self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)
        result = auto_update_statuses()
        self.assertEqual(result['assignments_completed'], 1)
        self.reload(a)
        self.assertEqual(a.status, 'completed')


class MilestoneFollowsResourcesTests(StatusAutomationBase):
    def test_first_started_resource_moves_not_started_to_in_progress(self):
        self.assign(self.alice, self.m1, self.past, self.later)
        self.assign(self.bob, self.m2, self.later - timedelta(days=5), self.later)  # starts in the future
        sync_milestone_statuses(self.project)
        self.reload(self.m1, self.m2)
        self.assertEqual(self.m1.status, 'in_progress')
        self.assertEqual(self.m2.status, 'not_started')

    def test_all_resources_completed_completes_the_milestone(self):
        self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)            # ends -> completed
        self.assign(self.bob, self.m1, self.past - timedelta(days=20), self.past, status='completed')
        self.assign(self.bob, self.m1, self.past, self.later, status='removed')                      # ignored
        self.assign(self.alice, self.m2, self.past - timedelta(days=20), self.yesterday)
        self.assign(self.bob, self.m2, self.past, self.later)                                        # still running
        apply_status_rules(self.project)
        self.reload(self.m1, self.m2)
        self.assertEqual(self.m1.status, 'completed')
        self.assertEqual(self.m2.status, 'in_progress')

    def test_on_hold_cancelled_and_resourceless_milestones_are_left_alone(self):
        m3 = Milestone.objects.create(project=self.project, name="M3", sequence=3)
        self.m1.status = 'on_hold'
        self.m1.save()
        self.m2.status = 'cancelled'
        self.m2.save()
        self.assign(self.alice, self.m1, self.past, self.yesterday)
        self.assign(self.bob, self.m2, self.past, self.later)
        apply_status_rules(self.project)
        self.reload(self.m1, self.m2, m3)
        self.assertEqual((self.m1.status, self.m2.status, m3.status), ('on_hold', 'cancelled', 'not_started'))

    def test_a_completed_milestone_is_never_moved_back(self):
        self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.yesterday)
        apply_status_rules(self.project)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'completed')
        self.assign(self.bob, self.m1, self.past, self.later)  # more work added later
        apply_status_rules(self.project)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'completed')

    def test_milestones_tab_and_resource_saves_update_it_straight_away(self):
        resp = self.api.post(self.url, {"resource_type": "employee", "resource_id": self.alice.pk, "milestone": self.m1.pk,
                                        "cost_rate": "500", "working_hours": "10",
                                        "start_date": str(self.past), "end_date": str(self.later)}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'in_progress')

        # Its only resource ends: the Milestones tab shows it Completed when it next loads.
        ResourceAssignment.objects.filter(pk=resp.data['id']).update(end_date=self.yesterday)
        listed = {m['id']: m['status'] for m in self.api.get(f"/api/projects/{self.project.pk}/milestones/").data}
        self.assertEqual(listed[self.m1.pk], 'completed')

    def test_removing_the_last_open_resource_completes_the_milestone(self):
        self.assign(self.alice, self.m1, self.past - timedelta(days=20), self.past, status='completed')
        running = self.assign(self.bob, self.m1, self.past, self.later)
        apply_status_rules(self.project)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'in_progress')
        self.assertEqual(self.api.delete(f"{self.url}{running.pk}/").status_code, 204)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'completed')

    def test_an_over_budget_milestone_still_moves(self):
        # Milestone.save() would refuse this (budgets above the contract value); the status move must not.
        self.project.contract_value = D("1000")
        self.project.save()
        Milestone.objects.filter(pk=self.m1.pk).update(budget_amount=D("5000"))
        self.assign(self.alice, self.m1, self.past, self.later)
        apply_status_rules(self.project)
        self.reload(self.m1)
        self.assertEqual(self.m1.status, 'in_progress')
