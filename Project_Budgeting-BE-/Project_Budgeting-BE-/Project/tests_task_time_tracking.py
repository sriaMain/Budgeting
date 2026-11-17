"""Task time tracking follows the project's engagement type: Time & Material tasks have allocated
hours, timers and extra-hours requests; milestone-based (Fixed Budget / internal) tasks don't.
Also: assigning a task to a milestone's resources (Add / Assign Task) or by HRMS record."""
from datetime import date
from decimal import Decimal

from rest_framework.test import APIClient

from hrms_integration.models import HrmsEmployee
from Project.models import NO_TIME_TRACKING_MESSAGE, Project, Task, TaskTimerLog
from Project.tests_resources import Account, ResourceTabBase
from roles.models import Role


class TaskTimeTrackingTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.manager.roles.add(Role.objects.get_or_create(role_name="Admin")[0])  # task create: Admin / PM / Employee
        self.tm = Project.objects.create(
            # project_type internal only to skip the quotation rule; time tracking follows engagement_type
            project_name="Hourly Support", project_type="internal", engagement_type="time_and_material",
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
        )

    def create(self, project, **extra):
        return self.api.post("/api/tasks/", {
            "title": "Write the spec", "description": "Scope and acceptance criteria.", "project": project.pk,
            "start_date": "2026-03-01", "end_date": "2026-03-10", **extra,
        }, format="json")

    def listed(self, project, task_id):
        data = self.api.get(f"/api/tasks/{project.pk}/tasks/").data
        return {t['id']: t for t in data[0]['Tasks']}[task_id]

    def test_milestone_project_task_needs_no_hours(self):
        resp = self.create(self.project, milestone=self.m1.pk)
        self.assertIn(resp.status_code, (200, 201), resp.data)
        task = Task.objects.get(title="Write the spec")
        self.assertEqual(task.allocated_hours, Decimal("0"))
        row = self.listed(self.project, task.pk)
        self.assertEqual((row['time_tracked'], row['project_engagement_type'], row['needs_extra_hours']), (False, 'fixed', False))

    def test_hours_sent_for_a_milestone_project_task_are_ignored(self):
        resp = self.create(self.project, allocated_hours="6.00")
        self.assertIn(resp.status_code, (200, 201), resp.data)
        task = Task.objects.get(title="Write the spec")
        self.assertEqual(task.allocated_hours, Decimal("0"))
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"allocated_hours": "3.00", "description": "x"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        task.refresh_from_db()
        self.assertEqual((task.allocated_hours, task.description), (Decimal("0"), "x"))

    def test_time_and_material_task_requires_hours(self):
        resp = self.create(self.tm)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("allocated_hours", resp.data["errors"])  # the app's exception handler nests field errors
        resp = self.create(self.tm, allocated_hours="4.50")
        self.assertIn(resp.status_code, (200, 201), resp.data)
        task = Task.objects.get(title="Write the spec")
        self.assertEqual(task.allocated_hours, Decimal("4.50"))
        row = self.listed(self.tm, task.pk)
        self.assertEqual((row['time_tracked'], row['project_engagement_type']), (True, 'time_and_material'))

    def test_no_timer_or_extra_hours_on_a_milestone_project_task(self):
        task = Task.objects.create(project=self.project, title="Fixed work", allocated_hours=Decimal("0"), assigned_to=self.alice)
        api = APIClient()
        api.force_authenticate(self.alice)
        resp = api.post(f"/api/tasks/{task.pk}/timer/start/")
        self.assertEqual((resp.status_code, resp.data.get("error")), (400, NO_TIME_TRACKING_MESSAGE))
        resp = api.post(f"/api/tasks/{task.pk}/extra-hours/request/", {"requested_hours": "2", "reason": "more"}, format="json")
        self.assertEqual((resp.status_code, resp.data.get("error")), (400, NO_TIME_TRACKING_MESSAGE))
        self.assertFalse(TaskTimerLog.objects.filter(task=task).exists())


class TaskAssigneeTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.manager.roles.add(Role.objects.get_or_create(role_name="Admin")[0])
        self.no_login = HrmsEmployee.objects.create(employee_id="30000001", full_name="Cara New", designation="Intern",
                                                    department="Engineering", is_active_in_hrms=True)

    def test_milestone_resources_are_readable_by_any_signed_in_user(self):
        # Add / Assign Task list GET /projects/<id>/resources/?milestone=<id> (or ?milestone=any).
        self.assign(self.bob, self.m1)
        self.assign(self.alice, self.m2)
        self.assign(resource_type='freelancer', resource_id=self.freelancer.pk, milestone=self.m1)
        plain = Account.objects.create_user(username="plain", email="plain@example.com", password="x")
        api = APIClient()
        api.force_authenticate(plain)
        rows = api.get(f"/api/projects/{self.project.pk}/resources/", {"milestone": self.m1.pk}).data
        self.assertEqual(sorted((r['resource_type'], r['resource_name']) for r in rows),
                         [('employee', 'Bob Das'), ('freelancer', 'Fiona Free')])
        rows = api.get(f"/api/projects/{self.project.pk}/resources/", {"milestone": "any"}).data
        self.assertEqual(len(rows), 3)

    def test_assign_to_a_milestone_resource_freelancer_or_nobody(self):
        """The calls Add / Assign Task make for a picked resource (utils/taskResources.assignmentPayload)."""
        self.assign(resource_type='freelancer', resource_id=self.freelancer.pk, milestone=self.m1)
        task = Task.objects.create(project=self.project, milestone=self.m1, title="Docs", allocated_hours=Decimal("0"),
                                   assigned_hrms_employee=self.no_login)
        url = f"/api/tasks/{task.pk}/"

        resp = self.api.patch(url, {"assigned_to": self.bob.pk, "freelancer": None}, format="json")  # employee resource
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['task']['assignee_name'], resp.data['task']['assignee_code']), ("Bob Das", "20000001"))

        resp = self.api.patch(url, {"freelancer": self.freelancer.pk, "assigned_to": None}, format="json")  # freelancer resource
        self.assertEqual(resp.status_code, 200, resp.data)
        task.refresh_from_db()
        self.assertEqual((task.assigned_to_id, task.assigned_hrms_employee_id), (None, None))
        self.assertEqual(resp.data['task']['assignee_name'], "Fiona Free")

        resp = self.api.patch(url, {"assigned_to": None, "hrms_employee": None, "freelancer": None}, format="json")  # nobody
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data['task']['assignee_name'])

    def test_assign_by_hrms_record(self):
        task = Task.objects.create(project=self.project, title="Docs", allocated_hours=Decimal("0"), assigned_to=self.bob)
        alice_hrms = HrmsEmployee.objects.get(employee_id="10000004")
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"hrms_employee": alice_hrms.pk, "assigned_to": None, "freelancer": None}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        task.refresh_from_db()
        self.assertEqual((task.assigned_to_id, task.assigned_hrms_employee_id), (self.alice.pk, alice_hrms.pk))
        self.assertEqual(resp.data['task']['assignee_name'], "Alice Rao")

        # Someone without a Budgeting login: kept on the HRMS record, no account.
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"hrms_employee": self.no_login.pk, "assigned_to": None, "freelancer": None}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        task.refresh_from_db()
        self.assertEqual((task.assigned_to_id, task.assigned_hrms_employee_id), (None, self.no_login.pk))
        self.assertEqual((resp.data['task']['assignee_name'], resp.data['task']['assignee_code']), ("Cara New", "30000001"))

    def test_reassigning_by_account_drops_the_old_hrms_link(self):
        task = Task.objects.create(project=self.project, title="Docs", allocated_hours=Decimal("0"), assigned_hrms_employee=self.no_login)
        resp = self.api.patch(f"/api/tasks/{task.pk}/", {"assigned_to": self.bob.pk}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['task']['assignee_name'], resp.data['task']['assignee_code']), ("Bob Das", "20000001"))
