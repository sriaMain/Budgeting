"""
Enterprise Task Assignment – Unit & Integration Tests
======================================================
Run with:  python manage.py test Project.tests
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase, RequestFactory
from django.utils import timezone
from django.core import signing
from rest_framework.test import APITestCase

from accounts.models import Account
from Project.models import Project, Task, TaskAssignmentAuditLog
from notifications.models import Notification
from Project.services.assignment_service import (
    generate_deep_link_token,
    validate_deep_link_token,
    build_deep_link_url,
    TaskAssignmentService,
    _SALT,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def make_user(**kwargs):
    defaults = dict(
        username=f"user_{timezone.now().timestamp()}",
        email=f"user_{timezone.now().timestamp()}@example.com",
        password="testpass",
        is_active=True,
    )
    defaults.update(kwargs)
    return Account.objects.create_user(**defaults)


def make_project(manager=None):
    return Project.objects.create(
        project_name=f"Project {timezone.now().timestamp()}",
        project_type="internal",
        start_date=timezone.now().date(),
        end_date=timezone.now().date(),
        project_manager=manager,
    )


def make_task(project, assignee=None, **kwargs):
    defaults = dict(
        title=f"Task {timezone.now().timestamp()}",
        allocated_hours="2.00",
        status="planned",
    )
    defaults.update(kwargs)
    return Task.objects.create(project=project, assigned_to=assignee, **defaults)


# ──────────────────────────────────────────────────────────────────────────────
# Token Tests
# ──────────────────────────────────────────────────────────────────────────────

class DeepLinkTokenTests(TestCase):

    def test_generate_and_validate_token(self):
        """A freshly generated token round-trips correctly."""
        token = generate_deep_link_token(task_id=42, user_id=7)
        payload = validate_deep_link_token(token)
        self.assertEqual(payload["task"], 42)
        self.assertEqual(payload["user"], 7)

    def test_build_deep_link_url_contains_token(self):
        """build_deep_link_url returns a URL with a token query param."""
        url = build_deep_link_url(task_id=1, user_id=1)
        self.assertIn("/task-access?token=", url)

    def test_expired_token_raises(self):
        """A token signed with max_age=0 should raise SignatureExpired."""
        token = generate_deep_link_token(task_id=1, user_id=1)
        with self.assertRaises(signing.SignatureExpired):
            signing.loads(token, salt=_SALT, max_age=0)

    def test_tampered_token_raises(self):
        """Modifying a valid token should raise BadSignature."""
        token = generate_deep_link_token(task_id=1, user_id=1)
        bad_token = token[:-4] + "XXXX"
        with self.assertRaises(signing.BadSignature):
            validate_deep_link_token(bad_token)


# ──────────────────────────────────────────────────────────────────────────────
# Assignment Service Tests
# ──────────────────────────────────────────────────────────────────────────────

class TaskAssignmentServiceTests(TestCase):

    def setUp(self):
        self.admin = make_user(username="admin_user", email="admin@example.com", is_superuser=True)
        self.assignee = make_user(username="assignee_user", email="assignee@example.com")
        self.project = make_project(manager=self.admin)
        self.task = make_task(self.project)

    @patch("Project.tasks.send_task_assignment_email_html.delay")
    def test_assign_creates_audit_log(self, mock_email):
        """Calling assign() should write a TaskAssignmentAuditLog record."""
        TaskAssignmentService.assign(
            task=self.task,
            assignee=self.assignee,
            assigned_by=self.admin,
        )
        log = TaskAssignmentAuditLog.objects.get(task=self.task)
        self.assertEqual(log.assigned_to, self.assignee)
        self.assertEqual(log.assigned_by, self.admin)
        self.assertIsNone(log.previous_assignee)  # first assignment

    @patch("Project.tasks.send_task_assignment_email_html.delay")
    def test_assign_creates_notification(self, mock_email):
        """Calling assign() should create an in-app Notification."""
        TaskAssignmentService.assign(
            task=self.task,
            assignee=self.assignee,
            assigned_by=self.admin,
        )
        notif = Notification.objects.filter(
            recipient=self.assignee,
            notification_type="TASK_ASSIGNED",
        ).first()
        self.assertIsNotNone(notif)
        self.assertFalse(notif.is_read)

    @patch("Project.tasks.send_task_assignment_email_html.delay")
    def test_assign_queues_celery_email(self, mock_email):
        """Calling assign() should queue the HTML email Celery task."""
        self.assignee.email = "assignee@example.com"
        self.assignee.save()
        TaskAssignmentService.assign(
            task=self.task,
            assignee=self.assignee,
            assigned_by=self.admin,
        )
        mock_email.assert_called_once()

    @patch("Project.tasks.send_task_assignment_email_html.delay")
    def test_reassign_records_previous_assignee(self, mock_email):
        """Re-assigning sets previous_assignee and reassigned_at in the audit log."""
        first = make_user(username="first_user", email="first@example.com")
        self.task.assigned_to = first
        self.task.save()

        TaskAssignmentService.assign(
            task=self.task,
            assignee=self.assignee,
            assigned_by=self.admin,
        )
        log = TaskAssignmentAuditLog.objects.filter(
            task=self.task, assigned_to=self.assignee
        ).first()
        self.assertEqual(log.previous_assignee, first)
        self.assertIsNotNone(log.reassigned_at)

    @patch("Project.tasks.send_task_assignment_email_html.delay")
    def test_assign_returns_result_dict(self, mock_email):
        """assign() returns a dict with task_id, assigned_to_id, deep_link_url."""
        result = TaskAssignmentService.assign(
            task=self.task,
            assignee=self.assignee,
            assigned_by=self.admin,
        )
        self.assertEqual(result["task_id"], self.task.id)
        self.assertEqual(result["assigned_to_id"], self.assignee.id)
        self.assertIn("task-access?token=", result["deep_link_url"])


# ──────────────────────────────────────────────────────────────────────────────
# API / Deep-Link Endpoint Tests
# ──────────────────────────────────────────────────────────────────────────────

class TaskDeepLinkViewTests(APITestCase):

    def setUp(self):
        from django.urls import reverse
        self.client_user = make_user(username="employee", email="emp@example.com")
        self.other_user = make_user(username="other", email="other@example.com")
        self.project = make_project()
        self.task = make_task(self.project, assignee=self.client_user)
        self.url = "/api/task-access/"

    def _token(self, task_id, user_id):
        return generate_deep_link_token(task_id=task_id, user_id=user_id)

    def test_missing_token_returns_400(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["status"], "invalid_token")

    def test_expired_token_returns_410(self):
        # Create a token then manually sign with max_age=0 to force expiry
        bad = signing.dumps({"task": self.task.id, "user": self.client_user.id}, salt=_SALT, compress=True)
        # Override the expiry check by sending a very old timestamp token manually
        with patch("Project.services.assignment_service.validate_deep_link_token") as mock_val:
            mock_val.side_effect = signing.SignatureExpired("expired")
            resp = self.client.get(self.url, {"token": bad})
        self.assertEqual(resp.status_code, 410)
        self.assertEqual(resp.json()["status"], "expired")

    def test_invalid_token_returns_400(self):
        resp = self.client.get(self.url, {"token": "totally.invalid.token"})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["status"], "invalid_token")

    def test_unauthenticated_returns_login_required(self):
        token = self._token(self.task.id, self.client_user.id)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "login_required")
        self.assertIn(str(self.task.id), resp.json()["next"])

    def test_deleted_task_returns_404(self):
        token = self._token(self.task.id, self.client_user.id)
        self.task.delete()
        self.client.force_authenticate(user=self.client_user)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["status"], "not_found")

    def test_reassigned_task_returns_reassigned_status(self):
        """If the task's current assignee differs from the token user, return 'reassigned'."""
        new_user = make_user(username="new_assignee", email="new@example.com")
        self.task.assigned_to = new_user
        self.task.save()
        token = self._token(self.task.id, self.client_user.id)
        self.client.force_authenticate(user=self.client_user)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["status"], "reassigned")

    def test_unauthorized_user_returns_403(self):
        """A valid token but the wrong authenticated user should return 'unauthorized'."""
        token = self._token(self.task.id, self.client_user.id)
        self.client.force_authenticate(user=self.other_user)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["status"], "unauthorized")

    def test_correct_user_returns_ok(self):
        """The correct authenticated user with a valid token gets 'ok'."""
        token = self._token(self.task.id, self.client_user.id)
        self.client.force_authenticate(user=self.client_user)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["task_id"], self.task.id)

    def test_admin_can_access_any_task(self):
        """Admin user should be able to access any task link regardless of assignee."""
        admin = make_user(username="superadmin", email="sa@example.com", is_superuser=True)
        token = self._token(self.task.id, self.client_user.id)
        self.client.force_authenticate(user=admin)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")


# ──────────────────────────────────────────────────────────────────────────────
# Notification Tests
# ──────────────────────────────────────────────────────────────────────────────

class NotificationFilterTests(APITestCase):

    def setUp(self):
        self.user = make_user(username="notif_user", email="notif@example.com")
        # Create one TASK_ASSIGNED and one 'task' notification
        Notification.objects.create(
            recipient=self.user,
            title="Task Assigned",
            message="msg",
            notification_type="TASK_ASSIGNED",
            priority="medium",
        )
        Notification.objects.create(
            recipient=self.user,
            title="Old Task",
            message="msg",
            notification_type="task",
            priority="low",
        )
        Notification.objects.create(
            recipient=self.user,
            title="Budget Alert",
            message="msg",
            notification_type="budget",
            priority="high",
        )

    def test_task_filter_returns_both_types(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/notifications/", {"type": "task"})
        data = resp.json()["notifications"]
        types = [n["notification_type"] for n in data]
        self.assertIn("TASK_ASSIGNED", types)
        self.assertIn("task", types)
        self.assertNotIn("budget", types)

    def test_budget_filter_returns_only_budget(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/notifications/", {"type": "budget"})
        data = resp.json()["notifications"]
        types = [n["notification_type"] for n in data]
        self.assertEqual(types, ["budget"])
