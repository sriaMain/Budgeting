from rest_framework import serializers

from accounts.models import Vendor
from .models import (
    VendorOnboardingProfile, VendorKYC, VendorBankDetail,
    VendorProcurementDetail, VendorDocument, VendorChangeRequest,
    VendorSubmissionVersion, VendorApprovalWorkflowConfig, VendorApprovalLevel,
    VendorApprovalHistory,
)
from .validators import pan_validator


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


class VendorKYCSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorKYC
        exclude = ("id", "vendor", "created_at", "updated_at")


class VendorBankDetailSerializer(serializers.ModelSerializer):
    """Default (masked) bank detail serializer - never exposes the full account number."""
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at")

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()


class VendorBankDetailUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated reveal endpoint."""

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at")


class VendorProcurementDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProcurementDetail
        exclude = ("id", "vendor", "created_at", "updated_at")


class VendorDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorDocument
        fields = (
            "id", "vendor", "file", "file_name", "file_size", "file_type",
            "category", "is_required", "status", "uploaded_by", "uploaded_by_role", "uploaded_at",
        )
        read_only_fields = ("uploaded_by", "uploaded_by_role", "uploaded_at", "file_name", "file_size", "file_type", "status")

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

    class Meta:
        model = Vendor
        fields = (
            "id", "vendor_reference_no", "name", "email", "phone",
            "vendor_type", "vendor_type_display", "contact_person_name",
            "company_code", "plant", "internal_requester", "initial_comments",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "created_by", "created_at", "updated_at", "submitted_at", "approved_at", "is_archived",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "documents", "change_requests",
            "current_approval_stage", "is_current_approver",
        )

    def get_progress_percentage(self, obj):
        return _progress_percentage(obj)

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
    onboarding_profile = VendorOnboardingProfileSerializer(read_only=True)
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
        vendor = self.vendor
        errors = {}

        if not vendor.name:
            errors["name"] = "Vendor legal name is required."
        if not vendor.vendor_type:
            errors["vendor_type"] = "Vendor type is required."
        if not vendor.email:
            errors["email"] = "Primary email is required."
        if not vendor.phone:
            errors["phone"] = "Primary mobile is required."

        profile = getattr(vendor, "onboarding_profile", None)
        if not profile:
            errors["profile"] = "Vendor details (Step 1) must be completed."
        else:
            for field in ("contact_person_name", "contact_person_designation",
                          "address_line1", "city", "state", "country", "pin_code"):
                if not getattr(profile, field):
                    errors[field] = "This field is required."
            if profile.gst_registered and not profile.gstin:
                errors["gstin"] = "GSTIN is required when GST registered."
            if profile.msme_registered:
                if not profile.udyam_number:
                    errors["udyam_number"] = "UDYAM number is required when MSME registered."
                if not profile.msme_category:
                    errors["msme_category"] = "MSME category is required when MSME registered."

        kyc = getattr(vendor, "kyc", None)
        if not kyc or not kyc.pan:
            errors["pan"] = "PAN is required."
        if kyc:
            try:
                pan_validator(kyc.pan)
            except Exception:
                errors["pan"] = "PAN format is invalid."
            if not getattr(kyc, "country_of_tax_residence", None):
                errors["country_of_tax_residence"] = "Country of tax residence is required."
            if vendor.vendor_type == "company":
                if not kyc.cin:
                    errors["cin"] = "CIN is required for Company vendor type."
                if not kyc.incorporation_date:
                    errors["incorporation_date"] = "Date of incorporation is required for Company vendor type."
            if kyc.tan and not kyc.tan_mobile:
                errors["tan_mobile"] = "TAN associated mobile number is required when TAN is provided."

        bank = getattr(vendor, "bank_detail", None)
        if not bank:
            errors["bank_detail"] = "Bank details (Step 3) must be completed."
        else:
            for field in ("bank_name", "account_holder_name", "account_number", "ifsc_code"):
                if not getattr(bank, field):
                    errors[field] = "This field is required."

        procurement = getattr(vendor, "procurement_detail", None)
        if not procurement:
            errors["procurement_detail"] = "Business / Procurement details (Step 4) must be completed."
        else:
            for field in ("account_group", "purchasing_org", "payment_terms", "order_currency"):
                if not getattr(procurement, field):
                    errors[field] = "This field is required."

        documents = list(vendor.documents.all())
        categories_present = {d.category for d in documents}
        if "pan" not in categories_present:
            errors["document_pan"] = "PAN document is required."
        bank_proof_categories = {
            "bank_proof_cancelled_cheque", "bank_proof_bank_statement", "bank_proof_bank_certificate",
        }
        if not (categories_present & bank_proof_categories):
            errors["document_bank_proof"] = "At least one bank proof document is required."
        if profile and profile.gst_registered and "gst_certificate" not in categories_present:
            errors["document_gst_certificate"] = "GST certificate is required when GST registered."
        if vendor.vendor_type == "company" and "cin_incorporation_certificate" not in categories_present:
            errors["document_cin"] = "CIN / Incorporation certificate is required for Company vendor type."
        if profile and profile.msme_registered and "msme_udyam_certificate" not in categories_present:
            errors["document_msme"] = "UDYAM / MSME certificate is required when MSME registered."
        if kyc and kyc.epf_number and "epf_certificate" not in categories_present:
            errors["document_epf"] = "EPF certificate is required when an EPF number is provided."
        if kyc and kyc.esic_number and "esic_certificate" not in categories_present:
            errors["document_esic"] = "ESIC certificate is required when an ESIC number is provided."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs
