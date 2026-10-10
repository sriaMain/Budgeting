
from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from django.utils import timezone
from django.utils.functional import cached_property
from decimal import Decimal


class Project(models.Model):

    STATUS_CHOICES = [
        ("planning", "Planning"),
        ("development", "Development In Progress"),
        ("testing", "Testing In Progress"),
        ("uat", "UAT In Progress"),
        ("ready_for_deployment", "Ready for Deployment"),
        ("deployed", "Deployed"),
        ("on_hold", "On Hold"),
    ]
    PROJECT_TYPE_CHOICES = [
        ('internal', 'Internal'),
        ('external', 'External'),
    ]
    POC_TYPE_CHOICES = [
        ('employee', 'Employee'),
        ('vendor', 'Vendor'),
        ('freelancer', 'Freelancer'),
    ]
    CURRENCY_CHOICES = [
        ('INR', 'INR'),
        ('USD', 'USD'),
        ('EUR', 'EUR'),
    ]

    # --- Project Financial Management: engagement/billing model ---------
    # This is a DIFFERENT axis from project_type (internal/external) above -
    # engagement_type controls which financial workflow applies (Milestones
    # + milestone billing, vs Resource assignments + recurring billing).
    # Kept optional/defaulted at the model level so it never breaks existing
    # rows or save() calls (Project.save() below runs full_clean()); the
    # create-project API enforces the type-specific required fields.
    ENGAGEMENT_TYPE_CHOICES = [
        ('fixed', 'Fixed Budget / Milestone-Based'),
        ('time_and_material', 'Time & Material (T&M)'),
    ]
    BILLING_FREQUENCY_CHOICES = [
        ('weekly', 'Weekly'),
        ('biweekly', 'Bi-Weekly'),
        ('monthly', 'Monthly'),
    ]
    engagement_type = models.CharField(
        max_length=20, choices=ENGAGEMENT_TYPE_CHOICES, default='fixed'
    )
    # Fixed Budget / Milestone-Based fields
    contract_value = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Total agreed contract value for a Fixed Budget project."
    )
    # Time & Material fields
    monthly_billing_amount = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Recurring client billing amount per billing period (T&M)."
    )
    billing_frequency = models.CharField(
        max_length=20, choices=BILLING_FREQUENCY_CHOICES, default='monthly', blank=True
    )
    # Cost budget for one month (T&M). Seeds each ProjectPeriod's budget_amount;
    # falls back to monthly_billing_amount when blank.
    monthly_budget = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Monthly cost budget (T&M). Defaults to the monthly billing amount."
    )
    # Shared by both engagement types
    payment_terms = models.CharField(
        max_length=100, blank=True, help_text="e.g. Net 30, Net 15, Due on Receipt."
    )

    # --- Project Contract (Fixed Budget only): a slice of the Contract
    # Value carved out for this project, expressed as either a percentage or
    # a direct amount. The two are always kept numerically in sync, and
    # remaining_amount is always derived - never entered directly. Stored as
    # separate fields (not folded into contract_value) so the original
    # Contract Value is never overwritten.
    project_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Percentage of the Contract Value carved out for this project."
    )
    project_amount = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Contract Value x Project %, or entered directly."
    )
    remaining_amount = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Contract Value minus Project Amount. Always auto-calculated, never entered directly."
    )

    status = models.CharField(
    max_length=50,
    choices=STATUS_CHOICES,
    default="planning"
)
    project_no = models.AutoField(primary_key=True)
    project_name = models.CharField(max_length=255, unique=True)
    project_type = models.CharField(max_length=20, choices=PROJECT_TYPE_CHOICES)
    client = models.ForeignKey('client.Company', on_delete=models.SET_NULL, null=True, blank=True)
    currency = models.CharField(max_length=10, choices=CURRENCY_CHOICES, default='INR')
    start_date = models.DateField()
    end_date = models.DateField()
    project_manager = models.ForeignKey('accounts.Account', on_delete=models.SET_NULL, null=True, blank=True)
    call_center = models.ForeignKey(
        'core.CallCenter', on_delete=models.SET_NULL, null=True, blank=True, related_name='projects'
    )
    profit_center = models.ForeignKey(
        'core.ProfitCenter', on_delete=models.SET_NULL, null=True, blank=True, related_name='projects'
    )
    gl_account = models.ForeignKey(
        'core.GLAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='projects'
    )
    poc_type = models.CharField(max_length=20, choices=POC_TYPE_CHOICES, null=True, blank=True)
    poc_id = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="ID of the POC in accounts.Account (employee) or accounts.Vendor (vendor/freelancer), per poc_type.",
    )
    created_from_quotation = models.OneToOneField(
        'product_group.Quote',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='project'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.project_type == 'external' and not self.created_from_quotation:
            raise ValidationError("Quotation is required for external projects.")

    def save(self, *args, **kwargs):
        # ✅ AUTO-ASSIGN CLIENT AND ACCOUNTING ATTRIBUTION FROM QUOTATION
        if self.created_from_quotation:
            if not self.client:
                self.client = self.created_from_quotation.client
            if not self.call_center:
                self.call_center = self.created_from_quotation.call_center
            if not self.profit_center:
                self.profit_center = self.created_from_quotation.profit_center
            if not self.gl_account:
                self.gl_account = self.created_from_quotation.gl_account
            if not self.contract_value:
                # Contract Value excludes GST: the quote's sub_total is its
                # pre-tax base amount, while total_amount includes tax_percentage.
                self.contract_value = self.created_from_quotation.sub_total

        if self.end_date < self.start_date:
            raise ValidationError("End date cannot be before start date.")

        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def quotation_tax_percentage(self):
        """Tax % of the quotation this project was created from (0 without one) - added on top
        of the pre-tax amount when a milestone or a T&M month is invoiced."""
        quotation = self.created_from_quotation
        return (quotation.tax_percentage if quotation else None) or Decimal("0.00")

    def __str__(self):
        return f"{self.project_name} ({self.project_no})"
    
class ProjectBudget(models.Model):
    project = models.OneToOneField(Project, on_delete=models.SET_NULL, null=True, related_name='budget')
    use_quoted_amounts = models.BooleanField(default=True)
    total_hours = models.PositiveIntegerField(null=True, blank=True)
    total_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    bills_and_expenses = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=10, default='INR')

    def apply_quoted_amounts(self):
        """
        Sums quoted hours/amounts across every quote that counts toward this
        project's budget: the quote the project was created from (if any and
        Confirmed), plus any follow-up/phase quotes added later via the
        Finances tab (product_group.Quote.linked_project) that are Confirmed.
        Draft/unconfirmed quotes are excluded so the budget only reflects
        committed amounts.
        """
        original_quote = self.project.created_from_quotation
        confirmed_quotes = list(
            self.project.linked_quotes.filter(status='Confirmed')
        )
        if original_quote and original_quote.status == 'Confirmed':
            confirmed_quotes.append(original_quote)

        if not confirmed_quotes:
            if not original_quote:
                raise ValidationError("Quotation is required")
            # Original quote exists but isn't Confirmed yet (e.g. applied
            # before confirmation) — fall back to it alone, as before.
            confirmed_quotes = [original_quote]

        total_hours = 0
        total_budget = Decimal("0.00")
        bills_and_expenses = Decimal("0.00")
        currency = None

        for quote in confirmed_quotes:
            total_hours += sum(
                item.quantity for item in quote.items.all()
                if item.unit == 'hours'
            )
            total_budget += quote.total_amount or Decimal("0.00")
            bills_and_expenses += (quote.in_house_cost or Decimal("0.00")) + (quote.outsourced_cost or Decimal("0.00"))
            currency = getattr(quote, 'currency', None) or currency

        self.total_hours = total_hours
        self.total_budget = total_budget
        self.bills_and_expenses = bills_and_expenses
        self.currency = currency or self.project.currency

    @property
    def actual_expenses(self):
        """
        Real expenses logged against the project (Finances > Expenses tab)
        plus amounts paid against its vendor bills (unpaid bill balances
        don't count). Falls back to the quoted/manual bills_and_expenses
        estimate when neither exists yet.
        """
        if not self.project:
            return self.bills_and_expenses or 0

        from finances.models import vendor_bills_paid_for_project

        # cost_bearing(): expenses linked to a bill are counted via the bill.
        logged = (self.project.expenses.cost_bearing().aggregate(
            total=models.Sum('amount')
        )['total'] or 0) + vendor_bills_paid_for_project(self.project)

        if logged:
            return logged
        return self.bills_and_expenses or 0

    @property
    def cost_budget(self):
        """Tax AND profit excluded - the single source of truth for "budget"
        everywhere it's shown (Financials tab, Budget > Profit sub-tab,
        Reports). For Fixed Budget projects, the Project Contract fields
        entered on Create Project (Contract Value minus Profit Margin =
        Project.remaining_amount, or Contract Value alone if no Profit
        Margin was entered) already give exactly this - Contract Value
        itself excludes GST (Project.save() sets it from the quote's
        sub_total, not total_amount). Falls back to total_budget (still
        tax/profit-inclusive) for T&M projects or ones with neither set."""
        project = self.project
        if project and project.engagement_type == 'fixed':
            if project.remaining_amount is not None:
                return project.remaining_amount
            if project.contract_value is not None:
                return project.contract_value
        return self.total_budget or Decimal("0.00")

    @property
    def forecasted_profit(self):
        """Expected total profit: Contract Value (revenue, tax excluded)
        minus actual cost so far - NOT cost_budget minus actual cost. Using
        Contract Value here (rather than the profit-already-excluded
        cost_budget) means the Profit Margin set aside at project creation,
        plus whatever of the execution budget ends up unspent, both
        correctly flow into this figure - Contract Value is exactly Profit
        Margin + cost_budget by construction, so this is equivalent to
        "profit already secured" + "remaining execution budget"."""
        project = self.project
        if project and project.engagement_type == 'fixed' and project.contract_value is not None:
            revenue = project.contract_value
        else:
            revenue = self.total_budget or Decimal("0.00")
        return revenue - self.actual_expenses


class BudgetLine(models.Model):
    """
    A single GL-Account-tagged row within a project's budget (e.g. "Employee
    Cost" against "5000 - Employee Expense"). GL Accounts are looked up from
    core.GLAccount -- the same Chart-of-Accounts table already used on
    Project.gl_account and Quote.gl_account -- so the budget stays wired to
    the one accounting structure instead of a separate master list:

        Project Budget -> GL Account -> Accounting Transactions

    "Actual" spend for a line is derived from finances.Expense rows logged
    against the same project under the same GL Account, which keeps Planned
    vs Actual vs Variance answerable without a second bookkeeping trail.
    """

    budget = models.ForeignKey(
        ProjectBudget, on_delete=models.CASCADE, related_name='lines'
    )
    description = models.CharField(max_length=255)
    gl_account = models.ForeignKey(
        'core.GLAccount', on_delete=models.PROTECT, related_name='budget_lines'
    )
    planned_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0.00")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['gl_account__code', 'id']

    def __str__(self):
        return f"{self.description} ({self.gl_account.code})"

    def clean(self):
        if self.planned_amount is None or self.planned_amount <= 0:
            raise ValidationError({"planned_amount": "Planned amount must be greater than 0."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    # ---------------------------
    # Budget vs Actual
    # ---------------------------
    @property
    def actual_amount(self):
        """Real spend logged against this project under this GL Account:
        expenses plus amounts paid on vendor bills tagged with the same GL
        Account (bill-linked expenses are counted via their bill only)."""
        if not self.budget_id or not self.budget.project_id:
            return Decimal("0.00")

        from finances.models import project_vendor_bills

        project = self.budget.project
        expenses = project.expenses.cost_bearing().filter(
            gl_account=self.gl_account
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal("0.00")
        bills_paid = project_vendor_bills(project).filter(
            gl_account=self.gl_account
        ).aggregate(total=models.Sum('paid_amount'))['total'] or Decimal("0.00")
        return expenses + bills_paid

    @property
    def remaining_amount(self):
        return (self.planned_amount or Decimal("0.00")) - self.actual_amount

    @property
    def variance(self):
        """Planned - Actual. Positive = under budget, negative = over budget."""
        return (self.planned_amount or Decimal("0.00")) - self.actual_amount

    @property
    def is_over_budget(self):
        return self.actual_amount > (self.planned_amount or Decimal("0.00"))


class ProjectPeriod(models.Model):
    """
    One calendar month of a Time & Material project, from the project's start
    month through its end month (first/last months clipped to the project
    dates). Created and kept in step with the project by
    Project/utils/tm_periods.py:sync_tm_periods().

    Only the configured amounts are stored. Costs, invoices and payments are
    derived from the underlying transactions by date (tm_periods.py), so a
    period never holds fake or duplicated figures:

        Expense.expense_date             -> expenses
        OutgoingPayment.payment_date     -> vendor bills (paid)
        Task due date (else created)     -> labour (allocated hours x rate)
        ResourceAssignment active months -> flat-fee / vendor / external resource cost
        finances.Invoice.billing_period  -> invoiced / received / outstanding
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='periods')
    # First day of the calendar month - the period's identity.
    month = models.DateField()
    period_start = models.DateField()
    period_end = models.DateField()
    budget_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(0)]
    )
    billing_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(0)]
    )
    # Set when someone edits this month's amounts - project-level changes then
    # no longer overwrite them.
    amounts_overridden = models.BooleanField(default=False)
    # False when the month falls outside the project dates after they changed,
    # but the period is kept because it has invoices.
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['month']
        constraints = [
            models.UniqueConstraint(fields=['project', 'month'], name='unique_project_period_month'),
        ]

    def __str__(self):
        return f"{self.project.project_name} - {self.month:%b %Y}"


class Milestone(models.Model):
    """
    A phase of a Fixed Budget / Milestone-Based project's contract (see
    Project.engagement_type == 'fixed'). Billing/payment status and actual
    cost are derived from the finances app (Invoice, InvoicePayment,
    Expense) rather than stored, so they can never drift from the
    underlying transactions:

        Milestone -> Invoice (finances.Invoice.milestone) -> InvoicePayment
        Milestone -> Task (milestone) -> allocated hours x assignee cost rate -> labour_cost
        Milestone -> ResourceAssignment (milestone) -> flat / non-employee cost -> assigned_resource_cost
        resource_cost = labour_cost + assigned_resource_cost
        Milestone -> Expense (finances.Expense.milestone) -> expenses_amount
        Milestone -> VendorBill (finances.VendorBill.milestone) -> paid amount -> bills_amount
        actual_cost = resource_cost + expenses_amount + bills_amount

    Employees and freelancers on a rate are costed on the allocated hours of this milestone's
    tasks assigned to them - see Project/utils/labour_cost.py.
    """

    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),
        ('cancelled', 'Cancelled'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    sequence = models.PositiveIntegerField(default=1)
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    completion_percent = models.PositiveIntegerField(
        default=0, validators=[MaxValueValidator(100)]
    )
    budget_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(0)]
    )
    billing_amount = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(0)]
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_started')

    # Soft delete/archive (Section 12: do not hard-delete financial records).
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='milestones_created'
    )
    updated_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='milestones_updated'
    )

    class Meta:
        ordering = ['sequence', 'id']

    def __str__(self):
        return f"{self.project.project_name} - {self.name}"

    def clean(self):
        if self.planned_end_date and self.planned_start_date and self.planned_end_date < self.planned_start_date:
            raise ValidationError({"planned_end_date": "Planned end date cannot be before planned start date."})

        # Section 11: milestone budgets cannot exceed the project's contract
        # value unless explicitly allowed (allow_budget_override, set by the
        # serializer from a request flag - never persisted).
        if (
            self.project_id
            and self.project.contract_value is not None
            and not getattr(self, '_allow_budget_override', False)
        ):
            other_total = self.project.milestones.filter(is_active=True).exclude(pk=self.pk).aggregate(
                total=models.Sum('budget_amount')
            )['total'] or Decimal("0.00")
            projected_total = other_total + (self.budget_amount or Decimal("0.00"))
            if projected_total > self.project.contract_value:
                raise ValidationError({
                    "budget_amount": (
                        f"Total milestone budgets ({projected_total}) would exceed the project's "
                        f"contract value ({self.project.contract_value})."
                    )
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    # ---------------------------
    # Derived financials (Section 14: never store what can be computed)
    # ---------------------------
    # Employee / freelancer cost reaches the milestone through its assigned
    # resources (resource_cost), so expenses in those categories are left out
    # to avoid counting the same person twice - same rule as the project
    # financial summary (FinancialSummaryAPIView.RESOURCE_COST_CATEGORIES).
    RESOURCE_EXPENSE_CATEGORIES = ('employee_cost', 'freelancer')

    @cached_property
    def _labour(self):
        from .utils.labour_cost import allocated_labour_cost
        return allocated_labour_cost(self.project, milestone=self)

    @property
    def labour_cost(self):
        """Cost of this milestone's tasks (allocated hours x assignee cost rate)."""
        return self._labour.cost

    @property
    def allocated_hours(self):
        """Total allocated hours of this milestone's tasks."""
        return self._labour.hours

    @property
    def unrated_hours(self):
        """Allocated hours with no cost rate to price them (unassigned, or no assignment rate / charges/hour)."""
        return self._labour.unrated_hours

    @property
    def assigned_resource_cost(self):
        """Assigned cost of resources not costed from task hours - flat-fee and vendor /
        external resources. Removed ones excluded."""
        from .utils.labour_cost import is_task_costed
        return sum(
            (
                a.assigned_cost
                for a in self.resource_assignments.filter(is_active=True).exclude(status='removed')
                if not is_task_costed(a)
            ),
            Decimal("0.00"),
        )

    @property
    def resource_cost(self):
        return (self.labour_cost + self.assigned_resource_cost).quantize(Decimal("0.01"))

    @property
    def expenses_amount(self):
        """Expenses tagged to this milestone (bill-linked expenses are counted via their bill only)."""
        return self.expenses.cost_bearing().exclude(
            category__in=self.RESOURCE_EXPENSE_CATEGORIES
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal("0.00")

    @property
    def bills_amount(self):
        """Amount paid so far on vendor bills tagged to this milestone."""
        return self.vendor_bills.aggregate(total=models.Sum('paid_amount'))['total'] or Decimal("0.00")

    @property
    def expense_cost(self):
        """Expenses + paid bills (non-resource cost)."""
        return self.expenses_amount + self.bills_amount

    @property
    def actual_cost(self):
        return (self.resource_cost + self.expense_cost).quantize(Decimal("0.01"))

    @property
    def margin(self):
        """Profit: billing amount - actual cost."""
        return (self.billing_amount or Decimal("0.00")) - self.actual_cost

    @property
    def margin_percent(self):
        if not self.billing_amount:
            return None
        return (self.margin / self.billing_amount * 100).quantize(Decimal("0.01"))

    @property
    def quotation_amount(self):
        """This milestone's share of the project quotation."""
        return self.billing_amount or Decimal("0.00")

    # ---------------------------
    # Percentage-based entry: budget_amount is a % of the project's user
    # budget, billing_amount is a % of the project's quotation (pre-tax,
    # since invoices add tax on top).
    # ---------------------------
    @staticmethod
    def project_budget_base_for(project):
        budget = getattr(project, 'budget', None) if project else None
        if budget is not None:
            return budget.cost_budget or Decimal("0.00")
        return (project.contract_value if project else None) or Decimal("0.00")

    @staticmethod
    def quotation_base_for(project):
        if project and project.created_from_quotation:
            return project.created_from_quotation.sub_total or Decimal("0.00")
        return (project.contract_value if project else None) or Decimal("0.00")

    @property
    def project_budget_base(self):
        return self.project_budget_base_for(self.project)

    @property
    def quotation_base(self):
        return self.quotation_base_for(self.project)

    @property
    def tax_percentage(self):
        """Tax % of the project's quotation - added on top when this milestone is invoiced."""
        return self.project.quotation_tax_percentage if self.project_id else Decimal("0.00")

    @property
    def budget_percent(self):
        base = self.project_budget_base
        if not base:
            return Decimal("0.00")
        return ((self.budget_amount or Decimal("0.00")) / base * 100).quantize(Decimal("0.01"))

    @property
    def bill_percent(self):
        base = self.quotation_base
        if not base:
            return Decimal("0.00")
        return ((self.billing_amount or Decimal("0.00")) / base * 100).quantize(Decimal("0.01"))

    @property
    def remaining_budget(self):
        return (self.budget_amount or Decimal("0.00")) - self.actual_cost

    @property
    def remaining_billable_amount(self):
        return self.quotation_amount - self.billed_base_amount

    @property
    def budget_utilization_percent(self):
        if not self.budget_amount:
            return Decimal("0.00")
        return (self.actual_cost / self.budget_amount * 100).quantize(Decimal("0.01"))

    @property
    def billing_percent(self):
        if not self.quotation_amount:
            return Decimal("0.00")
        return (self.billed_base_amount / self.quotation_amount * 100).quantize(Decimal("0.01"))

    def _billing_invoices(self):
        return self.invoices.exclude(status='Cancelled')

    @property
    def billed_amount(self):
        total = self._billing_invoices().aggregate(total=models.Sum('total_amount'))['total']
        return total or Decimal("0.00")

    @property
    def billed_base_amount(self):
        """Billed so far before tax - compared against the (pre-tax) quotation amount."""
        total = self._billing_invoices().aggregate(total=models.Sum('sub_total'))['total']
        return total or Decimal("0.00")

    @property
    def received_amount(self):
        total = self._billing_invoices().aggregate(total=models.Sum('paid_amount'))['total']
        return total or Decimal("0.00")

    @property
    def outstanding_amount(self):
        return self.billed_amount - self.received_amount

    @property
    def billing_status(self):
        """Not Billed -> Partially Invoiced -> Invoiced, derived from linked invoices."""
        invoices = self._billing_invoices()
        if not invoices.exists():
            return 'not_billed'
        if self.billing_amount and self.billed_base_amount >= self.billing_amount:
            return 'invoiced'
        return 'partially_invoiced'

    @property
    def payment_status(self):
        """Not Invoiced -> Draft/Sent -> Partially Paid -> Paid -> Overdue, mirroring the linked invoice(s)."""
        invoices = self._billing_invoices()
        if not invoices.exists():
            return 'not_invoiced'
        statuses = set(invoices.values_list('status', flat=True))
        if statuses == {'Paid'}:
            return 'paid'
        if 'Overdue' in statuses:
            return 'overdue'
        if self.received_amount > 0:
            return 'partially_paid'
        if 'Draft' in statuses:
            return 'draft'
        return 'sent'


class ResourceAssignment(models.Model):
    """
    A resource (employee or freelancer) staffed on a Time & Material project
    (see Project.engagement_type == 'time_and_material'). resource_type +
    resource_id mirror the existing Project.poc_type/poc_id pattern above,
    pointing at accounts.Account (employee) or accounts.Vendor (freelancer)
    rather than adding a redundant lookup table.

    working_hours is the resource's actual/planned hours for one billing
    period (not multiplied by allocation_percent again - allocation_percent
    is informational context for how that figure was reached).

    The same record also staffs a Fixed Budget milestone (`milestone` set).
    There the resource's cost is `assigned_cost`: the project/milestone-
    specific `cost_amount` when given, else cost_rate x working_hours
    (planned units). cost_rate starts from the resource master (employee
    charges_per_hour / freelancer rate card) but is a per-assignment copy, so
    overriding it never changes the master. Never derived from timers or
    timesheets.
    """

    RESOURCE_TYPE_CHOICES = [
        ('employee', 'Employee'),
        ('freelancer', 'Freelancer'),
        ('vendor', 'Vendor'),
        # Someone with no Employee / Freelancer / Vendor master record - named on the assignment itself.
        ('external', 'External Resource'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),
        ('removed', 'Removed'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='resource_assignments')
    # Set for a Fixed Budget milestone's resources; null for T&M project-level staffing.
    milestone = models.ForeignKey(
        Milestone, on_delete=models.CASCADE, null=True, blank=True, related_name='resource_assignments'
    )
    resource_type = models.CharField(max_length=20, choices=RESOURCE_TYPE_CHOICES)
    resource_id = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="ID in accounts.Account (employee), freelancer_onboarding.Freelancer (freelancer) "
                  "or accounts.Vendor (vendor), per resource_type. Empty for an external resource."
    )
    # Name of an external resource (resource_type='external') - there is no master record for these.
    external_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=100, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    cost_rate = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(0)],
        help_text="Hourly cost rate."
    )
    billing_rate = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(0)],
        help_text="Hourly rate billed to the client."
    )
    # Project/milestone-specific total cost for this resource. When set it is the
    # resource cost (overrides cost_rate x working_hours); the master rate is untouched.
    cost_amount = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)],
    )
    allocation_percent = models.PositiveIntegerField(default=100, validators=[MaxValueValidator(100)])
    working_hours = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(0)],
        help_text="Hours for one billing period, used to derive Monthly Cost/Billing."
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resource_assignments_created'
    )
    updated_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resource_assignments_updated'
    )

    class Meta:
        ordering = ['-start_date', 'id']

    def __str__(self):
        return f"{self.project.project_name} - {self.role or self.resource_type} #{self.resource_id}"

    def clean(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date cannot be before start date."})
        if self.milestone_id and self.project_id and self.milestone.project_id != self.project_id:
            raise ValidationError({"milestone": "Milestone must belong to the same project."})
        if self.resource_type == 'external':
            if not self.external_name.strip():
                raise ValidationError({"external_name": "Enter the external resource's name."})
        elif not self.resource_id:
            raise ValidationError({"resource_id": "Select a resource."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def resource_name(self):
        if self.resource_type == 'external':
            return self.external_name or None
        if self.resource_type == 'employee':
            from accounts.models import Account
            account = Account.objects.filter(pk=self.resource_id).first()
            return account.display_name if account else None
        if self.resource_type == 'vendor':
            from accounts.models import Vendor
            vendor = Vendor.objects.filter(pk=self.resource_id).first()
            return vendor.name if vendor else None
        # Freelancers are their own model (freelancer_onboarding.Freelancer),
        # not an accounts.Vendor row - see ResourceAssignmentSerializer.validate().
        from freelancer_onboarding.models import Freelancer
        freelancer = Freelancer.objects.filter(pk=self.resource_id).first()
        return freelancer.full_name if freelancer else None

    @property
    def assigned_cost(self):
        """This resource's cost on the project/milestone: the specific cost_amount when set,
        else cost_rate x planned units (working_hours). Not based on timers or timesheets."""
        if self.cost_amount is not None:
            return self.cost_amount
        return (self.cost_rate or Decimal("0.00")) * (self.working_hours or Decimal("0.00"))

    @property
    def is_cost_overridden(self):
        return self.cost_amount is not None

    @property
    def monthly_cost(self):
        return (self.cost_rate or Decimal("0.00")) * (self.working_hours or Decimal("0.00"))

    @property
    def monthly_billing(self):
        return (self.billing_rate or Decimal("0.00")) * (self.working_hours or Decimal("0.00"))




class Task(models.Model):
    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('needs_attention', 'Needs Attention'),
    ]

    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, related_name='tasks')
    title = models.CharField(max_length=255)
    assigned_to = models.ForeignKey(
        "accounts.Account",
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_tasks'
    )
    milestone = models.ForeignKey(
        Milestone,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tasks'
    )
    allocated_hours = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    modified_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "accounts.Account",
        on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_tasks')
    modified_by = models.ForeignKey(
        "accounts.Account",
        on_delete=models.SET_NULL,
        null=True, blank=True, related_name='modified_tasks'
    )

    def __str__(self):
        return self.title

    @property
    def consumed_hours(self):
        """Calculate consumed hours from TaskTimerLog (real-time tracking)"""
        from django.db.models import Sum, Q
        from decimal import Decimal
        
        # Get all completed timer logs for this task
        timer_logs = TaskTimerLog.objects.filter(
            task=self,
            is_active=False,
            end_time__isnull=False,
            start_time__isnull=False
        )
        
        total_seconds = 0
        for log in timer_logs:
            duration = (log.end_time - log.start_time).total_seconds()
            total_seconds += duration
        
        # Convert seconds to hours
        hours = Decimal(total_seconds) / Decimal(3600)
        return hours

    @property
    def remaining_hours(self):
        return max(self.allocated_hours - self.consumed_hours, 0)


class Timesheet(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    week_start = models.DateField()  # Sunday
    week_end = models.DateField()    # Saturday
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('user', 'week_start')

    def __str__(self):
        return f"{self.user} | {self.week_start}"



class TimesheetEntry(models.Model):
    timesheet = models.ForeignKey(
        Timesheet,
        on_delete=models.SET_NULL,
        null=True,
        related_name='entries'
    )
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        related_name='time_entries'
    )
    date = models.DateField()
    hours = models.DecimalField(max_digits=6, decimal_places=4)

    class Meta:
        unique_together = ('timesheet', 'task', 'date')


class TaskTimerLog(models.Model):
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="timer_logs"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)

    duration_minutes = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_extra = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.task} - {self.duration_minutes} mins"
    
    @staticmethod
    def get_total_seconds(task, user):
        logs = TaskTimerLog.objects.filter(task=task, user=user)
        total = 0
        for log in logs:
            if log.end_time:
                total += (log.end_time - log.start_time).total_seconds()
            else:
                total += (timezone.now() - log.start_time).total_seconds()
        return int(total)


class TaskExtraHoursRequest(models.Model):

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="extra_hour_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="extra_hour_requests"
    )

    requested_hours = models.DecimalField(max_digits=7, decimal_places=2)
    reason = models.TextField()
    previous_allocated_hours = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    approved_allocated_hours = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending"
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_extra_requests"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.task.title} | +{self.requested_hours} hrs"
