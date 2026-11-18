"""AIRA HRMS sync never deactivates a superuser.

Seen live: AIRA gave an employee a new employee ID; the sync saw the old ID missing, treated
the person as gone and deactivated the account linked to it - the superuser - so nobody could
sign in ("Your account is inactive"). Superusers are managed outside HRMS.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from hrms_integration.models import HrmsEmployee
from hrms_integration.services import revoke_access, sync_employees
from roles.models import Role

Account = get_user_model()


def aira(*people):
    return [{"employee_id": eid, "full_name": name, "email": email, "department": "HR Operations"}
            for eid, name, email in people]


class SyncNeverDeactivatesSuperuserTests(TestCase):
    def setUp(self):
        self.admin_role = Role.objects.get_or_create(role_name="Admin")[0]
        self.superuser = Account.objects.create_superuser(username="boss", email="boss@example.com", password="x")
        self.superuser.roles.add(self.admin_role)
        self.old_record = HrmsEmployee.objects.create(employee_id="10000067", full_name="Boss Person",
                                                      email="boss@example.com", is_eligible=True, account=self.superuser)
        self.staff = Account.objects.create_user(username="emp", email="emp@example.com", password="x")
        self.staff.roles.add(self.admin_role)
        HrmsEmployee.objects.create(employee_id="20000001", full_name="Emp One", email="emp@example.com",
                                    is_eligible=True, account=self.staff)

    def sync(self, records):
        with mock.patch("hrms_integration.services.fetch_active_employees", return_value=records):
            run = sync_employees(triggered_by=None)
        self.assertEqual(run.status, "success", run.error_message)
        return run

    def test_employee_id_change_keeps_the_superuser_signed_in(self):
        # AIRA now lists the superuser under a new ID; the old ID and Emp One are gone.
        run = self.sync(aira(("09000037", "Boss Person", "boss@example.com")))
        self.superuser.refresh_from_db()
        self.assertEqual((self.superuser.is_active, self.superuser.is_staff, self.superuser.is_superuser), (True, True, True))
        self.assertEqual(list(self.superuser.roles.all()), [self.admin_role])
        # Same email -> same person: the record now carries the new ID (tests_sync_id_change).
        self.old_record.refresh_from_db()
        self.assertEqual((self.old_record.employee_id, self.old_record.is_active_in_hrms, self.old_record.account_id),
                         ("09000037", True, self.superuser.pk))
        # Ordinary employees who leave AIRA still lose access.
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.is_active)
        self.assertEqual(self.staff.roles.count(), 0)
        self.assertEqual(run.access_revoked_count, 1)  # Emp One only

        # Later syncs leave the superuser alone and don't count it again.
        run = self.sync(aira(("09000037", "Boss Person", "boss@example.com")))
        self.assertEqual(run.access_revoked_count, 0)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)

    def test_superuser_re_enabled_by_hand_is_not_switched_off_again(self):
        self.superuser.is_active = False
        self.superuser.save(update_fields=["is_active"])
        self.old_record.is_active_in_hrms = False
        self.old_record.is_eligible = False
        self.old_record.save(update_fields=["is_active_in_hrms", "is_eligible"])
        self.superuser.is_active = True  # admin switches it back on
        self.superuser.save(update_fields=["is_active"])
        self.sync(aira(("09000037", "Boss Person", "boss@example.com"), ("20000001", "Emp One", "emp@example.com")))
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)

    def test_manual_revoke_leaves_a_superuser_account_alone(self):
        revoke_access(self.old_record)
        self.superuser.refresh_from_db()
        self.assertEqual((self.superuser.is_active, self.superuser.roles.count()), (True, 1))
        self.old_record.refresh_from_db()
        self.assertFalse(self.old_record.is_eligible)
