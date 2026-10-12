"""
Quote -> Project -> Invoice -> Payment status workflow.

QuoteCreationTests        new quotes are Confirmed; pipeline still lists every stage
ProjectDatesFromQuoteTests project Start/End Date come from the quote
InvoiceStatusTests        generated invoices are active (Issued), never Draft
PaymentWorkflowTests      payments start Pending; only Completed ones count
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client.models import Company
from finances.models import Invoice, InvoiceItem, InvoicePayment
from product_group.models import ProductGroup, Product_Services, Quote, QuoteItem
from Project.models import Milestone, Project
from roles.models import Role

Account = get_user_model()

LOCMEM_CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


def make_client(ready=True):
    n = Company.objects.count()
    company = Company.objects.create(company_name=f"Client {n}", email=f"client{n}@example.com")
    if ready:
        Company.objects.filter(pk=company.pk).update(onboarding_step="approved", kyc_status="verified")
        company.refresh_from_db()
    return company


def make_service():
    n = Product_Services.objects.count()
    group = ProductGroup.objects.create(product_group_name=f"Group {n}")
    return Product_Services.objects.create(product_service_name=f"Service {n}", product_group=group)


def make_quote(client, status="Confirmed", date_of_issue=None, due_date=None):
    today = timezone.localdate()
    quote = Quote.objects.create(
        quote_name="Website", client=client, status=status,
        date_of_issue=date_of_issue or today, due_date=due_date or today + timedelta(days=60),
    )
    QuoteItem.objects.create(quote=quote, product_service=make_service(), quantity=10, price_per_unit=Decimal("100.00"))
    quote.calculate_totals()
    quote.save()
    return quote


def make_invoice(client, total=Decimal("1000.00"), due_in_days=30, **kwargs):
    today = timezone.localdate()
    invoice = Invoice.objects.create(
        invoice_no=f"INV-T-{Invoice.objects.count() + 1}", client=client,
        issue_date=today, due_date=today + timedelta(days=due_in_days), **kwargs,
    )
    InvoiceItem.objects.create(invoice=invoice, description="Work", quantity=Decimal("1"), price_per_unit=total)
    invoice.update_status()
    return invoice


@override_settings(CACHES=LOCMEM_CACHE)
class WorkflowTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = Account.objects.create_user(username="finance", email="finance@example.com", password="x")
        # Admin role holds finances.payment.confirm (granted by finances 0022)
        self.user.roles.add(Role.objects.get(role_name="Admin"))
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.client_company = make_client()


class QuoteCreationTests(WorkflowTestCase):
    def payload(self, **extra):
        today = timezone.localdate()
        return {
            "quote_name": "Website",
            "date_of_issue": str(today),
            "due_date": str(today + timedelta(days=30)),
            "client": self.client_company.pk,
            "items": [{"product_service": make_service().pk, "quantity": 2, "unit": "hours", "price_per_unit": "50.00"}],
            **extra,
        }

    def test_new_quote_is_confirmed_without_status(self):
        resp = self.api.post("/api/quotes/", self.payload(), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Quote.objects.get(pk=resp.data["quote_no"]).status, "Confirmed")

    def test_new_quote_ignores_an_earlier_stage(self):
        resp = self.api.post("/api/quotes/", self.payload(status="Oppurtunity"), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Quote.objects.get(pk=resp.data["quote_no"]).status, "Confirmed")

    def test_existing_quotes_are_untouched(self):
        old = make_quote(self.client_company, status="Proposal")
        self.api.post("/api/quotes/", self.payload(), format="json")
        old.refresh_from_db()
        self.assertEqual(old.status, "Proposal")

    def test_pipeline_lists_every_stage(self):
        stages = ("Oppurtunity", "Scoping", "Proposal", "Confirmed", "Rejected", "Closed", "Cancelled")
        for stage in stages:
            make_quote(self.client_company, status=stage)

        data = self.api.get("/api/pipeline-data/").data
        self.assertEqual([s["title"] for s in data["stages"]], list(stages))
        self.assertTrue(all(s["count"] == 1 for s in data["stages"]))
        self.assertEqual(data["stats"]["total_quotes"], len(stages))


class ProjectDatesFromQuoteTests(WorkflowTestCase):
    def create_project(self, quote, **extra):
        payload = {
            "project_name": "Website build",
            "project_type": "external",
            "engagement_type": "fixed",
            "contract_value": "1000",
            "created_from_quotation": quote.pk,
            "budget": {"use_quoted_amounts": True},
            **extra,
        }
        return self.api.post("/api/projects/", payload, format="json")

    def test_dates_default_to_the_quote(self):
        today = timezone.localdate()
        quote = make_quote(self.client_company, date_of_issue=today, due_date=today + timedelta(days=80))
        resp = self.create_project(quote)
        self.assertEqual(resp.status_code, 201, resp.data)
        project = Project.objects.get(created_from_quotation=quote)
        self.assertEqual(project.start_date, quote.date_of_issue)
        self.assertEqual(project.end_date, quote.due_date)

    def test_edited_dates_are_kept(self):
        today = timezone.localdate()
        quote = make_quote(self.client_company, date_of_issue=today, due_date=today + timedelta(days=80))
        start, end = today + timedelta(days=5), today + timedelta(days=100)
        resp = self.create_project(quote, start_date=str(start), end_date=str(end))
        self.assertEqual(resp.status_code, 201, resp.data)
        project = Project.objects.get(created_from_quotation=quote)
        self.assertEqual((project.start_date, project.end_date), (start, end))

    def test_later_quote_date_changes_do_not_overwrite_project(self):
        today = timezone.localdate()
        quote = make_quote(self.client_company, date_of_issue=today, due_date=today + timedelta(days=80))
        self.assertEqual(self.create_project(quote).status_code, 201)
        quote.due_date = today + timedelta(days=200)
        quote.save()
        project = Project.objects.get(created_from_quotation=quote)
        self.assertEqual(project.end_date, today + timedelta(days=80))


class InvoiceStatusTests(WorkflowTestCase):
    def test_generated_invoice_is_issued(self):
        quote = make_quote(self.client_company)
        resp = self.api.post("/api/invoices/generate/", {"quote_id": quote.pk}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["invoice"]["status"], "Issued")

    def test_milestone_invoice_is_issued(self):
        project = Project.objects.create(
            project_name="Fixed", project_type="internal", engagement_type="fixed",
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=90),
            client=self.client_company, contract_value=Decimal("1000.00"),
        )
        milestone = Milestone.objects.create(project=project, name="M1", billing_amount=Decimal("500.00"))
        resp = self.api.post(
            f"/api/projects/{project.project_no}/milestones/{milestone.id}/create-invoice/", {}, format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Invoice.objects.get(pk=resp.data["id"]).status, "Issued")

    def test_editing_an_invoice_cannot_set_its_status(self):
        invoice = make_invoice(self.client_company)
        resp = self.api.put(f"/api/invoices/{invoice.pk}/", {"status": "Draft", "paid_amount": "999"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "Issued")
        self.assertEqual(invoice.paid_amount, Decimal("0.00"))

    def test_unpaid_invoice_past_due_is_overdue(self):
        invoice = make_invoice(self.client_company, due_in_days=-1)
        self.assertEqual(invoice.status, "Overdue")


class PaymentWorkflowTests(WorkflowTestCase):
    def setUp(self):
        super().setUp()
        self.invoice = make_invoice(self.client_company, total=Decimal("1000.00"))

    def record(self, amount, **extra):
        payload = {
            "payment_date": str(timezone.localdate()), "amount": str(amount),
            "payment_method": "Bank Transfer", **extra,
        }
        return self.api.post(f"/api/invoices/{self.invoice.pk}/payment/", payload, format="json")

    def set_status(self, payment_id, new_status, **extra):
        return self.api.post(
            f"/api/invoices/payments/{payment_id}/status/", {"status": new_status, **extra}, format="json",
        )

    def test_recorded_payment_is_pending_and_not_counted(self):
        resp = self.record(400, status="Completed")  # status in the body is ignored
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["data"]["status"], "Pending")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_amount, Decimal("0.00"))
        self.assertEqual(self.invoice.balance_amount, Decimal("1000.00"))
        self.assertEqual(self.invoice.status, "Issued")

    def test_partial_then_full_payment(self):
        first = self.record(400).data["data"]["id"]
        self.assertEqual(self.set_status(first, "Completed").status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_amount, Decimal("400.00"))
        self.assertEqual(self.invoice.balance_amount, Decimal("600.00"))
        self.assertEqual(self.invoice.status, "Partially Paid")

        second = self.record(600, reference_no="TXN-2").data["data"]["id"]
        self.set_status(second, "Processing")
        self.set_status(second, "Completed")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_amount, Decimal("1000.00"))
        self.assertEqual(self.invoice.balance_amount, Decimal("0.00"))
        self.assertEqual(self.invoice.status, "Paid")

    def test_partially_paid_invoice_past_due_is_overdue(self):
        payment = self.record(400).data["data"]["id"]
        self.set_status(payment, "Completed")
        Invoice.objects.filter(pk=self.invoice.pk).update(due_date=timezone.localdate() - timedelta(days=1))
        self.invoice.refresh_from_db()
        self.invoice.update_status()
        self.assertEqual(self.invoice.status, "Overdue")
        self.assertEqual(self.invoice.balance_amount, Decimal("600.00"))

    def test_failed_and_cancelled_payments_do_not_count(self):
        failed = self.record(300, reference_no="CHQ-1").data["data"]["id"]
        cancelled = self.record(300, reference_no="CHQ-2").data["data"]["id"]
        self.assertEqual(self.set_status(failed, "Failed", note="Cheque bounced").status_code, 200)
        self.assertEqual(self.set_status(cancelled, "Cancelled").status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_amount, Decimal("0.00"))
        self.assertEqual(self.invoice.balance_amount, Decimal("1000.00"))
        # Their amounts are free to be recorded again (a failed reference may be retried)
        self.assertEqual(self.record(1000, reference_no="CHQ-1").status_code, 201)

    def test_failing_needs_a_reason(self):
        payment = self.record(300).data["data"]["id"]
        self.assertEqual(self.set_status(payment, "Failed").status_code, 400)

    def test_duplicate_entry_is_rejected(self):
        self.assertEqual(self.record(300).status_code, 201)
        self.assertEqual(self.record(300).status_code, 400)
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_cannot_record_more_than_the_balance_including_pending(self):
        self.assertEqual(self.record(800, reference_no="A").status_code, 201)
        resp = self.record(300, reference_no="B")
        self.assertEqual(resp.status_code, 400)

    def test_completed_is_final(self):
        payment = self.record(300).data["data"]["id"]
        self.set_status(payment, "Completed")
        self.assertEqual(self.set_status(payment, "Failed", note="x").status_code, 400)
        self.assertEqual(self.set_status(payment, "Pending").status_code, 400)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_amount, Decimal("300.00"))

    def test_confirming_requires_permission(self):
        payment = self.record(300).data["data"]["id"]
        clerk = Account.objects.create_user(username="clerk", email="clerk@example.com", password="x")
        api = APIClient()
        api.force_authenticate(clerk)
        resp = api.post(f"/api/invoices/payments/{payment}/status/", {"status": "Completed"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(InvoicePayment.objects.get(pk=payment).status, "Pending")
