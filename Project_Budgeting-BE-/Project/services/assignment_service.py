"""
Task Assignment Service
=======================
Centralises all business logic for assigning tasks:
  • Writes audit log
  • Generates a signed deep-link token (HMAC, expires in settings.TASK_DEEP_LINK_EXPIRY_DAYS)
  • Queues HTML email via Celery (non-blocking)
  • Creates / upgrades the in-app notification

Usage (from a view):
    from Project.services.assignment_service import TaskAssignmentService
    result = TaskAssignmentService.assign(task=task, assignee=user, assigned_by=request.user)
"""
from __future__ import annotations

from django.conf import settings
from django.core import signing
from django.utils import timezone


# ──────────────────────────────────────────────────────────────────────────────
# Token helpers
# ──────────────────────────────────────────────────────────────────────────────
_SALT = "task-deep-link-v1"


def generate_deep_link_token(task_id: int, user_id: int) -> str:
    """
    Return a URL-safe, HMAC-signed token that encodes task_id + user_id.
    Token expires after TASK_DEEP_LINK_EXPIRY_DAYS (default 7).
    """
    payload = {"task": task_id, "user": user_id}
    expiry_days = getattr(settings, "TASK_DEEP_LINK_EXPIRY_DAYS", 7)
    return signing.dumps(payload, salt=_SALT, compress=True)


def validate_deep_link_token(token: str) -> dict:
    """
    Validate and decode a deep-link token.

    Returns the decoded dict  {'task': <int>, 'user': <int>}.
    Raises:
        signing.SignatureExpired  – token has expired
        signing.BadSignature      – token is tampered / invalid
    """
    expiry_days = getattr(settings, "TASK_DEEP_LINK_EXPIRY_DAYS", 7)
    max_age = expiry_days * 24 * 60 * 60  # seconds
    return signing.loads(token, salt=_SALT, max_age=max_age)


def build_deep_link_url(task_id: int, user_id: int) -> str:
    """
    Return the full URL that will be embedded in the email.
    Points to the React frontend /task-access page.
    """
    token = generate_deep_link_token(task_id, user_id)
    base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/task-access?token={token}"


# ──────────────────────────────────────────────────────────────────────────────
# Main service
# ──────────────────────────────────────────────────────────────────────────────
class TaskAssignmentService:
    """
    Central service for task assignment workflow.
    All methods are @staticmethod so callers need not instantiate.
    """

    @staticmethod
    def assign(task, assignee, assigned_by) -> dict:
        """
        Full assignment workflow:
          1. Capture previous assignee (for audit)
          2. Save assignment on the Task
          3. Write TaskAssignmentAuditLog
          4. Generate deep-link URL
          5. Queue Celery HTML email (non-blocking)
          6. Create / update in-app notification
          7. Return result dict

        Args:
            task        – Project.models.Task instance
            assignee    – accounts.models.Account instance (new assignee)
            assigned_by – accounts.models.Account instance (who is doing the assigning)

        Returns:
            dict with keys: task_id, assigned_to_id, deep_link_url
        """
        from Project.models import TaskAssignmentAuditLog
        from Project.tasks import send_task_assignment_email_html
        from notifications.utils import create_notification

        # 1. Capture previous assignee
        previous_assignee = task.assigned_to  # may be None

        # 2. Persist assignment (the signal will also fire, but we handle
        #    email & notification here so the signal's old plain-text path
        #    is superseded by this service)
        task.assigned_to = assignee
        task.save(update_fields=["assigned_to", "modified_at"])

        # 3. Audit log
        is_reassignment = previous_assignee is not None and previous_assignee != assignee
        TaskAssignmentAuditLog.objects.create(
            task=task,
            assigned_by=assigned_by,
            assigned_to=assignee,
            previous_assignee=previous_assignee if is_reassignment else None,
            reassigned_at=timezone.now() if is_reassignment else None,
        )

        # 4. Deep link
        deep_link_url = build_deep_link_url(task.id, assignee.id)

        # 5. Queue HTML email via Celery (fire-and-forget)
        if assignee.email:
            send_task_assignment_email_html.delay(
                task_id=task.id,
                assignee_id=assignee.id,
                assigner_id=assigned_by.id,
                deep_link_url=deep_link_url,
            )

        # 6. In-app notification (with deep-link redirect_url)
        project = task.project
        project_name = project.project_name if project else "Unknown Project"
        create_notification(
            recipient=assignee,
            title="New Task Assigned",
            message=f'Task "{task.title}" has been assigned to you in project "{project_name}".',
            notification_type="TASK_ASSIGNED",
            priority="medium",
            module_name="Tasks",
            record_id=task.id,
            redirect_url=deep_link_url,
        )

        return {
            "task_id": task.id,
            "assigned_to_id": assignee.id,
            "deep_link_url": deep_link_url,
        }

    # ── Recommendation helpers (kept from original stub) ──────────────────────

    def __init__(self, project):
        self.project = project

    def auto_assign(self):
        from Project.services.recommendation_engine import UserRecommendationEngine
        engine = UserRecommendationEngine(self.project)
        ranked_users = engine.get_ranked_users()
        return ranked_users.first()

    def get_recommendations(self, limit=5):
        from Project.services.recommendation_engine import UserRecommendationEngine
        engine = UserRecommendationEngine(self.project)
        return engine.get_ranked_users()[:limit]
