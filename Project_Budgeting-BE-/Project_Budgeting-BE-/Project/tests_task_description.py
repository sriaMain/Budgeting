"""Project Budgeting's own tasks (Project Details > Tasks, Task Management): a task keeps a
description, and the task API names its AIRA assignee (assignee_name / assignee_code)."""
from decimal import Decimal

from hrms_integration.models import HrmsEmployee
from Project.models import Task
from Project.tests_resources import ResourceTabBase
from roles.models import Role


class TaskDescriptionAndAssigneeTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.manager.roles.add(Role.objects.get_or_create(role_name="Admin")[0])  # task create: Admin / PM / Employee

    def project_tasks(self):
        data = self.api.get(f"/api/tasks/{self.project.pk}/tasks/").data
        return {t['id']: t for t in data[0]['Tasks']}

    def test_create_with_description_assigned_to_an_aira_employee(self):
        hrms = HrmsEmployee.objects.get(employee_id="10000004")
        resp = self.api.post("/api/tasks/", {
            "title": "Set up staging server", "description": "Docker + CI for staging.",
            "project": self.project.pk, "milestone": self.m1.pk, "allocated_hours": "4.00",
            "status": "planned", "hrms_employee": hrms.pk, "start_date": "2030-01-02", "end_date": "2030-01-31",
        }, format="json")
        self.assertIn(resp.status_code, (200, 201), resp.data)
        task = Task.objects.get(title="Set up staging server")
        self.assertEqual(task.description, "Docker + CI for staging.")
        row = self.project_tasks()[task.pk]
        self.assertEqual(row['description'], "Docker + CI for staging.")
        self.assertEqual((row['assignee_name'], row['assignee_code']), ("Alice Rao", "10000004"))
        self.assertEqual(row['milestone_name'], "M1")

    def test_description_can_be_edited(self):
        task = Task.objects.create(project=self.project, title="Old task", allocated_hours=Decimal("2"), assigned_to=self.bob)
        self.assertEqual(task.description, "")
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"description": "Now with details"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        task.refresh_from_db()
        self.assertEqual(task.description, "Now with details")
        row = self.project_tasks()[task.pk]
        self.assertEqual((row['assignee_name'], row['assignee_code']), ("Bob Das", "20000001"))  # via the linked account

    def test_description_start_and_end_date_are_required(self):
        resp = self.api.post("/api/tasks/", {"title": "No details", "project": self.project.pk, "description": "   "}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(set(resp.data["errors"]), {"description", "start_date", "end_date"})
        self.assertFalse(Task.objects.filter(title="No details").exists())

        resp = self.api.post("/api/tasks/", {"title": "Backwards", "project": self.project.pk, "description": "x",
                                             "start_date": "2026-03-10", "end_date": "2026-03-01"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("end_date", resp.data["errors"])

    def test_edit_cannot_clear_them_but_a_status_change_needs_none(self):
        task = Task.objects.create(project=self.project, title="Old task", allocated_hours=Decimal("0"), assigned_to=self.bob)
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"description": "", "start_date": None, "end_date": None}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(set(resp.data["errors"]), {"description", "start_date", "end_date"})
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"status": "in_progress"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_unassigned_task(self):
        task = Task.objects.create(project=self.project, title="Nobody yet", allocated_hours=Decimal("1"))
        row = self.project_tasks()[task.pk]
        self.assertIsNone(row['assignee_name'])
        self.assertIsNone(row['assignee_code'])
