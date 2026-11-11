"""Project Details filter toolbar: the same filters on every tab's API (Project/project_filters.py)."""
import io
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from accounts.models import Vendor
from client.models import Company
from finances.models import Expense, Invoice, InvoiceItem, InvoicePayment, OutgoingPayment, VendorBill
from Project.models import Milestone, Project, ResourceAssignment

Account = get_user_model()
D = Decimal


class ProjectFiltersBase(TestCase):
    def setUp(self):
        self.user = Account.objects.create_user(username="pm", email="pm@example.com", password="x")
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.client_co = Company.objects.create(company_name="Acme Corp", email="acme@example.com")
        self.project = Project.objects.create(
            project_name="Apollo", project_type="internal", engagement_type="fixed",
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), client=self.client_co,
        )
        self.m1 = Milestone.objects.create(project=self.project, name="Design", sequence=1, budget_amount=D("100000"))
        self.m2 = Milestone.objects.create(project=self.project, name="Build", sequence=2, budget_amount=D("200000"))
        self.base = f"/api/projects/{self.project.pk}"

        # Invoices: March (m1, part paid), May (m2, paid), July (no milestone, issued)
        # (totals incl. 18% GST: 118000 / 59000 / 23600; due dates ahead so none is Overdue)
        self.inv_mar = self.invoice("INV-MAR", "100000", date(2026, 3, 10), self.m1)
        self.inv_may = self.invoice("INV-MAY", "50000", date(2026, 5, 10), self.m2)
        self.inv_jul = self.invoice("INV-JUL", "20000", date(2026, 7, 10), None)
        InvoicePayment.objects.create(created_by=self.user, invoice=self.inv_mar, payment_date=date(2026, 3, 20),
                                      amount=D("18000"), payment_method='UPI', status='Completed', reference_no="UTR-1")
        InvoicePayment.objects.create(created_by=self.user, invoice=self.inv_may, payment_date=date(2026, 5, 25),
                                      amount=D("59000"), payment_method='UPI', status='Completed', reference_no="UTR-2")
        InvoicePayment.objects.create(created_by=self.user, invoice=self.inv_jul, payment_date=date(2026, 7, 25),
                                      amount=D("1000"), payment_method='UPI', status='Pending', reference_no="UTR-3")
        # Expenses: April travel (m1), June software (m2)
        Expense.objects.create(created_by=self.user, project=self.project, milestone=self.m1, category='travel',
                               description="Client visit", amount=D("5000"), expense_date=date(2026, 4, 5))
        Expense.objects.create(created_by=self.user, project=self.project, milestone=self.m2, category='software',
                               description="Licence", amount=D("12000"), expense_date=date(2026, 6, 5))
        vendor = Vendor.objects.create(name="Hosting Co", vendor_type="company")
        bill = VendorBill.objects.create(bill_no="VB-1", vendor=vendor, project=self.project,
                                         bill_date=date(2026, 4, 1), due_date=date(2026, 4, 30), total_amount=D("8000"))
        OutgoingPayment.objects.create(vendor_bill=bill, vendor=vendor, payment_date=date(2026, 4, 15),
                                       amount=D("8000"), payment_method='bank')
        # Resources: one in Q2 on m1, one in Q3 on m2
        self.alice = Account.objects.create_user(username="alice", email="alice@example.com", password="x")
        ResourceAssignment.objects.create(project=self.project, milestone=self.m1, resource_type='employee',
                                          resource_id=self.alice.pk, cost_rate=D("500"), working_hours=D("40"),
                                          start_date=date(2026, 4, 1), end_date=date(2026, 6, 30), status='active')
        ResourceAssignment.objects.create(project=self.project, milestone=self.m2, resource_type='external',
                                          external_name="Contract QA", cost_rate=D("400"), working_hours=D("50"),
                                          start_date=date(2026, 7, 1), end_date=date(2026, 9, 30), status='active')

    def invoice(self, no, base, issued, milestone):
        """A real invoice: one line, 18% GST, totals and status worked out by the app itself."""
        inv = Invoice.objects.create(
            invoice_no=no, client=self.client_co, project=self.project, milestone=milestone, status="Issued",
            issue_date=issued, due_date=date(2027, 12, 31), tax_percentage=D("18"),
        )
        InvoiceItem.objects.create(invoice=inv, description="Work", quantity=D("1"), price_per_unit=D(base))
        inv.update_status()
        return inv


class FilterValidationTests(ProjectFiltersBase):
    def test_from_after_to_is_rejected_on_every_tab(self):
        bad = {"date_from": "2026-06-01", "date_to": "2026-05-01"}
        for path in ("invoices/", "cost-entries/", "payments-list/", "financial-summary/", "invoices/export/"):
            resp = self.api.get(f"{self.base}/{path}", bad)
            self.assertEqual(resp.status_code, 400, path)
            self.assertIn("From Date", resp.data["error"], path)

    def test_bad_values_are_rejected(self):
        self.assertEqual(self.api.get(f"{self.base}/invoices/", {"date_from": "10/03/2026"}).status_code, 400)
        self.assertEqual(self.api.get(f"{self.base}/invoices/", {"status": "Bogus"}).status_code, 400)
        self.assertEqual(self.api.get(f"{self.base}/invoices/", {"milestone": "999999"}).status_code, 400)
        self.assertEqual(self.api.get(f"{self.base}/invoices/", {"payment_status": "nope"}).status_code, 400)
        self.assertEqual(self.api.get(f"{self.base}/invoices/", {"ordering": "password"}).status_code, 400)

    def test_filter_options(self):
        data = self.api.get(f"{self.base}/filter-options/").data
        self.assertEqual([m["label"] for m in data["milestones"]], ["Design", "Build"])
        self.assertEqual({r["value"] for r in data["resources"]}, {f"employee:{self.alice.pk}", "external:Contract QA"})
        self.assertIn({"value": "Paid", "label": "Paid"}, data["statuses"]["invoices"])
        self.assertIn({"value": "not_sent", "label": "Not Sent"}, data["payment_statuses"])


class InvoiceListTests(ProjectFiltersBase):
    def numbers(self, **params):
        resp = self.api.get(f"{self.base}/invoices/", params)
        self.assertEqual(resp.status_code, 200, resp.data)
        return [r["invoice_no"] for r in resp.data["results"]], resp.data

    def test_all_newest_first_with_billed_totals(self):
        numbers, data = self.numbers()
        self.assertEqual(numbers, ["INV-JUL", "INV-MAY", "INV-MAR"])
        self.assertEqual(data["totals"][0]["currency"], "INR")
        self.assertEqual(data["totals"][0]["total_amount"], D("200600"))
        self.assertEqual(data["totals"][0]["paid_amount"], D("77000"))

    def test_date_range_is_inclusive_on_invoice_date(self):
        self.assertEqual(self.numbers(date_from="2026-03-10", date_to="2026-05-10")[0], ["INV-MAY", "INV-MAR"])
        self.assertEqual(self.numbers(date_from="2026-05-11")[0], ["INV-JUL"])
        self.assertEqual(self.numbers(date_to="2026-03-09")[0], [])

    def test_filters_combine(self):
        self.assertEqual(self.numbers(milestone=self.m1.pk)[0], ["INV-MAR"])
        self.assertEqual(self.numbers(milestone="none")[0], ["INV-JUL"])
        self.assertEqual(self.numbers(payment_status="sent")[0], ["INV-JUL"])
        self.assertEqual(self.numbers(payment_status="partially_paid", milestone=self.m1.pk)[0], ["INV-MAR"])
        self.assertEqual(self.numbers(payment_status="paid", milestone=self.m1.pk)[0], [])
        self.assertEqual(self.numbers(search="build")[0], ["INV-MAY"])  # milestone name
        numbers, data = self.numbers(status="Paid", date_from="2026-01-01", date_to="2026-12-31")
        self.assertEqual((numbers, data["count"]), (["INV-MAY"], 1))

    def test_sorting_and_paging(self):
        self.assertEqual(self.numbers(ordering="total_amount")[0], ["INV-JUL", "INV-MAY", "INV-MAR"])
        numbers, data = self.numbers(ordering="issue_date", page_size=2, page=2)
        self.assertEqual((numbers, data["count"], data["total_pages"]), (["INV-JUL"], 3, 2))

    def test_export_uses_the_same_filters(self):
        resp = self.api.get(f"{self.base}/invoices/export/", {"date_from": "2026-05-01", "payment_status": "paid"})
        ws = load_workbook(io.BytesIO(resp.content))["Invoices"]
        listed = [ws.cell(r, 1).value for r in range(5, ws.max_row + 1) if not str(ws.cell(r, 1).value).startswith("Total")]
        self.assertEqual(listed, ["INV-MAY"])
        self.assertIn("Payment status: Paid", ws["A2"].value)


class CostEntryAndPaymentFilterTests(ProjectFiltersBase):
    def test_cost_entries_without_filters_are_unchanged(self):
        data = self.api.get(f"{self.base}/cost-entries/").data
        self.assertEqual([e["ref_no"] for e in data["entries"]][-1], "VB-1")
        self.assertEqual(data["totals"]["count"], 3)

    def test_cost_entries_date_status_milestone_search(self):
        get = lambda **p: self.api.get(f"{self.base}/cost-entries/", p).data  # noqa: E731
        data = get(date_from="2026-04-01", date_to="2026-04-30")
        self.assertEqual(sorted(e["type"] for e in data["entries"]), ["bill", "expense"])
        self.assertEqual(data["totals"]["amount"], 13000.0)
        self.assertEqual([e["description"] for e in get(milestone=self.m2.pk)["entries"]], ["Licence"])
        self.assertEqual([e["ref_no"] for e in get(search="hosting")["entries"]], ["VB-1"])
        self.assertEqual(len(get(status="paid")["entries"]), 1)  # the bill
        self.assertEqual([e["type"] for e in get(type="expense", date_from="2026-06-01")["entries"]], ["expense"])

    def test_payments_date_range_and_totals(self):
        get = lambda **p: self.api.get(f"{self.base}/payments-list/", p).data  # noqa: E731
        data = get()
        self.assertEqual(D(data["incoming"]["total_received"]), D("77000"))  # pending one not counted
        data = get(date_from="2026-04-01", date_to="2026-05-31")
        self.assertEqual([p["reference_no"] for p in data["incoming"]["payments"]], ["UTR-2"])
        self.assertEqual(D(data["incoming"]["total_received"]), D("59000"))
        self.assertEqual(D(data["outgoing"]["total_paid"]), D("8000"))
        self.assertEqual(len(get(status="Pending")["incoming"]["payments"]), 1)
        self.assertEqual(get(status="Pending")["outgoing"]["payments"], [])


class PeriodSummaryAndResourceTests(ProjectFiltersBase):
    def test_summary_has_no_period_without_dates(self):
        data = self.api.get(f"{self.base}/financial-summary/").data
        self.assertIsNone(data["period"])
        self.assertEqual(data["actual_cost"], D("20000") + D("20000") + D("17000") + D("8000"))

    def test_project_totals_include_invoices_and_expenses_without_a_milestone(self):
        Expense.objects.create(created_by=self.user, project=self.project, category='other', description="Unlinked",
                               amount=D("3000"), expense_date=date(2026, 8, 1))
        data = self.api.get(f"{self.base}/financial-summary/").data
        self.assertEqual(data["budget"], D("300000"))                # still the milestones' budgets
        self.assertEqual(data["billed_amount"], D("200600"))         # INV-JUL has no milestone but is billed
        self.assertEqual(data["received_amount"], D("77000"))
        self.assertEqual(data["expenses_amount"], D("20000"))        # 5000 + 12000 + the unlinked 3000
        self.assertEqual(data["not_linked"], {"billed_amount": D("23600"), "received_amount": D("0"),
                                              "expenses_amount": D("3000")})

    def test_period_counts_each_record_by_its_own_date(self):
        data = self.api.get(f"{self.base}/financial-summary/", {"date_from": "2026-04-01", "date_to": "2026-06-30"}).data
        p = data["period"]
        self.assertEqual(p["invoiced_amount"], D("59000"))      # May invoice only
        self.assertEqual(p["received_amount"], D("59000"))      # May receipt (March one outside)
        self.assertEqual(p["expenses_amount"], D("17000"))      # April + June expenses
        self.assertEqual(p["bills_paid_amount"], D("8000"))
        self.assertEqual(p["resource_cost"], D("20000"))        # Alice 500 x 40, Apr-Jun
        self.assertEqual(p["actual_cost"], D("45000"))
        self.assertEqual(data["budget"], D("300000"))           # project-to-date figures unchanged

    def test_resources_resource_filter(self):
        resp = self.api.get(f"{self.base}/resources/", {"page": 1, "resource": "external:contract qa"})
        self.assertEqual([r["resource_name"] for r in resp.data["results"]], ["Contract QA"])
        resp = self.api.get(f"{self.base}/resources/", {"page": 1, "resource": f"employee:{self.alice.pk}"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(self.api.get(f"{self.base}/resources/", {"page": 1, "resource": "nobody"}).status_code, 400)
