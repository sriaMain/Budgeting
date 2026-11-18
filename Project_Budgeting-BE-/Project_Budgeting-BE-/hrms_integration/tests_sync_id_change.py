"""AIRA gives an employee a new employee ID (seen live: many IDs changed at once).

The sync keeps the person - record, account, roles, login - instead of revoking them as "gone"
and creating a stranger with no account, so they stay in every employee picker (Project Manager
included, with their AIRA name). Records an older sync already split are repaired: the current
record takes the account over from the removed one.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from hrms_integration.models import HrmsEmployee
from hrms_integration.services import sync_employees
from roles.models import Role

Account = get_user_model()


def aira(*people):
    return [{"employee_id": eid, "full_name": name, "email": email, "designation": "Engineer"} for eid, name, email in people]


class SyncFollowsEmployeeIdChangesTests(TestCase):
    def setUp(self):
        self.role = Role.objects.get_or_create(role_name="Manager")[0]
        self.pm = Account.objects.create_user(username="priya", email="priya@example.com", password="x",
                                              first_name="P", last_name="R")
        self.pm.roles.add(self.role)
        self.record = HrmsEmployee.objects.create(employee_id="10000010", full_name="Priya Raman", email="priya@example.com",
                                                  is_eligible=True, account=self.pm)
        self.api = APIClient()
        self.api.force_authenticate(Account.objects.create_superuser(username="root", email="root@example.com", password="x"))

    def sync(self, records):
        with mock.patch("hrms_integration.services.fetch_active_employees", return_value=records):
            run = sync_employees(triggered_by=None)
        self.assertEqual(run.status, "success", run.error_message)
        return run

    def project_manager_names(self):
        rows = self.api.get("/api/projects/poc-options/").data
        return [r["name"] for r in rows if r["type"] == "employee"]

    def test_new_id_keeps_the_same_person_with_login_and_roles(self):
        run = self.sync(aira(("09000010", "Priya Raman", "priya@example.com")))
        self.assertEqual((run.created_count, run.access_revoked_count), (0, 0))
        self.record.refresh_from_db()
        self.assertEqual((self.record.employee_id, self.record.is_active_in_hrms, self.record.is_eligible, self.record.account_id),
                         ("09000010", True, True, self.pm.pk))
        self.assertEqual(HrmsEmployee.objects.count(), 1)
        self.pm.refresh_from_db()
        self.assertTrue(self.pm.is_active)
        self.assertEqual(list(self.pm.roles.all()), [self.role])
        self.assertEqual(self.project_manager_names(), ["Priya Raman"])

    def test_record_split_by_an_earlier_sync_gets_its_account_back(self):
        # What the old sync left behind: the original record removed and revoked, the new ID
        # as a separate record with no account - so the person was missing from the pickers.
        self.record.is_active_in_hrms = False
        self.record.is_eligible = False
        self.record.save()
        self.pm.is_active = False
        self.pm.save()
        self.pm.roles.clear()
        current = HrmsEmployee.objects.create(employee_id="09000010", full_name="Priya Raman", email="priya@example.com")
        self.assertEqual(self.project_manager_names(), [])

        self.sync(aira(("09000010", "Priya Raman", "priya@example.com")))
        current.refresh_from_db()
        self.record.refresh_from_db()
        self.assertEqual((current.account_id, self.record.account_id), (self.pm.pk, None))
        self.assertEqual(self.project_manager_names(), ["Priya Raman"])
        self.pm.refresh_from_db()
        self.assertFalse(self.pm.is_active)  # login comes back only through Grant access, as before

    def test_superuser_is_listed_but_never_switched_off(self):
        boss = Account.objects.create_superuser(username="boss", email="boss@example.com", password="x")
        HrmsEmployee.objects.create(employee_id="10000067", full_name="Boss Person", email="boss@example.com",
                                    is_active_in_hrms=False)  # unlinked by yesterday's repair
        HrmsEmployee.objects.create(employee_id="09000037", full_name="Boss Person", email="boss@example.com")
        self.sync(aira(("09000037", "Boss Person", "boss@example.com"), ("10000010", "Priya Raman", "priya@example.com")))
        self.assertEqual(HrmsEmployee.objects.get(employee_id="09000037").account_id, boss.pk)
        self.assertEqual(self.project_manager_names(), ["Boss Person", "Priya Raman"])

        self.sync(aira(("10000010", "Priya Raman", "priya@example.com")))  # AIRA drops the person
        boss.refresh_from_db()
        self.assertEqual((boss.is_active, boss.is_superuser), (True, True))

    def test_someone_who_really_left_still_loses_access(self):
        self.sync(aira(("30000001", "New Joiner", "new@example.com")))
        self.record.refresh_from_db()
        self.pm.refresh_from_db()
        self.assertEqual((self.record.employee_id, self.record.is_active_in_hrms), ("10000010", False))
        self.assertFalse(self.pm.is_active)
        self.assertEqual(self.project_manager_names(), ["New Joiner"])
