from rest_framework import serializers
from .models import ProductGroup, Product_Services, QuoteItem, Quote
from client.models import Company, POC
from client.serializers import  PointOfContactSerializer
from core.app_constants import CURRENCY_CHOICES

class ProductGroupSerializer(serializers.ModelSerializer):
 
	created_by = serializers.StringRelatedField(read_only=True)
	modified_by = serializers.StringRelatedField(read_only=True)
	class Meta:
		model = ProductGroup
		fields = [
			'id',
			'product_group_name',
			'description',
			'created_by',
			'modified_by',
			'created_at',
			'updated_at'
		]
 
	def to_representation(self, instance):
		data = super().to_representation(instance)
 
		# Rename key from product_group_name -> product_group
		data['product_group'] = data.pop('product_group_name')
 
		return data
 
	def get_modified_by(self, obj):
		return obj.modified_by.username if obj.modified_by else None
   
 
	def validate_product_group_name(self, value):
		if ProductGroup.objects.filter(product_group_name__iexact=value).exists():
			raise serializers.ValidationError("Product group already exists.")
		return value
	
class ProductServicesSerializer(serializers.ModelSerializer):
	"""
	Serializer for Product_Services.
	- On GET → show product_group object or product_group_name (if nested).
	- On POST/PUT → accept product_group as integer primary key.
	"""

	product_group = serializers.PrimaryKeyRelatedField(
		queryset=ProductGroup.objects.all(),
		allow_null=True
	)

	created_by = serializers.StringRelatedField(read_only=True)
	modified_by = serializers.StringRelatedField(read_only=True)

	class Meta:
		model = Product_Services
		fields = [
			'id',
			'product_group',
			'product_service_name',
			'description',
			'is_active',
			'created_by',
			'modified_by',
			'created_at',
			'updated_at',
		]

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
		if instance.product_group:
			data['product_group'] = instance.product_group.product_group_name
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

            # ❌ PROJECT EXISTS
            if Project.objects.filter(
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
        return Project.objects.filter(created_from_quotation=obj.quote_no).exists()

	
    def _create_items(self, quote, items_data):
        for item in items_data:
            QuoteItem.objects.create(quote=quote, **item)

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
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

	class Meta:
		model = Product_Services
		fields = ['module_id', 'module_name', 'description', 'is_active']

class ProductGroupWithModulesSerializer(serializers.ModelSerializer):
	group_id = serializers.IntegerField(source='id')
	group_name = serializers.CharField(source='product_group_name')
	modules = ProductServiceModuleSerializer(source='products_services', many=True)

	class Meta:
		model = ProductGroup
		fields = ['group_id', 'group_name', 'description', 'modules']

from core.app_constants import CURRENCY_CHOICES


class QuoteSummarySerializer(serializers.ModelSerializer):
    client_id = serializers.IntegerField(source='client.id')
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
        ]

    def get_has_project(self, obj):
        from Project.models import Project
        return Project.objects.filter(
            created_from_quotation=obj.quote_no
        ).exists()



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
        ).first()

        if not project:
            return None

        return {
            "project_id": project.project_no,
            "project_name": project.project_name
        }

    def get_has_project(self, obj):
        from Project.models import Project
        return Project.objects.filter(created_from_quotation=obj).exists()
