"""Project Details -> Invoices tab -> Export Excel (GET /api/projects/<id>/invoices/export/)."""
import io
from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from client.models import Company
from finances.models import Invoice
from Project.models import Milestone, Project

Account = get_user_model()
D = Decimal


class ProjectInvoiceExportTests(TestCase):
    def setUp(self):
        self.user = Account.objects.create_user(username="pm", email="pm@example.com", password="x")
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.client_co = Company.objects.create(company_name="Acme Corp", email="acme@example.com")
        self.project = Project.objects.create(
            project_name="Apollo Portal", project_type="internal", engagement_type="fixed",
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), client=self.client_co,
        )
        self.m1 = Milestone.objects.create(project=self.project, name="M1 - Discovery", sequence=1)
        self.invoice("INV-001", "Issued", "118000", paid="50000", sub="100000", tax="18000", milestone=self.m1,
                     issued=date(2026, 3, 1))
        self.invoice("INV-002", "Paid", "59000", paid="59000", sub="50000", tax="9000", issued=date(2026, 4, 1))
        self.invoice("INV-003", "Draft", "10000", issued=date(2026, 5, 1))
        self.invoice("INV-004", "Cancelled", "20000", issued=date(2026, 2, 1))
        other = Project.objects.create(project_name="Other", project_type="internal", engagement_type="fixed",
                                       start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), client=self.client_co)
        self.invoice("INV-999", "Issued", "999", project=other)
        self.url = f"/api/projects/{self.project.pk}/invoices/export/"

    def invoice(self, no, status, total, paid="0", sub=None, tax="0", milestone=None, issued=date(2026, 1, 15),
                project=None):
        total, paid = D(total), D(paid)
        return Invoice.objects.create(
            invoice_no=no, client=self.client_co, project=project or self.project, milestone=milestone,
            status=status, issue_date=issued, due_date=issued.replace(day=28),
            sub_total=D(sub or total), tax_amount=D(tax), total_amount=total,
            paid_amount=paid, balance_amount=max(total - paid, D("0")),
        )

    def sheet(self, resp, name):
        return load_workbook(io.BytesIO(resp.content))[name]

    def rows(self, ws):
        """Data rows of the Invoices sheet (header on row 4), as {header: value}."""
        headers = [c.value for c in ws[4]]
        return [dict(zip(headers, (c.value for c in row))) for row in ws.iter_rows(min_row=5) if row[0].value]

    def test_lists_this_projects_invoices_newest_first_with_billed_totals(self):
        resp = self.api.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("spreadsheetml", resp["Content-Type"])
        self.assertRegex(resp["Content-Disposition"], r'filename="Apollo-Portal_Invoices_\d{4}-\d{2}-\d{2}\.xlsx"')

        rows = self.rows(self.sheet(resp, "Invoices"))
        listed = [r["Invoice No"] for r in rows if not str(r["Invoice No"]).startswith("Total")]
        self.assertEqual(listed, ["INV-003", "INV-002", "INV-001", "INV-004"])  # every status, newest first

        first = next(r for r in rows if r["Invoice No"] == "INV-001")
        self.assertEqual(first["Billed For"], "Milestone: M1 - Discovery")
        self.assertEqual(first["Client"], "Acme Corp")
        self.assertEqual(first["Currency"], "INR")
        self.assertEqual(first["Invoice Date"], datetime(2026, 3, 1))
        self.assertEqual((first["Total Amount"], first["Paid"], first["Outstanding"]), (118000, 50000, 68000))

        total = next(r for r in rows if str(r["Invoice No"]).startswith("Total INR"))
        self.assertIn("2 billed", total["Invoice No"])  # Draft and Cancelled left out
        self.assertEqual((total["Total Amount"], total["Paid"], total["Outstanding"], total["Tax"]),
                         (177000, 109000, 68000, 27000))

    def test_formats_dates_and_rupees(self):
        ws = self.sheet(self.api.get(self.url), "Invoices")
        headers = [c.value for c in ws[4]]
        self.assertEqual(ws.cell(5, headers.index("Invoice Date") + 1).number_format, "DD/MM/YYYY")
        self.assertIn("₹", ws.cell(5, headers.index("Total Amount") + 1).number_format)
        self.assertEqual(ws.freeze_panes, "B5")
        self.assertTrue(ws.auto_filter.ref.startswith("A4:"))

    def test_summary_counts_statuses_and_totals(self):
        ws = self.sheet(self.api.get(self.url), "Summary")
        values = [[c.value for c in row] for row in ws.iter_rows()]
        self.assertIn("Invoices - Apollo Portal", values[1])
        self.assertIn(["Cancelled", 1, None, None, None], values)
        self.assertIn(["All listed", 4, None, None, None], values)
        self.assertIn(["INR", 2, 177000, 109000, 68000], values)

    def test_search_matches_the_tab(self):
        rows = self.rows(self.sheet(self.api.get(self.url, {"search": "inv-002"}), "Invoices"))
        self.assertEqual([r["Invoice No"] for r in rows if not str(r["Invoice No"]).startswith("Total")], ["INV-002"])
        rows = self.rows(self.sheet(self.api.get(self.url, {"search": "draft"}), "Invoices"))
        self.assertEqual([r["Invoice No"] for r in rows], ["INV-003"])  # a Draft has no billed total row

    def test_needs_login_and_a_real_project(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)
        self.assertEqual(self.api.get("/api/projects/999999/invoices/export/").status_code, 404)
