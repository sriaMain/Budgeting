"""Vendor onboarding serializers.

The section serializers (identity, profile, KYC, bank, procurement) are shared by the admin
endpoints and the vendor self-service portal; the portal variants expose only vendor-facing
fields. Validation is country-aware (core.countries / core.onboarding_validation) and takes
vendor-level facts it needs (the vendor's country and type) from the serializer context, which
the views fill from the same request when it changes them - see views._section_context().
"""
import re
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounts.models import Vendor
from core import countries as country_rules
from core.document_security import effective_document_status
from core.onboarding_validation import (
    check_country, clean_bank_details, clean_phone, clean_postal_code, clean_tax_id,
    confirm_account_number, normalize_country_fields,
)

from .access import VENDOR_MASTER_FIELDS
from .models import (
    VendorOnboardingProfile, VendorKYC, VendorBankDetail,
    VendorProcurementDetail, VendorDocument, VendorChangeRequest,
    VendorSubmissionVersion, VendorApprovalWorkflowConfig, VendorApprovalLevel,
    VendorApprovalHistory, VendorAuditLog,
)
from .progress import (
    CIN_RE, GSTIN_RE, LLPIN_RE, ONBOARDING_CURRENCIES, PAN_RE, PAYMENT_TERM_CHOICES, STEP_TITLES, TAN_RE, UDYAM_RE,
    VENDOR_ONBOARDING_STEPS, pan_vendor_type_mismatch, summarize_vendor_onboarding, vendor_entity,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def apply_name_parts(attrs, instance):
    """First / Middle / Last Name -> the single display name (`name`). Only acts when a name part
    is sent; callers that still send just the full name keep working. Returns attrs."""
    parts = ("first_name", "middle_name", "last_name")
    if not any(p in attrs for p in parts):
        return attrs
    values = {p: (attrs.get(p, getattr(instance, p, "")) or "").strip() for p in parts}
    attrs.update(values)
    attrs["name"] = Vendor.build_name(values["first_name"], values["middle_name"], values["last_name"])
    return attrs


def vendor_name_error(attrs, instance):
    """Vendor.name is required and unique - report it on the first-name field instead of failing
    with a database IntegrityError (a second blank draft used to 500)."""
    if instance is not None and "name" not in attrs:
        return None
    name = (attrs.get("name", getattr(instance, "name", "")) or "").strip()
    if not name:
        return "Enter the vendor's name - at least a first name is required to save a vendor."
    if Vendor.objects.filter(name=name).exclude(pk=getattr(instance, "pk", None)).exists():
        return f'A vendor named "{name}" already exists.'
    return None


def _display_name(user):
    if not user:
        return None
    return (getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", None)
            or getattr(user, "email", None))


class _UpperCaseIdentifiersMixin:
    """Upper-cases identifier fields (and drops spaces) BEFORE field validation, so 'abcde1234f'
    is stored as ABCDE1234F instead of failing the model's upper-case regex."""
    upper_fields = ()

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            data = data.copy()
            for field in self.upper_fields:
                value = data.get(field)
                if isinstance(value, str):
                    data[field] = re.sub(r"\s+", "", value).upper()
        return super().to_internal_value(data)


def _ctx_country(serializer):
    return serializer.context.get("vendor_country") or ""


def _ctx_vendor_type(serializer):
    return serializer.context.get("vendor_type") or ""


# ---------------------------------------------------------------------------
# Identity (accounts.Vendor)
# ---------------------------------------------------------------------------

IDENTITY_FIELDS = (
    "first_name", "middle_name", "last_name", "name", "vendor_type", "email", "phone", "contact_person_name",
    "company_code", "plant", "internal_requester", "initial_comments", "last_saved_step",
)
# What a vendor may change about itself through the secure link. The type and the contact email
# decide the approval chain and where notifications go, so only the inviting team changes them;
# company code / plant / requester / comments are internal.
PUBLIC_IDENTITY_FIELDS = ("first_name", "middle_name", "last_name", "name", "phone", "contact_person_name", "last_saved_step")

_BLANKABLE = {"required": False, "allow_blank": True}


class VendorIdentitySerializer(serializers.ModelSerializer):
    """Base Vendor fields, used by an internal user filling the record in. Drafts may be partial,
    but a vendor always has a name (Vendor.name is unique)."""

    class Meta:
        model = Vendor
        fields = ("id",) + IDENTITY_FIELDS
        read_only_fields = ("id",)
        extra_kwargs = {
            # Uniqueness is checked in validate() so the message lands on the first-name field.
            "name": {"required": False, "allow_blank": True, "validators": []},
            "first_name": _BLANKABLE, "middle_name": _BLANKABLE, "last_name": _BLANKABLE,
            "vendor_type": _BLANKABLE, "email": _BLANKABLE, "phone": _BLANKABLE, "contact_person_name": _BLANKABLE,
            "company_code": _BLANKABLE, "plant": _BLANKABLE, "internal_requester": _BLANKABLE, "initial_comments": _BLANKABLE,
            "last_saved_step": {"required": False, "min_value": 1, "max_value": len(VENDOR_ONBOARDING_STEPS)},
        }

    def validate(self, attrs):
        errors = {}
        attrs = apply_name_parts(attrs, self.instance)
        name_error = vendor_name_error(attrs, self.instance)
        if name_error:
            errors["first_name"] = name_error
        if "email" in attrs:
            attrs["email"] = (attrs["email"] or "").strip()
        clean_phone(attrs, "phone", errors, country=_ctx_country(self) or "IN")
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VendorPublicIdentitySerializer(VendorIdentitySerializer):
    """Portal variant - only the vendor-facing identity fields are writable."""

    class Meta(VendorIdentitySerializer.Meta):
        fields = PUBLIC_IDENTITY_FIELDS


# Kept for imports elsewhere - the admin create / identity endpoints use VendorIdentitySerializer.
VendorOnboardingDraftSerializer = VendorIdentitySerializer


class VendorRaiseRequestSerializer(serializers.ModelSerializer):
    """'Raise Vendor Request' (invite) - the bare minimum needed to invite the vendor. Everything
    else is filled in by the vendor through the secure link."""

    class Meta:
        model = Vendor
        fields = (
            "id", "name", "first_name", "middle_name", "last_name", "email", "phone", "vendor_type",
            "contact_person_name", "company_code", "plant", "internal_requester", "initial_comments",
        )
        extra_kwargs = {"name": {"required": False, "validators": []}}

    def validate(self, attrs):
        errors = {}
        attrs = apply_name_parts(attrs, None)
        name_error = vendor_name_error(attrs, None)
        if name_error:
            errors["first_name"] = name_error
        clean_phone(attrs, "phone", errors, country=_ctx_country(self) or "IN")
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


# ---------------------------------------------------------------------------
# Profile (basic information, address, GST / MSME registration)
# ---------------------------------------------------------------------------

PROFILE_INTERNAL_FIELDS = ("company_code", "plant") + VENDOR_MASTER_FIELDS


class VendorOnboardingProfileSerializer(_UpperCaseIdentifiersMixin, serializers.ModelSerializer):
    upper_fields = ("gstin", "udyam_number")

    class Meta:
        model = VendorOnboardingProfile
        exclude = ("id", "vendor", "created_at", "updated_at")
        # Format checks happen in validate(), after upper-casing and only where they apply.
        extra_kwargs = {"gstin": {"validators": []}, "udyam_number": {"validators": []}}

    def validate(self, attrs):
        errors = {}
        instance = self.instance
        normalize_country_fields(attrs, "country")
        check_country(attrs, "country", errors)
        country = attrs.get("country", getattr(instance, "country", "")) or _ctx_country(self)
        indian = country_rules.is_india(country) or not (country or "").strip()

        clean_postal_code(attrs, "pin_code", country, errors)
        clean_phone(attrs, "finance_manager_mobile", errors, country=country or "IN")
        for field in ("finance_manager_email", "address_line1", "address_line2", "city", "district", "state", "landmark"):
            if isinstance(attrs.get(field), str):
                attrs[field] = attrs[field].strip()

        # GST and MSME (UDYAM) are Indian registrations - stale values are cleared for other countries.
        if not indian:
            for field, blank in (("gst_registered", False), ("gstin", ""), ("msme_registered", False),
                                 ("udyam_number", ""), ("msme_category", "")):
                if field in attrs or getattr(instance, field, blank):
                    attrs[field] = blank
        if "gst_registered" in attrs and not attrs["gst_registered"]:
            attrs["gstin"] = ""
        gstin = attrs.get("gstin")
        if gstin and not GSTIN_RE.match(gstin):
            errors["gstin"] = "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)."
        if "msme_registered" in attrs and not attrs["msme_registered"]:
            attrs["udyam_number"] = ""
            attrs["msme_category"] = ""
        udyam = attrs.get("udyam_number")
        if udyam and not UDYAM_RE.match(udyam):
            errors["udyam_number"] = "Enter a valid UDYAM registration number (e.g. UDYAM-MH-01-0000001)."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VendorPublicOnboardingProfileSerializer(VendorOnboardingProfileSerializer):
    """Portal variant - internal fields (company code / plant drive the approval chain; rating,
    headcount and spend are vendor-master data) are never shown to or writable by the vendor."""

    class Meta(VendorOnboardingProfileSerializer.Meta):
        exclude = VendorOnboardingProfileSerializer.Meta.exclude + PROFILE_INTERNAL_FIELDS


# ---------------------------------------------------------------------------
# KYC
# ---------------------------------------------------------------------------

# Internal review fields - excluded from the step serializers below, which the vendor
# self-service portal shares; they are read/written only via VendorReviewSerializer.
KYC_REVIEW_FIELDS = ("kyc_status", "risk_rating", "compliance_remarks")
BANK_REVIEW_FIELDS = ("verification_status", "verification_remarks")


class VendorKYCSerializer(_UpperCaseIdentifiersMixin, serializers.ModelSerializer):
    upper_fields = ("pan", "cin", "tan", "epf_number", "esic_number")

    class Meta:
        model = VendorKYC
        exclude = ("id", "vendor", "created_at", "updated_at") + KYC_REVIEW_FIELDS
        extra_kwargs = {
            "pan": {"validators": []}, "cin": {"validators": []}, "tan": {"validators": []},
            "tan_mobile": {"validators": []},
        }

    def validate(self, attrs):
        errors = {}
        normalize_country_fields(attrs, "country_of_tax_residence")
        check_country(attrs, "country_of_tax_residence", errors)
        vendor_type = _ctx_vendor_type(self)
        residence = attrs.get("country_of_tax_residence", getattr(self.instance, "country_of_tax_residence", ""))
        tax_country = residence or _ctx_country(self)

        pan = attrs.get("pan")
        if pan:
            if not PAN_RE.match(pan):
                errors["pan"] = "Enter a valid PAN - 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)."
            else:
                mismatch = pan_vendor_type_mismatch(pan, vendor_type)
                if mismatch:
                    errors["pan"] = mismatch
        cin = attrs.get("cin")
        if cin:
            if vendor_type == "company" and not CIN_RE.match(cin):
                errors["cin"] = "Enter a valid 21-character CIN (e.g. U72900KA2015PTC082988)."
            elif not (CIN_RE.match(cin) or LLPIN_RE.match(cin)):
                errors["cin"] = "Enter a valid LLPIN (e.g. AAB-1234) or CIN."
        tan = attrs.get("tan")
        if tan and not TAN_RE.match(tan):
            errors["tan"] = "Enter a valid TAN - 4 letters, 5 digits, 1 letter (e.g. ABCD12345E)."
        # TAN is Indian, so a bare 10-digit number is read as an Indian mobile.
        clean_phone(attrs, "tan_mobile", errors, country="IN")
        incorporated = attrs.get("incorporation_date")
        if incorporated and incorporated > timezone.localdate():
            errors["incorporation_date"] = "The date of incorporation can't be in the future."
        if attrs.get("tax_id"):
            if country_rules.is_india(tax_country) or not tax_country:
                attrs["tax_id"] = re.sub(r"\s+", " ", attrs["tax_id"].strip()).upper()
            else:
                clean_tax_id(attrs, "tax_id", tax_country, errors, entity=vendor_entity(vendor_type))
        if isinstance(attrs.get("beneficial_ownership_details"), str):
            attrs["beneficial_ownership_details"] = attrs["beneficial_ownership_details"].strip()
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


# ---------------------------------------------------------------------------
# Bank
# ---------------------------------------------------------------------------

def non_applicable_bank_fields(code):
    """Identifier fields a bank in country `code` doesn't use - they are stored blank."""
    cfg = country_rules.bank_config(code)
    routing = cfg.get("routing")
    fields = []
    if not routing or routing["field"] != "ifsc_code":
        fields.append("ifsc_code")
    if not routing or routing["field"] != "routing_code":
        fields.append("routing_code")
    if cfg["swift"] == "hidden":
        fields.append("swift_code")
    if cfg["iban"] == "hidden":
        fields.append("iban")
    if not cfg.get("account_types"):
        fields.append("account_type")
    return fields


class VendorBankDetailSerializer(_UpperCaseIdentifiersMixin, serializers.ModelSerializer):
    """Masked bank detail serializer - never returns the full account number.

    Identifiers are validated for the bank's country (blank = the vendor's country); identifiers
    that country doesn't use are cleared, so an old IFSC can't linger after switching to a US
    bank. `confirm_account_number` (write-only) must match when sent."""
    upper_fields = ("ifsc_code", "swift_code", "iban")
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=40)
    confirm_account_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=40)
    account_number_masked = serializers.SerializerMethodField()

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at") + BANK_REVIEW_FIELDS
        extra_kwargs = {"ifsc_code": {"validators": []}}

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()

    def validate(self, attrs):
        errors = {}
        instance = self.instance
        confirm_account_number(self.initial_data, "account_number", "confirm_account_number", errors)
        attrs.pop("confirm_account_number", None)
        # The number is write-only and the form reloads it blank - blank means "keep the one on file".
        if not (attrs.get("account_number") or "").strip():
            attrs.pop("account_number", None)

        normalize_country_fields(attrs, "bank_country")
        check_country(attrs, "bank_country", errors)
        bank_country = attrs.get("bank_country", getattr(instance, "bank_country", "")) or _ctx_country(self) or "IN"
        code = country_rules.resolve_country(bank_country)
        if code:
            cfg = country_rules.bank_config(code)
            for field in non_applicable_bank_fields(code):
                if field in attrs or getattr(instance, field, ""):
                    attrs[field] = ""
            allowed_types = {value for value, _label in (cfg.get("account_types") or [])}
            if attrs.get("account_type") and attrs["account_type"] not in allowed_types:
                errors["account_type"] = "Select an account type from the list."
            if cfg.get("account_number") is None and "bank_country" in attrs and getattr(instance, "account_number", ""):
                # The IBAN carries the account number in this country; a stale local number would
                # otherwise keep showing as "on file".
                attrs["account_number"] = ""
            clean_bank_details(
                attrs, code, errors, instance=instance, partial=True,
                has_saved_account_number=bool(getattr(instance, "account_number", "")),
            )
        for field in ("bank_name", "account_holder_name", "branch", "bank_address"):
            if isinstance(attrs.get(field), str):
                attrs[field] = re.sub(r"\s+", " ", attrs[field]).strip()
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VendorBankDetailUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated reveal endpoint (vendor.bank.view_unmasked)."""

    class Meta:
        model = VendorBankDetail
        exclude = ("id", "vendor", "created_at", "updated_at") + BANK_REVIEW_FIELDS


# ---------------------------------------------------------------------------
# Procurement / commercial
# ---------------------------------------------------------------------------

# ERP / procurement master settings - set by the internal team, not by the vendor.
PROCUREMENT_INTERNAL_FIELDS = (
    "account_group", "purchasing_org", "grouping_key", "partner_category", "incoterms_1", "incoterms_2",
    "reconciliation_account", "schema_group", "gr_based_invoice_verification", "check_double_invoice",
)
PAYMENT_TERM_VALUES = {value for value, _label in PAYMENT_TERM_CHOICES}


class VendorProcurementDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProcurementDetail
        exclude = ("id", "vendor", "created_at", "updated_at")

    def validate(self, attrs):
        errors = {}
        instance = self.instance

        def current(field, default=None):
            return attrs[field] if field in attrs else getattr(instance, field, default)

        start, end = current("contract_start_date"), current("contract_end_date")
        if start and end and end < start:
            errors["contract_end_date"] = "Contract end date must be on or after the start date."
        if "order_currency" in attrs:
            currency = (attrs["order_currency"] or "").strip().upper()
            attrs["order_currency"] = currency
            # A legacy value already on the record may stay; new values come from the list.
            if currency and currency not in ONBOARDING_CURRENCIES and currency != getattr(instance, "order_currency", ""):
                errors["order_currency"] = f"Select one of: {', '.join(ONBOARDING_CURRENCIES)}."
        if "payment_terms" in attrs:
            terms = (attrs["payment_terms"] or "").strip()
            attrs["payment_terms"] = terms
            if terms and terms not in PAYMENT_TERM_VALUES and terms != getattr(instance, "payment_terms", ""):
                errors["payment_terms"] = "Select payment terms from the list."
        if ("payment_terms" in attrs or "custom_payment_terms" in attrs) and current("payment_terms", "") != "custom":
            attrs["custom_payment_terms"] = ""
        if ("withholding_tax_applicable" in attrs or "withholding_tax_percentage" in attrs) and not current("withholding_tax_applicable", False):
            attrs["withholding_tax_percentage"] = None
        pct = attrs.get("withholding_tax_percentage")
        if pct is not None and not (0 <= pct <= 100):
            errors["withholding_tax_percentage"] = "Enter a percentage between 0 and 100."
        rate = attrs.get("service_rate")
        if rate is not None and rate < 0:
            errors["service_rate"] = "The rate can't be negative."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VendorPublicProcurementDetailSerializer(VendorProcurementDetailSerializer):
    """Portal variant - commercial terms only; ERP / procurement settings are internal."""

    class Meta(VendorProcurementDetailSerializer.Meta):
        exclude = VendorProcurementDetailSerializer.Meta.exclude + PROCUREMENT_INTERNAL_FIELDS


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

DOCUMENT_FIELDS = (
    "id", "vendor", "file_name", "file_size", "file_type", "category", "category_display", "is_required",
    "status", "effective_status", "expiry_date", "document_number", "uploaded_by", "uploaded_by_role", "uploaded_at",
    "verified_by", "verified_by_name", "verified_at", "remarks",
)


class VendorDocumentSerializer(serializers.ModelSerializer):
    """Read-only - uploads go through views._upload_vendor_document(). The stored file reference
    is never returned; downloads go through the signed-URL endpoints."""
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    effective_status = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VendorDocument
        fields = DOCUMENT_FIELDS
        read_only_fields = DOCUMENT_FIELDS

    def get_effective_status(self, obj):
        return effective_document_status(obj.status, obj.expiry_date)

    def get_verified_by_name(self, obj):
        return _display_name(obj.verified_by)


class VendorPublicDocumentSerializer(VendorDocumentSerializer):
    """Portal variant - internal user ids and reviewer names are not shown to the vendor."""

    class Meta(VendorDocumentSerializer.Meta):
        fields = tuple(f for f in DOCUMENT_FIELDS if f not in ("uploaded_by", "verified_by", "vendor"))
        read_only_fields = fields

    def get_verified_by_name(self, obj):
        return None


class VendorDocumentVerifySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[("under_review", "Under Review"), ("verified", "Verified"), ("rejected", "Rejected")])
    remarks = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)

    def validate(self, attrs):
        if attrs["status"] == "rejected" and not attrs["remarks"].strip():
            raise serializers.ValidationError({"remarks": "A rejection reason is required."})
        return attrs


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

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


def onboarding_summary(vendor, internal=True):
    """summarize_vendor_onboarding() computed once per vendor instance per response."""
    attr = "_onboarding_summary_internal" if internal else "_onboarding_summary_public"
    cached = getattr(vendor, attr, None)
    if cached is None:
        cached = summarize_vendor_onboarding(vendor, internal=internal)
        setattr(vendor, attr, cached)
    return cached


class _VendorProgressMixin:
    """The one progress figure (onboarding.percent) and stage label every view shows."""
    internal_summary = True

    def get_progress_percentage(self, obj):
        return onboarding_summary(obj, self.internal_summary)["percent"]

    def get_onboarding(self, obj):
        return onboarding_summary(obj, self.internal_summary)

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
        current = onboarding_summary(obj, self.internal_summary)["current_step"] or VENDOR_ONBOARDING_STEPS[-1]
        index = VENDOR_ONBOARDING_STEPS.index(current) + 1
        return f"Step {index} of {len(VENDOR_ONBOARDING_STEPS)} · {STEP_TITLES[current]}"


class VendorOnboardingDetailSerializer(_VendorProgressMixin, serializers.ModelSerializer):
    """Read-only composite view used by the admin onboarding wizard, details page and lists."""
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
    # Data-driven onboarding summary (steps, percentage, submission / approval issues).
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
            "id", "vendor_reference_no", "name", "first_name", "middle_name", "last_name", "email", "phone",
            "onboarding", "financials", "service_categories", "review", "email_status", "permissions",
            "vendor_type", "vendor_type_display", "contact_person_name",
            "company_code", "plant", "internal_requester", "initial_comments",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage",
            "created_by", "created_at", "updated_at", "submitted_at", "approved_at", "is_archived",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "documents", "change_requests",
            "current_approval_stage", "is_current_approver",
        )

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
        from .access import can_edit, can_edit_master_fields, has_permission, is_editable_status

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return {}
        is_approver = self.get_is_current_approver(obj)
        editable = can_edit(obj, user)
        return {
            "edit": editable,
            # Rating / headcount stay editable after submission and approval.
            "edit_master": can_edit_master_fields(obj, user),
            "submit": has_permission(user, "vendor.submit") and is_editable_status(obj) and can_edit_master_fields(obj, user),
            "verify": has_permission(user, "vendor.verify") and obj.status != "approved",
            "approve": has_permission(user, "vendor.approve") and is_approver,
            "request_changes": has_permission(user, "vendor.request_changes") and is_approver,
            "send_email": has_permission(user, "vendor.create") and obj.status != "approved",
            "delete": has_permission(user, "vendor.delete"),
            "view_unmasked_bank": has_permission(user, "vendor.bank.view_unmasked"),
            "upload_documents": has_permission(user, "vendor.document.upload") and editable,
            "delete_documents": has_permission(user, "vendor.document.delete") and editable,
        }

    def get_is_current_approver(self, obj):
        from .services import user_is_authorized_for_level

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        instance = getattr(obj, "approval_instance", None)
        if not instance or instance.current_level_order is None:
            return False
        # The same function the approve / request-changes views authorize with, so the
        # "show the buttons" flag can never drift from what the backend allows.
        return user_is_authorized_for_level(request.user, instance.current_level())


class VendorPublicDetailSerializer(_VendorProgressMixin, serializers.ModelSerializer):
    """Public, token-scoped view - only vendor-facing data (no internal codes, reviewer
    identities, approval internals or review results)."""
    internal_summary = False

    onboarding_profile = VendorPublicOnboardingProfileSerializer(read_only=True)
    kyc = VendorKYCSerializer(read_only=True)
    bank_detail = VendorBankDetailSerializer(read_only=True)
    procurement_detail = VendorPublicProcurementDetailSerializer(read_only=True)
    documents = VendorPublicDocumentSerializer(many=True, read_only=True)
    vendor_type_display = serializers.CharField(source="get_vendor_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_stage = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    onboarding = serializers.SerializerMethodField()
    editable = serializers.SerializerMethodField()
    open_change_request = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = (
            "vendor_reference_no", "name", "first_name", "middle_name", "last_name", "email", "phone",
            "vendor_type", "vendor_type_display", "contact_person_name",
            "status", "status_display", "current_stage", "last_saved_step", "progress_percentage", "onboarding",
            "editable", "submitted_at", "approved_at",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "documents",
            "open_change_request",
        )

    def get_editable(self, obj):
        from .access import is_editable_status

        return is_editable_status(obj)

    def get_open_change_request(self, obj):
        change_request = obj.change_requests.filter(status="open").order_by("-requested_at").first()
        if not change_request:
            return None
        data = VendorChangeRequestSerializer(change_request).data
        data.pop("requested_by", None)
        return data


class RequestChangesSerializer(serializers.Serializer):
    section = serializers.ChoiceField(choices=VendorChangeRequest.SECTION_CHOICES)
    required_changes = serializers.CharField()
    comments = serializers.CharField(required=False, allow_blank=True, default="")


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
            return _display_name(user)
        return "Vendor (self-service)" if obj.performed_by_label == "vendor" else (obj.performed_by_label or "System")
