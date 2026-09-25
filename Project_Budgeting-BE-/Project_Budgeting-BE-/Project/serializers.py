from decimal import Decimal
from rest_framework import serializers
from .models import (Project, ProjectBudget, BudgetLine, Milestone, ResourceAssignment, Task, Timesheet,
                      TimesheetEntry, TaskTimerLog, TaskExtraHoursRequest)
from core.models import GLAccount
from django.core.exceptions import ObjectDoesNotExist
from accounts.models import Account
from client.serializers import PointOfContactSerializer

# class ProjectBudgetSerializer(serializers.ModelSerializer):
#     forecasted_profit = serializers.DecimalField(
#         max_digits=12, decimal_places=2, read_only=True
#     )

#     class Meta:
#         model = ProjectBudget
#         fields = (
#             'use_quoted_amounts',
#             'total_hours',
#             'total_budget',
#             'bills_and_expenses',
#             'currency',
#             'forecasted_profit',
#         )

#     def validate(self, data):
#         project_type = self.context.get('project_type')

#         # Quoted amounts → model will fill values
#         if data.get('use_quoted_amounts'):
#             return data

#         # Manual budget
#         if project_type == 'external':
#             # STRICT for external
#             missing = []
#             if not data.get('total_hours'):
#                 missing.append("total hours")
#             if not data.get('total_budget'):
#                 missing.append("total budget")

#             if missing:
#                 raise serializers.ValidationError(
#                     f"{', '.join(missing)} is required"
#                 )

#         # Internal → manual budget is OPTIONAL
#         return data
from django.db.models import Sum
from rest_framework import serializers
from decimal import Decimal

class BudgetLineSerializer(serializers.ModelSerializer):
    """
    One GL-Account-tagged row of a project's budget. `gl_account` is a
    PrimaryKeyRelatedField into core.GLAccount (the same Chart-of-Accounts
    table used across the app) so the frontend renders it as a searchable
    dropdown rather than free text, while still keeping the account's own
    code/id available for later mapping to another accounting platform.
    """

    # Description / GL Account / Planned Amount are the three required
    # fields on a budget line -- explicit declarations here (instead of
    # relying on the plain model-derived fields) so every missing/invalid
    # value comes back as a clear, specific message the form can show
    # inline rather than a generic DRF default.
    description = serializers.CharField(
        max_length=255,
        error_messages={
            "required": "Description is required.",
            "blank": "Description is required.",
        },
    )
    gl_account = serializers.PrimaryKeyRelatedField(
        queryset=GLAccount.objects.all(),
        error_messages={
            "required": "GL Account is required.",
            "null": "GL Account is required.",
            "does_not_exist": "Selected GL Account does not exist.",
        },
    )
    planned_amount = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        min_value=Decimal("0.01"),
        error_messages={
            "required": "Planned amount is required.",
            "min_value": "Planned amount must be greater than 0.",
            "invalid": "Enter a valid planned amount.",
        },
    )

    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    gl_account_type = serializers.CharField(source='gl_account.account_type', read_only=True)
    gl_account_is_active = serializers.BooleanField(source='gl_account.is_active', read_only=True)

    # Budget vs Actual (not surfaced in the simplified Budget Line UI yet,
    # but kept available for reporting/API consumers).
    actual_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    variance = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    is_over_budget = serializers.BooleanField(read_only=True)

    class Meta:
        model = BudgetLine
        fields = (
            'id',
            'budget',
            'description',
            'gl_account',
            'gl_account_code',
            'gl_account_name',
            'gl_account_type',
            'gl_account_is_active',
            'planned_amount',
            'actual_amount',
            'remaining_amount',
            'variance',
            'is_over_budget',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'budget', 'created_at', 'updated_at')

    def validate_gl_account(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "Selected GL Account is inactive. Choose an active GL Account."
            )
        return value


class ProjectBudgetSerializer(serializers.ModelSerializer):

    quoted_amount = serializers.SerializerMethodField()
    manual_budget = serializers.DecimalField(
        source="total_budget",
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    # The actual execution/cost budget - in_house + outsourced cost from the
    # linked quote(s), with tax and profit margin excluded (unlike
    # total_budget, which mirrors the client-facing quote total_amount,
    # sub_total + tax, and therefore still includes both). This is what the
    # UI's budget/"used" stat cards should be measured against.
    cost_budget = serializers.SerializerMethodField()
    difference_from_quote = serializers.SerializerMethodField()

    billable_hours = serializers.SerializerMethodField()
    remaining_billable_hours = serializers.SerializerMethodField()

    used_budget = serializers.SerializerMethodField()
    remaining_budget = serializers.SerializerMethodField()

    profit_or_loss = serializers.SerializerMethodField()

    # 🔹 GL Account budget lines (Description / GL Account / Planned / Actual
    # / Variance) plus roll-up totals so Finance can answer "how much was
    # budgeted / spent / remaining per GL Account" without opening each line.
    lines = BudgetLineSerializer(many=True, read_only=True)
    total_planned_by_gl = serializers.SerializerMethodField()
    total_actual_by_gl = serializers.SerializerMethodField()
    total_variance_by_gl = serializers.SerializerMethodField()
    gl_accounts_over_budget = serializers.SerializerMethodField()

    class Meta:
        model = ProjectBudget
        fields = (
            "use_quoted_amounts",
            "quoted_amount",
            "manual_budget",
            "total_budget",
            "cost_budget",
            "actual_expenses",
            "forecasted_profit",
            "difference_from_quote",
            "billable_hours",
            "remaining_billable_hours",
            "used_budget",
            "remaining_budget",
            "profit_or_loss",
            "total_hours",
            "bills_and_expenses",
            "currency",
            "lines",
            "total_planned_by_gl",
            "total_actual_by_gl",
            "total_variance_by_gl",
            "gl_accounts_over_budget",
        )

    # ---------------------------
    # 🔹 GL Account budget lines — roll-ups
    # ---------------------------
    def get_total_planned_by_gl(self, obj):
        return obj.lines.aggregate(
            total=Sum('planned_amount')
        )['total'] or Decimal("0.00")

    def get_total_actual_by_gl(self, obj):
        total = Decimal("0.00")
        for line in obj.lines.select_related('gl_account').all():
            total += line.actual_amount
        return total

    def get_total_variance_by_gl(self, obj):
        return self.get_total_planned_by_gl(obj) - self.get_total_actual_by_gl(obj)

    def get_gl_accounts_over_budget(self, obj):
        return [
            {
                "gl_account": line.gl_account_id,
                "gl_account_code": line.gl_account.code,
                "gl_account_name": line.gl_account.name,
                "planned_amount": line.planned_amount,
                "actual_amount": line.actual_amount,
                "variance": line.variance,
            }
            for line in obj.lines.select_related('gl_account').all()
            if line.is_over_budget
        ]

    # ---------------------------
    # 🔹 Quoted Revenue
    # ---------------------------
    def get_quoted_amount(self, obj):
        project = obj.project
        if project and project.created_from_quotation:
            return project.created_from_quotation.total_amount
        return None

    # ---------------------------
    # 🔹 Difference (Quoted vs Manual Budget)
    # ---------------------------
    def get_difference_from_quote(self, obj):
        project = obj.project
        if (
            project
            and project.created_from_quotation
            and obj.total_budget is not None
        ):
            return (
                project.created_from_quotation.total_amount
                - obj.total_budget
            )
        return None

    # ---------------------------
    # 🔹 Total Billable Hours
    # ---------------------------
    def get_billable_hours(self, obj):
        project = obj.project

        # obj.total_hours is kept in sync (see Quote.save()/apply_quoted_amounts)
        # with every Confirmed quote linked to this project — the quote it was
        # created from AND any follow-up/phase quotes added later — so it's
        # the authoritative figure whenever it's set.
        if obj.total_hours:
            return obj.total_hours

        if obj.use_quoted_amounts and project.created_from_quotation:
            quoted_hours = sum(
                item.quantity
                for item in project.created_from_quotation.items.all()
                if item.unit == "hours"
            )
            if quoted_hours:
                return quoted_hours

        # Neither the quote(s) nor the manual budget has hours set — fall back
        # to the sum of each task's own allocated hours so this figure isn't
        # falsely zero when the project's tasks clearly have hours allocated.
        if project:
            return sum(
                (task.allocated_hours or Decimal("0")) for task in project.tasks.all()
            )

        return Decimal("0")

    # ---------------------------
    # 🔹 Remaining Billable Hours
    # -------------------------

    # 🔹 Consumed hours for a task, including the elapsed time of a timer
    # that is actively running right now (not yet committed to a TaskTimerLog
    # row), so budget/hours figures update live while someone is tracking time.
    def _live_consumed_hours(self, task):
        consumed = task.consumed_hours or Decimal("0")

        if not task.assigned_to_id:
            return consumed

        from .utils.timer import get_active_timer
        redis_task, redis_start = get_active_timer(task.assigned_to_id)
        if redis_task and redis_start and int(redis_task) == task.id:
            from django.utils import timezone
            start_time = timezone.datetime.fromisoformat(
                redis_start.decode() if isinstance(redis_start, bytes) else redis_start
            )
            elapsed_seconds = (timezone.now() - start_time).total_seconds()
            consumed += Decimal(elapsed_seconds) / Decimal(3600)

        return consumed

    def get_remaining_billable_hours(self, obj):
        project = obj.project
        if not project:
            return "00:00:00"

        # 🔹 Total billable hours (manual or quoted)
        total_hours = self.get_billable_hours(obj) or Decimal("0")

        # 🔹 Sum consumed hours from tasks (including any live-running timer)
        used_hours = Decimal("0")
        for task in project.tasks.all():
            used_hours += self._live_consumed_hours(task)

        remaining_hours = total_hours - used_hours

        if remaining_hours < 0:
            remaining_hours = Decimal("0")

        # 🔥 Convert hours → total seconds
        total_seconds = int(remaining_hours * Decimal("3600"))

        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60

        return f"{hours:02}:{minutes:02}:{seconds:02}"


    # ---------------------------
    # 🔹 Cost Budget (execution budget, tax/profit excluded)
    # ---------------------------
    def get_cost_budget(self, obj):
        return obj.cost_budget

    # ---------------------------
    # 🔹 Used Budget (Actual Cost) — labor cost (live hours × rate) plus any
    # real logged expenses, so this, Remaining Budget and Profit/Loss all
    # agree on what "actual cost" means instead of each using a different
    # basis (which made Total ≠ Used + Remaining in the UI).
    # ---------------------------
    def _total_actual_cost(self, obj):
        project = obj.project
        labor_cost = Decimal("0.00")

        if project:
            for task in project.tasks.select_related("assigned_to"):
                if not task.assigned_to:
                    continue

                hourly_rate = task.assigned_to.charges_per_hour or Decimal("0")
                labor_cost += self._live_consumed_hours(task) * hourly_rate

        real_expenses = Decimal(obj.actual_expenses or 0)
        return (labor_cost + real_expenses).quantize(Decimal("0.01"))

    def get_used_budget(self, obj):
        if not obj.project:
            return Decimal("0.00")
        return self._total_actual_cost(obj)


    # ---------------------------
    # 🔹 Remaining Budget - measured against cost_budget (tax/profit
    # excluded), the same basis _total_actual_cost() is on, rather than
    # total_budget (which still includes both) so this isn't an
    # apples-to-oranges subtraction.
    # ---------------------------
    def get_remaining_budget(self, obj):
        return self.get_cost_budget(obj) - self._total_actual_cost(obj)

    # ---------------------------
    # 🔹 Profit or Loss (REAL LOGIC)
    # Revenue - Actual Cost
    # ---------------------------
    def get_profit_or_loss(self, obj):
        project = obj.project

        if not project or not project.created_from_quotation:
            return None

        quoted_amount = project.created_from_quotation.total_amount
        used_budget = self._total_actual_cost(obj)

        return quoted_amount - used_budget


    
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError


class MilestoneSerializer(serializers.ModelSerializer):
    """
    A Fixed Budget project's phase. Actual cost / billing / payment status
    are read-only, derived properties on the model (from finances.Expense
    and finances.Invoice linked to this milestone) - never stored, per the
    "derive, do not store calculated values" requirement.
    """

    status_display = serializers.CharField(source='get_status_display', read_only=True)

    actual_cost = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    margin = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    billed_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    received_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    outstanding_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    billing_status = serializers.CharField(read_only=True)
    payment_status = serializers.CharField(read_only=True)

    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    # Write-only escape hatch for Section 11's "unless explicitly allowed" -
    # never persisted, just relaxes the contract-value cap for this save.
    override_budget_check = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Milestone
        fields = (
            'id',
            'project',
            'name',
            'description',
            'sequence',
            'planned_start_date',
            'planned_end_date',
            'completion_percent',
            'budget_amount',
            'billing_amount',
            'status',
            'status_display',
            'is_active',
            'actual_cost',
            'margin',
            'billed_amount',
            'received_amount',
            'outstanding_amount',
            'billing_status',
            'payment_status',
            'created_at',
            'updated_at',
            'created_by_name',
            'updated_by_name',
            'override_budget_check',
        )
        read_only_fields = ('id', 'project', 'created_at', 'updated_at')

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None

    def create(self, validated_data):
        override = validated_data.pop('override_budget_check', False)
        instance = Milestone(**validated_data)
        instance._allow_budget_override = override
        instance.save()
        return instance

    def update(self, instance, validated_data):
        override = validated_data.pop('override_budget_check', False)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance._allow_budget_override = override
        instance.save()
        return instance


class ResourceAssignmentSerializer(serializers.ModelSerializer):
    """
    A resource (employee or freelancer) staffed on a T&M project.
    Monthly Cost / Monthly Billing are derived (cost_rate/billing_rate x
    working_hours), not stored, so they always match the underlying rates.
    """

    resource_type_display = serializers.CharField(source='get_resource_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    resource_name = serializers.CharField(read_only=True)
    monthly_cost = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    monthly_billing = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ResourceAssignment
        fields = (
            'id',
            'project',
            'resource_type',
            'resource_type_display',
            'resource_id',
            'resource_name',
            'role',
            'start_date',
            'end_date',
            'cost_rate',
            'billing_rate',
            'allocation_percent',
            'working_hours',
            'status',
            'status_display',
            'is_active',
            'monthly_cost',
            'monthly_billing',
            'created_at',
            'updated_at',
            'created_by_name',
            'updated_by_name',
        )
        read_only_fields = ('id', 'project', 'created_at', 'updated_at')

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None

    def validate(self, data):
        resource_type = data.get('resource_type', getattr(self.instance, 'resource_type', None))
        resource_id = data.get('resource_id', getattr(self.instance, 'resource_id', None))

        if resource_type and resource_id:
            if resource_type == 'employee':
                if not Account.objects.filter(pk=resource_id).exists():
                    raise serializers.ValidationError({"resource_id": "No employee found with this ID."})
            else:
                # Freelancers are their own model (freelancer_onboarding.Freelancer),
                # not an accounts.Vendor row - matches ProjectPOCOptionsAPIView,
                # which already sources its freelancer picker options from there.
                from freelancer_onboarding.models import Freelancer
                if not Freelancer.objects.filter(pk=resource_id).exists():
                    raise serializers.ValidationError({"resource_id": "No freelancer found with this ID."})

        return data


class ProjectCreateSerializer(serializers.ModelSerializer):
    budget = ProjectBudgetSerializer(required=False)

    class Meta:
        model = Project
        fields = (
            'status',
            'project_no',
            'project_name',
            'project_type',
            'client',
            'start_date',
            'end_date',
            'project_manager',
            'call_center',
            'profit_center',
            'gl_account',
            'poc_type',
            'poc_id',
            'created_from_quotation',
            'budget',
            # Project Financial Management: engagement/billing model.
            # engagement_type is a DIFFERENT axis from project_type
            # (internal/external) above.
            'engagement_type',
            'contract_value',
            'payment_terms',
            'billing_frequency',
            'monthly_billing_amount',
            # Project Contract: a slice of the Contract Value for this
            # project. remaining_amount is read-only - it's always derived,
            # never accepted as input (see validate() below).
            'project_percentage',
            'project_amount',
            'remaining_amount',
        )
        extra_kwargs = {
            'client': {'required': False},
            'remaining_amount': {'read_only': True},
        }
    def get_fields(self):
        fields = super().get_fields()

        # Safely determine project_type
        project_type = None

        if hasattr(self, 'initial_data'):
            project_type = self.initial_data.get('project_type')
        elif self.instance:
            project_type = getattr(self.instance, 'project_type', None)

        fields['budget'] = ProjectBudgetSerializer(
            required=False,
            context={'project_type': project_type}
        )
        return fields


    def validate(self, data):
        project_type = data.get('project_type')
        quotation = data.get('created_from_quotation')
        budget = data.get('budget')
        start_date = data.get('start_date')
        end_date = data.get('end_date')

        # 🔒 Common date validation
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                "End date cannot be before start date."
            )

        # =============================
        # 🔹 PROJECT FINANCIAL MANAGEMENT: engagement type
        # =============================
        engagement_type = data.get('engagement_type') or getattr(self.instance, 'engagement_type', 'fixed')

        if engagement_type == 'fixed':
            contract_value = data.get('contract_value', getattr(self.instance, 'contract_value', None))
            if contract_value is None:
                raise serializers.ValidationError({
                    "contract_value": "Contract value is required for Fixed Budget / Milestone-Based projects."
                })

            # =============================
            # 🔹 PROJECT CONTRACT: Project % / Project Amount / Remaining Amount
            # Exactly one of Project %/Project Amount drives the calculation
            # per request - whichever the client actually sent. Project
            # Amount wins if both arrive together, since it's the more
            # precise (rupee) figure; Project % is then re-derived from it so
            # the two never disagree. Remaining Amount is always derived,
            # never accepted as input.
            # =============================
            project_amount = data.get('project_amount', None)
            project_percentage = data.get('project_percentage', None)
            has_amount = project_amount is not None
            has_percentage = project_percentage is not None

            if not has_amount and not has_percentage and self.instance is not None:
                # Neither sent in this request (e.g. a PATCH that only
                # changes contract_value) - re-derive from whatever the
                # project already had, so the three fields stay in sync.
                project_amount = self.instance.project_amount
                project_percentage = self.instance.project_percentage
                has_amount = project_amount is not None
                has_percentage = project_percentage is not None

            if has_amount or has_percentage:
                contract_value = Decimal(contract_value)
                if contract_value <= 0:
                    raise serializers.ValidationError({
                        "project_amount": "Contract Value must be greater than 0 before setting Project % or Project Amount."
                    })

                if has_amount:
                    project_amount = Decimal(str(project_amount))
                    if project_amount < 0:
                        raise serializers.ValidationError({
                            "project_amount": "Project Amount cannot be negative."
                        })
                    if project_amount > contract_value:
                        raise serializers.ValidationError({
                            "project_amount": "Project Amount cannot be greater than Contract Value."
                        })
                    project_percentage = (project_amount / contract_value * Decimal('100')).quantize(Decimal('0.01'))
                else:
                    project_percentage = Decimal(str(project_percentage))
                    if project_percentage < 0 or project_percentage > 100:
                        raise serializers.ValidationError({
                            "project_percentage": "Project % must be between 0 and 100."
                        })
                    project_amount = (contract_value * project_percentage / Decimal('100')).quantize(Decimal('0.01'))

                remaining_amount = (contract_value - project_amount).quantize(Decimal('0.01'))
                if remaining_amount < 0:
                    raise serializers.ValidationError({
                        "project_amount": "Remaining Amount cannot be negative."
                    })

                data['project_amount'] = project_amount
                data['project_percentage'] = project_percentage
                data['remaining_amount'] = remaining_amount
        elif engagement_type == 'time_and_material':
            monthly_billing_amount = data.get(
                'monthly_billing_amount', getattr(self.instance, 'monthly_billing_amount', None)
            )
            if monthly_billing_amount is None:
                raise serializers.ValidationError({
                    "monthly_billing_amount": "Monthly billing amount is required for Time & Material projects."
                })

        # =============================
        # 🔹 INTERNAL PROJECT
        # =============================
        if project_type == 'internal':

            # Quotation should not be used
            if quotation:
                raise serializers.ValidationError({
                    "created_from_quotation": (
                        "Quotation is not applicable for internal projects."
                    )
                })

            # Budget is OPTIONAL, but must be MANUAL if provided
            if budget and budget.get('use_quoted_amounts'):
                raise serializers.ValidationError({
                    "budget": {
                        "use_quoted_amounts": (
                            "Internal projects cannot use quoted amounts."
                        )
                    }
                })

            return data

        # =============================
        # 🔹 EXTERNAL PROJECT
        # =============================
        if project_type == 'external':

            # 1️⃣ Quotation is mandatory
            if not quotation:
                raise serializers.ValidationError({
                    "created_from_quotation": (
                        "Quotation is required for external projects."
                    )
                })

            # 2️⃣ Budget is mandatory
            if not budget:
                raise serializers.ValidationError({
                    "budget": "Budget is required for external projects."
                })

            # 3️⃣ Quotation status validation
            invalid_statuses = ['Rejected', 'Cancelled', 'Closed']
            if quotation.status in invalid_statuses:
                raise serializers.ValidationError({
                    "created_from_quotation": (
                        f"Project cannot be created because the quotation is {quotation.status}."
                    )
                })

            if quotation.status != 'Confirmed':
                raise serializers.ValidationError({
                    "created_from_quotation": (
                        "Project can only be created from a Confirmed quotation."
                    )
                })

            # 4️⃣ Prevent duplicate project creation
            if Project.objects.filter(created_from_quotation=quotation).exists():
                raise serializers.ValidationError({
                    "created_from_quotation": (
                        "A project already exists for this quotation."
                    )
                })

        return data

    def create(self, validated_data):
        budget_data = validated_data.pop('budget', None)

        project = Project.objects.create(**validated_data)

        # 🔹 Create budget only if provided
        if budget_data:
            # Section (Project Types / Financial Management): when the
            # Budget Settings tab isn't used to set an explicit total_budget
            # (e.g. the admin Projects page hides that tab entirely), fall
            # back to the engagement-type figure the user DID enter on the
            # Project Settings tab - contract_value for Fixed, monthly
            # billing amount for T&M - so ProjectBudget.total_budget (which
            # the Projects list card and Budget health tab both read from)
            # isn't silently left at 0.
            if not budget_data.get('total_budget'):
                if project.engagement_type == 'fixed' and project.contract_value:
                    budget_data['total_budget'] = project.contract_value
                elif project.engagement_type == 'time_and_material' and project.monthly_billing_amount:
                    budget_data['total_budget'] = project.monthly_billing_amount

            budget = ProjectBudget.objects.create(
                project=project,
                **budget_data
            )

            # Apply quoted amounts if selected
            if budget.use_quoted_amounts:
                try:
                    budget.apply_quoted_amounts()
                    budget.save()
                except DjangoValidationError as e:
                    raise serializers.ValidationError({"budget": e.messages})

        return project



from finances.serializers import InvoiceListSerializer
class ProjectListSerializer(serializers.ModelSerializer):
    budget = serializers.SerializerMethodField()
    invoices = serializers.SerializerMethodField()
    company_name = serializers.CharField(
        source='client.company_name',
        read_only=True
    )
    contacts=serializers.SerializerMethodField()
    call_center_name = serializers.CharField(source='call_center.name', read_only=True, default=None)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True, default=None)
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True, default=None)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True, default=None)

    class Meta:
        model = Project
        fields = (
            'project_no',
            'project_name',
            'project_type',
            'status',
            'start_date',
            'end_date',
            'budget',
            'invoices',
            'client',
            'company_name',
            'contacts',
            'call_center',
            'call_center_name',
            'profit_center',
            'profit_center_name',
            'gl_account',
            'gl_account_name',
            'gl_account_code',
            'created_from_quotation',
            'engagement_type',
            'contract_value',
            'payment_terms',
            'billing_frequency',
            'monthly_billing_amount',
            'project_percentage',
            'project_amount',
            'remaining_amount',
        )

    def get_budget(self, obj):
        try:
            return ProjectBudgetSerializer(obj.budget).data
        except ObjectDoesNotExist:
            return None
    def get_invoices(self, obj):
        invoices = obj.invoice_set.all()  # ✅ CORRECT

        if not invoices.exists():
            return []

        return InvoiceListSerializer(invoices, many=True).data
    def get_contacts(self, obj):
        """Get all POCs (contacts) for the project's client company"""
        if not obj.client:
            return []
        
        pocs = obj.client.pocs.all()
        return PointOfContactSerializer(pocs, many=True).data
    

class TaskSerializer(serializers.ModelSerializer):
    # due_date = serializers.DateField(required=True)
    created_by = serializers.SerializerMethodField(read_only=True)
    modified_by = serializers.SerializerMethodField(read_only=True)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        required=False,
        allow_null=True
    )
    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(),
        required=True
    )
    project_name = serializers.SerializerMethodField(read_only=True)
    consumed_hours = serializers.SerializerMethodField(read_only=True)
    remaining_hours = serializers.SerializerMethodField(read_only=True)
    allocated_formatted = serializers.SerializerMethodField(read_only=True)
    consumed_formatted = serializers.SerializerMethodField(read_only=True)
    remaining_formatted_hms = serializers.SerializerMethodField(read_only=True)
    needs_extra_hours = serializers.SerializerMethodField(read_only=True)
    total_seconds = serializers.SerializerMethodField(read_only=True)
    running = serializers.SerializerMethodField(read_only=True)
    started_at = serializers.SerializerMethodField(read_only=True)
    is_stopped = serializers.SerializerMethodField(read_only=True)
    stop_reason = serializers.SerializerMethodField(read_only=True)
    stopped_at = serializers.SerializerMethodField(read_only=True)
    remaining_seconds = serializers.SerializerMethodField(read_only=True)
    remaining_formatted = serializers.SerializerMethodField(read_only=True)
    exceeded_by_seconds = serializers.SerializerMethodField(read_only=True)
    exceeded_formatted = serializers.SerializerMethodField(read_only=True)
    has_extra_hours_request = serializers.SerializerMethodField(read_only=True)
    # has_pending_extra_hours_request = serializers.SerializerMethodField(read_only=True)
    # has_approved_extra_hours_request = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "status",
            "allocated_hours",
            "allocated_formatted",
            "consumed_hours",
            "remaining_hours",
            "consumed_formatted",
            "remaining_formatted_hms",
            "assigned_to",
            "project",
            "project_name",
            "created_by",
            "modified_by",
            "due_date",
            "needs_extra_hours",
            "total_seconds",
            "running",
            "started_at",
            "is_stopped",
            "stop_reason",
            "stopped_at",
            "remaining_seconds",
            "remaining_formatted",
            "exceeded_by_seconds",
            "exceeded_formatted",
            "has_extra_hours_request",
           
            # "is_extra_hours_requested"
        ]
        read_only_fields = [
            "created_by",
            "modified_by",
            "consumed_hours",
            "remaining_hours",
            "allocated_formatted",
            "has_extra_hours_request",
            "needs_extra_hours",
            "total_seconds",
            "running",
            "started_at",
            "is_stopped",
            "stop_reason",
            "stopped_at",
            "remaining_seconds",
            "remaining_formatted",
            "exceeded_by_seconds",
            "exceeded_formatted",
        ]

    def get_project_name(self, obj):
        return obj.project.project_name if obj.project else None


    def get_created_by(self, obj):
        return obj.created_by.username if obj.created_by else None

    def get_modified_by(self, obj):
        return obj.modified_by.username if obj.modified_by else None

    def get_consumed_hours(self, obj):
        return obj.consumed_hours

    def get_remaining_hours(self, obj):
        return obj.remaining_hours

    def get_allocated_formatted(self, obj):
        try:
            from .utils.timer import format_seconds
            seconds = int(float(obj.allocated_hours) * 3600)
            return format_seconds(seconds)["formatted"]
        except Exception:
            return None

    def get_consumed_formatted(self, obj):
        try:
            from .utils.timer import format_seconds
            seconds = int(float(obj.consumed_hours) * 3600)
            return format_seconds(seconds)["formatted"]
        except Exception:
            return None

    def get_remaining_formatted_hms(self, obj):
        try:
            from .utils.timer import format_seconds
            seconds = int(float(obj.remaining_hours) * 3600)
            return format_seconds(seconds)["formatted"]
        except Exception:
            return None

    def get_has_extra_hours_request(self, obj):
        """Backward-compatible: true only if a pending request exists"""
        from .models import TaskExtraHoursRequest
        return TaskExtraHoursRequest.objects.filter(
            task=obj,
            status='pending'
        ).exists()

    def get_has_pending_extra_hours_request(self, obj):
        from .models import TaskExtraHoursRequest
        return TaskExtraHoursRequest.objects.filter(task=obj, status='pending').exists()

    def get_has_approved_extra_hours_request(self, obj):
        from .models import TaskExtraHoursRequest
        return TaskExtraHoursRequest.objects.filter(task=obj, status='approved').exists()

    def get_needs_extra_hours(self, obj):
        try:
            allocated = float(obj.allocated_hours)
            consumed = float(obj.consumed_hours)
            return consumed > allocated
        except Exception:
            return False

    def get_total_seconds(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return None
        from Project.utils.timer import get_active_timer
        from Project.models import TaskTimerLog
        user = request.user
        # Sum all previous logs for this user and task
        previous_logs = TaskTimerLog.objects.filter(task=obj, user=user, is_active=False)
        prev_seconds = sum([(log.end_time - log.start_time).total_seconds() for log in previous_logs if log.end_time and log.start_time])
        prev_seconds = int(prev_seconds)
        # If running, add current session
        redis_task, redis_start = get_active_timer(user.id)
        if redis_task and int(redis_task) == obj.id and redis_start:
            from django.utils import timezone
            start_time = timezone.datetime.fromisoformat(redis_start.decode())
            elapsed_seconds = int((timezone.now() - start_time).total_seconds())
            return prev_seconds + elapsed_seconds
        return prev_seconds

    def get_running(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return False
        from Project.utils.timer import get_active_timer
        redis_task, _ = get_active_timer(request.user.id)
        return bool(redis_task and int(redis_task) == obj.id)

    def get_started_at(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return None
        from Project.utils.timer import get_active_timer
        redis_task, redis_start = get_active_timer(request.user.id)
        if redis_task and int(redis_task) == obj.id and redis_start:
            return redis_start.decode()
        return None

    def get_is_stopped(self, obj):
        """Check if task is currently stopped (has a timesheet entry for today and is not actively running)"""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return False
        # A task that has an active timer session right now is not "stopped",
        # even if an earlier pause/stop today already logged a timesheet entry.
        if self.get_running(obj):
            return False
        from django.utils import timezone
        from Project.models import TimesheetEntry
        today = timezone.now().date()
        return TimesheetEntry.objects.filter(
            timesheet__user=request.user,
            task=obj,
            date=today
        ).exists()

    def _get_time_stats(self, obj):
        """Compute stop metadata for serializer consumers"""
        # Always use the task's assigned user, not the current request user
        # This ensures PMs see the assigned employee's stats, not the PM's own (empty) stats
        user = obj.assigned_to
        
        if not user:
            return None

        from Project.models import TaskTimerLog
        from .utils.timer import format_seconds

        logs = TaskTimerLog.objects.filter(
            task=obj,
            user=user,
            is_active=False,
            end_time__isnull=False,
            start_time__isnull=False
        )

        if not logs.exists():
            return {
                "total_seconds": 0,
                "stopped_at": None,
                "stop_reason": None,
                "remaining_seconds": int(float(obj.allocated_hours) * 3600),
                "remaining_formatted": format_seconds(float(obj.allocated_hours) * 3600)["formatted"],
                "exceeded_by_seconds": 0,
                "exceeded_formatted": "00:00:00",
            }

        total_seconds = int(sum((log.end_time - log.start_time).total_seconds() for log in logs))
        last_log = logs.order_by("-end_time").first()
        allocated_seconds = int(float(obj.allocated_hours) * 3600)
        remaining_seconds = max(allocated_seconds - total_seconds, 0)
        exceeded_by_seconds = max(total_seconds - allocated_seconds, 0)

        stop_reason = None
        if not self.get_running(obj):
            stop_reason = "AUTO" if exceeded_by_seconds > 0 else "COMPLETED"

        return {
            "total_seconds": total_seconds,
            "stopped_at": last_log.end_time.isoformat() if last_log and last_log.end_time else None,
            "stop_reason": stop_reason,
            "remaining_seconds": remaining_seconds,
            "remaining_formatted": format_seconds(remaining_seconds)["formatted"],
            "exceeded_by_seconds": exceeded_by_seconds,
            "exceeded_formatted": format_seconds(exceeded_by_seconds)["formatted"],
        }

    def get_stop_reason(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("stop_reason") if stats else None

    def get_stopped_at(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("stopped_at") if stats else None

    def get_remaining_seconds(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("remaining_seconds") if stats else None

    def get_remaining_formatted(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("remaining_formatted") if stats else None

    def get_exceeded_by_seconds(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("exceeded_by_seconds") if stats else None

    def get_exceeded_formatted(self, obj):
        stats = self._get_time_stats(obj)
        return stats.get("exceeded_formatted") if stats else None

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Replace assigned_to with user object if present
        if instance.assigned_to:
            rep["assigned_to"] = {
                "id": instance.assigned_to.id,
                "username": instance.assigned_to.username
            }
        else:
            rep["assigned_to"] = None
        return rep
class TimesheetEntrySerializer(serializers.ModelSerializer):

    def validate(self, attrs):
        entry_date = attrs['date']

        # ❌ Sunday restricted
        if entry_date.weekday() == 6:
            raise serializers.ValidationError(
                "Sunday time entry is not allowed."
            )

        # ✅ Monday–Friday normal
        # ✅ Saturday optional
        return attrs

    class Meta:
        model = TimesheetEntry
        fields = ['id', 'task', 'date', 'hours']


class TimesheetSerializer(serializers.ModelSerializer):
    entries = TimesheetEntrySerializer(many=True)

    class Meta:
        model = Timesheet
        fields = [
            'id',
            'user',
            'week_start',
            'week_end',
            'status',
            'entries'
        ]
        read_only_fields = ['user', 'status']

    def create(self, validated_data):
        entries_data = validated_data.pop('entries')
        timesheet = Timesheet.objects.create(**validated_data)

        for entry in entries_data:
            TimesheetEntry.objects.create(
                timesheet=timesheet,
                **entry
            )

        return timesheet

class TimesheetEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TimesheetEntry
        fields = ['id', 'task', 'date', 'hours']


class TimesheetSerializer(serializers.ModelSerializer):
    entries = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Timesheet
        fields = [
            'id', 'week_start', 'week_end',
            'status', 'entries'
        ]

    def get_entries(self, obj):
        """Populate entries with a unified logic that matches weekly summary.

        If `week_start` and `week_end` are provided in context, return entries
        for the object's user within that date range (task not null). Otherwise,
        fall back to entries attached to this timesheet.
        """
        from .models import TimesheetEntry

        week_start = self.context.get('week_start')
        week_end = self.context.get('week_end')
        include_orphans = bool(self.context.get('include_orphans'))

        if week_start and week_end:
            qs = TimesheetEntry.objects.filter(
                timesheet__user=obj.user,
                date__gte=week_start,
                date__lte=week_end,
            ).select_related('task')
        else:
            qs = TimesheetEntry.objects.filter(
                timesheet=obj,
            ).select_related('task')
        if not include_orphans:
            qs = qs.filter(task__isnull=False)

        # Local import to avoid circulars
        from .utils.timer import format_seconds

        out = []
        for e in qs:
            out.append({
                'id': e.id,
                'task': e.task.id if e.task else None,
                'date': e.date,
                'hours': float(e.hours),
                'hours_formatted': format_seconds(int(round(float(e.hours) * 3600)))['formatted'],
            })
        return out



class TaskTimerLogSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = TaskTimerLog
        fields = [
            "id",
            "task",
            "task_title",
            "start_time",
            "end_time",
            "duration_minutes",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields



# from rest_framework import serializers

class TaskExtraHoursRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskExtraHoursRequest
        fields = [
            "id",
            # "task",
            "requested_hours",
            "reason",
            "status",
            "created_at"

        ]
        read_only_fields = ["status", "created_at", "previous_allocated_hours", "approved_allocated_hours"]

class TaskExtraHoursReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject"])


class TimesheetWeeklySummarySerializer(serializers.Serializer):
    """Serializer for weekly timesheet summary"""
    week = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    data = serializers.SerializerMethodField()

    def get_week(self, obj):
        """Extract week info from obj dict"""
        return obj.get('week')

    def get_summary(self, obj):
        """Extract summary from obj dict"""
        return obj.get('summary')

    def get_data(self, obj):
        """Extract data from obj dict"""
        return obj.get('data', [])