"""POST /api/accounts/login/ - which account an identifier (username / email / name) means.

The AIRA HRMS sync creates inactive, password-less placeholder accounts for employees. They used
to hide real logins that share a name: login took the first match (ordered by name) and answered
"Your account is inactive" to a user whose own account was fine.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.serializers import LOGIN_NAME_AMBIGUOUS

Account = get_user_model()
INACTIVE = "Your account is inactive. Please contact admin."


class LoginLookupTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        # HRMS placeholders first (lower pk), and sorting before the real login by name.
        self.placeholder = self.placeholder_account("ravi.placeholder", "Ravi", "Anand")
        self.placeholder_account("kumar.p", "Kumar", "Bose")
        self.ravi = Account.objects.create_user(username="ravi.k", email="ravi@example.com", password="Secret#123",
                                                first_name="Ravi", last_name="Kumar")

    def placeholder_account(self, username, first, last):
        account = Account(username=username, first_name=first, last_name=last, is_active=False)
        account.set_unusable_password()
        account.save()
        return account

    def login(self, identifier, password="Secret#123"):
        return self.api.post("/api/accounts/login/", {"identifier": identifier, "password": password}, format="json")

    def error(self, resp):
        data = resp.data
        value = data.get("error") if isinstance(data, dict) else None
        if isinstance(value, list):
            value = value[0]
        return str(value) if value is not None else str(data)

    def assertLogsIn(self, identifier):
        resp = self.login(identifier)
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", resp))
        self.assertEqual(resp.data["user"]["username"], "ravi.k")

    def test_real_login_wins_over_hrms_placeholders(self):
        for identifier in ("Ravi", "ravi", "Kumar", "Ravi Kumar", "ravi.k", "RAVI@example.com"):
            with self.subTest(identifier=identifier):
                self.assertLogsIn(identifier)

    def test_placeholder_only_is_inactive(self):
        resp = self.login("Anand")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.error(resp), INACTIVE)

    def test_username_and_email_are_exact(self):
        # Another real login whose first name is someone else's username doesn't take it over.
        Account.objects.create_user(username="asha", email="asha@example.com", password="x", first_name="ravi.k")
        self.assertLogsIn("ravi.k")

    def test_name_shared_by_two_real_logins_asks_for_username(self):
        Account.objects.create_user(username="ravi.s", email="ravi.s@example.com", password="Other#123",
                                    first_name="Ravi", last_name="Shah")
        resp = self.login("Ravi")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.error(resp), LOGIN_NAME_AMBIGUOUS)
        self.assertLogsIn("Ravi Kumar")  # the full name is still unique
        self.assertLogsIn("ravi.k")

    def test_unknown_and_wrong_password(self):
        self.assertEqual(self.error(self.login("nobody")), "User not found.")
        self.assertEqual(self.error(self.login("ravi.k", password="wrong")), "Invalid password.")

    def test_deactivated_real_login_still_says_inactive(self):
        self.ravi.is_active = False
        self.ravi.save(update_fields=["is_active"])
        self.assertEqual(self.error(self.login("ravi.k")), INACTIVE)
