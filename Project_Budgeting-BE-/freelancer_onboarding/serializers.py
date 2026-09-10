from datetime import date, datetime, timedelta
from decimal import Decimal

from rest_framework import serializers

from .models import (
    Freelancer, FreelancerDocument, FreelancerRateCard, FreelancerContract,
    FreelancerProjectAssignment, FreelancerTaskAssignment, FreelancerTimeEntry,
    FreelancerBankDetail,
)


class FreelancerInviteSerializer(serializers.Serializer):
    """Used by the admin's 'Invite Freelancer' action - only the bare minimum
    needed to send the invite. Everything else is filled in by the freelancer
    themselves via the secure link."""
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()


EDITABLE_FIELDS = (
    "full_name", "email", "phone", "location",
    "professional_title", "skills", "years_of_experience", "portfolio_url", "linkedin_url",
    "availability", "preferred_start_date", "available_until",
    "hours_per_day", "hours_per_week", "notice_period_days", "timezone",
    "payment_method", "currency", "rate",
)


class FreelancerSerializer(serializers.ModelSerializer):
    """Read representation used for both the admin list/detail views and the
    public portal - status/timestamps are read-only, changed only via the
    dedicated invite/submit/resend actions."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS + (
            "id", "status", "last_saved_step", "created_at", "updated_at", "is_archived",
        )
        read_only_fields = ("id", "status", "created_at", "updated_at", "is_archived")


class FreelancerManualCreateSerializer(serializers.ModelSerializer):
    """'Add Manually' - an internal user fills the whole profile directly, so
    it's immediately usable (status='active') with no invitation/onboarding
    step needed."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS

    def create(self, validated_data):
        validated_data["status"] = "active"
        validated_data["created_by"] = self.context.get("request").user
        return super().create(validated_data)


class FreelancerAdminUpdateSerializer(serializers.ModelSerializer):
    """Admin 'Edit' action on an existing freelancer record."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS
        extra_kwargs = {"full_name": {"required": False}, "email": {"required": False}}


class FreelancerPublicUpdateSerializer(serializers.ModelSerializer):
    """Public 'Save & Continue' - every field optional so any subset of the
    form can be patched as the freelancer moves through the steps."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS + ("last_saved_step",)
        extra_kwargs = {
            "full_name": {"required": False},
            "email": {"required": False},
        }


class FreelancerDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FreelancerDocument
        fields = (
            "id", "freelancer", "file", "file_name", "file_size", "file_type",
            "category", "uploaded_by", "uploaded_at",
        )
        read_only_fields = ("uploaded_by", "uploaded_at", "file_name", "file_size", "file_type")

    def create(self, validated_data):
        request = self.context.get("request")
        file = validated_data["file"]

        validated_data["file_name"] = file.name
        validated_data["file_size"] = file.size
        validated_data["file_type"] = file.content_type or ""

        user = getattr(request, "user", None) if request else None
        if user is not None and user.is_authenticated:
            validated_data["uploaded_by"] = user

        return super().create(validated_data)


class FreelancerRateCardSerializer(serializers.ModelSerializer):
    margin = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_current = serializers.BooleanField(read_only=True)

    class Meta:
        model = FreelancerRateCard
        fields = (
            "id", "freelancer", "pricing_model", "cost_rate", "billing_rate", "currency",
            "effective_from", "effective_to", "minimum_billable_hours", "overtime_rate",
            "weekend_rate", "is_active", "margin", "is_current", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"freelancer": {"required": False}}

    def validate(self, attrs):
        """Rule 3: only one active rate card per pricing_model may cover any
        given date. Compares the candidate's [effective_from, effective_to]
        range against every other active card of the same freelancer +
        pricing_model, treating a null effective_to as open-ended."""
        freelancer = attrs.get("freelancer") or getattr(self.instance, "freelancer", None)
        pricing_model = attrs.get("pricing_model") or getattr(self.instance, "pricing_model", None)
        is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        effective_from = attrs.get("effective_from") or getattr(self.instance, "effective_from", None)
        effective_to = attrs.get("effective_to", getattr(self.instance, "effective_to", None))

        if is_active and freelancer and pricing_model and effective_from:
            candidate_to = effective_to or date.max
            qs = FreelancerRateCard.objects.filter(
                freelancer=freelancer, pricing_model=pricing_model, is_active=True,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            for existing in qs:
                existing_to = existing.effective_to or date.max
                if existing.effective_from <= candidate_to and effective_from <= existing_to:
                    raise serializers.ValidationError(
                        f"An active {pricing_model} rate card already covers this date range "
                        f"({existing.effective_from} to {existing.effective_to or 'ongoing'}). "
                        "Deactivate it or adjust the dates first."
                    )
        return attrs


class FreelancerContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = FreelancerContract
        fields = (
            "id", "freelancer", "contract_type", "start_date", "end_date", "status",
            "payment_terms", "notice_period_days", "nda_signed", "agreement_signed",
            "document", "document_name", "notes", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"freelancer": {"required": False}}

    def create(self, validated_data):
        file = validated_data.get("document")
        if file and not validated_data.get("document_name"):
            validated_data["document_name"] = getattr(file, "name", "")
        return super().create(validated_data)


class FreelancerProjectAssignmentSerializer(serializers.ModelSerializer):
    freelancer_name = serializers.CharField(source="freelancer.full_name", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)
    margin = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerProjectAssignment
        fields = (
            "id", "freelancer", "freelancer_name", "project", "project_name", "rate_card",
            "role", "start_date", "end_date", "estimated_hours", "allocated_hours",
            "pricing_model_snapshot", "cost_rate_snapshot", "billing_rate_snapshot",
            "currency_snapshot", "margin", "status", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "pricing_model_snapshot", "cost_rate_snapshot", "billing_rate_snapshot",
            "currency_snapshot", "created_at", "updated_at",
        )

    def get_margin(self, obj):
        return obj.margin

    def create(self, validated_data):
        """Snapshots the freelancer's rate at assignment time (Rule 4) - a
        later change to the freelancer's rate card must never alter this
        assignment's cost/billing figures (Rule 5)."""
        freelancer = validated_data["freelancer"]
        rate_card = validated_data.get("rate_card")

        if rate_card is None:
            rate_card = (
                FreelancerRateCard.objects.filter(freelancer=freelancer, is_active=True)
                .order_by("-effective_from")
                .first()
            )
            validated_data["rate_card"] = rate_card

        if rate_card:
            validated_data["pricing_model_snapshot"] = rate_card.pricing_model
            validated_data["cost_rate_snapshot"] = rate_card.cost_rate
            validated_data["billing_rate_snapshot"] = rate_card.billing_rate
            validated_data["currency_snapshot"] = rate_card.currency

        request = self.context.get("request")
        if request is not None:
            validated_data["created_by"] = request.user

        return super().create(validated_data)


class FreelancerTaskAssignmentSerializer(serializers.ModelSerializer):
    freelancer_name = serializers.CharField(source="freelancer.full_name", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    project_name = serializers.CharField(source="task.project.project_name", read_only=True)
    actual_hours = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    billable_hours = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    remaining_hours = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cost = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, allow_null=True)
    billing_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, allow_null=True)

    class Meta:
        model = FreelancerTaskAssignment
        fields = (
            "id", "freelancer", "freelancer_name", "task", "task_title", "project_name",
            "project_assignment", "estimated_hours", "allocated_hours", "status",
            "actual_hours", "billable_hours", "remaining_hours", "cost", "billing_amount",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        """A task assignment only makes sense within a project the freelancer
        is already assigned to - project_assignment is auto-resolved from
        the task's project when not given explicitly, and cross-checked
        against it otherwise."""
        freelancer = attrs.get("freelancer") or getattr(self.instance, "freelancer", None)
        task = attrs.get("task") or getattr(self.instance, "task", None)
        project_assignment = attrs.get("project_assignment")

        if freelancer and task:
            if project_assignment is None:
                project_assignment = (
                    FreelancerProjectAssignment.objects.filter(
                        freelancer=freelancer, project=task.project,
                    )
                    .order_by("-created_at")
                    .first()
                )
                if project_assignment is None:
                    raise serializers.ValidationError(
                        "This freelancer has no project assignment for this task's project yet - "
                        "assign them to the project first."
                    )
                attrs["project_assignment"] = project_assignment
            elif project_assignment.project_id != task.project_id or project_assignment.freelancer_id != freelancer.id:
                raise serializers.ValidationError(
                    "The selected project assignment doesn't match this freelancer/task's project."
                )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class FreelancerBankDetailSerializer(serializers.ModelSerializer):
    """Default (masked) bank detail serializer - mirrors
    VendorBankDetailSerializer exactly: never exposes the full account
    number, only ever accepts a new one on write."""

    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerBankDetail
        fields = (
            "id", "freelancer", "payment_method", "payment_terms", "payment_status",
            "tax_type", "tax_number", "account_holder_name", "bank_name",
            "account_number", "account_number_masked", "ifsc_code",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"freelancer": {"required": False}}

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()

    def update(self, instance, validated_data):
        # A blank account_number means "leave the number on file alone" -
        # the field always reloads blank (write-only), so an untouched field
        # must never overwrite what's already stored.
        if not validated_data.get("account_number"):
            validated_data.pop("account_number", None)
        return super().update(instance, validated_data)


class FreelancerBankDetailPublicSerializer(serializers.ModelSerializer):
    """Public (token-authenticated) counterpart to FreelancerBankDetailSerializer,
    used by the freelancer's own self-service onboarding portal - identical
    masking/blank-preserving behavior, but "freelancer" and "payment_status"
    are read-only so a freelancer can never reassign the record to a
    different freelancer id or set their own verification status."""

    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerBankDetail
        fields = (
            "id", "freelancer", "payment_method", "payment_terms", "payment_status",
            "tax_type", "tax_number", "account_holder_name", "bank_name",
            "account_number", "account_number_masked", "ifsc_code",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "freelancer", "payment_status", "created_at", "updated_at")

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()

    def update(self, instance, validated_data):
        # A blank account_number means "leave the number on file alone" -
        # the field always reloads blank (write-only), so an untouched field
        # must never overwrite what's already stored.
        if not validated_data.get("account_number"):
            validated_data.pop("account_number", None)
        return super().update(instance, validated_data)


class FreelancerBankDetailUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated reveal endpoint."""

    class Meta:
        model = FreelancerBankDetail
        fields = (
            "id", "freelancer", "payment_method", "payment_terms", "payment_status",
            "tax_type", "tax_number", "account_holder_name", "bank_name",
            "account_number", "ifsc_code", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class FreelancerTimeEntrySerializer(serializers.ModelSerializer):
    freelancer_name = serializers.CharField(source="task_assignment.freelancer.full_name", read_only=True)
    task_title = serializers.CharField(source="task_assignment.task.title", read_only=True)
    project_name = serializers.CharField(source="task_assignment.task.project.project_name", read_only=True)

    class Meta:
        model = FreelancerTimeEntry
        fields = (
            "id", "task_assignment", "freelancer_name", "task_title", "project_name",
            "date", "start_time", "end_time", "break_minutes", "hours", "is_billable",
            "description", "status", "submitted_at", "reviewed_by", "reviewed_at",
            "rejection_reason", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "status", "submitted_at", "reviewed_by", "reviewed_at", "rejection_reason",
            "created_at", "updated_at",
        )

    def validate(self, attrs):
        """hours is either given directly, or derived from start_time/end_time
        minus break_minutes - never both silently disagreeing. Approved
        entries are immutable (Rule 5's spirit: a locked-in actual cost figure
        shouldn't shift after the fact)."""
        if self.instance and self.instance.status == "approved":
            raise serializers.ValidationError("An approved time entry can no longer be edited.")

        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        break_minutes = attrs.get("break_minutes", getattr(self.instance, "break_minutes", 0)) or 0

        if start and end:
            start_dt = datetime.combine(date.min, start)
            end_dt = datetime.combine(date.min, end)
            if end_dt <= start_dt:
                end_dt += timedelta(days=1)
            total_minutes = (end_dt - start_dt).total_seconds() / 60 - break_minutes
            if total_minutes <= 0:
                raise serializers.ValidationError("End time must be after start time (after subtracting break).")
            attrs["hours"] = round(Decimal(total_minutes) / 60, 2)
        elif not attrs.get("hours") and not getattr(self.instance, "hours", None):
            raise serializers.ValidationError("Provide either hours, or both start_time and end_time.")

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None:
            validated_data["created_by"] = request.user
        return super().create(validated_data)
