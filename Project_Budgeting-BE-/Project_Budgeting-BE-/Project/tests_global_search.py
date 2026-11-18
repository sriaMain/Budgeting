"""Header global search (Project/global_search.py): GET /api/search/?q=<text>."""
from datetime import date
from decimal import Decimal

from rest_framework.test import APIClient

from client.models import Company
from finances.models import Expense, Invoice, InvoiceItem, InvoicePayment, VendorBill
from Project.models import Milestone, Project, Task
from Project.tests_resources import ResourceTabBase
from roles.models import Role


class GlobalSearchTests(ResourceTabBase):
    def setUp(self):
        super().setUp()  # self.api is signed in as a "Manager"; project "Apollo Portal" (fixed price)
        self.client_co = Company.objects.create(company_name="Zenith Corp", email="zenith@example.com")
        self.project.client = self.client_co
        self.project.save()
        self.review = Milestone.objects.create(project=self.project, name="Design Review", sequence=3)
        self.task = Task.objects.create(project=self.project, milestone=self.m1, title="Write spec", description="Scope",
                                        allocated_hours=Decimal("0"), assigned_to=self.bob,
                                        start_date=date(2026, 2, 1), due_date=date(2026, 2, 10))
        self.assign(account=self.alice, role="Lead developer")
        self.assign(account=self.alice, milestone=self.m2)  # same person twice -> one result
        self.expense = Expense.objects.create(created_by=self.manager, project=self.project, category='travel',
                                              description="Flight to client site", amount=Decimal("2500.00"),
                                              expense_date=date(2026, 3, 1))
        VendorBill.objects.create(bill_no="VB-77", vendor=self.vendor, project=self.project, bill_date=date(2026, 3, 2),
                                  due_date=date(2026, 3, 30), total_amount=Decimal("10000.00"))
        self.invoice = Invoice.objects.create(invoice_no="INV-SRCH-1", client=self.client_co, project=self.project,
                                              status='Draft', issue_date=date(2026, 3, 5), due_date=date(2026, 4, 5))
        InvoiceItem.objects.create(invoice=self.invoice, description="Work", quantity=Decimal("1"), price_per_unit=Decimal("1000"))
        self.invoice.update_status()
        InvoicePayment.objects.create(created_by=self.manager, invoice=self.invoice, payment_date=date(2026, 3, 20),
                                      amount=Decimal("100.00"), payment_method='UPI', status='Completed',
                                      reference_no="UTR998877")

    def search(self, q, client=None):
        resp = (client or self.api).get("/api/search/", {"q": q})
        self.assertEqual(resp.status_code, 200, resp.data)
        return {s["key"]: s["results"] for s in resp.data["sections"]}

    def only(self, sections, key):
        self.assertIn(key, sections, sections)
        self.assertEqual(len(sections[key]), 1, sections[key])
        return sections[key][0]

    def test_finds_each_tab_with_the_text_its_search_box_needs(self):
        cases = [
            ("spec", "tasks", "Tasks", "Write spec"),
            ("Design Rev", "milestones", "Milestones", "Design Review"),
            ("Alice", "resources", "Resources", "Alice Rao"),
            ("10000004", "resources", "Resources", "Alice Rao"),  # AIRA employee ID
            ("Flight", "expenses", "Expenses", self.expense.expense_no),
            ("VB-77", "expenses", "Expenses", "VB-77"),
            ("INV-SRCH", "invoices", "Invoices", "INV-SRCH-1"),
            ("UTR998", "payments", "Payments", "UTR998877"),
        ]
        for q, section, tab, tab_search in cases:
            row = self.only(self.search(q), section)
            self.assertEqual((row["tab"], row["tab_search"], row["project_id"], row["project_name"]),
                             (tab, tab_search, self.project.pk, "Apollo Portal"), q)
        task = self.only(self.search("spec"), "tasks")
        self.assertIn("Bob Das", task["subtitle"])

    def test_project_by_name_client_or_number_lists_its_tabs(self):
        for q in ("Apollo", "Zenith", str(self.project.pk)):
            row = self.only(self.search(q), "projects")
            self.assertEqual((row["title"], row["tab"]), ("Apollo Portal", "Overview"), q)
        self.assertEqual(row["tabs"], ['Overview', 'Tasks', 'Expenses', 'Resources', 'Invoices', 'Milestones', 'Financials', 'Payments'])

    def test_time_and_material_project_has_no_milestones_tab(self):
        tm = Project.objects.create(project_name="Hourly Support", project_type="internal", engagement_type="time_and_material",
                                    start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        Milestone.objects.create(project=tm, name="Phase Zeta", sequence=1)
        self.assertNotIn("Milestones", self.only(self.search("Hourly"), "projects")["tabs"])
        row = self.only(self.search("Zeta"), "milestones")
        self.assertEqual((row["tab"], row["tab_search"]), ("Overview", ""))  # no Milestones tab to open

    def test_employee_gets_only_own_tasks(self):
        alice = APIClient()
        alice.force_authenticate(self.alice)
        self.alice.roles.add(Role.objects.get_or_create(role_name="Employee")[0])
        self.assertEqual(self.search("spec", alice), {})  # Bob's task
        mine = Task.objects.create(project=self.project, title="Fix spec typos", allocated_hours=Decimal("0"), assigned_to=self.alice)
        sections = self.search("Apollo", alice)
        self.assertEqual(list(sections), ["tasks"])  # no projects, invoices, payments...
        row = sections["tasks"][0]
        self.assertEqual((row["task_id"], row["tab"], row["project_id"]), (mine.pk, None, None))

    def test_short_query_and_login(self):
        self.assertEqual(self.search("a"), {})
        Project.objects.create(project_no=9, project_name="Ninth Project", project_type="internal",
                               start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        sections = self.search("9")  # a one-digit project number: projects only
        self.assertEqual(list(sections), ["projects"])
        self.assertEqual([r["title"] for r in sections["projects"]], ["Ninth Project"])
        self.assertIn(APIClient().get("/api/search/", {"q": "Apollo"}).status_code, (401, 403))
