from decimal import Decimal

from rest_framework import serializers

from accounts.models import Vendor
from .models import (
    VendorOnboardingProfile, VendorKYC, VendorBankDetail,
    VendorProcurementDetail, VendorDocument, VendorChangeRequest,
    VendorSubmissionVersion, VendorApprovalWorkflowConfig, VendorApprovalLevel,
    VendorApprovalHistory, VendorAuditLog, VendorEmailLog,
)


TOTAL_STEPS = 6


class VendorRaiseRequestSerializer(serializers.ModelSerializer):
    """Used by the admin's 'Raise Vendor Request' action - only the bare
    minimum needed to invite the vendor. Everything else is filled in by the
    vendor themselves via the secure link."""

    class Meta:
        model = Vendor
        fields = (
            "id", "name", "email", "phone", "vendor_type",
            "contact_person_name", "company_code", "plant", "internal_requester",
            "initial_comments",
        )


class VendorOnboardingDraftSerializer(serializers.ModelSerializer):
    """Patches the base Vendor identity fields when an admin is filling
    the whole thing out directly. Never validates business rules - drafts may
    be saved with anything filled in, or nothing at all."""

    class Meta:
        model = Vendor
        fields = (
            "id", "name", "vendor_type", "email", "phone",
            "contact_person_name", "company_code", "plant", "internal_requester",
            "initial_comments", "last_saved_step",
        )
        extra_kwargs = {
            "name": {"required": False, "allow_blank": True},
            "vendor_type": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
            "contact_person_name": {"required": False, "allow_blank": True},
        }


class VendorOnboardingProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorOnboardingProfile
        exclude = ("id", "vendor", "created_at", "updated_at")


class VendorPublicOnboardingProfileSerializer(VendorOnboardingProfileSerializer):
    """Portal variant - the internal rating, headcount and spend are never shown to or writable by the vendor."""

    class Meta(VendorOnboardingProfileSerializer.Meta):
        exclude = VendorOnboardingProfileSerializer.Meta.exclude + ("rating", "headcount", "manual_amount_spent")


# Internal review fields - excluded from the step serializers below, which the vendor
# self-service portal shares; they are read/written only via VendorReviewSerializer.
KYC_REVIEW_FIELDS = ("kyc_status", "risk_rating", "compliance_remarks")
BANK_REVIEW_FIELDS = ("verification_status", "verification_remarks")


class VendorKYCSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorKYC
        exclude = ("id", "vendor", "created_at", "updated_at") + KYC_REVIEW_FIELDS


class VendorBankDetailSerializer(serializers.ModelSerializer):
    """Default (masked) bank detail serializer - never exposes the full account number."""
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at") + BANK_REVIEW_FIELDS

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()


class VendorBankDetailUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated reveal endpoint."""

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at") + BANK_REVIEW_FIELDS


class VendorProcurementDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProcurementDetail
        exclude = ("id", "vendor", "created_at", "updated_at")

    def validate(self, attrs):
        start = attrs.get("contract_start_date", getattr(self.instance, "contract_start_date", None))
        end = attrs.get("contract_end_date", getattr(self.instance, "contract_end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"contract_end_date": "Contract end date must be on or after the start date."})
        pct = attrs.get("withholding_tax_percentage")
        if pct is not None and not (0 <= pct <= 100):
            raise serializers.ValidationError({"withholding_tax_percentage": "Enter a percentage between 0 and 100."})
        return attrs


class VendorDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorDocument
        fields = (
            "id", "vendor", "file", "file_name", "file_size", "file_type",
            "category", "is_required", "status", "uploaded_by", "uploaded_by_role", "uploaded_at",
            "verified_by", "verified_by_name", "verified_at", "remarks",
        )
        read_only_fields = (
            "uploaded_by", "uploaded_by_role", "uploaded_at", "file_name", "file_size", "file_type", "status",
            "verified_by", "verified_at", "remarks",
        )
        # The stored file reference is never returned - downloads go through the signed-URL endpoints.
        extra_kwargs = {"file": {"write_only": True}}

    verified_by_name = serializers.SerializerMethodField()

    def get_verified_by_name(self, obj):
        user = obj.verified_by
        if not user:
            return None
        return getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", None) or getattr(user, "email", None)

    def create(self, validated_data):
        request = self.context.get("request")
        file = validated_data["file"]

        validated_data["file_name"] = file.name
        validated_data["file_size"] = file.size
        validated_data["file_type"] = file.content_type or ""

        user = getattr(request, "user", None) if request else None
        if user is not None and user.is_authenticated:
            validated_data["uploaded_by"] = user
            validated_data["uploaded_by_role"] = "admin"
        else:
            validated_data["uploaded_by_role"] = "vendor"

        return super().create(validated_data)


class VendorChangeRequestSerializer(serializers.ModelSerializer):
    section_display = serializers.CharField(source="get_section_display", read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VendorChangeRequest
        fields = (
            "id", "section", "section_display", "required_changes", "comments",
            "requested_by", "requested_by_name", "requested_at", "status", "resolved_at",
        )
        read_only_fields = ("requested_by", "requested_at", "status", "resolved_at")

    def get_requested_by_name(self, obj):
        if not obj.requested_by:
            return None
        return obj.requested_by.display_name or obj.requested_by.username


class VendorSubmissionVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorSubmissionVersion
        fields = ("id", "version_number", "snapshot", "is_resubmission", "created_at")


class VendorApprovalHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    section = serializers.CharField(source="change_request.section", read_only=True, default=None)

    class Meta:
        model = VendorApprovalHistory
        fields = (
            "id", "level_order", "actor", "actor_name", "actor_role_snapshot",
            "action", "previous_status", "new_status", "comments", "required_changes",
            "section", "created_at",
        )

    def get_actor_name(self, obj):
        if not obj.actor:
            return "Vendor"
        return obj.actor.display_name or obj.actor.username


class VendorApprovalLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorApprovalLevel
        fields = ("id", "config", "level_order", "name", "approver_role", "approver_user")

    def validate(self, attrs):
        role = attrs.get("approver_role", getattr(self.instance, "approver_role", None))
        user = attrs.get("approver_user", getattr(self.instance, "approver_user", None))
        if bool(role) == bool(user):
            raise serializers.ValidationError("Exactly one of approver_role or approver_user must be set.")
        return attrs


class VendorApprovalWorkflowConfigSerializer(serializers.ModelSerializer):
    levels = VendorApprovalLevelSerializer(many=True, read_only=True)

    class Meta:
        model = VendorApprovalWorkflowConfig
        fields = (
            "id", "name", "company_code", "plant", "vendor_type", "is_active",
            "created_by", "created_at", "updated_at", "levels",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")


def _progress_percentage(obj):
    if obj.status in ("submitted", "resubmitted", "approval_in_progress", "approved"):
        return 100
    return min(100, round((obj.last_saved_step - 1) * 100 / TOTAL_STEPS))


class _VendorApprovalStageMixin:
    def get_current_approval_stage(self, obj):
        instance = getattr(obj, "approval_instance", None)
        if not instance or instance.current_level_order is None:
            return None
        level = instance.current_level()
        return {
            "level_order": instance.current_level_order,
            "level_name": level.name if level else None,
        }

    def get_current_stage(self, obj):
        if obj.status == "approved":
            return "Completed"
        if obj.status in ("submitted", "resubmitted", "approval_in_progress"):
            stage = self.get_current_approval_stage(obj)
            if stage:
                return f"Approval Level {stage['level_order']}: {stage['level_name'] or ''}".strip(": ")
            return "Awaiting Approval Assignment"
        return f"Step {min(obj.last_saved_step, TOTAL_STEPS)} of {TOTAL_STEPS}"


class VendorOnboardingDetailSerializer(_VendorApprovalStageMixin, serializers.ModelSerializer):
    """Read-only composite view used by the admin's tabbed vendor review page."""
    onboarding_profile = VendorOnboardingProfileSerializer(read_only=True)
    kyc = VendorKYCSerializer(read_only=True)
    bank_detail = VendorBankDetailSerializer(read_only=True)
    procurement_detail = VendorProcurementDetailSerializer(read_only=True)
    documents = VendorDocumentSerializer(many=True, read_only=True)
    change_requests = VendorChangeRequestSerializer(many=True, read_only=True)
    vendor_type_display = serializers.CharField(source="get_vendor_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_approval_stage = serializers.SerializerMethodField()
    current_stage = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    is_current_approver = serializers.SerializerMethodField()
    # Data-driven 5-step summary (intake -> tax & KYC -> banking -> contract -> approved).
    onboarding = serializers.SerializerMethodField()
    # Committed POs / bills from finances - internal only, never on the public portal serializer.
    financials = serializers.SerializerMethodField()
    service_categories = serializers.SerializerMethodField()
    # Internal review state (KYC status, risk, bank verification) - admin serializer only.
    review = serializers.SerializerMethodField()
    email_status = serializers.SerializerMethodField()
    # What the requesting user may do, so the UI hides actions their role can't perform.
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = (
            "id", "vendor_reference_no", "name", "email", "phone",
            "onboarding", "financials", "service_categories", "review", "email_status", "permissions",
            "vendor_type", "vendor_type_display", "contact_person_name",
            "company_code", "plant", "internal_requester", "initial_comments",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "created_by", "created_at", "updated_at", "submitted_at", "approved_at", "is_archived",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "documents", "change_requests",
            "current_approval_stage", "is_current_approver",
        )

    def get_progress_percentage(self, obj):
        return _progress_percentage(obj)

    def get_onboarding(self, obj):
        from .progress import summarize_vendor_onboarding

        return summarize_vendor_onboarding(obj)

    def get_financials(self, obj):
        # The list view pre-computes these for every vendor in 4 grouped queries and passes
        # them in context; a single-vendor detail request computes its own.
        financials = self.context.get("vendor_financials")
        if financials is None:
            from .progress import build_vendor_financials

            financials = build_vendor_financials([obj.id])
        summary = dict(financials.get(obj.id) or {})
        if not summary:
            return None
        # FY spend = vendor bills this FY + the manually entered amount (spend not billed in the system).
        profile = getattr(obj, "onboarding_profile", None)
        manual = profile.manual_amount_spent if profile and profile.manual_amount_spent is not None else Decimal("0")
        summary["billed_fy_spend"] = summary["fy_spend"]
        summary["manual_spend"] = str(manual)
        summary["fy_spend"] = str(Decimal(summary["fy_spend"]) + manual)
        return summary

    def get_service_categories(self, obj):
        profile = getattr(obj, "onboarding_profile", None)
        if profile and profile.service_category:
            return [profile.service_category]
        return [pg.product_group_name for pg in obj.product_groups.all()]

    def get_review(self, obj):
        kyc = getattr(obj, "kyc", None)
        bank = getattr(obj, "bank_detail", None)
        return {
            "kyc_status": kyc.kyc_status if kyc else "draft",
            "risk_rating": kyc.risk_rating if kyc else "low",
            "compliance_remarks": kyc.compliance_remarks if kyc else "",
            "bank_verification_status": bank.verification_status if bank else "not_verified",
            "bank_verification_remarks": bank.verification_remarks if bank else "",
        }

    def get_email_status(self, obj):
        log = obj.email_logs.filter(template="vendor_invited.html").first()
        if not log:
            return {"status": "not_sent", "recipient": obj.email or None, "sent_at": None, "sender": None}
        return {"status": log.status, "recipient": log.recipient, "sent_at": log.created_at, "sender": log.sender}

    def get_permissions(self, obj):
        from .views import _can_edit, _can_edit_master_fields

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return {}

        def has(code):
            return bool(user.is_superuser or user.has_role_permission(code))

        is_approver = self.get_is_current_approver(obj)
        return {
            "edit": _can_edit(obj, user),
            # Rating / headcount stay editable after submission and approval.
            "edit_master": _can_edit_master_fields(obj, user),
            "submit": has("vendor.submit") and obj.status in ("draft", "action_required", "invited"),
            "verify": has("vendor.verify") and obj.status != "approved",
            "approve": has("vendor.approve") and is_approver,
            "request_changes": has("vendor.request_changes") and is_approver,
            "send_email": has("vendor.create") and obj.status != "approved",
            "delete": has("vendor.delete"),
            "view_unmasked_bank": has("vendor.bank.view_unmasked"),
            "upload_documents": has("vendor.document.upload") and _can_edit(obj, user),
            "delete_documents": has("vendor.document.delete") and _can_edit(obj, user),
        }

    def get_is_current_approver(self, obj):
        from .services import user_is_authorized_for_level

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        instance = getattr(obj, "approval_instance", None)
        if not instance or instance.current_level_order is None:
            return False
        # Delegate to the same function the approve/request-changes views use
        # to actually authorize the action, so the "show the buttons" flag
        # can never drift out of sync with what the backend will actually allow.
        return user_is_authorized_for_level(request.user, instance.current_level())


class VendorPublicDetailSerializer(_VendorApprovalStageMixin, serializers.ModelSerializer):
    """Public, token-scoped view - excludes anything admin-internal (created_by,
    approval history, is_current_approver, etc.)."""
    onboarding_profile = VendorPublicOnboardingProfileSerializer(read_only=True)
    kyc = VendorKYCSerializer(read_only=True)
    bank_detail = VendorBankDetailSerializer(read_only=True)
    procurement_detail = VendorProcurementDetailSerializer(read_only=True)
    documents = VendorDocumentSerializer(many=True, read_only=True)
    vendor_type_display = serializers.CharField(source="get_vendor_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_stage = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    open_change_request = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = (
            "vendor_reference_no", "name", "email", "phone",
            "vendor_type", "vendor_type_display", "contact_person_name",
            "company_code", "plant",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "submitted_at", "approved_at",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "documents",
            "open_change_request",
        )

    def get_progress_percentage(self, obj):
        return _progress_percentage(obj)

    def get_open_change_request(self, obj):
        change_request = obj.change_requests.filter(status="open").order_by("-requested_at").first()
        if not change_request:
            return None
        return VendorChangeRequestSerializer(change_request).data


class RequestChangesSerializer(serializers.Serializer):
    section = serializers.ChoiceField(choices=VendorChangeRequest.SECTION_CHOICES)
    required_changes = serializers.CharField()
    comments = serializers.CharField(required=False, allow_blank=True, default="")


class VendorSubmitForApprovalSerializer(serializers.Serializer):
    """Pure validation orchestrator - enforces every mandatory / conditional-mandatory
    field and document rule at submit time. Does not itself persist anything."""

    def __init__(self, *args, vendor=None, **kwargs):
        self.vendor = vendor
        super().__init__(*args, **kwargs)

    def validate(self, attrs):
        from .progress import vendor_requirement_issues

        errors = {
            issue["key"]: f"{issue['message']} is required." if issue["kind"] == "missing" else issue["message"]
            for issue in vendor_requirement_issues(self.vendor)
            if issue["stage"] == "submission"
        }
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VendorReviewSerializer(serializers.Serializer):
    """Internal reviewer update of KYC status / risk / bank verification - never used by the portal."""
    kyc_status = serializers.ChoiceField(choices=VendorKYC.KYC_STATUS_CHOICES, required=False)
    risk_rating = serializers.ChoiceField(choices=VendorKYC.RISK_RATING_CHOICES, required=False)
    compliance_remarks = serializers.CharField(required=False, allow_blank=True)
    bank_verification_status = serializers.ChoiceField(choices=VendorBankDetail.VERIFICATION_STATUS_CHOICES, required=False)
    bank_verification_remarks = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs.get("kyc_status") == "rejected" and not (attrs.get("compliance_remarks") or "").strip():
            raise serializers.ValidationError({"compliance_remarks": "A reason is required when rejecting KYC."})
        if attrs.get("bank_verification_status") == "rejected" and not (attrs.get("bank_verification_remarks") or "").strip():
            raise serializers.ValidationError({"bank_verification_remarks": "A reason is required when rejecting bank verification."})
        return attrs


class VendorDocumentVerifySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[("under_review", "Under Review"), ("verified", "Verified"), ("rejected", "Rejected")])
    remarks = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["status"] == "rejected" and not attrs["remarks"].strip():
            raise serializers.ValidationError({"remarks": "A rejection reason is required."})
        return attrs


class VendorAuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VendorAuditLog
        fields = ("id", "action", "action_display", "field_name", "old_value", "new_value", "remarks",
                  "performed_by", "performed_by_name", "created_at")

    def get_performed_by_name(self, obj):
        user = obj.performed_by
        if user:
            return getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", None) or getattr(user, "email", None)
        return "Vendor (self-service)" if obj.performed_by_label == "vendor" else (obj.performed_by_label or "System")
