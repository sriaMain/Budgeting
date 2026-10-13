import re
from decimal import Decimal

from rest_framework import serializers
from phonenumber_field.serializerfields import PhoneNumberField

from core import countries as country_rules
from core.document_security import effective_document_status
from core.onboarding_validation import (
    check_country,
    clean_bank_details,
    clean_postal_code,
    clean_tax_id,
    confirm_account_number,
    normalize_country_fields,
)

from .models import POC, ClientAuditLog, ClientChangeRequest, ClientDocument, Company, CompanyTag
from .onboarding import BANK_FIELD_MAP, bank_country_code
from .permissions import record_permissions, user_permissions


class CompanyTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyTag
        fields = ["id", "name"]


# Bank fields whose change means the account is no longer the one a reviewer verified.
BANK_IDENTITY_FIELDS = {
    "bank_account_holder_name", "bank_name", "bank_account_number", "bank_ifsc_code", "bank_swift_code",
    "bank_iban", "bank_routing_code", "bank_country",
}

# Only a compliance reviewer may flag these through a normal edit; every other KYC status
# change goes through the submit / approve / request-changes endpoints.
REVIEWER_KYC_STATUSES = ("enhanced_review", "review_due")

DUPLICATE_CHECKS = (
    # (field, lookup, message)
    ("company_name", "company_name__iexact", "A client with this legal name is already registered."),
    ("email", "email__iexact", "This email address is already registered to another client."),
    ("mobile_number", "mobile_number", "This phone number is already registered to another client."),
    ("pan", "pan__iexact", "This PAN is already registered to another client."),
    ("gstin", "gstin__iexact", "This GSTIN is already registered to another client."),
    ("tax_id", "tax_id__iexact", "This tax ID is already registered to another client."),
)


def _phone_text(value) -> str:
    """E.164 text of a stored phone number ('' when blank)."""
    if not value:
        return ""
    try:
        return value.as_e164 if value.is_valid() else str(value)
    except AttributeError:
        return str(value)


def _comparable(value):
    if hasattr(value, "as_e164"):
        return _phone_text(value)
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, Decimal):
        return value.normalize()
    return value


class CompanySerializer(serializers.ModelSerializer):
    """Client (Company) create / edit.

    Drafts may be partial: on create only the Basic Information minimum (legal name, email,
    phone, country) is required and every value sent is checked for format; required-ness of the
    remaining KYC data is enforced by POST /client/<id>/submit/ (client/onboarding.py).
    """

    tags = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=CompanyTag.objects.all(),
        required=False,
    )

    # Write-only phone input: an E.164 value in `mobile_number` ("+919876543210"), or the legacy
    # pair `country_code` ("+91") + national `mobile_number`. Required on create, and validated
    # whenever either is sent.
    country_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mobile_number = serializers.CharField(write_only=True, required=False, allow_blank=True)

    # Backward-compatible combined address for read-only consumers (PDFs, listings)
    street_address = serializers.CharField(read_only=True)

    # Bank account number is write-only; only a masked version is ever read back. A blank value
    # keeps the number on file. When `confirm_account_number` is sent it must match.
    bank_account_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=34)
    confirm_account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bank_account_number_masked = serializers.SerializerMethodField()

    is_project_ready = serializers.BooleanField(read_only=True)
    jurisdiction = serializers.CharField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "company_name",
            "country_code",
            "mobile_number",
            "email",
            "contact_person",
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
            "bank_account_holder_name",
            "bank_name",
            "bank_account_number",
            "confirm_account_number",
            "bank_account_number_masked",
            "bank_ifsc_code",
            "bank_routing_code",
            "bank_swift_code",
            "bank_iban",
            "bank_account_type",
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
            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            # Uniqueness is checked case-insensitively in validate() with a clear message.
            "company_name": {"validators": []},
            "email": {"validators": []},
            # PAN / GSTIN are upper-cased and checked per country in validate().
            "gstin": {"required": False, "validators": []},
            "pan": {"required": False, "validators": []},
            "country": {"required": True},
            "state": {"required": False},
            "withholding_tax_percentage": {"min_value": Decimal("0"), "max_value": Decimal("100")},
            # Legacy single bank identifier - migration 0016 copied it into the new fields.
            "bank_code": {"read_only": True},
            # Stamped by the server when a compliance status changes.
            "compliance_reviewed_by": {"read_only": True},
            "compliance_reviewed_at": {"read_only": True},
            # Set only by the approve endpoint.
            "kyc_verified_by": {"read_only": True},
            "kyc_verified_at": {"read_only": True},
            "approval_remarks": {"read_only": True},
        }

    def get_bank_account_number_masked(self, obj):
        return obj.mask_account_number()

    # ------------------------------------------------------------------ validation

    def _value(self, attrs, field, default=""):
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, default) if self.instance is not None else default

    def validate(self, attrs):
        errors: dict = {}
        instance = self.instance
        attrs.pop("confirm_account_number", None)  # compared against initial_data below

        for field in ("company_name", "contact_person", "registration_no", "authorised_signatory_name",
                      "authorised_signatory_role", "billing_contact", "address1", "address2", "city", "state"):
            if isinstance(attrs.get(field), str):
                attrs[field] = attrs[field].strip()
        for field in ("email", "billing_email"):
            if isinstance(attrs.get(field), str):
                attrs[field] = attrs[field].strip().lower()

        if instance is None or "company_name" in attrs:
            if not (attrs.get("company_name") or "").strip():
                errors["company_name"] = "Legal name is required."
        if instance is None or "email" in attrs:
            if not attrs.get("email"):
                errors["email"] = "Email is required."

        # Country (stored as the canonical display name)
        normalize_country_fields(attrs, "country", "bank_country")
        check_country(attrs, "country", errors)
        check_country(attrs, "bank_country", errors)
        if (instance is None or "country" in attrs) and not (attrs.get("country") or "").strip():
            errors["country"] = "Country is required."
        country = (self._value(attrs, "country") or "").strip()
        indian = not country or country_rules.is_india(country)
        client_type = self._value(attrs, "client_type", "company")
        entity = "individual" if client_type == "individual" else "business"

        self._clean_phone(attrs, country, errors)

        # Postal code (format per country)
        if "postal_code" in attrs and country_rules.resolve_country(country):
            clean_postal_code(attrs, "postal_code", country, errors)

        # Tax identifiers: PAN / GSTIN for India, the country's tax ID elsewhere
        for field in ("pan", "gstin"):
            if isinstance(attrs.get(field), str):
                attrs[field] = re.sub(r"\s+", "", attrs[field]).upper()
        if indian:
            if attrs.get("pan") and not re.match(country_rules.PAN_REGEX, attrs["pan"]):
                errors["pan"] = "Enter a valid PAN (10 characters, e.g. AAAAA9999A)."
            if attrs.get("gstin") and not re.match(country_rules.GSTIN_REGEX, attrs["gstin"]):
                errors["gstin"] = "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)."
            pan, gstin = self._value(attrs, "pan"), self._value(attrs, "gstin")
            if (
                ("pan" in attrs or "gstin" in attrs) and pan and gstin
                and "pan" not in errors and "gstin" not in errors and gstin[2:12] != pan
            ):
                errors["gstin"] = "The GSTIN doesn't match the PAN (characters 3-12 of a GSTIN are the PAN)."
            if isinstance(attrs.get("tax_id"), str):
                attrs["tax_id"] = attrs["tax_id"].strip()
        else:
            for field, label in (("pan", "PAN"), ("gstin", "GSTIN")):
                if attrs.get(field) and attrs[field] != (getattr(instance, field, "") or ""):
                    errors[field] = f"{label} applies only to clients in India - use the Tax ID field instead."
            clean_tax_id(attrs, "tax_id", country, errors, entity)

        self._clean_bank(attrs, country, errors)
        self._clean_workflow_fields(attrs, errors)

        if attrs.get("withholding_tax_applicable") is False and "withholding_tax_percentage" not in attrs:
            attrs["withholding_tax_percentage"] = None

        self._check_duplicates(attrs, errors)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def _clean_phone(self, attrs, country, errors):
        sent = "mobile_number" in attrs or "country_code" in attrs
        code = (attrs.pop("country_code", None) or "").strip()
        raw = (attrs.get("mobile_number") or "").strip()
        if not sent:
            if self.instance is None:
                errors["mobile_number"] = "Phone number is required."
            return
        if not raw:
            attrs.pop("mobile_number", None)
            errors["mobile_number"] = "Phone number is required."
            return
        if not raw.startswith("+") and code:
            raw = "+" + re.sub(r"\D", "", code) + re.sub(r"\D", "", raw)
        try:
            attrs["mobile_number"] = country_rules.normalize_phone(raw, default_country=country or None)
        except country_rules.PhoneValidationError as exc:
            attrs.pop("mobile_number", None)
            errors["mobile_number"] = str(exc)

    def _clean_bank(self, attrs, country, errors):
        touched = any(f in attrs for f in BANK_FIELD_MAP.values()) or "bank_country" in attrs or "bank_account_type" in attrs
        confirm = self.initial_data.get("confirm_account_number") if hasattr(self.initial_data, "get") else None
        if not touched and not confirm:
            return
        instance = self.instance
        has_saved = bool(instance is not None and instance.bank_account_number)
        if "bank_account_number" in attrs and not (attrs["bank_account_number"] or "").strip():
            # Blank = keep the number on file (it is write-only and never sent back in full).
            attrs.pop("bank_account_number")
        bank_country = (self._value(attrs, "bank_country") or "").strip() or country
        clean_bank_details(
            attrs, bank_country, errors, instance=instance, field_map=BANK_FIELD_MAP,
            partial=True, has_saved_account_number=has_saved,
        )
        confirm_account_number(self.initial_data, "bank_account_number", "confirm_account_number", errors)
        account_type = (attrs.get("bank_account_type") or "").strip()
        if account_type:
            code = country_rules.resolve_country(bank_country) or "IN"
            allowed = [value for value, _ in (country_rules.bank_config(code).get("account_types") or [])]
            if account_type not in allowed:
                errors["bank_account_type"] = "Select a valid account type for the bank's country."

    def _clean_workflow_fields(self, attrs, errors):
        instance = self.instance
        if "kyc_status" in attrs:
            current = instance.kyc_status if instance is not None else "draft"
            if attrs["kyc_status"] == current:
                attrs.pop("kyc_status")
            elif instance is None or attrs["kyc_status"] not in REVIEWER_KYC_STATUSES:
                errors["kyc_status"] = (
                    "KYC status changes through Submit for approval, Approve and Request changes. "
                    "A reviewer can only flag a client for Enhanced Review or Review Due here."
                )
        if "onboarding_step" in attrs:
            current = instance.onboarding_step if instance is not None else "intake"
            if attrs["onboarding_step"] == current:
                attrs.pop("onboarding_step")
            elif attrs["onboarding_step"] == "approved":
                errors["onboarding_step"] = "A client is marked Approved only by the Approve action."

    def _check_duplicates(self, attrs, errors):
        others = Company.objects.all()
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        for field, lookup, message in DUPLICATE_CHECKS:
            value = attrs.get(field)
            if field in errors or value in (None, ""):
                continue
            if self.instance is not None and _comparable(getattr(self.instance, field)) == _comparable(value):
                continue  # unchanged (legacy duplicates must not block unrelated edits)
            if others.filter(**{lookup: value}).exists():
                errors[field] = message

    # ------------------------------------------------------------------ output

    def to_representation(self, instance):
        rep = super().to_representation(instance)

        phone = instance.mobile_number
        rep["phone"] = _phone_text(phone)
        if phone and getattr(phone, "country_code", None):
            rep["country_code"] = f"+{phone.country_code}"
            rep["mobile_number"] = str(phone.national_number)
        else:
            rep["country_code"] = ""
            rep["mobile_number"] = rep["phone"]

        rep["tags"] = CompanyTagSerializer(instance.tags.all(), many=True).data
        rep["kyc_status_display"] = instance.get_kyc_status_display()

        state = instance.onboarding_state()
        rep["step_statuses"] = state.step_statuses
        rep["approval_blockers"] = state.approval_blockers
        rep["submission_issues"] = state.submission_issues
        rep["document_slots"] = state.slots
        rep["required_documents"] = state.required_documents
        rep["bank_country_code"] = bank_country_code(instance)

        flags = self.context.get("user_permissions")
        request = self.context.get("request")
        if flags is None and request is not None:
            flags = user_permissions(request.user)
        rep["permissions"] = record_permissions(instance, flags) if flags is not None else {}
        return rep


class PointOfContactSerializer(serializers.ModelSerializer):

    company_name = serializers.CharField(
        source='company.company_name',
        read_only=True
    )

    # Write-only phone input: `input_mobile` as E.164 ("+919876543210"), or the legacy pair
    # `country_code` ("+91") + national `input_mobile`. Required on create.
    country_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    input_mobile = serializers.CharField(write_only=True, required=False, allow_blank=True)

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
        errors = {}
        sent = "input_mobile" in attrs or "country_code" in attrs
        code = (attrs.pop("country_code", None) or "").strip()
        raw = (attrs.pop("input_mobile", None) or "").strip()
        company = attrs.get("company") or getattr(self.instance, "company", None)

        if not sent and self.instance is None:
            errors["input_mobile"] = "Phone number is required."
        elif sent:
            if not raw:
                errors["input_mobile"] = "Phone number is required."
            else:
                if not raw.startswith("+") and code:
                    raw = "+" + re.sub(r"\D", "", code) + re.sub(r"\D", "", raw)
                try:
                    e164 = country_rules.normalize_phone(raw, default_country=getattr(company, "country", None) or None)
                except country_rules.PhoneValidationError as exc:
                    errors["input_mobile"] = str(exc)
                else:
                    duplicates = POC.objects.filter(poc_mobile=e164)
                    if self.instance is not None:
                        duplicates = duplicates.exclude(pk=self.instance.pk)
                    if duplicates.exists():
                        errors["input_mobile"] = "This phone number is already registered to another contact."
                    else:
                        attrs["poc_mobile"] = e164
        if isinstance(attrs.get("poc_email"), str):
            attrs["poc_email"] = attrs["poc_email"].strip().lower()
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        validated_data.pop("country_code", None)
        validated_data.pop("input_mobile", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("country_code", None)
        validated_data.pop("input_mobile", None)
        return super().update(instance, validated_data)


def _user_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.username


class ClientDocumentSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    effective_status = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClientDocument
        fields = (
            "id", "company", "file", "file_name", "file_size", "file_type",
            "category", "category_label", "is_required", "status", "effective_status",
            "expiry_date", "document_number",
            "uploaded_by", "uploaded_by_name", "uploaded_at",
            "verified_by", "verified_by_name", "verified_at", "remarks",
        )
        # Status / review fields are only ever set by ClientDocumentVerifyView; expiry, number and
        # is_required are parsed and set by the upload view.
        read_only_fields = (
            "uploaded_by", "uploaded_at", "file_name", "file_size", "file_type", "status", "is_required",
            "expiry_date", "document_number", "verified_by", "verified_at", "remarks",
        )
        # The stored Cloudinary reference is never sent back - files are only ever reachable
        # through ClientDocumentDownloadView's permission-checked, short-lived signed URL.
        extra_kwargs = {"file": {"write_only": True}}

    def get_effective_status(self, obj):
        return effective_document_status(obj.status, obj.expiry_date)

    def get_verified_by_name(self, obj):
        return _user_name(obj.verified_by)

    def get_uploaded_by_name(self, obj):
        return _user_name(obj.uploaded_by)

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
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = ClientAuditLog
        fields = (
            "id", "company", "company_name", "action", "action_label", "field_name", "old_value", "new_value",
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

    def validate_required_changes(self, value):
        if not (value or "").strip():
            raise serializers.ValidationError("Describe the changes that are needed.")
        return value.strip()

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if user is not None and user.is_authenticated:
            validated_data["requested_by"] = user
        return super().create(validated_data)


class ClientApprovalSerializer(serializers.Serializer):
    """Body of POST /client/<id>/approve/ - the readiness checks themselves live in
    client/onboarding.py (approval_blockers)."""

    approval_remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000)


# Backward-compatible name for the approve body serializer.
ClientApprovalReadinessSerializer = ClientApprovalSerializer
