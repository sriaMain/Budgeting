from rest_framework import serializers
from .models import ProductGroup, Product_Services, QuoteItem, Quote, Tax, UnitOfMeasure
from accounts.models import Vendor
from core.models import GLAccount
from client.models import Company, POC
from client.serializers import  PointOfContactSerializer
from core.app_constants import CURRENCY_CHOICES

ACCOUNTING_PERMISSION = 'catalog.accounting.view'
ACCOUNTING_FIELDS = ('income_account', 'expense_account', 'income_account_label', 'expense_account_label')


def can_see_product_accounting(request):
    """Accounting settings on catalog items are limited to catalog.accounting.view (superusers pass)."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return False
    return bool(getattr(user, 'is_superuser', False) or user.has_role_permission(ACCOUNTING_PERMISSION))


def hrms_resource_options():
    """Department and designation names from synced AIRA HRMS employees (active ones). AIRA sends
    names only, so catalog items store names; switch to IDs once AIRA provides them."""
    from hrms_integration.models import HrmsEmployee
    active = HrmsEmployee.objects.filter(is_active_in_hrms=True)
    departments = sorted({d for d in active.values_list('department', flat=True) if d and d.strip()})
    designations = sorted({d for d in active.values_list('designation', flat=True) if d and d.strip()})
    return departments, designations


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = ['id', 'code', 'name', 'category', 'is_active']


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ['id', 'name', 'rate', 'scope', 'description', 'is_active']

    def validate_name(self, value):
        name = value.strip()
        qs = Tax.objects.filter(name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A tax with this name already exists.")
        return name


class ProductGroupSerializer(serializers.ModelSerializer):
    """Product category. Output keeps the `product_group` key (= name) existing screens read."""

    created_by = serializers.StringRelatedField(read_only=True)
    modified_by = serializers.StringRelatedField(read_only=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ProductGroup.objects.all(), allow_null=True, required=False)
    parent_name = serializers.CharField(source='parent.product_group_name', read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = ProductGroup
        fields = [
            'id',
            'product_group_name',
            'description',
            'parent',
            'parent_name',
            'full_name',
            'is_active',
            'icon',
            'created_by',
            'modified_by',
            'created_at',
            'updated_at',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Rename key from product_group_name -> product_group
        data['product_group'] = data.pop('product_group_name')
        return data

    def validate_product_group_name(self, value):
        name = value.strip()
        qs = ProductGroup.objects.filter(product_group_name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Product group already exists.")
        return name

    def validate(self, attrs):
        parent = attrs.get('parent')
        if parent is not None and self.instance is not None:
            node, seen = parent, set()
            while node is not None and node.pk not in seen:
                if node.pk == self.instance.pk:
                    raise serializers.ValidationError(
                        {"parent": "A category can't be placed under itself or its own sub-category."})
                seen.add(node.pk)
                node = node.parent
        return attrs


class ProductServicesSerializer(serializers.ModelSerializer):
    """
    Products & Services catalog item.
    - Output keeps `product_group` as the category NAME (existing screens read it that way) and
      adds `product_group_id` / `category_path` for the catalog screen.
    - Input takes `product_group` as a primary key.
    - Accounting fields are only shown to / accepted from users with catalog.accounting.view.
    """

    product_group = serializers.PrimaryKeyRelatedField(
        queryset=ProductGroup.objects.all(), allow_null=True, required=False)
    uom = serializers.PrimaryKeyRelatedField(
        queryset=UnitOfMeasure.objects.all(), allow_null=True, required=False)
    purchase_uom = serializers.PrimaryKeyRelatedField(
        queryset=UnitOfMeasure.objects.all(), allow_null=True, required=False)
    sales_tax = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(), allow_null=True, required=False)
    purchase_tax = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(), allow_null=True, required=False)
    preferred_vendor = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(), allow_null=True, required=False)
    income_account = serializers.PrimaryKeyRelatedField(
        queryset=GLAccount.objects.all(), allow_null=True, required=False)
    expense_account = serializers.PrimaryKeyRelatedField(
        queryset=GLAccount.objects.all(), allow_null=True, required=False)
    internal_reference = serializers.CharField(
        max_length=64, allow_blank=True, allow_null=True, required=False)
    suggested_designations = serializers.ListField(
        child=serializers.CharField(max_length=150), required=False, allow_null=True, max_length=20)
    payment_terms_days = serializers.IntegerField(min_value=0, max_value=365, required=False, allow_null=True)
    default_contract_months = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    category_icon = serializers.CharField(source='product_group.icon', read_only=True, default=None)

    product_group_id = serializers.IntegerField(read_only=True)
    category_path = serializers.CharField(source='product_group.full_name', read_only=True, default=None)
    uom_code = serializers.CharField(source='uom.code', read_only=True, default=None)
    uom_name = serializers.CharField(source='uom.name', read_only=True, default=None)
    purchase_uom_name = serializers.CharField(source='purchase_uom.name', read_only=True, default=None)
    sales_tax_name = serializers.CharField(source='sales_tax.name', read_only=True, default=None)
    sales_tax_rate = serializers.DecimalField(
        source='sales_tax.rate', max_digits=5, decimal_places=2, read_only=True, default=None)
    purchase_tax_name = serializers.CharField(source='purchase_tax.name', read_only=True, default=None)
    preferred_vendor_name = serializers.CharField(source='preferred_vendor.name', read_only=True, default=None)
    income_account_label = serializers.SerializerMethodField()
    expense_account_label = serializers.SerializerMethodField()
    # How many quotation / invoice lines use this item (set by the list/detail views).
    usage_count = serializers.SerializerMethodField()

    created_by = serializers.StringRelatedField(read_only=True)
    modified_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Product_Services
        fields = [
            'id',
            'product_group',
            'product_group_id',
            'category_path',
            'product_service_name',
            'description',
            'is_active',
            'internal_reference',
            'product_type',
            'internal_notes',
            'short_description',
            'service_delivery_type',
            'category_icon',
            'can_be_sold',
            'sales_price',
            'uom',
            'uom_code',
            'uom_name',
            'sales_tax',
            'sales_tax_name',
            'sales_tax_rate',
            'invoicing_policy',
            'billing_method',
            'currency',
            'default_discount_percent',
            'payment_terms_days',
            'default_engagement_type',
            'default_contract_months',
            'can_be_purchased',
            'cost_price',
            'purchase_description',
            'purchase_uom',
            'purchase_uom_name',
            'purchase_tax',
            'purchase_tax_name',
            'preferred_vendor',
            'preferred_vendor_name',
            'vendor_reference',
            'cost_currency',
            'procurement_type',
            'department_name',
            'suggested_designations',
            'default_cost_rate',
            'default_billing_rate',
            'estimated_hours',
            'delivery_team_type',
            'income_account',
            'income_account_label',
            'expense_account',
            'expense_account_label',
            'usage_count',
            'created_by',
            'modified_by',
            'created_at',
            'updated_at',
        ]

    @staticmethod
    def _account_label(account):
        return f"{account.code} - {account.name}" if account else None

    def get_income_account_label(self, obj):
        return self._account_label(obj.income_account)

    def get_expense_account_label(self, obj):
        return self._account_label(obj.expense_account)

    def get_usage_count(self, obj):
        quote_lines = getattr(obj, 'quote_line_count', None)
        invoice_lines = getattr(obj, 'invoice_line_count', None)
        if quote_lines is None or invoice_lines is None:
            return None
        return quote_lines + invoice_lines

    def _accounting_allowed(self):
        return can_see_product_accounting(self.context.get('request'))

    def validate_product_service_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Enter the product or service name.")
        qs = Product_Services.objects.filter(product_service_name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product or service with this name already exists.")
        return name

    def validate_internal_reference(self, value):
        ref = (value or '').strip() or None
        if ref:
            qs = Product_Services.objects.filter(internal_reference__iexact=ref)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Another product or service already uses this internal reference.")
        return ref

    def validate_suggested_designations(self, value):
        seen, out = set(), []
        for name in value or []:
            name = name.strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append(name)
        return out

    def _check_hrms_names(self, attrs, errors):
        """Department / designations must be AIRA HRMS values (keeping a value that AIRA later
        renamed is allowed, so saving an unrelated change never fails)."""
        if 'department_name' not in attrs and 'suggested_designations' not in attrs:
            return
        departments, designations = hrms_resource_options()
        dept = (attrs.get('department_name') or '').strip()
        if 'department_name' in attrs:
            attrs['department_name'] = dept
            current = (getattr(self.instance, 'department_name', '') or '') if self.instance else ''
            if dept and dept != current and dept not in departments:
                errors['department_name'] = "Choose a department from AIRA HRMS."
        if attrs.get('suggested_designations'):
            current = set((getattr(self.instance, 'suggested_designations', None) or []) if self.instance else [])
            unknown = [d for d in attrs['suggested_designations'] if d not in designations and d not in current]
            if unknown:
                errors['suggested_designations'] = f"Not an AIRA HRMS designation: {', '.join(unknown)}."

    def _check_active(self, attrs, field, label, errors):
        """A newly chosen unit / tax / category / account must be active (keeping an existing
        one that was archived later is fine)."""
        if field not in attrs or attrs[field] is None:
            return
        current = getattr(self.instance, f'{field}_id', None) if self.instance else None
        if attrs[field].pk != current and not attrs[field].is_active:
            errors[field] = f"This {label} is archived and can't be selected."

    def validate(self, attrs):
        if not self._accounting_allowed():
            # Silently ignore accounting fields from users who can't see them.
            attrs.pop('income_account', None)
            attrs.pop('expense_account', None)

        errors = {}
        self._check_hrms_names(attrs, errors)
        self._check_active(attrs, 'product_group', 'category', errors)
        self._check_active(attrs, 'uom', 'unit', errors)
        self._check_active(attrs, 'purchase_uom', 'unit', errors)
        self._check_active(attrs, 'sales_tax', 'tax', errors)
        self._check_active(attrs, 'purchase_tax', 'tax', errors)
        self._check_active(attrs, 'income_account', 'account', errors)
        self._check_active(attrs, 'expense_account', 'account', errors)
        if attrs.get('sales_tax') is not None and attrs['sales_tax'].scope == 'purchase':
            errors['sales_tax'] = "This tax is for purchases only."
        if attrs.get('purchase_tax') is not None and attrs['purchase_tax'].scope == 'sale':
            errors['purchase_tax'] = "This tax is for sales only."
        if attrs.get('income_account') is not None and attrs['income_account'].account_type not in ('', 'income'):
            errors['income_account'] = "Choose an income account."
        if attrs.get('expense_account') is not None and attrs['expense_account'].account_type not in ('', 'expense'):
            errors['expense_account'] = "Choose an expense account."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['modified_by'] = request.user
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['product_group'] = instance.product_group.product_group_name if instance.product_group else None
        if not self._accounting_allowed():
            for field in ACCOUNTING_FIELDS:
                data.pop(field, None)
        return data

class QuoteItemSerializer(serializers.ModelSerializer):
    product_service = serializers.PrimaryKeyRelatedField(
        queryset=Product_Services.objects.all(),
        required=True
    )

    quantity = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=1
    )

    price_per_unit = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0
    )

    class Meta:
        model = QuoteItem
        fields = [
            "id",
            "product_service",
            "description",
            "quantity",
            "unit",
            "price_per_unit",
            "cost",
            "po_number",
            "bill_number",
            "amount",
        ]
        read_only_fields = ["amount"]


from django.db import transaction
from finances.models import PurchaseOrderItem
from Project.models import Project

class QuoteSerializer(serializers.ModelSerializer):
    items = QuoteItemSerializer(many=True, write_only=True)

    client = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.all()
    )
    client_name = serializers.StringRelatedField(
        source="client", read_only=True
    )

    poc = serializers.PrimaryKeyRelatedField(
        queryset=POC.objects.all(),
        allow_null=True,
        required=False
    )
    poc_name = serializers.StringRelatedField(
        source="poc", read_only=True
    )
    currency = serializers.ChoiceField(
        choices=CURRENCY_CHOICES,
        required=False
    )
    project = serializers.PrimaryKeyRelatedField(
        source='linked_project',
        queryset=Project.objects.all(),
        allow_null=True,
        required=False
    )

    call_center_name = serializers.CharField(source="call_center.name", read_only=True, default=None)
    profit_center_name = serializers.CharField(source="profit_center.name", read_only=True, default=None)
    gl_account_name = serializers.CharField(source="gl_account.name", read_only=True, default=None)

    created_by = serializers.StringRelatedField(read_only=True)
    modified_by = serializers.StringRelatedField(read_only=True)
    author = serializers.StringRelatedField(read_only=True)

    has_project = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = [
            "quote_no",
            "quote_name",
            "date_of_issue",
            "due_date",
            "status",
            "client",
            "client_name",
            "poc",
            "poc_name",
            "author",
            "sub_total",
            "tax_percentage",
            "total_amount",
            "total_cost",
            "in_house_cost",
            "outsourced_cost",
            "invoiced_sum",
            "to_be_invoiced_sum",
            "created_at",
            "updated_at",
            "created_by",
            "modified_by",
            "items",
            "has_project",
            "currency",
            "project",
            "call_center",
            "call_center_name",
            "profit_center",
            "profit_center_name",
            "gl_account",
            "gl_account_name",
        ]
        read_only_fields = (
            "quote_no",
            "created_at",
            "updated_at",
            "sub_total",
            "total_amount",
            "total_cost",
        )


    def to_internal_value(self, data):
        data = data.copy()
        items = data.get("items")

        if self.instance and items is not None:
            cleaned = [
                i for i in items
                if isinstance(i, dict)
                and i.get("product_service") is not None
                and i.get("quantity") not in (None, 0, "")
            ]

            if cleaned:
                data["items"] = cleaned
            else:
                data.pop("items", None)

        return super().to_internal_value(data)


    def validate(self, data):
        

        instance = self.instance
        new_status = data.get("status")

        if instance and new_status:
            current = instance.status

            # ✅ SAME STATUS
            if current == new_status:
                raise serializers.ValidationError(
                    {"error": f"Quote is already in '{current}' status."}
                )

            # ❌ IMMUTABLE STATES
            if current in ["Cancelled", "Closed"]:
                raise serializers.ValidationError(
                    {"error": f"{current} quotations cannot be modified."}
                )

            # ❌ CONFIRMED → backward
            if current == "Confirmed" and new_status in [
                "Oppurtunity", "Scoping", "Proposal"
            ]:
                raise serializers.ValidationError(
                    {"error": "Confirmed quotations cannot be moved back."}
                )

            # ❌ PROJECT EXISTS (but allow closing a Confirmed quote whose
            # project has been completed)
            is_confirmed_to_closed = current == "Confirmed" and new_status == "Closed"
            if not is_confirmed_to_closed and Project.objects.filter(
                created_from_quotation=instance.quote_no
            ).exists():
                raise serializers.ValidationError(
                    {"error": "A project already exists for this quotation."}
                )

        # ❌ BLOCK ITEM UPDATE IF PO EXISTS
        if instance and data.get("items"):
            if PurchaseOrderItem.objects.filter(
                quote_item__quote=instance
            ).exists():
                raise serializers.ValidationError(
                    {
                        "error": (
                            "Quote items cannot be modified because "
                            "they are already linked to a Purchase Order."
                        )
                    }
                )

        # 🔴 CREATE requires items
        if not instance and not data.get("items"): 
            raise serializers.ValidationError(
                {"items": "At least one valid item is required."}
            )

        return data


    def get_has_project(self, obj):
        from Project.models import Project
        return Project.objects.filter(
            created_from_quotation=obj.quote_no
        ).exists() or obj.linked_project_id is not None

	
    def _create_items(self, quote, items_data):
        for item in items_data:
            QuoteItem.objects.create(quote=quote, **item)

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        # A new quote is always saved as Confirmed - whatever (if anything)
        # the client sent. Later status moves (Closed, Cancelled...) go
        # through update() and validate() as before.
        validated_data["status"] = "Confirmed"
        with transaction.atomic():
            quote = Quote.objects.create(**validated_data)
            self._create_items(quote, items_data)
        return quote

    def update(self, instance, validated_data):
       

        items_data = validated_data.pop("items", None)

        with transaction.atomic():
            # ✅ Update normal fields
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            # ✅ Update items ONLY if allowed
            if items_data is not None:
                po_exists = PurchaseOrderItem.objects.filter(
                    quote_item__quote=instance
                ).exists()

                if po_exists:
                    raise serializers.ValidationError(
                        {
                            "error": (
                                "Quote items cannot be modified because "
                                "they are already used in a Purchase Order."
                            )
                        }
                    )

                instance.items.all().delete()
                self._create_items(instance, items_data)

        return instance



class ProductServiceModuleSerializer(serializers.ModelSerializer):
	module_id = serializers.IntegerField(source='id')
	module_name = serializers.CharField(source='product_service_name')
	# Catalog defaults a quotation line can pre-fill from.
	uom_code = serializers.CharField(source='uom.code', read_only=True, default=None)
	sales_tax_rate = serializers.DecimalField(
		source='sales_tax.rate', max_digits=5, decimal_places=2, read_only=True, default=None)

	class Meta:
		model = Product_Services
		fields = ['module_id', 'module_name', 'description', 'is_active',
		          'internal_reference', 'sales_price', 'uom_code', 'sales_tax_rate']

class ProductGroupWithModulesSerializer(serializers.ModelSerializer):
	group_id = serializers.IntegerField(source='id')
	group_name = serializers.CharField(source='product_group_name')
	# Quotation picker: only items that can be sold.
	modules = serializers.SerializerMethodField()

	def get_modules(self, obj):
		items = [p for p in obj.products_services.all() if p.can_be_sold]
		return ProductServiceModuleSerializer(items, many=True).data

	class Meta:
		model = ProductGroup
		fields = ['group_id', 'group_name', 'description', 'modules']

from core.app_constants import CURRENCY_CHOICES


class QuoteSummarySerializer(serializers.ModelSerializer):
    client_id = serializers.IntegerField(allow_null=True)
    client_name = serializers.StringRelatedField(source='client')
    has_project = serializers.SerializerMethodField()
    quote_value = serializers.DecimalField(
        source="total_amount",   
        max_digits=15,
        decimal_places=2,
        read_only=True
    )

    currency = serializers.ChoiceField(
        choices=CURRENCY_CHOICES,
        read_only=True
    )

    call_center_name = serializers.CharField(source='call_center.name', read_only=True, default=None)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True, default=None)
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True, default=None)

    class Meta:
        model = Quote
        fields = [
            'quote_no',
            'client_id',
            'client_name',
            'quote_name',
            'date_of_issue',
            'quote_value',
            'status',
            'has_project',
            'currency',
            'call_center_name',
            'profit_center_name',
            'gl_account_name',
        ]

    def get_has_project(self, obj):
        from Project.models import Project
        return Project.objects.filter(
            created_from_quotation=obj.quote_no
        ).exists() or obj.linked_project_id is not None



from finances.models import  InvoiceItem
from .models import Quote, QuoteItem
from django.db.models import Sum
from decimal import Decimal
class QuoteItemDetailSerializer(serializers.ModelSerializer):
	product_group = serializers.CharField(source='product_service.product_group.product_group_name', read_only=True)
	product_name = serializers.CharField(source='product_service.product_service_name', read_only=True)
	remaining_quantity = serializers.SerializerMethodField()

	class Meta:
		model = QuoteItem
		fields = [
			'id',
			'product_group',
			'product_name',
			'quantity',
			'unit',
			'price_per_unit',
			'amount',
			'po_number',
			'bill_number',
			'remaining_quantity',
		]

	def get_remaining_quantity(self, obj):
		invoiced_sum = InvoiceItem.objects.filter(
			invoice__quote=obj.quote,
			product_service_id=obj.product_service_id
		).aggregate(total=Sum('quantity'))['total']
		invoiced_sum = invoiced_sum or Decimal('0')
		remaining = Decimal(str(obj.quantity)) - invoiced_sum
		return Decimal('0') if remaining < 0 else remaining

class ClientDetailSerializer(serializers.ModelSerializer):
    pocs = PointOfContactSerializer(many=True, read_only=True)

    class Meta:
        model = Company
        fields = [
            'company_name',
            'street_address',
            'city',
            'state',
            'country',
            'pocs',
        ]


class QuoteDetailSerializer(serializers.ModelSerializer):
    author = serializers.StringRelatedField()
    client = ClientDetailSerializer(read_only=True)
    items = QuoteItemDetailSerializer(many=True, read_only=True)
    has_project = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    currency = serializers.ChoiceField(
        choices=CURRENCY_CHOICES,
        required=False
    )

    class Meta:
        model = Quote
        fields = [
            'quote_no',
            'quote_name',
            'date_of_issue',
            'due_date',
            'status',
            'author',
            'client',
            'currency', 
            'sub_total',
            'tax_percentage',
            'total_amount',
            'total_cost',
            'in_house_cost',
            'outsourced_cost',
            'invoiced_sum',
            'to_be_invoiced_sum',
            'items',
            'has_project',
            'project',
        ]

    def get_project(self, obj):
        from Project.models import Project

        project = Project.objects.filter(
            created_from_quotation=obj
        ).first() or obj.linked_project

        if not project:
            return None

        return {
            "project_id": project.project_no,
            "project_name": project.project_name
        }

    def get_has_project(self, obj):
        from Project.models import Project
        return Project.objects.filter(
            created_from_quotation=obj
        ).exists() or obj.linked_project_id is not None
