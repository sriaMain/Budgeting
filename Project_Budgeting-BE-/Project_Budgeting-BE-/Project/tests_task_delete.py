"""DELETE /api/tasks/<id>/: admins / managers only, refused while the task's timer runs; the task's
timer logs and freelancer task assignment go with it."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from freelancer_onboarding.models import FreelancerTaskAssignment
from Project.models import Task, TaskTimerLog
from Project.tests_resources import ResourceTabBase
from roles.models import Role

Account = get_user_model()


class TaskDeleteTests(ResourceTabBase):
    def setUp(self):
        super().setUp()  # self.api is signed in as a "Manager"
        self.task = Task.objects.create(project=self.project, milestone=self.m1, title="Write spec", description="Scope",
                                        allocated_hours=Decimal("0"), assigned_to=self.alice,
                                        start_date=date(2026, 2, 1), due_date=date(2026, 2, 10))

    def client_for(self, account, role=None):
        if role:
            account.roles.add(Role.objects.get_or_create(role_name=role)[0])
        client = APIClient()
        client.force_authenticate(account)
        return client

    def test_manager_deletes_task_with_its_time_logs_and_freelancer_assignment(self):
        admin = Account.objects.create_user(username="adm", email="adm@example.com", password="x")
        resp = self.client_for(admin, "Admin").patch(f"/api/tasks/{self.task.pk}/", {"freelancer": self.freelancer.pk}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(FreelancerTaskAssignment.objects.filter(task=self.task).exists())
        start = timezone.now() - timedelta(hours=2)
        TaskTimerLog.objects.create(task=self.task, user=self.alice, start_time=start, end_time=start + timedelta(hours=1), is_active=False)

        resp = self.api.delete(f"/api/tasks/{self.task.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Task.objects.filter(pk=self.task.pk).exists())
        self.assertFalse(TaskTimerLog.objects.filter(task_id=self.task.pk).exists())
        self.assertFalse(FreelancerTaskAssignment.objects.filter(task_id=self.task.pk).exists())

    def test_admin_project_manager_and_superuser_may_delete(self):
        people = [
            (Account.objects.create_user(username="a1", email="a1@example.com", password="x"), "Admin"),
            (Account.objects.create_user(username="a2", email="a2@example.com", password="x"), "Project Manager"),
            (Account.objects.create_superuser(username="root", email="root@example.com", password="x"), None),
        ]
        for account, role in people:
            task = Task.objects.create(project=self.project, title=f"Task for {account.username}", allocated_hours=Decimal("0"))
            resp = self.client_for(account, role).delete(f"/api/tasks/{task.pk}/")
            self.assertEqual(resp.status_code, 204, account.username)
            self.assertFalse(Task.objects.filter(pk=task.pk).exists())

    def test_employee_cannot_delete(self):
        for client in (self.client_for(self.alice, "Employee"), self.client_for(self.bob)):
            resp = client.delete(f"/api/tasks/{self.task.pk}/")
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.data["error"], "Only admins and managers can delete tasks.")
        self.assertTrue(Task.objects.filter(pk=self.task.pk).exists())

    def test_running_timer_blocks_delete(self):
        TaskTimerLog.objects.create(task=self.task, user=self.alice, start_time=timezone.now(), is_active=True)
        resp = self.api.delete(f"/api/tasks/{self.task.pk}/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("timer is running", resp.data["error"])
        self.assertTrue(Task.objects.filter(pk=self.task.pk).exists())

    def test_unknown_task(self):
        self.assertEqual(self.api.delete("/api/tasks/999999/").status_code, 404)
