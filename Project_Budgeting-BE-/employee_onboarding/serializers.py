from rest_framework import serializers

from accounts.models import Account
from .models import (
    EmployeeOnboardingRequest, EmployeePersonalDetail, EmployeeAddressDetail,
    EmployeeStatutoryDetail, EmployeeBankDetail, EmployeeEmergencyContact,
    EmployeeDocument, EmployeeChangeRequest, EmployeeSubmissionVersion,
    EmployeeOnboardingHistory,
)
from .validators import pan_validator, aadhaar_validator


TOTAL_STEPS = 8

MANDATORY_DOCUMENT_CATEGORIES = ("pan", "aadhaar", "bank_proof", "photo", "education_certificate")


class AccountBasicSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Account
        fields = ("id", "first_name", "last_name", "email", "display_name")


class EmployeeInviteSerializer(serializers.Serializer):
    """Used by the admin's 'Send Onboarding Invite' action - only the
    employment details the admin owns. Everything else is filled in by the
    employee themselves via the secure link."""

    # Optional - if left blank, services.send_or_resend_invite auto-assigns
    # an EMP-<year>-<seq> code (mirrors accounts.Vendor's vendor_reference_no),
    # so an admin can create a bare Employee account with no employment
    # details at all and fill the rest in afterwards via the onboarding wizard.
    employee_code = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    department = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    designation = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    reporting_manager = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(), required=False, allow_null=True, default=None,
    )
    joining_date = serializers.DateField(required=False, allow_null=True, default=None)
    employment_type = serializers.ChoiceField(
        choices=EmployeeOnboardingRequest.EMPLOYMENT_TYPE_CHOICES, required=False, allow_blank=True, default="",
    )
    work_location = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    pf_applicable = serializers.BooleanField(required=False, default=False)

    def __init__(self, *args, account=None, **kwargs):
        self.account = account
        super().__init__(*args, **kwargs)

    def validate_employee_code(self, value):
        if not value:
            return value
        qs = EmployeeOnboardingRequest.objects.filter(employee_code=value)
        if self.account is not None:
            qs = qs.exclude(account=self.account)
        if qs.exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value


class EmployeeEmploymentDetailsSerializer(serializers.ModelSerializer):
    """Admin-only PATCH of the request's own employment fields, used by the
    'fill onboarding on the employee's behalf' wizard to complete details that
    were left blank at invite time. All fields optional/partial-friendly -
    mirrors VendorOnboardingDraftSerializer's philosophy that drafts may be
    saved with anything filled in, or nothing at all."""

    class Meta:
        model = EmployeeOnboardingRequest
        fields = (
            "employee_code", "department", "designation", "reporting_manager",
            "joining_date", "employment_type", "work_location", "pf_applicable",
        )
        extra_kwargs = {
            "employee_code": {"required": False, "allow_null": True, "allow_blank": True},
            "department": {"required": False, "allow_blank": True},
            "designation": {"required": False, "allow_blank": True},
            "employment_type": {"required": False, "allow_blank": True},
            "work_location": {"required": False, "allow_blank": True},
        }

    def validate_employee_code(self, value):
        if not value:
            return value
        qs = EmployeeOnboardingRequest.objects.filter(employee_code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value


class EmployeePersonalDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeePersonalDetail
        exclude = ("id", "request", "created_at", "updated_at")


class EmployeeAddressDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeAddressDetail
        exclude = ("id", "request", "created_at", "updated_at")


class EmployeeStatutoryDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeStatutoryDetail
        exclude = ("id", "request", "created_at", "updated_at")


class EmployeeBankDetailSerializer(serializers.ModelSerializer):
    """Default (masked) bank detail serializer - never exposes the full account number."""
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeBankDetail
        exclude = ("id", "request", "created_at", "updated_at")

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()


class EmployeeEmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeEmergencyContact
        exclude = ("id", "request", "created_at", "updated_at")


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeDocument
        fields = (
            "id", "request", "file", "file_name", "file_size", "file_type",
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
            validated_data["uploaded_by_role"] = "employee"

        return super().create(validated_data)


class EmployeeChangeRequestSerializer(serializers.ModelSerializer):
    section_display = serializers.CharField(source="get_section_display", read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeChangeRequest
        fields = (
            "id", "section", "section_display", "field_name", "reason", "comments",
            "requested_by", "requested_by_name", "requested_at", "status", "resolved_at",
        )
        read_only_fields = ("requested_by", "requested_at", "status", "resolved_at")

    def get_requested_by_name(self, obj):
        if not obj.requested_by:
            return None
        return obj.requested_by.display_name or obj.requested_by.username


class RequestEmployeeChangesSerializer(serializers.Serializer):
    section = serializers.ChoiceField(choices=EmployeeChangeRequest.SECTION_CHOICES)
    field_name = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField()
    comments = serializers.CharField(required=False, allow_blank=True, default="")


class EmployeeSubmissionVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeSubmissionVersion
        fields = ("id", "version_number", "snapshot", "is_resubmission", "created_at")


class EmployeeOnboardingHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    section = serializers.CharField(source="change_request.section", read_only=True, default=None)

    class Meta:
        model = EmployeeOnboardingHistory
        fields = (
            "id", "actor", "actor_name", "actor_role_snapshot",
            "action", "previous_status", "new_status", "comments", "reason",
            "section", "created_at",
        )

    def get_actor_name(self, obj):
        if not obj.actor:
            return "Employee"
        return obj.actor.display_name or obj.actor.username


def _progress_percentage(obj):
    if obj.status in ("submitted", "resubmitted", "approved"):
        return 100
    return min(100, round((obj.last_saved_step - 1) * 100 / TOTAL_STEPS))


def _current_stage(obj):
    if obj.status == "approved":
        return "Completed"
    if obj.status in ("submitted", "resubmitted"):
        return "Awaiting Admin Approval"
    return f"Step {min(obj.last_saved_step, TOTAL_STEPS)} of {TOTAL_STEPS}"


class EmployeeOnboardingDetailSerializer(serializers.ModelSerializer):
    """Read-only composite view used by the admin's tabbed employee review page."""
    account = AccountBasicSerializer(read_only=True)
    reporting_manager = AccountBasicSerializer(read_only=True)
    personal_detail = EmployeePersonalDetailSerializer(read_only=True)
    address_detail = EmployeeAddressDetailSerializer(read_only=True)
    statutory_detail = EmployeeStatutoryDetailSerializer(read_only=True)
    bank_detail = EmployeeBankDetailSerializer(read_only=True)
    emergency_contact = EmployeeEmergencyContactSerializer(read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    change_requests = EmployeeChangeRequestSerializer(many=True, read_only=True)
    employment_type_display = serializers.CharField(source="get_employment_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_stage = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeOnboardingRequest
        fields = (
            "id", "account", "employee_code", "department", "designation",
            "reporting_manager", "joining_date", "employment_type", "employment_type_display",
            "work_location", "pf_applicable",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "created_by", "created_at", "updated_at", "submitted_at", "approved_at",
            "personal_detail", "address_detail", "statutory_detail", "bank_detail",
            "emergency_contact", "documents", "change_requests",
        )

    def get_progress_percentage(self, obj):
        return _progress_percentage(obj)

    def get_current_stage(self, obj):
        return _current_stage(obj)


class EmployeePublicDetailSerializer(serializers.ModelSerializer):
    """Public, token-scoped view - excludes anything admin-internal (created_by,
    approval history, etc.)."""
    account = AccountBasicSerializer(read_only=True)
    reporting_manager_name = serializers.SerializerMethodField()
    personal_detail = EmployeePersonalDetailSerializer(read_only=True)
    address_detail = EmployeeAddressDetailSerializer(read_only=True)
    statutory_detail = EmployeeStatutoryDetailSerializer(read_only=True)
    bank_detail = EmployeeBankDetailSerializer(read_only=True)
    emergency_contact = EmployeeEmergencyContactSerializer(read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    employment_type_display = serializers.CharField(source="get_employment_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_stage = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    open_change_request = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeOnboardingRequest
        fields = (
            "account", "employee_code", "department", "designation",
            "reporting_manager_name", "joining_date", "employment_type", "employment_type_display",
            "work_location", "pf_applicable",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "submitted_at", "approved_at",
            "personal_detail", "address_detail", "statutory_detail", "bank_detail",
            "emergency_contact", "documents", "open_change_request",
        )

    def get_reporting_manager_name(self, obj):
        return obj.reporting_manager.display_name if obj.reporting_manager else None

    def get_progress_percentage(self, obj):
        return _progress_percentage(obj)

    def get_current_stage(self, obj):
        return _current_stage(obj)

    def get_open_change_request(self, obj):
        change_request = obj.change_requests.filter(status="open").order_by("-requested_at").first()
        if not change_request:
            return None
        return EmployeeChangeRequestSerializer(change_request).data


class EmployeePublicIdentityUpdateSerializer(serializers.ModelSerializer):
    """PATCH for exactly the two base identity fields the employee may edit on
    Account (Step 1) - never exposes any other Account field, since Account is
    the shared login/user model, not something specific to onboarding."""

    class Meta:
        model = Account
        fields = ("first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }


class EmployeeSubmitSerializer(serializers.Serializer):
    """Pure validation orchestrator - enforces every mandatory / conditional-
    mandatory field and document rule at submit time. Does not itself persist
    anything."""

    def __init__(self, *args, onboarding_request=None, **kwargs):
        self.onboarding_request = onboarding_request
        super().__init__(*args, **kwargs)

    def validate(self, attrs):
        req = self.onboarding_request
        errors = {}

        account = req.account
        if not account.first_name:
            errors["first_name"] = "First name is required."
        if not account.last_name:
            errors["last_name"] = "Last name is required."

        personal = getattr(req, "personal_detail", None)
        if not personal:
            errors["personal_detail"] = "Personal details (Step 1) must be completed."
        else:
            if not personal.personal_email:
                errors["personal_email"] = "Personal email is required."
            if not personal.mobile_number:
                errors["mobile_number"] = "Mobile number is required."
            if not personal.date_of_birth:
                errors["date_of_birth"] = "Date of birth is required."
            if not personal.gender:
                errors["gender"] = "Gender is required."

        address = getattr(req, "address_detail", None)
        if not address:
            errors["address_detail"] = "Address (Step 2) must be completed."
        else:
            for field in ("current_address", "city", "state", "country", "pin_code"):
                if not getattr(address, field):
                    errors[field] = "This field is required."

        if not req.employee_code:
            errors["employee_code"] = "Employee ID is required."
        if not req.department:
            errors["department"] = "Department is required."
        if not req.designation:
            errors["designation"] = "Designation is required."
        if not req.reporting_manager_id:
            errors["reporting_manager"] = "Reporting manager is required."
        if not req.joining_date:
            errors["joining_date"] = "Joining date is required."
        if not req.employment_type:
            errors["employment_type"] = "Employment type is required."
        if not req.work_location:
            errors["work_location"] = "Work location is required."

        statutory = getattr(req, "statutory_detail", None)
        if not statutory:
            errors["statutory_detail"] = "Statutory details (Step 4) must be completed."
        else:
            if not statutory.pan:
                errors["pan"] = "PAN is required."
            else:
                try:
                    pan_validator(statutory.pan)
                except Exception:
                    errors["pan"] = "PAN format is invalid."
            if not statutory.aadhaar_number:
                errors["aadhaar_number"] = "Aadhaar number is required."
            else:
                try:
                    aadhaar_validator(statutory.aadhaar_number)
                except Exception:
                    errors["aadhaar_number"] = "Aadhaar format is invalid."
            if req.pf_applicable and not statutory.uan_number:
                errors["uan_number"] = "UAN is required when PF is applicable."

        bank = getattr(req, "bank_detail", None)
        if not bank:
            errors["bank_detail"] = "Bank details (Step 5) must be completed."
        else:
            for field in ("account_holder_name", "bank_name", "account_number", "ifsc_code"):
                if not getattr(bank, field):
                    errors[field] = "This field is required."

        emergency = getattr(req, "emergency_contact", None)
        if not emergency:
            errors["emergency_contact"] = "Emergency contact (Step 6) must be completed."
        else:
            for field in ("contact_name", "contact_number", "relationship"):
                if not getattr(emergency, field):
                    errors[field] = "This field is required."

        categories_present = set(req.documents.values_list("category", flat=True))
        for category in MANDATORY_DOCUMENT_CATEGORIES:
            if category not in categories_present:
                errors[f"document_{category}"] = f"{dict(EmployeeDocument.CATEGORY_CHOICES)[category]} is required."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs
