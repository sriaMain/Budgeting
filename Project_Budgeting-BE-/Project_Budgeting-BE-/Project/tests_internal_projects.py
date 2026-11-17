"""Internal projects (Project.project_category='internal'): created without a quotation by Admins /
Managers / Project Managers, with a department, project manager and approved internal budget;
milestones, resources, expenses and vendor bills cost against that budget; no client billing.
Client projects keep their own rules (see finances.tests / Project.tests for the quotation path)."""
import io
from datetime import date
from decimal import Decimal

from django.utils import timezone
from openpyxl import load_workbook

from accounts.models import Vendor
from finances.models import Expense, OutgoingPayment, VendorBill
from Project.models import Milestone, Project, ProjectBudget, ResourceAssignment
from Project.tests_resources import ResourceTabBase
from roles.models import Role

D = Decimal


class InternalProjectBase(ResourceTabBase):
    def setUp(self):
        super().setUp()  # self.manager has the Manager role
        self.plain = self.employee("30000001", "Plain User", "Developer", "Engineering")
        self.today = timezone.localdate()

    def as_user(self, user):
        self.api.force_authenticate(user)

    def payload(self, **kw):
        values = {
            "project_category": "internal",
            "project_name": "Office ERP Rollout",
            "department": "Engineering",
            "project_manager": self.alice.pk,
            "description": "Roll out the new ERP internally.",
            "start_date": "2027-01-01",
            "end_date": "2027-06-30",
            "approved_budget": "100000",
            "currency": "INR",
            "status": "planning",
        }
        values.update(kw)
        return values

    def create(self, **kw):
        resp = self.api.post("/api/projects/", self.payload(**kw), format="json")
        self.assertEqual(resp.status_code, 201, getattr(resp, 'data', resp))
        return Project.objects.get(project_no=resp.data['project']['project_no'])


class CreateAndEditTests(InternalProjectBase):
    def test_manager_creates_an_internal_project_without_a_quotation(self):
        resp = self.api.post("/api/projects/", self.payload(), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['project']['approved_budget'], D("100000.00"))
        p = Project.objects.get(project_name="Office ERP Rollout")
        self.assertEqual((p.project_category, p.project_type, p.engagement_type), ('internal', 'internal', 'fixed'))
        self.assertEqual((p.department, p.project_manager_id), ("Engineering", self.alice.pk))
        self.assertIsNone(p.created_from_quotation)
        self.assertIsNone(p.client)
        self.assertIsNone(p.contract_value)
        self.assertEqual(p.budget.total_budget, D("100000.00"))
        self.assertFalse(p.budget.use_quoted_amounts)
        self.assertEqual(p.budget.cost_budget, D("100000.00"))
        self.assertEqual(p.budget.forecasted_profit, D("0.00"))  # no client revenue

    def test_admin_and_project_manager_roles_can_create_others_cannot(self):
        self.as_user(self.plain)
        resp = self.api.post("/api/projects/", self.payload(), format="json")
        self.assertEqual(resp.status_code, 403)
        for i, role in enumerate(("Admin", "Project Manager")):
            self.plain.roles.set([Role.objects.get_or_create(role_name=role)[0]])
            self.assertEqual(self.api.post("/api/projects/", self.payload(project_name=f"P{i}"), format="json").status_code, 201)

    def test_required_fields(self):
        resp = self.api.post("/api/projects/", self.payload(project_manager=None, approved_budget="0", department=""), format="json")
        self.assertEqual(resp.status_code, 400)
        for field in ("department", "project_manager", "approved_budget"):
            self.assertIn(field, str(resp.data))

    def test_department_is_required(self):
        for dept in ("", "   "):
            resp = self.api.post("/api/projects/", self.payload(department=dept), format="json")
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Select the department.", str(resp.data))
        payload = self.payload(project_name="No dept field")
        payload.pop("department")
        self.assertEqual(self.api.post("/api/projects/", payload, format="json").status_code, 400)
        self.assertFalse(Project.objects.filter(project_name="No dept field").exists())

    def test_edit_cannot_clear_the_department(self):
        p = self.create()
        resp = self.api.put(f"/api/projects/{p.pk}/", {"department": ""}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Select the department.", str(resp.data))
        p.refresh_from_db()
        self.assertEqual(p.department, "Engineering")
        # An edit that doesn't send the department leaves it alone.
        self.assertEqual(self.api.put(f"/api/projects/{p.pk}/", {"description": "Phase 2"}, format="json").status_code, 200)

    def test_no_time_and_material_or_quotation_billing(self):
        resp = self.api.post("/api/projects/", self.payload(engagement_type="time_and_material",
                                                           monthly_billing_amount="5000"), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("milestone-based", str(resp.data))

    def test_edit_budget_and_department_and_permissions(self):
        p = self.create()
        resp = self.api.put(f"/api/projects/{p.pk}/", {"approved_budget": "150000", "department": "Quality",
                                                       "description": "Phase 2"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        p.refresh_from_db()
        self.assertEqual((p.department, p.description, p.budget.total_budget), ("Quality", "Phase 2", D("150000.00")))
        self.assertEqual(self.api.put(f"/api/projects/{p.pk}/", {"project_category": "client"}, format="json").status_code, 400)
        self.as_user(self.plain)
        self.assertEqual(self.api.put(f"/api/projects/{p.pk}/", {"description": "x"}, format="json").status_code, 403)

    def test_existing_client_projects_are_unchanged(self):
        # project_type 'internal' made the old way (no quote) stays a client project with its rules.
        self.as_user(self.plain)
        resp = self.api.post("/api/projects/", {
            "project_name": "Old style", "project_type": "internal", "engagement_type": "fixed",
            "contract_value": "50000", "start_date": "2027-01-01", "end_date": "2027-03-31",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        p = Project.objects.get(project_name="Old style")
        self.assertEqual(p.project_category, 'client')
        self.assertEqual(self.project.project_category, 'client')

    def test_department_options_come_from_aira(self):
        data = self.api.get("/api/projects/department-options/").data
        self.assertEqual(data['departments'], ["Engineering", "Quality"])  # 'Ops' person is inactive
        self.assertTrue(data['can_manage_internal_projects'])
        self.as_user(self.plain)
        self.assertFalse(self.api.get("/api/projects/department-options/").data['can_manage_internal_projects'])

    def test_projects_list_groups_internal_projects(self):
        self.create()
        groups = {g['company_name']: g for g in self.api.get("/api/projects/").data['Projects']}
        internal = groups["Internal Projects"]['project_details'][0]
        self.assertEqual((internal['project_category'], internal['department'], internal['approved_budget']),
                         ('internal', 'Engineering', D("100000.00")))
        self.assertEqual(internal['project_manager_name'], "Alice Rao")


class InternalCostTests(InternalProjectBase):
    def setUp(self):
        super().setUp()
        self.p = self.create()
        self.ms_url = f"/api/projects/{self.p.pk}/milestones/"
        self.res_url = f"/api/projects/{self.p.pk}/resources/"
        resp = self.api.post(self.ms_url, {"name": "Build", "sequence": 1, "budget_percent": 40, "bill_percent": 0,
                                           "status": "not_started", "completion_percent": 50}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.m = Milestone.objects.get(pk=resp.data['id'])

    def add_costs(self):
        # Resource on the milestone: 500 x 10 = 5,000; project-level resource: 2,000.
        r1 = self.api.post(self.res_url, {"resource_type": "employee", "resource_id": self.alice.pk, "milestone": self.m.pk,
                                          "cost_rate": "500", "working_hours": "10",
                                          "start_date": "2027-01-01", "end_date": "2027-03-31"}, format="json")
        self.assertEqual(r1.status_code, 201, r1.data)
        r2 = self.api.post(self.res_url, {"resource_type": "freelancer", "resource_id": self.freelancer.pk,
                                          "cost_rate": "0", "working_hours": "0", "cost_amount": "2000",
                                          "start_date": "2027-02-01", "end_date": "2027-04-30"}, format="json")
        self.assertEqual(r2.status_code, 201, r2.data)
        # Expense 3,000 on the milestone; an employee-cost expense is NOT counted again.
        Expense.objects.create(created_by=self.manager, project=self.p, milestone=self.m, category='software',
                               description="Licences", amount=D("3000"), expense_date=self.today)
        Expense.objects.create(created_by=self.manager, project=self.p, category='employee_cost',
                               description="Salary share", amount=D("9999"), expense_date=self.today)
        # Vendor bill 4,000 on the milestone, 1,500 paid -> 1,500 counted.
        vendor = Vendor.objects.create(name="Hosting Co", vendor_type="company")
        bill = VendorBill.objects.create(bill_no="VB-9", vendor=vendor, project=self.p, milestone=self.m,
                                         bill_date=self.today, due_date=self.today, total_amount=D("4000"))
        OutgoingPayment.objects.create(vendor_bill=bill, vendor=vendor, payment_date=self.today,
                                       amount=D("1500"), payment_method='bank')

    def test_milestone_budget_is_a_share_of_the_approved_budget(self):
        self.assertEqual(self.m.budget_amount, D("40000.00"))
        self.assertEqual(self.m.completion_percent, 50)

    def test_resources_may_sit_on_the_project_itself(self):
        resp = self.api.post(self.res_url, {"resource_type": "employee", "resource_id": self.bob.pk,
                                            "cost_rate": "100", "working_hours": "1",
                                            "start_date": "2027-01-01", "end_date": "2027-01-31"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNone(resp.data['milestone'])
        # A client Fixed Budget project still needs a milestone.
        resp = self.api.post(self.url, {"resource_type": "employee", "resource_id": self.bob.pk,
                                        "cost_rate": "100", "working_hours": "1",
                                        "start_date": "2030-01-01", "end_date": "2030-01-31"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_summary_counts_every_cost_once_against_the_approved_budget(self):
        self.add_costs()
        s = self.api.get(f"/api/projects/{self.p.pk}/financial-summary/").data
        self.assertEqual(s['project_category'], 'internal')
        self.assertEqual(s['approved_budget'], D("100000.00"))
        self.assertEqual(s['budget'], D("100000.00"))
        self.assertEqual(s['resource_cost'], D("7000.00"))
        self.assertEqual(s['expenses_amount'], D("3000.00"))
        self.assertEqual(s['bills_amount'], D("1500.00"))
        self.assertEqual(s['actual_cost'], D("11500.00"))
        self.assertEqual(s['remaining_budget'], D("88500.00"))
        self.assertEqual(s['utilization_percent'], D("11.50"))
        self.assertEqual((s['allocated_to_milestones'], s['unallocated_budget']), (D("40000.00"), D("60000.00")))
        self.assertEqual(s['not_linked']['resource_cost'], D("2000.00"))
        self.assertEqual(s['milestone_progress']['total'], 1)
        self.assertEqual(s['milestone_progress']['average_progress'], 50)
        self.assertIsNone(s['margin_percent'])
        self.assertEqual(s['billed_amount'], D("0.00"))
        # The milestone: 5,000 resources + 3,000 expense + 1,500 bill against 40,000.
        row = s['milestones'][0]
        self.assertEqual((row['actual_cost'], row['remaining_budget'], row['resource_count']),
                         (D("9500.00"), D("30500.00"), 1))
        ms = self.api.get(self.ms_url).data[0]
        self.assertEqual(D(ms['actual_cost']), D("9500.00"))
        self.assertEqual([r['name'] for r in ms['assigned_resources']], ["Alice Rao"])

    def test_report_export(self):
        self.add_costs()
        resp = self.api.get(f"/api/projects/{self.p.pk}/internal-report/export/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Office-ERP-Rollout_Internal-Report_", resp['Content-Disposition'])
        wb = load_workbook(io.BytesIO(resp.content))
        self.assertEqual(wb.sheetnames, ['Summary', 'Milestones', 'Resources', 'Costs'])
        figures = {row[0]: row[1] for row in wb['Summary'].iter_rows(values_only=True) if row and row[0]}
        self.assertEqual(figures['Approved Internal Budget'], 100000)
        self.assertEqual(figures['Actual Cost'], 11500)
        self.assertEqual(figures['Remaining Budget'], 88500)
        self.assertEqual(wb['Milestones'].cell(row=2, column=2).value, "Build")
        self.assertEqual(wb['Resources'].max_row, 3)  # header + 2 resources
        # Client projects don't have this report.
        self.assertEqual(self.api.get(f"/api/projects/{self.project.pk}/internal-report/export/").status_code, 400)

    def test_activity(self):
        self.add_costs()
        data = self.api.get(f"/api/projects/{self.p.pk}/activity/").data
        titles = [e['title'] for e in data['results']]
        for expected in ("Project created: Office ERP Rollout", "Milestone added: Build", "Resource added: Alice Rao",
                         "Expense recorded:", "Vendor bill recorded: VB-9", "Vendor bill paid: VB-9"):
            self.assertTrue(any(t.startswith(expected) for t in titles), expected)
        self.assertEqual(data['count'], len(data['results']))
        searched = self.api.get(f"/api/projects/{self.p.pk}/activity/", {"search": "VB-9"}).data
        self.assertEqual(searched['count'], 2)
        self.assertEqual(self.api.get(f"/api/projects/{self.p.pk}/activity/",
                                      {"date_from": "2030-01-01"}).data['count'], 0)

    def test_budget_record_stays_in_sync(self):
        self.assertEqual(ProjectBudget.objects.filter(project=self.p).count(), 1)
        self.assertEqual(ResourceAssignment.objects.filter(project=self.p).count(), 0)
