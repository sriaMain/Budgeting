"""Resources tab (Project/resource_service.py): table filters and paging, duplicate / inactive-employee
rules, Excel export and Excel import."""
import io
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from accounts.models import Vendor
from freelancer_onboarding.models import Freelancer, FreelancerRateCard
from hrms_integration.models import HrmsEmployee
from Project.models import Milestone, Project, ResourceAssignment
from Project.resource_service import IMPORT_COLUMNS
from roles.models import Role

Account = get_user_model()
D = Decimal


class ResourceTabBase(TestCase):
    def setUp(self):
        self.manager = Account.objects.create_user(username="pm", email="pm@example.com", password="x")
        self.manager.roles.add(Role.objects.get_or_create(role_name="Manager")[0])
        self.api = APIClient()
        self.api.force_authenticate(self.manager)
        self.project = Project.objects.create(
            project_name="Apollo Portal", project_type="internal", engagement_type="fixed",
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
        )
        self.m1 = Milestone.objects.create(project=self.project, name="M1", sequence=1)
        self.m2 = Milestone.objects.create(project=self.project, name="M2", sequence=2)
        self.alice = self.employee("10000004", "Alice Rao", "Developer", "Engineering")
        self.bob = self.employee("20000001", "Bob Das", "QA Lead", "Quality")
        self.gone = self.employee("50000001", "Gone Person", "Analyst", "Ops", active=False)
        self.freelancer = Freelancer.objects.create(full_name="Fiona Free", email="fiona@example.com", status="active",
                                                    professional_title="Designer", skills="Figma, UX")
        FreelancerRateCard.objects.create(freelancer=self.freelancer, pricing_model="daily", cost_rate=D("4000"),
                                          billing_rate=D("6000"), effective_from=date(2026, 1, 1))
        self.vendor = Vendor.objects.create(name="Staffing Co", vendor_type="company")
        self.vendor.assign_reference_number()
        self.vendor.save()
        self.url = f"/api/projects/{self.project.pk}/resources/"

    def employee(self, employee_id, name, designation, department, active=True, rate=D("500")):
        first, last = name.split(" ")
        account = Account.objects.create_user(username=employee_id, email=f"{employee_id}@example.com", password="x",
                                              first_name=first, last_name=last, charges_per_hour=rate)
        HrmsEmployee.objects.create(employee_id=employee_id, full_name=name, designation=designation,
                                    department=department, is_active_in_hrms=active, account=account)
        return account

    def assign(self, account=None, milestone=None, start=date(2026, 2, 1), end=date(2026, 2, 28), **kw):
        values = dict(project=self.project, milestone=milestone or self.m1, resource_type='employee',
                      resource_id=(account or self.alice).pk, start_date=start, end_date=end,
                      cost_rate=D("500"), working_hours=D("10"))
        values.update(kw)
        return ResourceAssignment.objects.create(**values)

    def table(self, **params):
        resp = self.api.get(self.url, {"page": 1, **params})
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', resp))
        return resp.data


class ResourceTableTests(ResourceTabBase):
    def setUp(self):
        super().setUp()
        self.a = self.assign(self.alice, self.m1, date(2026, 2, 1), date(2026, 2, 28))                  # 5000
        self.b = self.assign(self.bob, self.m2, date(2026, 3, 1), date(2026, 3, 31), cost_amount=D("7000"))
        self.f = self.assign(resource_type='freelancer', resource_id=self.freelancer.pk, milestone=self.m1,
                             start=date(2026, 4, 1), end=date(2026, 4, 30), cost_rate=D("500"), working_hours=D("8"))
        self.r = self.assign(self.bob, self.m1, date(2026, 5, 1), date(2026, 5, 31), status='removed')  # not costed

    def test_rows_carry_the_master_profile_and_cost(self):
        data = self.table(ordering='start_date')
        self.assertEqual(data['count'], 4)
        row = data['results'][0]
        self.assertEqual((row['resource_name'], row['resource_code'], row['designation'], row['department']),
                         ("Alice Rao", "10000004", "Developer", "Engineering"))
        self.assertEqual(row['total_cost'], D("5000.00"))
        self.assertEqual(data['results'][2]['resource_code'], self.freelancer.freelancer_code)
        self.assertEqual(data['results'][2]['resource_detail'], "Figma, UX")
        # Removed ones are listed but not costed - in the filtered totals and the project summary.
        self.assertEqual(data['filtered'], {"count": 4, "total_cost": D("16000.00")})
        self.assertEqual(data['summary']['resources'], 3)
        self.assertEqual(data['summary']['total_cost'], D("16000.00"))
        self.assertEqual(data['summary']['by_type']['employee']['count'], 2)
        self.assertTrue(data['can_import'])

    def test_filters_run_on_the_server(self):
        self.assertEqual([r['id'] for r in self.table(resource_type='freelancer')['results']], [self.f.pk])
        self.assertEqual({r['id'] for r in self.table(milestone=self.m2.pk)['results']}, {self.b.pk})
        self.assertEqual({r['id'] for r in self.table(status='removed')['results']}, {self.r.pk})
        self.assertEqual({r['id'] for r in self.table(search='bob')['results']}, {self.b.pk, self.r.pk})
        self.assertEqual({r['id'] for r in self.table(search='10000004')['results']}, {self.a.pk})

    def test_date_range_uses_the_assignment_period(self):
        data = self.table(date_from='2026-02-15', date_to='2026-04-30')
        # starts on/after 15 Feb and ends on/before 30 Apr: March (b) and April (f) - not Feb (starts 1 Feb)
        self.assertEqual({r['id'] for r in data['results']}, {self.b.pk, self.f.pk})
        self.assertEqual(data['filtered']['total_cost'], D("11000.00"))
        self.assertIn("15/02/2026", data['period'])
        ongoing = self.assign(self.alice, self.m2, date(2026, 3, 1), None)
        self.assertNotIn(ongoing.pk, {r['id'] for r in self.table(date_to='2026-12-31')['results']})

    def test_invalid_filters_are_rejected(self):
        for params, message in (
            ({'date_from': '2026-05-01', 'date_to': '2026-04-01'}, "To Date can't be earlier"),
            ({'date_from': '01/05/2026'}, "From Date must be a valid date"),
            ({'milestone': '999999'}, "Milestone not found"),
            ({'resource_type': 'robot'}, "Resource type must be"),
            ({'ordering': 'salary'}, "Sort by one of"),
        ):
            resp = self.api.get(self.url, {"page": 1, **params})
            self.assertEqual(resp.status_code, 400, params)
            self.assertIn(message, resp.data['error'])

    def test_sorting_and_paging(self):
        for i in range(60):
            self.assign(resource_type='external', resource_id=None, external_name=f"Contractor {i:02d}",
                        start=date(2026, 6, 1), end=date(2026, 6, 30), cost_amount=D("100"))
        first = self.table(page_size=25, ordering='name')
        self.assertEqual((first['count'], first['total_pages'], len(first['results'])), (64, 3, 25))
        names = [r['resource_name'] for r in first['results']]
        self.assertEqual(names, sorted(names, key=str.lower))
        last = self.api.get(self.url, {"page": 3, "page_size": 25, "ordering": "-total_cost"}).data
        self.assertEqual(len(last['results']), 14)
        top = self.table(page_size=5, ordering='-total_cost')['results'][0]
        self.assertEqual(top['id'], self.b.pk)
        self.assertEqual(self.table(page_size=500)['page_size'], 100)  # capped

    def test_old_list_calls_keep_working(self):
        resp = self.api.get(self.url, {"milestone": "any"})
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)
        self.assertEqual(len(resp.data), 4)


class ResourceRulesTests(ResourceTabBase):
    def payload(self, **kw):
        values = {"resource_type": "employee", "resource_id": self.alice.pk, "milestone": self.m1.pk,
                  "cost_rate": "500", "working_hours": "10", "start_date": "2026-02-01", "end_date": "2026-02-28"}
        values.update(kw)
        return values

    def test_overlapping_assignment_on_the_same_milestone_is_a_duplicate(self):
        self.assertEqual(self.api.post(self.url, self.payload(), format="json").status_code, 201)
        resp = self.api.post(self.url, self.payload(start_date="2026-02-20", end_date="2026-03-10"), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already assigned", str(resp.data))
        # Not a duplicate: another milestone, dates that don't overlap, or a completed assignment.
        self.assertEqual(self.api.post(self.url, self.payload(milestone=self.m2.pk), format="json").status_code, 201)
        self.assertEqual(self.api.post(self.url, self.payload(start_date="2026-03-01", end_date="2026-03-31"),
                                       format="json").status_code, 201)
        self.assertEqual(self.api.post(self.url, self.payload(status="completed"), format="json").status_code, 201)

    def test_editing_an_assignment_doesnt_clash_with_itself(self):
        created = self.api.post(self.url, self.payload(), format="json").data
        resp = self.api.patch(f"{self.url}{created['id']}/", {"working_hours": "20"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_inactive_aira_employee_gets_no_new_assignment(self):
        resp = self.api.post(self.url, self.payload(resource_id=self.gone.pk), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("isn't active in AIRA HRMS", str(resp.data))
        # An existing assignment of someone who has left can still be closed.
        old = self.assign(self.gone)
        resp = self.api.patch(f"{self.url}{old.pk}/", {"status": "completed"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_resource_cost_feeds_the_milestone(self):
        self.api.post(self.url, self.payload(), format="json")
        self.api.post(self.url, self.payload(resource_type="vendor", resource_id=self.vendor.pk, cost_amount="2500"),
                      format="json")
        self.assertEqual(Milestone.objects.get(pk=self.m1.pk).actual_cost, D("7500.00"))

    def test_picker_options_show_ids_and_default_rates(self):
        options = self.api.get("/api/projects/poc-options/").data
        alice = next(o for o in options if o['type'] == 'employee' and o['id'] == self.alice.pk)
        self.assertEqual((alice['code'], alice['designation'], alice['department']), ("10000004", "Developer", "Engineering"))
        self.assertFalse(any(o['type'] == 'employee' and o['id'] == self.gone.pk for o in options))
        fiona = next(o for o in options if o['type'] == 'freelancer')
        self.assertEqual((fiona['code'], fiona['skills'], fiona['default_cost_rate'], fiona['rate_unit']),
                         (self.freelancer.freelancer_code, "Figma, UX", D("4000.00"), "daily"))


class ResourceExportTests(ResourceTabBase):
    def test_export_has_every_matching_row_and_a_summary(self):
        for i in range(40):
            self.assign(resource_type='external', resource_id=None, external_name=f"Temp {i}", cost_amount=D("100"),
                        start=date(2026, 3, 1), end=date(2026, 3, 31))
        self.assign(self.alice, self.m1, date(2026, 5, 1), date(2026, 5, 31))  # outside the range below
        resp = self.api.get(f"{self.url}export/", {"date_from": "2026-03-01", "date_to": "2026-03-31"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Apollo-Portal_Resources_2026-03-01_to_2026-03-31.xlsx', resp['Content-Disposition'])
        wb = load_workbook(io.BytesIO(resp.content))
        self.assertEqual(wb.sheetnames, ['Summary', 'Resources'])
        ws = wb['Resources']
        headers = [c.value for c in ws[4]]
        self.assertEqual(headers[:4], ['Project Name', 'Resource Name', 'Resource ID', 'Resource Type'])
        data_rows = [r for r in ws.iter_rows(min_row=5, values_only=True) if r[0] == 'Apollo Portal']
        self.assertEqual(len(data_rows), 40)  # all of them, not one page
        cost_col = headers.index('Total Resource Cost') + 1
        self.assertEqual(ws.cell(ws.max_row, cost_col).value, 4000)
        self.assertIn('₹', ws.cell(5, cost_col).number_format)
        self.assertEqual(ws.cell(5, headers.index('Assignment Start Date') + 1).number_format, 'DD/MM/YYYY')
        summary = {r[0]: r[1] for r in wb['Summary'].iter_rows(values_only=True) if r and r[0]}
        self.assertEqual(summary['Resources in this export'], 40)
        self.assertEqual(summary['All assigned resources on the project'], 41)

    def test_export_respects_type_and_search(self):
        self.assign(self.alice)
        self.assign(self.bob, self.m2)
        resp = self.api.get(f"{self.url}export/", {"search": "alice"})
        ws = load_workbook(io.BytesIO(resp.content))['Resources']
        names = [r[1] for r in ws.iter_rows(min_row=5, values_only=True) if r[0] == 'Apollo Portal']
        self.assertEqual(names, ['Alice Rao'])
        self.assertIn('All-dates', resp['Content-Disposition'])


class ResourceImportTests(ResourceTabBase):
    def xlsx(self, rows, headers=None):
        wb = Workbook()
        ws = wb.active
        ws.title = 'Resources'
        ws.append(headers or [title for title, *_ in IMPORT_COLUMNS])
        for row in rows:
            ws.append(row)
        out = io.BytesIO()
        wb.save(out)
        return SimpleUploadedFile("resources.xlsx", out.getvalue(),
                                  content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    def rows(self):
        self.assign(self.bob, self.m1, date(2026, 2, 1), date(2026, 2, 28))  # makes row 6 a duplicate
        return [
            # type, id, external name, milestone, rate, hours, amount, start, end, status
            ['Employee', '10000004', None, 'M1', None, 40, None, '01/02/2026', '28/02/2026', None],   # master rate 500
            ['Freelancer', self.freelancer.freelancer_code, None, 'm2', None, 16, None, date(2026, 3, 1), date(2026, 3, 31), 'Active'],
            ['Vendor', self.vendor.vendor_reference_no, None, 'M2', None, None, 2500, '2026-03-01', '2026-03-31', 'On Hold'],
            ['External', None, 'Contract QA', 'M1', 300, 10, None, '01/03/2026', '31/03/2026', 'Completed'],
            ['Employee', '20000001', None, 'M1', 450, 10, None, '15/02/2026', '20/02/2026', None],    # duplicate (DB)
            ['Employee', '10000004', None, 'M1', 500, 5, None, '10/02/2026', '12/02/2026', None],     # duplicate (row 2)
            ['Employee', '50000001', None, 'M1', 500, 5, None, '01/02/2026', '28/02/2026', None],     # inactive
            ['Employee', '99999999', None, 'M9', 'abc', None, None, '31/02/2026', None, 'Paused'],    # many errors
        ]

    def test_preview_validates_every_row_and_saves_nothing(self):
        upload = self.xlsx(self.rows())
        before = ResourceAssignment.objects.count()
        resp = self.api.post(f"{self.url}import/", {"file": upload}, format="multipart")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data['committed'])
        self.assertEqual(ResourceAssignment.objects.count(), before)
        by_row = {r['row']: r for r in resp.data['rows']}
        self.assertEqual(resp.data['counts'], {"total": 8, "valid": 4, "duplicate": 2, "error": 2})
        self.assertEqual([by_row[n]['status'] for n in range(2, 10)],
                         ['valid'] * 4 + ['duplicate', 'duplicate', 'error', 'error'])
        self.assertEqual(by_row[2]['values']['cost_rate'], "500.00")  # default from the employee record
        self.assertEqual(by_row[3]['values']['cost_rate'], "500.00")  # daily 4000 / 8 h
        self.assertIn("row 2", by_row[7]['errors'][0])
        self.assertIn("no longer active in AIRA HRMS", by_row[8]['errors'][0])
        errors = ' '.join(by_row[9]['errors'])
        for text in ("isn't in AIRA HRMS", 'Milestone "M9" not found', "Cost Rate must be a number",
                     "Start Date must be a date", "End Date is required", "Status must be"):
            self.assertIn(text, errors)

    def test_commit_creates_valid_rows_only_and_logs_the_run(self):
        with self.assertLogs('Project.resource_import', level='INFO') as logs:
            resp = self.api.post(f"{self.url}import/", {"file": self.xlsx(self.rows()), "commit": "true"},
                                 format="multipart")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['counts'], {"total": 8, "created": 4, "skipped": 2, "failed": 2})
        created = ResourceAssignment.objects.filter(pk__in=[r['assignment_id'] for r in resp.data['rows'] if r['assignment_id']])
        self.assertEqual(created.count(), 4)
        alice = created.get(resource_type='employee')
        self.assertEqual((alice.resource_id, alice.milestone_id, alice.assigned_cost), (self.alice.pk, self.m1.pk, D("20000.00")))
        self.assertEqual(created.get(resource_type='vendor').status, 'on_hold')
        self.assertEqual(created.get(resource_type='external').external_name, 'Contract QA')
        self.assertEqual(created.get(resource_type='freelancer').milestone_id, self.m2.pk)
        self.assertEqual(alice.created_by, self.manager)
        self.assertIn("created=4 skipped=2 failed=2", logs.output[0])
        # No new people were created - only assignments.
        self.assertEqual(HrmsEmployee.objects.count(), 3)
        self.assertEqual(Freelancer.objects.count(), 1)

    def test_bad_files_are_rejected_clearly(self):
        resp = self.api.post(f"{self.url}import/", {"file": self.xlsx([], headers=['Name', 'Cost'])}, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Missing column(s): Resource Type", resp.data['error'])
        resp = self.api.post(f"{self.url}import/", {"file": self.xlsx([])}, format="multipart")
        self.assertIn("No rows to import", resp.data['error'])
        bad = SimpleUploadedFile("resources.csv", b"a,b", content_type="text/csv")
        self.assertIn(".xlsx", self.api.post(f"{self.url}import/", {"file": bad}, format="multipart").data['error'])

    def test_only_managers_can_import(self):
        staff = Account.objects.create_user(username="staff", email="staff@example.com", password="x")
        api = APIClient()
        api.force_authenticate(staff)
        self.assertEqual(api.post(f"{self.url}import/", {"file": self.xlsx(self.rows())}, format="multipart").status_code, 403)
        self.assertEqual(api.get(f"{self.url}import-template/").status_code, 403)
        self.assertFalse(api.get(self.url, {"page": 1}).data['can_import'])
        self.assertEqual(api.get(f"{self.url}export/").status_code, 200)  # export follows the list's access

    def test_template(self):
        resp = self.api.get(f"{self.url}import-template/")
        self.assertEqual(resp.status_code, 200)
        wb = load_workbook(io.BytesIO(resp.content))
        self.assertEqual(wb.sheetnames, ['Resources', 'Instructions'])
        self.assertEqual(wb['Resources']['A1'].value, 'Resource Type *')
        text = ' '.join(str(c.value) for row in wb['Instructions'].iter_rows() for c in row if c.value)
        self.assertIn("M1, M2", text)
        # The template itself imports cleanly as "nothing to import".
        upload = SimpleUploadedFile("t.xlsx", resp.content)
        self.assertIn("No rows to import", self.api.post(f"{self.url}import/", {"file": upload}, format="multipart").data['error'])
