"""GET /api/hrms/employees/ returns only the employees currently in AIRA HRMS.

Rows for people AIRA no longer lists (left, or given a new employee ID) stay in the database for
the access history; they're left out unless ?include_removed=true.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from hrms_integration.models import HrmsEmployee

Account = get_user_model()


class EmployeeListTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(Account.objects.create_superuser(username="root", email="root@example.com", password="x"))
        HrmsEmployee.objects.create(employee_id="09000037", full_name="New Id", email="a@example.com")
        HrmsEmployee.objects.create(employee_id="09000038", full_name="Still Here", email="b@example.com")
        HrmsEmployee.objects.create(employee_id="10000067", full_name="Old Id", email="a@example.com", is_active_in_hrms=False)

    def ids(self, data):
        return sorted(e["employee_id"] for e in data["employees"])

    def test_only_current_aira_employees_by_default(self):
        data = self.api.get("/api/hrms/employees/").data
        self.assertEqual(self.ids(data), ["09000037", "09000038"])
        self.assertEqual(data["removed_count"], 1)

    def test_include_removed_returns_everyone(self):
        data = self.api.get("/api/hrms/employees/", {"include_removed": "true"}).data
        self.assertEqual(self.ids(data), ["09000037", "09000038", "10000067"])
        self.assertEqual(data["removed_count"], 1)

    def test_still_needs_sign_in(self):
        self.assertIn(APIClient().get("/api/hrms/employees/").status_code, (401, 403))
