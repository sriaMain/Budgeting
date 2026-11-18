"""Helpdesk API (X-API-Key): the tasks created per project / milestone in Project Budgeting.

GET /api/v1/projects/<project_id>/tasks/   one project's current tasks
GET /api/v1/tasks/?updated_since=...       every project's tasks, oldest change first
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from hrms_integration.models import HrmsEmployee
from Project.models import Project, Task, TaskTimerLog
from Project.tests_resources import ResourceTabBase
from roles.models import Role

KEY = "hd_test_key_123"


@override_settings(HELPDESK_INBOUND_API_KEYS=[KEY])
class HelpdeskTasksApiTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.manager.roles.add(Role.objects.get_or_create(role_name="Admin")[0])
        self.hd = APIClient()
        self.hd.credentials(HTTP_X_API_KEY=KEY)
        self.no_login = HrmsEmployee.objects.create(employee_id="30000001", full_name="Cara New", email="cara@example.com")
        self.t_m2 = Task.objects.create(project=self.project, milestone=self.m2, title="Build API", description="REST endpoints",
                                        allocated_hours=Decimal("0"), assigned_hrms_employee=self.no_login,
                                        start_date=date(2026, 3, 1), due_date=date(2026, 3, 20), status="in_progress")
        self.t_m1 = Task.objects.create(project=self.project, milestone=self.m1, title="Write spec", description="Scope",
                                        allocated_hours=Decimal("0"), assigned_to=self.bob,
                                        start_date=date(2026, 2, 1), due_date=date(2026, 2, 10), created_by=self.manager)
        self.t_free = Task.objects.create(project=self.project, milestone=self.m1, title="Design screens", description="UI",
                                          allocated_hours=Decimal("0"), start_date=date(2026, 2, 1), due_date=date(2026, 2, 15))
        resp = self.api.patch(f"/api/tasks/{self.t_free.pk}/", {"freelancer": self.freelancer.pk}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.freelancer.refresh_from_db()

    def get(self, url, **params):
        resp = self.hd.get(url, params)
        return resp.status_code, resp.data

    def test_api_key_required(self):
        bad = APIClient()
        bad.credentials(HTTP_X_API_KEY="wrong")
        for c in (APIClient(), bad):
            resp = c.get(f"/api/v1/projects/{self.project.pk}/tasks/")
            self.assertEqual(resp.status_code, 401)
            self.assertEqual((resp.data["status"], resp.data["message"]), ("error", "Invalid or inactive API key."))

    def test_project_tasks_by_milestone_with_assignees(self):
        status, data = self.get(f"/api/v1/projects/{self.project.pk}/tasks/")
        self.assertEqual(status, 200, data)
        self.assertEqual((data["status"], data["message"]), ("success", "Tasks retrieved."))
        page = data["data"]
        self.assertEqual((page["project_id"], page["project_name"], page["count"]), (self.project.pk, "Apollo Portal", 3))
        rows = page["results"]
        self.assertEqual([r["title"] for r in rows], ["Write spec", "Design screens", "Build API"])  # M1 by due date, then M2
        spec, design, build = rows
        self.assertEqual(spec["assignee"], {"resource_type": "employee", "resource_code": "20000001", "resource_name": "Bob Das"})
        self.assertEqual(build["assignee"], {"resource_type": "employee", "resource_code": "30000001", "resource_name": "Cara New"})
        self.assertEqual(design["assignee"]["resource_type"], "freelancer")
        self.assertEqual((design["assignee"]["resource_code"], design["assignee"]["resource_name"]),
                         (self.freelancer.freelancer_code, "Fiona Free"))
        self.assertEqual((spec["milestone_id"], spec["milestone_name"], spec["description"]), (self.m1.pk, "M1", "Scope"))
        self.assertEqual((str(spec["start_date"]), str(spec["end_date"]), spec["status"], spec["status_display"]),
                         ("2026-02-01", "2026-02-10", "planned", "Planned"))
        # Milestone-based project: no hours.
        self.assertEqual((spec["time_tracked"], spec["allocated_hours"], spec["consumed_hours"]), (False, None, None))
        self.assertEqual(spec["created_by_name"], self.manager.display_name or self.manager.username)
        self.assertEqual(set(spec), {
            "task_id", "title", "description", "status", "status_display", "project_id", "project_name", "milestone_id",
            "milestone_name", "assignee", "start_date", "end_date", "time_tracked", "allocated_hours", "consumed_hours",
            "created_by_name", "created_at", "updated_at",
        })

    def test_filters(self):
        url = f"/api/v1/projects/{self.project.pk}/tasks/"
        self.assertEqual([r["title"] for r in self.get(url, milestone_id=self.m2.pk)[1]["data"]["results"]], ["Build API"])
        self.assertEqual([r["title"] for r in self.get(url, status="in_progress")[1]["data"]["results"]], ["Build API"])
        self.assertEqual([r["title"] for r in self.get(url, assignee_code="20000001")[1]["data"]["results"]], ["Write spec"])
        self.assertEqual([r["title"] for r in self.get(url, assignee_code=self.freelancer.freelancer_code)[1]["data"]["results"]],
                         ["Design screens"])
        self.assertEqual(self.get(url, status="nope")[0], 400)
        self.assertEqual(self.get(url, milestone_id=99999)[0], 404)
        self.assertEqual(self.get("/api/v1/projects/99999/tasks/")[0], 404)
        status, data = self.get(url, page_size=2, page=2)
        self.assertEqual((data["data"]["count"], data["data"]["total_pages"], len(data["data"]["results"])), (3, 2, 1))

    def test_time_and_material_task_has_hours(self):
        tm = Project.objects.create(project_name="Hourly Support", project_type="internal", engagement_type="time_and_material",
                                    start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        task = Task.objects.create(project=tm, title="Fix login", description="Bug", allocated_hours=Decimal("4.00"),
                                   assigned_to=self.alice, start_date=date(2026, 4, 1), due_date=date(2026, 4, 2))
        start = timezone.make_aware(datetime(2026, 4, 1, 9, 0))
        TaskTimerLog.objects.create(task=task, user=self.alice, start_time=start, end_time=start + timedelta(minutes=90), is_active=False)
        row = self.get(f"/api/v1/projects/{tm.pk}/tasks/")[1]["data"]["results"][0]
        self.assertEqual((row["time_tracked"], row["allocated_hours"], row["consumed_hours"]), (True, Decimal("4.00"), Decimal("1.50")))

    def test_feed_of_changes_across_projects(self):
        Task.objects.create(project=None, title="Orphan", allocated_hours=Decimal("0"))  # no project: left out
        Task.objects.filter(pk=self.t_m1.pk).update(modified_at=timezone.now() - timedelta(days=5))
        status, data = self.get("/api/v1/tasks/")
        self.assertEqual(status, 200, data)
        titles = [r["title"] for r in data["data"]["results"]]
        self.assertEqual(titles[0], "Write spec")  # oldest change first
        self.assertEqual(sorted(titles), ["Build API", "Design screens", "Write spec"])

        since = (timezone.now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        titles = [r["title"] for r in self.get("/api/v1/tasks/", updated_since=since)[1]["data"]["results"]]
        self.assertEqual(sorted(titles), ["Build API", "Design screens"])
        self.assertEqual(self.get("/api/v1/tasks/", updated_since="yesterday")[0], 400)
        self.assertEqual(self.get("/api/v1/tasks/", project_id=99999)[1]["data"]["count"], 0)

    def test_deleted_task_disappears(self):
        self.t_m2.delete()
        titles = [r["title"] for r in self.get(f"/api/v1/projects/{self.project.pk}/tasks/")[1]["data"]["results"]]
        self.assertNotIn("Build API", titles)
