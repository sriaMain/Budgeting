"""
Time & Material multi-month financial tracking (Project/utils/tm_periods.py).

Phase 1 - monthly periods          TMPeriodGenerationTests
Phase 2 - monthly costs and budget TMPeriodCostTests
Phase 3 - invoices and payments    TMPeriodInvoiceTests
Phase 4 - project-level summary    TMProjectSummaryTests
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Vendor
from client.models import Company
from finances.models import Expense, Invoice, InvoicePayment, OutgoingPayment, VendorBill
from Project.models import Project, ProjectPeriod, ResourceAssignment, Task
from Project.utils.tm_periods import (
    month_end, month_start, next_month, period_detail, period_financials, sync_tm_periods,
)

Account = get_user_model()


def add_months(d, n):
    m = month_start(d)
    for _ in range(abs(n)):
        m = next_month(m) if n > 0 else month_start(m - timedelta(days=1))
    return m


def make_client():
    n = Company.objects.count()
    return Company.objects.create(company_name=f"Client {n}", email=f"client{n}@example.com")


def make_tm_project(start, end, billing=Decimal("100000.00"), budget=None, **kwargs):
    defaults = dict(
        project_name=f"TM Project {Project.objects.count()}",
        project_type="internal",
        engagement_type="time_and_material",
        start_date=start,
        end_date=end,
        monthly_billing_amount=billing,
        monthly_budget=budget,
    )
    defaults.update(kwargs)
    return Project.objects.create(**defaults)


class TMPeriodGenerationTests(TestCase):
    """Phase 1: one period per month, start month through end month."""

    def setUp(self):
        self.today = date(2026, 10, 10)
        self.project = make_tm_project(date(2026, 10, 15), date(2027, 3, 20), budget=Decimal("80000.00"))

    def test_oct_to_mar_creates_six_months(self):
        sync_tm_periods(self.project, today=self.today)
        periods = list(self.project.periods.all())
        self.assertEqual(
            [p.month for p in periods],
            [date(2026, 10, 1), date(2026, 11, 1), date(2026, 12, 1),
             date(2027, 1, 1), date(2027, 2, 1), date(2027, 3, 1)],
        )
        # First / last months are clipped to the project dates
        self.assertEqual(periods[0].period_start, date(2026, 10, 15))
        self.assertEqual(periods[0].period_end, date(2026, 10, 31))
        self.assertEqual(periods[-1].period_start, date(2027, 3, 1))
        self.assertEqual(periods[-1].period_end, date(2027, 3, 20))
        for p in periods:
            self.assertEqual(p.budget_amount, Decimal("80000.00"))
            self.assertEqual(p.billing_amount, Decimal("100000.00"))

    def test_budget_defaults_to_billing_amount(self):
        project = make_tm_project(date(2026, 10, 1), date(2026, 11, 30))
        sync_tm_periods(project, today=self.today)
        self.assertTrue(all(p.budget_amount == Decimal("100000.00") for p in project.periods.all()))

    def test_sync_is_idempotent(self):
        for _ in range(3):
            sync_tm_periods(self.project, today=self.today)
        self.assertEqual(self.project.periods.count(), 6)

    def test_future_periods_have_no_actuals(self):
        sync_tm_periods(self.project, today=self.today)
        rows, totals = period_financials(self.project, today=self.today)
        for row in rows:
            self.assertEqual(row['actual_cost'], Decimal("0.00"))
            self.assertEqual(row['invoiced_amount'], Decimal("0.00"))
            self.assertEqual(row['received_amount'], Decimal("0.00"))
            self.assertEqual(row['payment_status'], 'not_invoiced')
        self.assertEqual(totals['budget_amount'], Decimal("480000.00"))
        self.assertEqual(totals['billing_amount'], Decimal("600000.00"))

    def test_extending_end_date_adds_months(self):
        sync_tm_periods(self.project, today=self.today)
        self.project.end_date = date(2027, 5, 31)
        self.project.save()
        sync_tm_periods(self.project, today=self.today)
        self.assertEqual(self.project.periods.count(), 8)
        self.assertEqual(self.project.periods.last().period_end, date(2027, 5, 31))

    def test_shortening_removes_empty_months_and_keeps_invoiced_ones(self):
        self.project.client = make_client()
        self.project.save()
        sync_tm_periods(self.project, today=self.today)
        feb = self.project.periods.get(month=date(2027, 2, 1))
        Invoice.objects.create(
            invoice_no="INV-TEST-FEB", client=self.project.client, project=self.project,
            billing_period=feb, status='Draft', issue_date=self.today, due_date=self.today,
        )
        self.project.end_date = date(2026, 12, 31)
        self.project.save()
        sync_tm_periods(self.project, today=self.today)

        months = {p.month: p.is_active for p in self.project.periods.all()}
        self.assertNotIn(date(2027, 1, 1), months)   # no history - removed
        self.assertNotIn(date(2027, 3, 1), months)
        self.assertIn(date(2027, 2, 1), months)      # invoiced - kept, inactive
        self.assertFalse(months[date(2027, 2, 1)])
        self.assertTrue(months[date(2026, 12, 1)])

    def test_amount_change_updates_current_and_future_months_only(self):
        sync_tm_periods(self.project, today=date(2026, 12, 5))
        self.project.monthly_billing_amount = Decimal("120000.00")
        self.project.monthly_budget = Decimal("90000.00")
        self.project.save()
        sync_tm_periods(self.project, today=date(2026, 12, 5))

        amounts = {p.month: (p.budget_amount, p.billing_amount) for p in self.project.periods.all()}
        self.assertEqual(amounts[date(2026, 10, 1)], (Decimal("80000.00"), Decimal("100000.00")))  # past
        self.assertEqual(amounts[date(2026, 11, 1)], (Decimal("80000.00"), Decimal("100000.00")))  # past
        self.assertEqual(amounts[date(2026, 12, 1)], (Decimal("90000.00"), Decimal("120000.00")))  # current
        self.assertEqual(amounts[date(2027, 3, 1)], (Decimal("90000.00"), Decimal("120000.00")))   # future

    def test_edited_month_keeps_its_amounts(self):
        sync_tm_periods(self.project, today=self.today)
        jan = self.project.periods.get(month=date(2027, 1, 1))
        jan.billing_amount = Decimal("50000.00")
        jan.amounts_overridden = True
        jan.save()
        self.project.monthly_billing_amount = Decimal("120000.00")
        self.project.save()
        sync_tm_periods(self.project, today=self.today)
        jan.refresh_from_db()
        self.assertEqual(jan.billing_amount, Decimal("50000.00"))

    def test_fixed_projects_get_no_periods(self):
        project = make_tm_project(date(2026, 10, 1), date(2027, 3, 31), engagement_type='fixed')
        sync_tm_periods(project, today=self.today)
        self.assertEqual(project.periods.count(), 0)

    def test_month_is_unique_per_project(self):
        from django.db import IntegrityError, transaction
        sync_tm_periods(self.project, today=self.today)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProjectPeriod.objects.create(
                project=self.project, month=date(2026, 10, 1),
                period_start=date(2026, 10, 15), period_end=date(2026, 10, 31),
            )


class TMPeriodCostTests(TestCase):
    """Phase 2: each cost lands in the month of its date; nothing is counted twice."""

    def setUp(self):
        self.today = timezone.localdate()
        self.current = month_start(self.today)
        # 3 past months, the current month, 2 future months
        self.first = add_months(self.current, -3)
        self.last = add_months(self.current, 2)
        self.project = make_tm_project(self.first, month_end(self.last))
        sync_tm_periods(self.project, today=self.today)
        self.employee = Account.objects.create_user(
            username="dev", email="dev@example.com", password="x", charges_per_hour=Decimal("500.00"),
        )

    def rows(self):
        rows, totals = period_financials(self.project, today=self.today)
        return {r['month']: r for r in rows}, totals

    def test_expense_falls_in_its_month(self):
        last_month = add_months(self.current, -1)
        Expense.objects.create(
            project=self.project, category='travel', description="Trip",
            amount=Decimal("2500.00"), expense_date=last_month + timedelta(days=3),
        )
        rows, _ = self.rows()
        self.assertEqual(rows[last_month]['expenses'], Decimal("2500.00"))
        self.assertEqual(rows[last_month]['actual_cost'], Decimal("2500.00"))
        self.assertEqual(rows[self.current]['expenses'], Decimal("0.00"))

    def test_expense_before_start_falls_in_first_month(self):
        Expense.objects.create(
            project=self.project, category='software', description="Licence",
            amount=Decimal("1000.00"), expense_date=self.first - timedelta(days=10),
        )
        rows, _ = self.rows()
        self.assertEqual(rows[self.first]['expenses'], Decimal("1000.00"))

    def test_resource_category_expenses_are_not_expenses(self):
        Expense.objects.create(
            project=self.project, category='employee_cost', description="Salary share",
            amount=Decimal("9000.00"), expense_date=self.current,
        )
        rows, totals = self.rows()
        self.assertEqual(totals['expenses'], Decimal("0.00"))

    def test_vendor_bill_counts_in_payment_month_and_only_what_was_paid(self):
        vendor = Vendor.objects.create(name="Acme Hosting", vendor_type="company")
        bill = VendorBill.objects.create(
            bill_no="VB-1", vendor=vendor, project=self.project,
            bill_date=self.first, due_date=self.first, total_amount=Decimal("10000.00"),
        )
        pay_month = add_months(self.current, -2)
        OutgoingPayment.objects.create(
            vendor_bill=bill, vendor=vendor, payment_date=pay_month + timedelta(days=1),
            amount=Decimal("4000.00"), payment_method='bank',
        )
        rows, totals = self.rows()
        self.assertEqual(rows[pay_month]['vendor_bills'], Decimal("4000.00"))
        self.assertEqual(totals['vendor_bills'], Decimal("4000.00"))  # unpaid balance isn't cost

    def test_task_labour_falls_in_due_date_month(self):
        due_month = add_months(self.current, -1)
        Task.objects.create(
            project=self.project, title="Build API", assigned_to=self.employee,
            allocated_hours=Decimal("10.00"), due_date=due_month + timedelta(days=5),
        )
        rows, totals = self.rows()
        self.assertEqual(rows[due_month]['labour_cost'], Decimal("5000.00"))
        self.assertEqual(rows[due_month]['resource_cost'], Decimal("5000.00"))
        self.assertEqual(totals['labour_cost'], Decimal("5000.00"))

    def test_unassigned_task_hours_are_unrated(self):
        Task.objects.create(project=self.project, title="Spec", allocated_hours=Decimal("4.00"), due_date=self.today)
        rows, _ = self.rows()
        self.assertEqual(rows[self.current]['labour_cost'], Decimal("0.00"))
        self.assertEqual(rows[self.current]['unrated_hours'], Decimal("4.00"))

    def test_vendor_resource_costs_started_months_only(self):
        vendor = Vendor.objects.create(name="Staffing Co", vendor_type="company")
        ResourceAssignment.objects.create(
            project=self.project, resource_type='vendor', resource_id=vendor.pk,
            start_date=self.first, cost_rate=Decimal("100.00"), working_hours=Decimal("160.00"),
        )
        rows, totals = self.rows()
        for m, row in rows.items():
            expected = Decimal("16000.00") if m <= self.current else Decimal("0.00")
            self.assertEqual(row['assigned_resource_cost'], expected, m)
        self.assertEqual(totals['assigned_resource_cost'], Decimal("64000.00"))  # 4 started months

    def test_budget_remaining_and_used_percent(self):
        Expense.objects.create(
            project=self.project, category='travel', description="Trip",
            amount=Decimal("25000.00"), expense_date=self.current,
        )
        rows, _ = self.rows()
        row = rows[self.current]
        self.assertEqual(row['budget_amount'], Decimal("100000.00"))
        self.assertEqual(row['remaining_budget'], Decimal("75000.00"))
        self.assertEqual(row['budget_used_percent'], Decimal("25.00"))

    def test_detail_lists_the_transactions_behind_the_month(self):
        Expense.objects.create(
            project=self.project, category='travel', description="Trip",
            amount=Decimal("700.00"), expense_date=self.current,
        )
        period = self.project.periods.get(month=self.current)
        detail = period_detail(self.project, period, today=self.today)
        self.assertEqual(len(detail['items']['expenses']), 1)
        self.assertEqual(detail['items']['expenses'][0]['amount'], Decimal("700.00"))


class TMPeriodInvoiceTests(TestCase):
    """Phase 3: one invoice per month, linked to its period; payments (incl. partial) roll up."""

    def setUp(self):
        self.today = timezone.localdate()
        self.current = month_start(self.today)
        self.user = Account.objects.create_user(username="pm", email="pm@example.com", password="x")
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.project = make_tm_project(
            add_months(self.current, -1), month_end(add_months(self.current, 1)), client=make_client(),
        )
        sync_tm_periods(self.project, today=self.today)
        self.url = f"/api/projects/{self.project.pk}/generate-tm-invoice/"

    def period(self, offset):
        return self.project.periods.get(month=add_months(self.current, offset))

    def generate(self, period, **extra):
        return self.api.post(self.url, {"period": period.pk, **extra}, format="json")

    def test_invoice_is_linked_to_its_month(self):
        resp = self.generate(self.period(0))
        self.assertEqual(resp.status_code, 201, resp.data)
        invoice = Invoice.objects.get(pk=resp.data['id'])
        self.assertEqual(invoice.billing_period, self.period(0))
        self.assertEqual(invoice.sub_total, Decimal("100000.00"))
        self.assertEqual(invoice.billing_period_start, self.period(0).period_start)

    def test_tax_is_added_on_top(self):
        # No quotation on this project -> default 0%; an explicit tax % is applied on top
        resp = self.generate(self.period(0), amount="50000", tax_percentage="18")
        self.assertEqual(resp.status_code, 201, resp.data)
        invoice = Invoice.objects.get(pk=resp.data['id'])
        self.assertEqual(invoice.sub_total, Decimal("50000.00"))
        self.assertEqual(invoice.tax_amount, Decimal("9000.00"))
        self.assertEqual(invoice.total_amount, Decimal("59000.00"))
        row = next(r for r in period_financials(self.project, today=self.today)[0] if r['month'] == self.current)
        self.assertEqual(row['invoiced_amount'], Decimal("59000.00"))
        self.assertEqual(row['revenue'], Decimal("50000.00"))  # profit is measured without tax

    def test_invalid_tax_is_rejected(self):
        self.assertEqual(self.generate(self.period(0), tax_percentage="150").status_code, 400)

    def test_duplicate_invoice_for_a_month_is_rejected(self):
        self.assertEqual(self.generate(self.period(0)).status_code, 201)
        resp = self.generate(self.period(0))
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.period(0).invoices.count(), 1)

    def test_cancelled_month_can_be_invoiced_again(self):
        first = self.generate(self.period(-1))
        Invoice.objects.filter(pk=first.data['id']).update(status='Cancelled')
        self.assertEqual(self.generate(self.period(-1)).status_code, 201)

    def test_future_month_cannot_be_invoiced(self):
        resp = self.generate(self.period(1))
        self.assertEqual(resp.status_code, 400)

    def test_old_callers_can_pass_period_start(self):
        resp = self.api.post(self.url, {"period_start": str(self.period(-1).period_start)}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Invoice.objects.get(pk=resp.data['id']).billing_period, self.period(-1))

    def test_partial_payment(self):
        invoice = Invoice.objects.get(pk=self.generate(self.period(0)).data['id'])
        InvoicePayment.objects.create(
            invoice=invoice, payment_date=self.today, amount=Decimal("40000.00"), payment_method='UPI',
        )
        rows, totals = period_financials(self.project, today=self.today)
        row = next(r for r in rows if r['month'] == self.current)
        self.assertEqual(row['received_amount'], Decimal("40000.00"))
        self.assertEqual(row['outstanding_amount'], Decimal("60000.00"))
        self.assertEqual(row['payment_status'], 'partially_paid')
        self.assertFalse(row['can_generate_invoice'])

        InvoicePayment.objects.create(
            invoice=invoice, payment_date=self.today, amount=Decimal("60000.00"), payment_method='UPI',
        )
        rows, _ = period_financials(self.project, today=self.today)
        row = next(r for r in rows if r['month'] == self.current)
        self.assertEqual(row['payment_status'], 'paid')
        self.assertEqual(row['outstanding_amount'], Decimal("0.00"))

    def test_outstanding_is_separate_from_remaining_budget(self):
        self.generate(self.period(0))
        rows, _ = period_financials(self.project, today=self.today)
        row = next(r for r in rows if r['month'] == self.current)
        self.assertEqual(row['outstanding_amount'], Decimal("100000.00"))  # billed, not paid
        self.assertEqual(row['remaining_budget'], Decimal("100000.00"))    # nothing spent

    def test_billing_amount_is_frozen_once_invoiced(self):
        period = self.period(0)
        self.generate(period)
        resp = self.api.patch(
            f"/api/projects/{self.project.pk}/periods/{period.pk}/", {"billing_amount": "1"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_edit_month_amounts(self):
        period = self.period(1)
        resp = self.api.patch(
            f"/api/projects/{self.project.pk}/periods/{period.pk}/",
            {"budget_amount": "70000", "billing_amount": "90000"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        period.refresh_from_db()
        self.assertEqual(period.budget_amount, Decimal("70000.00"))
        self.assertTrue(period.amounts_overridden)


class TMProjectSummaryTests(TestCase):
    """Phase 4: project totals are the sum of the months."""

    def setUp(self):
        self.today = timezone.localdate()
        self.current = month_start(self.today)
        self.user = Account.objects.create_user(username="admin2", email="a2@example.com", password="x")
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.project = make_tm_project(
            add_months(self.current, -2), month_end(add_months(self.current, 3)), client=make_client(),
        )

    def test_totals_equal_sum_of_months_and_summary(self):
        Expense.objects.create(
            project=self.project, category='travel', description="Trip",
            amount=Decimal("3000.00"), expense_date=add_months(self.current, -1),
        )
        resp = self.api.get(f"/api/projects/{self.project.pk}/periods/")
        self.assertEqual(resp.status_code, 200, resp.data)
        periods, totals = resp.data['periods'], resp.data['totals']
        self.assertEqual(len(periods), 6)
        for field in ('budget_amount', 'billing_amount', 'actual_cost', 'invoiced_amount', 'received_amount'):
            self.assertEqual(totals[field], sum((p[field] for p in periods), Decimal("0.00")), field)

        self.api.post(
            f"/api/projects/{self.project.pk}/generate-tm-invoice/",
            {"period": periods[0]['id']}, format="json",
        )
        summary = self.api.get(f"/api/projects/{self.project.pk}/financial-summary/").data
        self.assertEqual(summary['engagement_type'], 'time_and_material')
        self.assertEqual(summary['months'], 6)
        self.assertEqual(summary['total_cost'], Decimal("3000.00"))
        self.assertEqual(summary['billed_amount'], Decimal("100000.00"))
        self.assertEqual(summary['total_budget'], Decimal("600000.00"))
        self.assertEqual(summary['remaining_budget'], Decimal("597000.00"))

    def test_project_create_api_generates_periods(self):
        """The create form sends only the billing amount - each month's spending
        budget starts at it, then the budget alone can be changed later."""
        start = self.current
        resp = self.api.post("/api/projects/", {
            "project_name": "TM via API",
            "project_type": "internal",
            "engagement_type": "time_and_material",
            "start_date": str(start),
            "end_date": str(month_end(add_months(start, 5))),
            "monthly_billing_amount": "50000",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        project = Project.objects.get(project_name="TM via API")
        self.assertEqual(project.periods.count(), 6)
        self.assertIsNone(project.monthly_budget)
        self.assertTrue(all(p.budget_amount == Decimal("50000.00") for p in project.periods.all()))

        # Adjust the spending budget later (Financials tab) - billing is untouched
        resp = self.api.put(f"/api/projects/{project.pk}/", {"monthly_budget": "40000"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        for p in project.periods.all():
            self.assertEqual(p.budget_amount, Decimal("40000.00"))
            self.assertEqual(p.billing_amount, Decimal("50000.00"))

    def test_fixed_project_summary_unchanged(self):
        project = make_tm_project(self.current, month_end(self.current), engagement_type='fixed')
        resp = self.api.get(f"/api/projects/{project.pk}/financial-summary/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['engagement_type'], 'fixed')
        self.assertEqual(project.periods.count(), 0)



class MilestoneLabourTests(TestCase):
    """Fixed Budget / milestone projects cost labour on the allocated hours of the milestone's tasks."""

    def setUp(self):
        from Project.models import Milestone
        self.today = timezone.localdate()
        self.project = make_tm_project(self.today, self.today + timedelta(days=90), engagement_type='fixed')
        self.milestone = Milestone.objects.create(project=self.project, name="Phase 1", budget_amount=Decimal("2000.00"))
        self.employee = Account.objects.create_user(
            username="fixed-dev", email="fixed-dev@example.com", password="x", charges_per_hour=Decimal("150.00"),
        )
        self.task = Task.objects.create(
            project=self.project, milestone=self.milestone, title="Build", assigned_to=self.employee,
            allocated_hours=Decimal("10.00"),
        )

    def milestone(self):
        from Project.models import Milestone
        return Milestone.objects.get(pk=self.milestone.pk)  # fresh - labour is cached per instance

    def test_allocated_hours_are_costed_at_the_assignee_rate(self):
        m = self.milestone()
        self.assertEqual(m.allocated_hours, Decimal("10.00"))
        self.assertEqual(m.labour_cost, Decimal("1500.00"))  # 10 h x 150
        self.assertEqual(m.actual_cost, Decimal("1500.00"))
        self.assertEqual(m.unrated_hours, Decimal("0.00"))

    def test_allocated_hours_without_a_rate_are_unrated(self):
        Account.objects.filter(pk=self.employee.pk).update(charges_per_hour=None)
        m = self.milestone()
        self.assertEqual(m.labour_cost, Decimal("0.00"))
        self.assertEqual(m.unrated_hours, Decimal("10.00"))
