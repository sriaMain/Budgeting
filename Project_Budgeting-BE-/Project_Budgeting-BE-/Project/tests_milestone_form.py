"""Milestone Add / Edit drawer against a project with no user budget and no quotation: 0% is fine
(the form always sends both percentages), anything above 0% is refused, and an edit never wipes an
older milestone's stored amount."""
from decimal import Decimal

from Project.models import Milestone
from Project.tests_resources import ResourceTabBase

D = Decimal


class MilestoneWithoutBasesTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.base_url = f"/api/projects/{self.project.pk}/milestones/"

    def form(self, **kw):
        values = {"name": "M3 - Launch", "description": "", "sequence": 3, "planned_start_date": None,
                  "planned_end_date": None, "budget_percent": 0, "bill_percent": 0, "status": "not_started"}
        values.update(kw)
        return values

    def test_add_with_zero_percentages(self):
        resp = self.api.post(self.base_url, self.form(), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        m = Milestone.objects.get(pk=resp.data['id'])
        self.assertEqual((m.budget_amount, m.billing_amount), (D("0.00"), D("0.00")))

    def test_edit_with_zero_percentages_saves_and_keeps_stored_amounts(self):
        Milestone.objects.filter(pk=self.m1.pk).update(budget_amount=D("1200"), billing_amount=D("500"))
        resp = self.api.patch(f"{self.base_url}{self.m1.pk}/",
                              self.form(name="M1 renamed", sequence=1, description="Edited in the drawer"), format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.m1.refresh_from_db()
        self.assertEqual((self.m1.name, self.m1.description), ("M1 renamed", "Edited in the drawer"))
        self.assertEqual((self.m1.budget_amount, self.m1.billing_amount), (D("1200.00"), D("500.00")))

    def test_a_percentage_without_a_base_is_still_refused(self):
        resp = self.api.patch(f"{self.base_url}{self.m1.pk}/", {"bill_percent": 10}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no quotation amount", str(resp.data))
        resp = self.api.patch(f"{self.base_url}{self.m1.pk}/", {"budget_percent": 5}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no user budget", str(resp.data))
