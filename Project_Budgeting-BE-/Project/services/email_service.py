"""
Task Email Service
==================
Renders and sends the HTML task-assignment email.
Called from the Celery task, NOT directly from views.
"""
from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags


class TaskEmailService:

    @staticmethod
    def send_task_assigned_email(task, assignee, assigner, deep_link_url: str) -> bool:
        """
        Render the HTML email template and dispatch it via Django's mail backend.

        Args:
            task          – Project.models.Task instance (fully loaded with .project)
            assignee      – accounts.models.Account (recipient)
            assigner      – accounts.models.Account (who assigned the task)
            deep_link_url – Signed URL to embed in the "Open Task" button

        Returns:
            True on success, False on failure (errors are logged, never re-raised).
        """
        if not assignee.email:
            return False

        project = task.project
        context = {
            "assignee_name": assignee.get_full_name() or assignee.username,
            "assigner_name": assigner.get_full_name() or assigner.username,
            "project_name": project.project_name if project else "N/A",
            "task_title": task.title,
            "task_description": task.description or "",
            "task_status": task.get_status_display(),
            "task_priority": task.get_priority_display() if hasattr(task, 'get_priority_display') else task.priority.capitalize(),
            "allocated_hours": task.allocated_hours,
            "due_date": task.due_date.strftime("%d %B %Y") if task.due_date else "Not set",
            "deep_link_url": deep_link_url,
            "company_name": getattr(settings, "COMPANY_NAME", "Budget Management Platform"),
            "frontend_base_url": getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173"),
            "expiry_days": getattr(settings, "TASK_DEEP_LINK_EXPIRY_DAYS", 7),
        }

        html_message = render_to_string("emails/task_assigned.html", context)
        plain_message = strip_tags(html_message)

        subject = f"New Task Assigned – {context['project_name']}"

        try:
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[assignee.email],
                html_message=html_message,
                fail_silently=False,
            )
            return True
        except Exception as exc:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(
                "Failed to send task-assignment email to %s for task %s: %s",
                assignee.email, task.id, exc,
            )
            return False
