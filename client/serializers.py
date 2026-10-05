from rest_framework import serializers
from .models import POC, ClientAuditLog, ClientChangeRequest, ClientDocument, Company, CompanyTag
from phonenumber_field.serializerfields import PhoneNumberField

class CompanyTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyTag
        fields = ["id", "name"]



class CompanySerializer(serializers.ModelSerializer):

    tags = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=CompanyTag.objects.all(),
        required=False,
    )

    # Write-only (for input)
    country_code = serializers.CharField(write_only=True)
    mobile_number = serializers.CharField(write_only=True)

    # Backward-compatible combined address for read-only consumers (PDFs, listings)
    street_address = serializers.CharField(read_only=True)

    # Bank account number is write-only; only a masked version is ever read back
    bank_account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bank_account_number_masked = serializers.SerializerMethodField()

    is_project_ready = serializers.BooleanField(read_only=True)
    jurisdiction = serializers.CharField(read_only=True)
    step_statuses = serializers.SerializerMethodField()
    approval_blockers = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id",
            "company_name",
            "country_code",
            "mobile_number",
            "email",
            "gstin",
            "address1",
            "address2",
            "street_address",
            "city",
            "postal_code",
            "state",
            "country",
            "tags",
            "client_type",
            "currency",
            "registration_no",
            "pan",
            "tax_id",
            "authorised_signatory_name",
            "authorised_signatory_role",
            "bank_name",
            "bank_account_number",
            "bank_account_number_masked",
            "bank_code",
            "bank_branch",
            "bank_country",
            "bank_address",
            "banking_verification_status",
            "sanctions_screening_status",
            "beneficial_ownership_status",
            "tax_residency_status",
            "enhanced_due_diligence_status",
            "compliance_remarks",
            "compliance_reviewed_by",
            "compliance_reviewed_at",
            "payment_terms",
            "custom_payment_terms",
            "withholding_tax_applicable",
            "withholding_tax_percentage",
            "invoice_requirements",
            "po_required",
            "billing_frequency",
            "billing_contact",
            "billing_email",
            "commercial_remarks",
            "kyc_status",
            "risk_rating",
            "onboarding_step",
            "is_active",
            "kyc_verified_by",
            "kyc_verified_at",
            "approval_remarks",
            "is_project_ready",
            "jurisdiction",
            "step_statuses",
            "approval_blockers",
            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            "gstin": {"required": False},
            "address1": {"required": False},
            "address2": {"required": False},
            "country": {"required": True},
            "state": {"required": True},
            "client_type": {"required": False},
            "currency": {"required": False},
            "registration_no": {"required": False},
            "pan": {"required": False},
            "tax_id": {"required": False},
            "authorised_signatory_name": {"required": False},
            "authorised_signatory_role": {"required": False},
            "bank_name": {"required": False},
            "bank_code": {"required": False},
            "bank_branch": {"required": False},
            "bank_country": {"required": False},
            "bank_address": {"required": False},
            "banking_verification_status": {"required": False},
            "sanctions_screening_status": {"required": False},
            "beneficial_ownership_status": {"required": False},
            "tax_residency_status": {"required": False},
            "enhanced_due_diligence_status": {"required": False},
            "compliance_remarks": {"required": False},
            "compliance_reviewed_by": {"required": False},
            "payment_terms": {"required": False},
            "custom_payment_terms": {"required": False},
            "withholding_tax_applicable": {"required": False},
            "withholding_tax_percentage": {"required": False},
            "invoice_requirements": {"required": False},
            "po_required": {"required": False},
            "billing_frequency": {"required": False},
            "billing_contact": {"required": False},
            "billing_email": {"required": False},
            "commercial_remarks": {"required": False},
            "kyc_status": {"required": False},
            "risk_rating": {"required": False},
            "onboarding_step": {"required": False},
            "is_active": {"required": False},
            # Set only by ClientSubmitForApprovalView, never directly writable via PATCH.
            "kyc_verified_by": {"read_only": True},
            "kyc_verified_at": {"read_only": True},
            "approval_remarks": {"required": False},
        }

    def get_bank_account_number_masked(self, obj):
        return obj.mask_account_number()

    def get_step_statuses(self, obj):
        return {step: obj.get_step_status(step) for step, _ in Company.ONBOARDING_STEP_CHOICES}

    def get_approval_blockers(self, obj):
        return obj.get_approval_blockers()

    def validate(self, attrs):

        country_code = attrs.get("country_code")
        number = attrs.get("mobile_number")

        if not country_code or not number:
            raise serializers.ValidationError({
                "mobile_number": "Country code and mobile number are required."
            })

        # Combine and store full number
        full_number = f"{country_code}{number}"
        attrs["mobile_number"] = full_number

        # Model.clean() is never called by ModelSerializer.save(), so the
        # Approved-blocked-until-Verified business rule has to be enforced
        # here to actually take effect through the API.
        onboarding_step = attrs.get("onboarding_step", getattr(self.instance, "onboarding_step", None))
        kyc_status = attrs.get("kyc_status", getattr(self.instance, "kyc_status", None))
        if onboarding_step == "approved" and kyc_status != "verified":
            raise serializers.ValidationError({
                "onboarding_step": "A client cannot be marked Approved until KYC status is Verified."
            })

        return attrs

    def create(self, validated_data):
        validated_data.pop("country_code")
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("country_code", None)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        rep = super().to_representation(instance)

        phone = instance.mobile_number

        if phone:
            rep["country_code"] = f"+{phone.country_code}"
            rep["mobile_number"] = str(phone.national_number)

        rep["tags"] = CompanyTagSerializer(instance.tags.all(), many=True).data

        return rep


# class PointOfContactSerializer(serializers.ModelSerializer):
#     company_name = serializers.CharField(source='company.company_name', read_only=True)
#     country_code = serializers.CharField(write_only=True)
#     poc_mobile = serializers.CharField(write_only=True)

  


#     class Meta:
#         model = POC
#         fields = ["id", "company", "company_name", "poc_name", "designation", "poc_email"]
#         extra_kwargs = {
#             'company': {'write_only': True}
#         }

#     def validate(self, attrs):

#         country_code = attrs.get("country_code")
#         number = attrs.get("poc_mobile")

#         if not country_code or not number:
#             raise serializers.ValidationError({
#                 "poc_mobile": "Country code and mobile number are required."
#             })

#         # Combine
#         full_number = f"{country_code}{number}"

#         attrs["poc_mobile"] = full_number
#         return attrs

#     def create(self, validated_data):
#         validated_data.pop("country_code")
#         return super().create(validated_data)

#     def update(self, instance, validated_data):
#         validated_data.pop("country_code", None)
#         return super().update(instance, validated_data)

#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         # If an instance is passed (i.e., for an update), make 'company' not required.
#         if self.instance:
#             self.fields['company'].required = False

#     def validate_company(self, value):
#         if not Company.objects.filter(id=value.id).exists():
#             raise serializers.ValidationError("Company does not exist.")
#         return value

#     def validate(self, data):
#         """
#         Check for duplicate email or mobile number within the same company.
#         """
#         # For updates where company_id is not provided, use the instance's company
#         company = data.get('company') or (self.instance and self.instance.company)
        
#         poc_email = data.get('poc_email')
#         poc_mobile = data.get('poc_mobile')
        
#         # On update, self.instance is the existing POC object.
#         # On create, self.instance is None.
#         instance = self.instance

#         # Base queryset for checking duplicates
#         queryset = POC.objects.filter(company=company)

#         # If updating, exclude the current instance from the queryset
#         if instance:
#             queryset = queryset.exclude(pk=instance.pk)

#         # Check if a POC with the same email exists for this company
#         if poc_email and queryset.filter(poc_email__iexact=poc_email).exists():
#             raise serializers.ValidationError(
#                 "A point of contact with this email address already exists for this company."
#             )

#         # Check if a POC with the same mobile number exists for this company
#         if poc_mobile and queryset.filter(poc_mobile=poc_mobile).exists():
#             raise serializers.ValidationError(
#                 "A point of contact with this mobile number already exists for this company."
#             )

#         return data
from phonenumber_field.serializerfields import PhoneNumberField

class PointOfContactSerializer(serializers.ModelSerializer):

    company_name = serializers.CharField(
        source='company.company_name',
        read_only=True
    )

    # Write-only input
    country_code = serializers.CharField(write_only=True)
    input_mobile = serializers.CharField(write_only=True)

    # Proper read field for model
    poc_mobile = PhoneNumberField(read_only=True)

    # Auto-derived full name, kept for consumers that only display it
    poc_name = serializers.CharField(read_only=True)

    class Meta:
        model = POC
        fields = [
            "id",
            "company",
            "company_name",
            "salutation",
            "first_name",
            "middle_name",
            "last_name",
            "poc_name",
            "designation",
            "poc_email",
            "country_code",
            "input_mobile",
            "poc_mobile",
        ]
        extra_kwargs = {
            "company": {"write_only": True},
            "salutation": {"required": True},
            "first_name": {"required": True},
            "last_name": {"required": True},
        }

    def validate(self, attrs):

        country_code = attrs.get("country_code")
        number = attrs.get("input_mobile")

        if not country_code or not number:
            raise serializers.ValidationError({
                "input_mobile": "Country code and mobile number are required."
            })

        full_number = f"{country_code}{number}"
        attrs["poc_mobile"] = full_number

        return attrs

    def create(self, validated_data):
        validated_data.pop("country_code")
        validated_data.pop("input_mobile")
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("country_code", None)
        validated_data.pop("input_mobile", None)
        return super().update(instance, validated_data)


class ClientDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientDocument
        fields = (
            "id", "company", "file", "file_name", "file_size", "file_type",
            "category", "is_required", "status", "uploaded_by", "uploaded_at",
            "verified_by", "verified_at", "remarks",
        )
        # verified_by/verified_at/remarks are only ever set by ClientDocumentVerifyView,
        # never directly writable through list/upload.
        read_only_fields = (
            "uploaded_by", "uploaded_at", "file_name", "file_size", "file_type", "status",
            "verified_by", "verified_at", "remarks",
        )
        # The stored Cloudinary reference is never sent back - files are only ever reachable
        # through ClientDocumentDownloadView's permission-checked, short-lived signed URL.
        extra_kwargs = {"file": {"write_only": True}}

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


class ClientAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source="performed_by.get_full_name", read_only=True, default="")

    class Meta:
        model = ClientAuditLog
        fields = (
            "id", "company", "company_name", "action", "field_name", "old_value", "new_value",
            "performed_by", "performed_by_name", "created_at",
        )
        read_only_fields = fields


class ClientChangeRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True, default="")

    class Meta:
        model = ClientChangeRequest
        fields = (
            "id", "company", "section", "required_changes", "comments",
            "requested_by", "requested_by_name", "requested_at", "status", "resolved_at",
        )
        read_only_fields = ("requested_by", "requested_at", "status", "resolved_at")

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if user is not None and user.is_authenticated:
            validated_data["requested_by"] = user
        return super().create(validated_data)


class ClientApprovalReadinessSerializer(serializers.Serializer):
    """Pure (non-model) Final Approval checklist validator - mirrors
    VendorSubmitForApprovalSerializer's shape. Not tied to persistence: it only ever
    reads the company instance passed into it and reports what's missing."""

    approval_remarks = serializers.CharField(required=False, allow_blank=True)

    def __init__(self, *args, company=None, **kwargs):
        self.company = company
        super().__init__(*args, **kwargs)

    def validate(self, attrs):
        blockers = self.company.get_approval_blockers()
        if blockers:
            raise serializers.ValidationError({"missing": blockers})
        return attrs
