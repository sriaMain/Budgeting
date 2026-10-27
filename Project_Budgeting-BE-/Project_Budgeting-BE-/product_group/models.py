from django.db import models
from django.core.exceptions import ValidationError, ObjectDoesNotExist
from django.core.validators import MaxValueValidator, MinValueValidator
from django.conf import settings
from django.db.models import Sum
from decimal import Decimal
from core.app_constants import CURRENCY_CHOICES


class UnitOfMeasure(models.Model):
    """Controlled list of units for the Products & Services catalog. `code` matches the unit
    values quotation / invoice lines already store (pieces, hours, days...), so lines keep
    saving the code as a snapshot and nothing on existing documents changes."""

    CATEGORY_CHOICES = [
        ('unit', 'Unit'),
        ('time', 'Time'),
        ('billing', 'Billing'),
    ]

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=50)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='unit')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return self.name


class Tax(models.Model):
    """A tax rate offered on catalog items. Quotations / invoices still apply one tax % per
    document; a product's default tax pre-fills it."""

    SCOPE_CHOICES = [
        ('sale', 'Sales'),
        ('purchase', 'Purchases'),
        ('both', 'Sales & Purchases'),
    ]

    name = models.CharField(max_length=100, unique=True)
    rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        help_text="Percentage, e.g. 18.00",
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES, default='both')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['rate', 'name']

    def __str__(self):
        return f"{self.name} ({self.rate}%)"


# Product categories ("Product Groups" in the existing UI and APIs).
class ProductGroup(models.Model):
    product_group_name = models.CharField(max_length=100, unique=True)
    # Optional parent for a category tree (e.g. Services / Development); null = top level.
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    is_active = models.BooleanField(default=True, db_default=True)
    # Icon key shown on catalog cards (e.g. 'globe', 'bot'); blank = picked from the name.
    icon = models.CharField(max_length=40, blank=True, default='', db_default='')
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, related_name='product_groups_created', null=True)
    modified_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, related_name='product_groups_updated', null=True)

    def __str__(self):
        return self.product_group_name
    
    def clean(self):
        name = self.product_group_name.strip().lower()
        if ProductGroup.objects.filter(product_group_name__iexact=name).exclude(id=self.id).exists():
            raise ValidationError("Product Group with this name already exists (case insensitive).")
        # A category can't sit under itself or one of its own sub-categories.
        node, seen = self.parent, set()
        while node is not None and node.pk not in seen:
            if self.pk and node.pk == self.pk:
                raise ValidationError({"parent": "A category can't be placed under itself or its own sub-category."})
            seen.add(node.pk)
            node = node.parent

    @property
    def full_name(self):
        """'Parent / Child' path for display."""
        names, node, seen = [], self, set()
        while node is not None and node.pk not in seen:
            names.append(node.product_group_name)
            seen.add(node.pk)
            node = node.parent
        return " / ".join(reversed(names))

    def save(self, *args, **kwargs):
    # only clean the name if needed
        self.product_group_name = self.product_group_name.strip()
        super().save(*args, **kwargs)



class Product_Services(models.Model):
    # UNIT_CHOICES = [
    #     ('pieces', 'Pieces'),
    #     ('hours', 'Hours'),
    #     ('days', 'Days'),
    #     ('minutes', 'Minutes'),
    # ]
    # unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pieces')
    product_service_name = models.CharField(max_length=100, unique=True)
    product_group = models.ForeignKey(ProductGroup, on_delete=models.SET_NULL, related_name='products_services', null=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, related_name='products_services_created', null=True)
    modified_by = models.ForeignKey(
        'accounts.Account', on_delete=models.SET_NULL, related_name='products_services_updated', null=True)
    # False = archived: hidden from pickers, but quotes / invoices that use it keep working.
    is_active = models.BooleanField(default=True)

    # ---- Products & Services catalog (Odoo-style). Every field below is optional or defaulted,
    # so existing rows, the old Modules screen and existing API clients keep working. Required
    # columns also carry a db_default, so code that doesn't know these columns yet (a teammate
    # on an older branch, the old process during a deploy) can still insert rows. ----
    PRODUCT_TYPE_CHOICES = [
        ('service', 'Service'),
        ('consumable', 'Physical Product'),
        ('digital', 'Digital Product / Licence'),
    ]
    SERVICE_DELIVERY_CHOICES = [
        ('fixed_price', 'Fixed-Price Project'),
        ('time_material', 'Time & Material'),
        ('hourly', 'Hourly Service'),
        ('daily', 'Daily Service'),
        ('milestone', 'Milestone-Based Project'),
        ('retainer', 'Monthly Retainer'),
        ('subscription', 'Recurring Subscription'),
    ]
    # Same values as Project.ENGAGEMENT_TYPE_CHOICES (kept local to avoid importing Project here).
    ENGAGEMENT_TYPE_CHOICES = [
        ('fixed', 'Fixed Budget / Milestone-Based'),
        ('time_and_material', 'Time & Material (T&M)'),
    ]
    PROCUREMENT_TYPE_CHOICES = [
        ('subcontract', 'Subcontracted development'),
        ('freelancer', 'Freelancer / contractor'),
        ('software_license', 'Software licence / subscription'),
        ('cloud', 'Cloud / hosting'),
        ('hardware', 'Hardware'),
        ('other', 'Other third-party'),
    ]
    DELIVERY_TEAM_CHOICES = [
        ('internal', 'Internal team'),
        ('freelancer', 'Freelancers'),
        ('vendor', 'Vendor / partner'),
        ('mixed', 'Mixed team'),
    ]
    INVOICING_POLICY_CHOICES = [
        ('ordered', 'Ordered quantities'),
        ('delivered', 'Delivered quantities'),
    ]
    BILLING_METHOD_CHOICES = [
        ('fixed', 'Fixed price'),
        ('hourly', 'Hourly'),
        ('milestone', 'Milestone-based'),
    ]

    # Internal reference / SKU - unique when set (NULL when empty so blanks don't clash).
    internal_reference = models.CharField(max_length=64, unique=True, null=True, blank=True)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES, default='service', db_default='service')
    internal_notes = models.TextField(blank=True, default='', db_default='')
    # One-line summary for catalog cards; the full sales text is `description`.
    short_description = models.CharField(max_length=255, blank=True, default='', db_default='')
    # Services only: how the work is sold and billed (drives which settings the form shows).
    service_delivery_type = models.CharField(
        max_length=20, choices=SERVICE_DELIVERY_CHOICES, blank=True, default='', db_default='')

    # Sales
    can_be_sold = models.BooleanField(default=True, db_default=True)
    sales_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'), db_default=Decimal('0.00'), validators=[MinValueValidator(Decimal('0'))])
    # The sales description is the existing `description` field (the default quote-line text).
    uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, null=True, blank=True, related_name='products')
    sales_tax = models.ForeignKey(
        Tax, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales_products')
    invoicing_policy = models.CharField(max_length=20, choices=INVOICING_POLICY_CHOICES, default='ordered', db_default='ordered')
    # Superseded by service_delivery_type (kept so existing values aren't lost).
    billing_method = models.CharField(max_length=20, choices=BILLING_METHOD_CHOICES, blank=True, default='', db_default='')
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='INR', db_default='INR')
    default_discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'), db_default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))])
    payment_terms_days = models.PositiveSmallIntegerField(null=True, blank=True, help_text="e.g. 30 = Net 30")
    default_engagement_type = models.CharField(
        max_length=20, choices=ENGAGEMENT_TYPE_CHOICES, blank=True, default='', db_default='',
        help_text="Default project type when this service starts a project.")
    default_contract_months = models.PositiveSmallIntegerField(null=True, blank=True)

    # Purchase
    can_be_purchased = models.BooleanField(default=False, db_default=False)
    cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'), db_default=Decimal('0.00'), validators=[MinValueValidator(Decimal('0'))])
    purchase_description = models.TextField(blank=True, default='', db_default='')
    purchase_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, null=True, blank=True, related_name='purchase_products')
    purchase_tax = models.ForeignKey(
        Tax, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_products')
    preferred_vendor = models.ForeignKey(
        'accounts.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='catalog_products')
    # External (supplier / third-party) cost only - internal staff cost comes from resource costing.
    vendor_reference = models.CharField(max_length=100, blank=True, default='', db_default='')
    cost_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='INR', db_default='INR')
    procurement_type = models.CharField(
        max_length=20, choices=PROCUREMENT_TYPE_CHOICES, blank=True, default='', db_default='')

    # Resource & delivery (services). Department / designations are AIRA HRMS names (AIRA sends no
    # IDs yet); they drive resource suggestions only and never restrict who can be assigned.
    department_name = models.CharField(max_length=150, blank=True, default='', db_default='')
    suggested_designations = models.JSONField(default=list, blank=True, null=True)
    default_cost_rate = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal('0'))],
        help_text="Indicative internal cost per hour for estimates; actual staff cost comes from resource costing.")
    default_billing_rate = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal('0'))])
    estimated_hours = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal('0'))])
    delivery_team_type = models.CharField(
        max_length=20, choices=DELIVERY_TEAM_CHOICES, blank=True, default='', db_default='')

    # Accounting - reuses the existing chart of accounts (core.GLAccount).
    income_account = models.ForeignKey(
        'core.GLAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='income_products')
    expense_account = models.ForeignKey(
        'core.GLAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_products')

    class Meta:
        ordering = ['product_service_name']

    def __str__(self):
        return self.product_service_name

    def clean(self):
        self.internal_reference = (self.internal_reference or '').strip() or None
        errors = {}
        if self.internal_reference and Product_Services.objects.filter(
                internal_reference__iexact=self.internal_reference).exclude(pk=self.pk).exists():
            errors['internal_reference'] = "Another product or service already uses this internal reference."
        if Product_Services.objects.filter(
                product_service_name__iexact=(self.product_service_name or '').strip()).exclude(pk=self.pk).exists():
            errors['product_service_name'] = "A product or service with this name already exists."
        if errors:
            raise ValidationError(errors)
    

class Quote(models.Model):

    STATUS_CHOICES = [
        ('Oppurtunity', 'Oppurtunity'),
        ('Scoping', 'Scoping'),
        ('Proposal', 'Proposal'),
        ('Confirmed', 'Confirmed'),
        ('Rejected', 'Rejected'),
        ('Closed', 'Closed'),
        ('Cancelled', 'Cancelled'),
    ]
    quote_no = models.AutoField(primary_key=True)
    quote_name = models.CharField(max_length=100)
    date_of_issue = models.DateField()
    due_date = models.DateField()
    # New quotes are created Confirmed (QuoteSerializer.create enforces it);
    # the earlier stages remain only for historical quotes.
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Confirmed')

    
    # Link to the Client and POC models
    client = models.ForeignKey('client.Company', on_delete=models.SET_NULL, related_name='quotes', null=True)
    poc = models.ForeignKey('client.POC', on_delete=models.SET_NULL, related_name='quotes', null=True)

    # Accounting attribution, carried over to the Project created from this
    # quote once it's Confirmed (see Project.call_center/profit_center/gl_account).
    call_center = models.ForeignKey(
        'core.CallCenter', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotes'
    )
    profit_center = models.ForeignKey(
        'core.ProfitCenter', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotes'
    )
    gl_account = models.ForeignKey(
        'core.GLAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='quotes'
    )

    # Optional link to an existing Project this quote was added to
    # (e.g. a follow-up/phase-2 quote raised against an already-created project).
    # Distinct from Project.created_from_quotation, which tracks the single
    # quote a project was originally created from (and whose related_name
    # 'project' is already used elsewhere as the reverse accessor).
    linked_project = models.ForeignKey(
        'Project.Project', on_delete=models.SET_NULL, related_name='linked_quotes', null=True, blank=True
    )
    
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='authored_quotes', null=True)
    
    # Summary fields can be calculated or stored
    sub_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    total_cost = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    in_house_cost = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    outsourced_cost = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    invoiced_sum = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    to_be_invoiced_sum = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(
    max_length=3,
    choices=CURRENCY_CHOICES,
    default="INR"
)

    # # Cost and invoicing summary
    # total_cost = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal("0.00"))
    # in_house_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    # outsourced_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    # invoiced_sum = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    # to_be_invoiced_sum = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='created_quotes', null=True)
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='updated_quotes', null=True)

    def __str__(self):
        return f"Quote {self.quote_no} - {self.quote_name}"

    def calculate_totals(self):

        self.sub_total = (
            self.items.aggregate(total=Sum('amount'))['total']
            or Decimal("0.00")
        )

        tax = self.sub_total * (self.tax_percentage / Decimal("100"))
        self.total_amount = self.sub_total + tax

        # SAFETY CONVERSION
        invoiced = self.invoiced_sum or Decimal("0.00")

        self.to_be_invoiced_sum = self.total_amount - Decimal(invoiced)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._sync_linked_project_budget()

    def _sync_linked_project_budget(self):
        """
        Keep the project's budget (hours/amount totals) up to date with this
        quote — whether it's the quote a project was originally created from,
        or a follow-up/phase quote added later via the project's Finances tab.
        Only projects using quoted amounts (not manual budgets) are affected.
        """
        project = self.linked_project
        if project is None:
            try:
                project = self.project  # reverse of Project.created_from_quotation
            except ObjectDoesNotExist:
                project = None

        if not project:
            return

        try:
            budget = project.budget
        except ObjectDoesNotExist:
            return

        if not budget.use_quoted_amounts:
            return

        try:
            budget.apply_quoted_amounts()
        except ValidationError:
            return

        budget.save(update_fields=['total_hours', 'total_budget', 'bills_and_expenses', 'currency'])

class QuoteItem(models.Model):
    """
    This new model stores each individual line item for a quote.
    """
    UNIT_CHOICES = [
        ('pieces', 'Pieces'),
        ('hours', 'Hours'),
        ('days', 'Days'),
        ('minutes', 'Minutes'),
        ('months', 'Months'),
        ('fixed', 'Fixed Price'),
    ]
    # Link each item back to its parent Quote
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name='items')
    
    # The product/service chosen for this line
    product_service = models.ForeignKey(
        Product_Services,
        on_delete=models.PROTECT,
        null=False,
        blank=False
    )
    
    # You can override the default description
    description = models.TextField(blank=True)
    
    quantity = models.PositiveIntegerField()
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='pieces')
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    # This can be calculated automatically on save
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        editable=False
    )

    # ✅ EXECUTION DECISION (MOST IMPORTANT)
    is_outsourced = models.BooleanField(
        default=False,
        help_text="If true, this item requires Purchase Order"
    )
    # Optional tracking numbers
    po_number = models.CharField(max_length=50, blank=True, null=True)
    bill_number = models.CharField(max_length=50, blank=True, null=True)
    

    def save(self, *args, **kwargs):
        self.full_clean()  # 🔒 enforce validation
        self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)
    def __str__(self):
        return f"Item for Quote {self.quote.quote_no}: {self.product_service.product_service_name}"
    
    def save(self, *args, **kwargs):
        self.full_clean()
        self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)

        # 🔥 update quote totals
        quote = self.quote
        quote.calculate_totals()
        quote.save(update_fields=[
            'sub_total',
            'total_amount',
            'to_be_invoiced_sum'
        ])

    def delete(self, *args, **kwargs):
        quote = self.quote
        super().delete(*args, **kwargs)

        quote.calculate_totals()
        quote.save(update_fields=[
            'sub_total',
            'total_amount',
            'to_be_invoiced_sum'
        ])