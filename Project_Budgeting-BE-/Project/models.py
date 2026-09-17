
from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from django.utils import timezone
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
    # Shared by both engagement types
    payment_terms = models.CharField(
        max_length=100, blank=True, help_text="e.g. Net 30, Net 15, Due on Receipt."
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

        if self.end_date < self.start_date:
            raise ValidationError("End date cannot be before start date.")

        self.full_clean()
        super().save(*args, **kwargs)

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
        Real expenses logged against the project (Finances > Expenses tab).
        Falls back to the quoted/manual bills_and_expenses estimate when no
        real expense has been logged yet.
        """
        if not self.project:
            return self.bills_and_expenses or 0

        logged = self.project.expenses.aggregate(
            total=models.Sum('amount')
        )['total']

        if logged:
            return logged
        return self.bills_and_expenses or 0

    @property
    def forecasted_profit(self):
            """
            Expected profit based on current budget and expenses
            """
            if self.total_budget is None:
                return None
            return self.total_budget - self.actual_expenses


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
        """Real spend logged against this project under this GL Account."""
        if not self.budget_id or not self.budget.project_id:
            return Decimal("0.00")

        total = self.budget.project.expenses.filter(
            gl_account=self.gl_account
        ).aggregate(total=models.Sum('amount'))['total']
        return total or Decimal("0.00")

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


class Milestone(models.Model):
    """
    A phase of a Fixed Budget / Milestone-Based project's contract (see
    Project.engagement_type == 'fixed'). Billing/payment status and actual
    cost are derived from the finances app (Invoice, InvoicePayment,
    Expense) rather than stored, so they can never drift from the
    underlying transactions:

        Milestone -> Invoice (finances.Invoice.milestone) -> InvoicePayment
        Milestone -> Expense (finances.Expense.milestone) -> actual_cost
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
    @property
    def actual_cost(self):
        total = self.expenses.aggregate(total=models.Sum('amount'))['total']
        return total or Decimal("0.00")

    @property
    def margin(self):
        return (self.billing_amount or Decimal("0.00")) - self.actual_cost

    def _billing_invoices(self):
        return self.invoices.exclude(status='Cancelled')

    @property
    def billed_amount(self):
        total = self._billing_invoices().aggregate(total=models.Sum('total_amount'))['total']
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
        if self.billing_amount and self.billed_amount >= self.billing_amount:
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
    """

    RESOURCE_TYPE_CHOICES = [
        ('employee', 'Employee'),
        ('freelancer', 'Freelancer'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),
        ('removed', 'Removed'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='resource_assignments')
    resource_type = models.CharField(max_length=20, choices=RESOURCE_TYPE_CHOICES)
    resource_id = models.PositiveIntegerField(
        help_text="ID in accounts.Account (employee) or accounts.Vendor (freelancer), per resource_type."
    )
    role = models.CharField(max_length=100, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    cost_rate = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)],
        help_text="Hourly cost rate."
    )
    billing_rate = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)],
        help_text="Hourly rate billed to the client."
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

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def resource_name(self):
        if self.resource_type == 'employee':
            from accounts.models import Account
            account = Account.objects.filter(pk=self.resource_id).first()
            return account.display_name if account else None
        from accounts.models import Vendor
        vendor = Vendor.objects.filter(pk=self.resource_id).first()
        return vendor.name if vendor else None

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
    allocated_hours = models.DecimalField(max_digits=5, decimal_places=2)
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
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    approved_allocated_hours = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
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
