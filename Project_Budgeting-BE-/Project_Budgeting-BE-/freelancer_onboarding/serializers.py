from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import serializers

from core import countries
from core.document_security import effective_document_status
from core.onboarding_validation import (
    check_country, clean_bank_details, clean_phone, clean_postal_code, confirm_account_number,
    normalize_country_fields,
)

from . import kyc
from .models import (
    Freelancer, FreelancerDocument, FreelancerRateCard, FreelancerContract,
    FreelancerProjectAssignment, FreelancerTaskAssignment, FreelancerTimeEntry,
    FreelancerBankDetail, FreelancerEquipment, FreelancerAuditLog,
)


def apply_name_parts(attrs, instance, target, require_first):
    """First / Middle / Last Name -> the single display name field (`target`).
    Only acts when a name part is sent; callers that still send just the full
    name keep working. Returns attrs."""
    parts = ("first_name", "middle_name", "last_name")
    if not any(p in attrs for p in parts):
        return attrs
    values = {p: (attrs.get(p, getattr(instance, p, "")) or "").strip() for p in parts}
    if require_first and not values["first_name"]:
        raise serializers.ValidationError({"first_name": "First name is required."})
    attrs.update(values)
    attrs[target] = " ".join(v for v in values.values() if v)
    return attrs


def _user_can(user, code):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    has = getattr(user, "has_role_permission", None)
    return bool(has and has(code))


def _user_name(user):
    if not user:
        return None
    full = getattr(user, "get_full_name", lambda: "")() or getattr(user, "display_name", "")
    return full or getattr(user, "username", None) or getattr(user, "email", None)


class FreelancerInviteSerializer(serializers.Serializer):
    """Used by the admin's 'Invite Freelancer' action - only the bare minimum
    needed to send the invite. Everything else is filled in by the freelancer
    themselves via the secure link."""
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    middle_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    # Built from the name parts when they're sent
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField()

    def validate(self, attrs):
        attrs = apply_name_parts(attrs, None, "full_name", require_first=True)
        if not (attrs.get("full_name") or "").strip():
            raise serializers.ValidationError({"first_name": "First name is required."})
        attrs["email"] = attrs["email"].strip()
        if Freelancer.objects.filter(email__iexact=attrs["email"], is_archived=False).exists():
            raise serializers.ValidationError({"email": "A freelancer with this email address already exists."})
        return attrs


# --------------------------------------------------------------------------- #
# Field groups                                                                 #
# --------------------------------------------------------------------------- #

BASIC_FIELDS = (
    "first_name", "middle_name", "last_name", "phone", "alternate_phone", "date_of_birth", "gender", "nationality",
)
IDENTITY_FIELDS = ("country_of_residence", "id_document_type", "id_document_number", "tax_residency_country")
PERMANENT_ADDRESS_FIELDS = (
    "permanent_address_line1", "permanent_address_line2", "permanent_city",
    "permanent_state", "permanent_country", "permanent_pincode",
)
TEMP_ADDRESS_FIELDS = (
    "temp_address_line1", "temp_address_line2", "temp_city", "temp_state", "temp_country", "temp_pincode",
)
EMERGENCY_FIELDS = ("emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship")
ADDRESS_FIELDS = PERMANENT_ADDRESS_FIELDS + ("temp_same_as_permanent",) + TEMP_ADDRESS_FIELDS + EMERGENCY_FIELDS
PROFESSIONAL_FIELDS = (
    "professional_title", "skills", "years_of_experience", "portfolio_url", "linkedin_url",
    "availability", "preferred_start_date", "available_until",
    "hours_per_day", "hours_per_week", "notice_period_days", "timezone",
)
# What the freelancer may change through the secure link: never email (the invite
# identity), commercial terms (rate / currency / payment terms), internal notes or status.
PORTAL_WRITABLE_FIELDS = BASIC_FIELDS + IDENTITY_FIELDS + ADDRESS_FIELDS + PROFESSIONAL_FIELDS + ("last_saved_step",)
ADMIN_ONLY_FIELDS = ("full_name", "email", "location", "currency", "rate", "notes", "internal_remarks")
ADMIN_WRITABLE_FIELDS = PORTAL_WRITABLE_FIELDS + ADMIN_ONLY_FIELDS

# Kept for anything importing the old name.
EDITABLE_FIELDS = ADMIN_WRITABLE_FIELDS

COUNTRY_FIELDS = ("nationality", "country_of_residence", "tax_residency_country", "permanent_country", "temp_country")
PHONE_FIELDS = ("phone", "alternate_phone", "emergency_contact_phone")
ADDRESS_COPY = tuple(zip(PERMANENT_ADDRESS_FIELDS, (
    "temp_address_line1", "temp_address_line2", "temp_city", "temp_state", "temp_country", "temp_pincode",
)))

_GENDERS = {}
for _value, _label in Freelancer.GENDER_CHOICES:
    _GENDERS[_value] = _value
    _GENDERS[_label.lower()] = _value
_GENDERS.update({"m": "male", "f": "female", "nonbinary": "non_binary", "non binary": "non_binary"})


def normalize_gender(value):
    """'Male' / 'male' / 'M' / 'prefer not to say' -> stored choice value, or None when unknown."""
    key = (value or "").strip().lower()
    return _GENDERS.get(key) or _GENDERS.get(key.replace("_", " ")) or _GENDERS.get(key.replace(" ", "_"))


def normalize_skills(value):
    seen, out = set(), []
    for part in (value or "").split(","):
        skill = part.strip()[:60]
        if skill and skill.lower() not in seen:
            seen.add(skill.lower())
            out.append(skill)
    return ", ".join(out)


def _merged(attrs, instance, field, default=""):
    if field in attrs:
        return attrs[field]
    if instance is None:
        return default
    return getattr(instance, field, default)


def _check_range(attrs, field, low, high, errors, message, *, exclusive_low=False):
    value = attrs.get(field)
    if value in (None, ""):
        return
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return
    if number > high or number < low or (exclusive_low and number <= low):
        errors[field] = message


def validate_freelancer_profile(attrs, instance, errors, *, check_email=True):
    """Country-aware validation shared by the admin and the portal write serializers.
    Drafts may be partial: only malformed values are rejected here; required-ness is
    enforced at submission (kyc.submission_issues)."""
    normalize_country_fields(attrs, *COUNTRY_FIELDS)
    for field in COUNTRY_FIELDS:
        check_country(attrs, field, errors)

    # Phones -> E.164, a bare national number read against the country of residence.
    residence = (
        _merged(attrs, instance, "country_of_residence")
        or _merged(attrs, instance, "permanent_country")
        or _merged(attrs, instance, "nationality")
    )
    default_country = residence if countries.resolve_country(residence) else None
    for field in PHONE_FIELDS:
        clean_phone(attrs, field, errors, country=default_country)
    phone, alternate = _merged(attrs, instance, "phone"), _merged(attrs, instance, "alternate_phone")
    if "alternate_phone" in attrs and alternate and phone and alternate == phone and "alternate_phone" not in errors:
        errors["alternate_phone"] = "The alternate phone must be different from the primary phone."

    if check_email and "email" in attrs:
        email = (attrs.get("email") or "").strip()
        attrs["email"] = email
        changed = instance is None or (instance.email or "").strip().lower() != email.lower()
        if email and changed:
            qs = Freelancer.objects.filter(email__iexact=email, is_archived=False)
            if instance is not None:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                errors["email"] = "A freelancer with this email address already exists."

    if attrs.get("gender"):
        gender = normalize_gender(attrs["gender"])
        if gender is None:
            errors["gender"] = "Select a gender from the list."
        else:
            attrs["gender"] = gender

    dob = attrs.get("date_of_birth")
    if dob:
        today = timezone.localdate()
        if dob > today:
            errors["date_of_birth"] = "Date of birth can't be in the future."
        elif dob < date(1900, 1, 1):
            errors["date_of_birth"] = "Enter a valid date of birth."
        elif kyc.age_on(dob, today) < 18:
            errors["date_of_birth"] = "Freelancers must be at least 18 years old."

    # Government ID - write-only; a blank value keeps what is on file.
    id_type = _merged(attrs, instance, "id_document_type")
    nationality = _merged(attrs, instance, "nationality")
    if "id_document_number" in attrs:
        raw = (attrs.get("id_document_number") or "").strip()
        if not raw:
            attrs.pop("id_document_number")
        elif not id_type:
            errors["id_document_type"] = "Select the ID document type."
        else:
            value, message = kyc.clean_id_document_number(id_type, raw, nationality)
            if message:
                errors["id_document_number"] = message
            else:
                attrs["id_document_number"] = value
    elif "id_document_type" in attrs and instance is not None and instance.id_document_number \
            and attrs["id_document_type"] and attrs["id_document_type"] != instance.id_document_type:
        _, message = kyc.clean_id_document_number(attrs["id_document_type"], instance.id_document_number, nationality)
        if message:
            errors["id_document_number"] = "Re-enter the document number for the selected ID type."

    # Addresses - postal code per country; "same as permanent" copies the permanent address.
    clean_postal_code(attrs, "permanent_pincode", _merged(attrs, instance, "permanent_country"), errors)
    same = attrs.get("temp_same_as_permanent", _merged(attrs, instance, "temp_same_as_permanent", False))
    if same:
        if any(f in attrs for f in PERMANENT_ADDRESS_FIELDS + ("temp_same_as_permanent",)):
            for source, target in ADDRESS_COPY:
                attrs[target] = _merged(attrs, instance, source)
    else:
        clean_postal_code(attrs, "temp_pincode", _merged(attrs, instance, "temp_country"), errors)

    # Professional
    if "skills" in attrs:
        attrs["skills"] = normalize_skills(attrs["skills"])
    _check_range(attrs, "years_of_experience", 0, 70, errors, "Enter years of experience between 0 and 70.")
    _check_range(attrs, "hours_per_day", 0, 24, errors, "Hours per day must be more than 0 and at most 24.", exclusive_low=True)
    _check_range(attrs, "hours_per_week", 0, 168, errors, "Hours per week must be more than 0 and at most 168.", exclusive_low=True)
    _check_range(attrs, "notice_period_days", 0, 365, errors, "Enter a notice period between 0 and 365 days.")
    start = _merged(attrs, instance, "preferred_start_date", None)
    until = _merged(attrs, instance, "available_until", None)
    if start and until and until < start and ("available_until" in attrs or "preferred_start_date" in attrs):
        errors["available_until"] = "Available until must be on or after the preferred start date."
    if attrs.get("linkedin_url") and not kyc.is_linkedin_url(attrs["linkedin_url"]):
        errors["linkedin_url"] = "Enter a LinkedIn profile URL (https://www.linkedin.com/in/...)."
    if attrs.get("timezone"):
        attrs["timezone"] = attrs["timezone"].strip()
        if not kyc.is_valid_timezone(attrs["timezone"]):
            errors["timezone"] = "Select a time zone from the list (e.g. Asia/Kolkata)."

    # Location (shown on the cards / used by the list filter) follows the address unless set explicitly.
    location_inputs = ("permanent_city", "temp_city", "country_of_residence", "permanent_country", "temp_same_as_permanent")
    if "location" not in attrs and any(f in attrs for f in location_inputs):
        city = _merged(attrs, instance, "permanent_city")
        if not same and _merged(attrs, instance, "temp_city"):
            city = _merged(attrs, instance, "temp_city")
        country = _merged(attrs, instance, "country_of_residence") or _merged(attrs, instance, "permanent_country")
        location = ", ".join(part for part in (city, country) if part)
        if location:
            attrs["location"] = location[:150]


class _FreelancerWriteSerializer(serializers.ModelSerializer):
    # Write-only: read back masked (id_document_number_masked) - never in full.
    id_document_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=60)
    portal = False

    def validate(self, attrs):
        errors = {}
        try:
            attrs = apply_name_parts(attrs, self.instance, "full_name", require_first=True)
        except serializers.ValidationError as exc:
            errors.update(exc.detail)
        validate_freelancer_profile(attrs, self.instance, errors, check_email=not self.portal)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


def admin_status_targets(instance):
    """Statuses an admin may set directly (PATCH). Onboarding statuses only change through
    invite / submit / approve / request-changes, so approval can't be bypassed."""
    current = instance.status
    closed = set(Freelancer.CLOSED_STATUSES)
    if current in Freelancer.APPROVED_STATUSES:
        return set(Freelancer.APPROVED_STATUSES) | closed
    if current in Freelancer.CLOSED_STATUSES:
        targets = closed | {"onboarding"}
        if instance.kyc_status == "verified":
            targets |= set(Freelancer.APPROVED_STATUSES)
        return targets
    return closed


class FreelancerAdminWriteSerializer(_FreelancerWriteSerializer):
    """Admin create ('Onboard Freelancer') and edit. A new record starts as a draft: the
    admin either completes and submits it here or sends the freelancer the secure link;
    approval then activates it."""

    class Meta:
        model = Freelancer
        fields = ADMIN_WRITABLE_FIELDS + ("status",)
        extra_kwargs = {
            "full_name": {"required": False},
            "email": {"required": False},
            "status": {"required": False},
        }

    def validate_status(self, value):
        instance = self.instance
        if instance is None or value == instance.status:
            return value
        if value not in admin_status_targets(instance):
            if value in Freelancer.APPROVED_STATUSES:
                if instance.status in Freelancer.CLOSED_STATUSES:
                    raise serializers.ValidationError(
                        "This freelancer's KYC was never approved - re-open the onboarding instead."
                    )
                raise serializers.ValidationError("Use Approve to activate a freelancer whose onboarding is in progress.")
            raise serializers.ValidationError(
                "Onboarding statuses are set by the invite, submit, approve and request-changes actions."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None:
            errors = {}
            if not (attrs.get("full_name") or "").strip():
                errors["first_name"] = "First name is required."
            if not (attrs.get("email") or "").strip():
                errors["email"] = "Email address is required."
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        validated_data.pop("status", None)
        validated_data["status"] = "draft"
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


# Backwards-compatible names for the old create / update serializers.
FreelancerManualCreateSerializer = FreelancerAdminWriteSerializer
FreelancerAdminUpdateSerializer = FreelancerAdminWriteSerializer


class FreelancerPortalWriteSerializer(_FreelancerWriteSerializer):
    """Public 'Save & next' / 'Save draft' - only freelancer-facing fields, all optional."""
    portal = True

    class Meta:
        model = Freelancer
        fields = PORTAL_WRITABLE_FIELDS


FreelancerPublicUpdateSerializer = FreelancerPortalWriteSerializer


# --------------------------------------------------------------------------- #
# Read serializers                                                             #
# --------------------------------------------------------------------------- #

def portal_status_for(status):
    if status in ("draft", "invited", "onboarding"):
        return "in_progress"
    if status == "changes_requested":
        return "changes_requested"
    if status == "completed":
        return "submitted"
    if status in Freelancer.APPROVED_STATUSES:
        return "approved"
    return "closed"


class _KycMixin:
    """Computes the KYC requirement lists once per object per serialization."""

    def _kyc(self, obj):
        cache = self.context.setdefault("_freelancer_kyc", {}) if hasattr(self, "context") else {}
        key = obj.pk
        if key not in cache:
            bank = kyc._bank(obj)
            documents = kyc._documents(obj, None)
            cache[key] = {
                "bank": bank,
                "documents": documents,
                "required_documents": kyc.required_documents(obj, documents=documents, bank=bank),
                "submission_issues": kyc.submission_issues(obj, bank=bank, documents=documents),
            }
        return cache[key]


_BASE_READ_FIELDS = (
    "freelancer_code", "full_name", "first_name", "middle_name", "last_name", "email",
    "phone", "alternate_phone", "date_of_birth", "gender", "nationality", "profile_photo_url",
    "country_of_residence", "id_document_type", "id_document_number_masked", "has_id_document_number",
    "tax_residency_country",
) + ADDRESS_FIELDS + PROFESSIONAL_FIELDS


class FreelancerListSerializer(_KycMixin, serializers.ModelSerializer):
    """Admin list rows (and the base of the admin detail). Sensitive identifiers are
    masked; the reveal endpoints are separately permissioned."""

    pan_masked = serializers.SerializerMethodField()
    assigned_projects_count = serializers.SerializerMethodField()
    id_document_number_masked = serializers.SerializerMethodField()
    has_id_document_number = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    kyc_status_display = serializers.CharField(source="get_kyc_status_display", read_only=True)
    step_completion = serializers.SerializerMethodField()

    class Meta:
        model = Freelancer
        fields = ("id",) + _BASE_READ_FIELDS + (
            "location", "payment_method", "currency", "rate", "notes", "internal_remarks",
            "status", "status_display", "kyc_status", "kyc_status_display", "submitted_at", "reviewed_at",
            "last_saved_step", "is_archived", "created_at", "updated_at",
            "pan_masked", "assigned_projects_count", "step_completion",
        )
        read_only_fields = fields

    def get_pan_masked(self, obj):
        """Convenience masked PAN for list/detail views (Section 7) - never
        the full number, so this is safe on any response that includes it."""
        bank_detail = kyc._bank(obj)
        return bank_detail.mask_tax_number() if bank_detail else None

    def get_assigned_projects_count(self, obj):
        annotated = getattr(obj, "_assigned_projects_count", None)
        return annotated if annotated is not None else obj.project_assignments.count()

    def get_id_document_number_masked(self, obj):
        return obj.mask_id_document_number() or None

    def get_has_id_document_number(self, obj):
        return bool(obj.id_document_number)

    def get_profile_photo_url(self, obj):
        photo = obj.profile_photo
        if not photo:
            return None
        try:
            return photo.build_url(secure=True)
        except AttributeError:
            return None

    def get_step_completion(self, obj):
        return kyc.step_completion(self._kyc(obj)["submission_issues"])


# Older name, still imported in places.
FreelancerSerializer = FreelancerListSerializer


class FreelancerDetailSerializer(FreelancerListSerializer):
    """Admin detail: adds the KYC requirement lists, the reviewer's state, what the
    requesting user may do, and the secure link's status (never the token)."""

    reviewed_by_name = serializers.SerializerMethodField()
    required_documents = serializers.SerializerMethodField()
    submission_issues = serializers.SerializerMethodField()
    approval_issues = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    access_link = serializers.SerializerMethodField()

    class Meta(FreelancerListSerializer.Meta):
        fields = FreelancerListSerializer.Meta.fields + (
            "review_remarks", "changes_requested_sections", "reviewed_by_name",
            "required_documents", "submission_issues", "approval_issues", "permissions", "access_link",
        )
        read_only_fields = fields

    def get_reviewed_by_name(self, obj):
        return _user_name(obj.reviewed_by)

    def get_required_documents(self, obj):
        return self._kyc(obj)["required_documents"]

    def get_submission_issues(self, obj):
        return self._kyc(obj)["submission_issues"]

    def get_approval_issues(self, obj):
        data = self._kyc(obj)
        return kyc.approval_issues(obj, bank=data["bank"], documents=data["documents"])

    def get_permissions(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        def has(code):
            return _user_can(user, code)

        return {
            "edit": has("freelancer_onboarding.edit"),
            "submit": has("freelancer_onboarding.edit") and obj.status in Freelancer.SUBMITTABLE_STATUSES,
            "approve": has("freelancer_onboarding.freelancer.approve") and obj.status == "completed",
            "request_changes": has("freelancer_onboarding.freelancer.request_changes")
            and obj.status in ("completed", "changes_requested"),
            "verify": has("freelancer_onboarding.document.verify"),
            "manage_link": has("freelancer_onboarding.create"),
            "view_bank": has("freelancer_onboarding.bank_detail.view"),
            "edit_bank": has("freelancer_onboarding.bank_detail.edit"),
            "view_unmasked_bank": has("freelancer_onboarding.bank_detail.view_unmasked"),
            "view_pan_unmasked": has("freelancer_onboarding.bank_detail.view_pan_unmasked"),
            "view_unmasked_id": has("freelancer_onboarding.identity.view_unmasked"),
            "view_documents": has("freelancer_onboarding.document.view"),
            "upload_documents": has("freelancer_onboarding.document.upload"),
            "delete_documents": has("freelancer_onboarding.document.delete"),
        }

    def get_access_link(self, obj):
        from .services import access_link_summary
        return access_link_summary(obj)


class FreelancerPublicSerializer(_KycMixin, serializers.ModelSerializer):
    """What the secure link may read: the freelancer's own onboarding data - never internal
    notes / remarks, commercial terms, the internal status or unmasked identifiers."""

    id_document_number_masked = serializers.SerializerMethodField()
    has_id_document_number = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()
    portal_status = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    review_remarks = serializers.SerializerMethodField()
    changes_requested_sections = serializers.SerializerMethodField()
    required_documents = serializers.SerializerMethodField()
    submission_issues = serializers.SerializerMethodField()
    kyc_status_display = serializers.CharField(source="get_kyc_status_display", read_only=True)

    class Meta:
        model = Freelancer
        fields = _BASE_READ_FIELDS + (
            "last_saved_step", "kyc_status", "kyc_status_display", "submitted_at",
            "portal_status", "can_edit", "review_remarks", "changes_requested_sections",
            "required_documents", "submission_issues",
        )
        read_only_fields = fields

    get_id_document_number_masked = FreelancerListSerializer.get_id_document_number_masked
    get_has_id_document_number = FreelancerListSerializer.get_has_id_document_number
    get_profile_photo_url = FreelancerListSerializer.get_profile_photo_url

    def get_portal_status(self, obj):
        return portal_status_for(obj.status)

    def get_can_edit(self, obj):
        return obj.status in Freelancer.PORTAL_EDITABLE_STATUSES

    def get_review_remarks(self, obj):
        return obj.review_remarks if obj.status == "changes_requested" else ""

    def get_changes_requested_sections(self, obj):
        return list(obj.changes_requested_sections or []) if obj.status == "changes_requested" else []

    def get_required_documents(self, obj):
        return self._kyc(obj)["required_documents"]

    def get_submission_issues(self, obj):
        return self._kyc(obj)["submission_issues"]


# --------------------------------------------------------------------------- #
# Documents                                                                    #
# --------------------------------------------------------------------------- #

class FreelancerDocumentSerializer(serializers.ModelSerializer):
    """Read-only - uploads go through views.save_document_upload (type / size / content
    checks, atomic replace). The stored file reference is never returned: downloads use
    short-lived signed URLs."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)
    effective_status = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerDocument
        fields = (
            "id", "freelancer", "file_name", "file_size", "file_type", "category", "category_display",
            "status", "effective_status", "expiry_date", "document_number",
            "uploaded_by", "uploaded_at", "verified_by", "verified_by_name", "verified_at", "remarks",
        )
        read_only_fields = fields

    def get_effective_status(self, obj):
        return effective_document_status(obj.status, obj.expiry_date)

    def get_verified_by_name(self, obj):
        return _user_name(obj.verified_by)


class FreelancerPublicDocumentSerializer(FreelancerDocumentSerializer):
    """Portal view of a document: no internal user ids or reviewer names."""

    class Meta(FreelancerDocumentSerializer.Meta):
        fields = (
            "id", "file_name", "file_size", "file_type", "category", "category_display",
            "status", "effective_status", "expiry_date", "document_number", "uploaded_at", "verified_at", "remarks",
        )
        read_only_fields = fields


class DocumentVerifySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[("verified", "Verified"), ("rejected", "Rejected"), ("under_review", "Under Review")])
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        attrs["remarks"] = (attrs.get("remarks") or "").strip()
        if attrs["status"] == "rejected" and not attrs["remarks"]:
            raise serializers.ValidationError({"remarks": "A reason is required to reject a document."})
        return attrs


class RequestChangesSerializer(serializers.Serializer):
    remarks = serializers.CharField(max_length=2000)
    sections = serializers.ListField(
        child=serializers.ChoiceField(choices=kyc.STEP_KEYS), required=False, allow_empty=True,
    )

    def validate_remarks(self, value):
        if not value.strip():
            raise serializers.ValidationError("Tell the freelancer what needs to change.")
        return value.strip()

    def validate_sections(self, value):
        return list(dict.fromkeys(value))


class ApproveSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=2000)


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
    client_name = serializers.SerializerMethodField()
    project_type = serializers.CharField(source="project.engagement_type", read_only=True)
    margin = serializers.SerializerMethodField()
    planned_freelancer_cost = serializers.SerializerMethodField()
    # Write-only override: when given, this (and billing_rate_override) wins
    # over the freelancer's active rate card for THIS assignment only. The
    # freelancer's own rate card is never touched either way (Section 12).
    cost_rate_override = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, write_only=True
    )
    billing_rate_override = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = FreelancerProjectAssignment
        fields = (
            "id", "freelancer", "freelancer_name", "project", "project_name", "client_name",
            "project_type", "rate_card", "role", "start_date", "end_date", "estimated_hours",
            "allocated_hours", "allocation_percent", "planned_units", "planned_freelancer_cost",
            "cost_rate_override", "billing_rate_override",
            "pricing_model_snapshot", "cost_rate_snapshot", "billing_rate_snapshot",
            "currency_snapshot", "margin", "status", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "pricing_model_snapshot", "cost_rate_snapshot", "billing_rate_snapshot",
            "currency_snapshot", "created_at", "updated_at",
        )

    def get_margin(self, obj):
        return obj.margin

    def get_planned_freelancer_cost(self, obj):
        return obj.planned_freelancer_cost

    def get_client_name(self, obj):
        client = getattr(obj.project, "client", None)
        return getattr(client, "company_name", None)

    def create(self, validated_data):
        """Snapshots the freelancer's rate at assignment time (Rule 4) - a
        later change to the freelancer's rate card must never alter this
        assignment's cost/billing figures (Rule 5). An explicit
        cost_rate_override/billing_rate_override in the request overrides
        the snapshot pulled from the rate card (Section 12) without ever
        writing back to the rate card itself."""
        freelancer = validated_data["freelancer"]
        rate_card = validated_data.get("rate_card")
        cost_override = validated_data.pop("cost_rate_override", None)
        billing_override = validated_data.pop("billing_rate_override", None)

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

        if cost_override is not None:
            validated_data["cost_rate_snapshot"] = cost_override
        if billing_override is not None:
            validated_data["billing_rate_snapshot"] = billing_override

        request = self.context.get("request")
        if request is not None:
            validated_data["created_by"] = request.user

        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Overrides only make sense at creation (they seed the snapshot);
        # silently drop them on PATCH rather than trying to re-snapshot.
        validated_data.pop("cost_rate_override", None)
        validated_data.pop("billing_rate_override", None)
        return super().update(instance, validated_data)


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


# --------------------------------------------------------------------------- #
# Bank / tax details                                                           #
# --------------------------------------------------------------------------- #

# A change to any of these resets the reviewer's payout verification to 'pending'.
BANK_IDENTITY_FIELDS = (
    "payment_method", "bank_country", "account_holder_name", "bank_name", "account_number",
    "ifsc_code", "routing_code", "swift_code", "iban", "upi_id", "paypal_email", "wise_email",
)
BANK_WRITABLE_FIELDS = (
    "payment_method", "tax_number", "bank_country", "account_holder_name", "bank_name",
    "account_number", "confirm_account_number", "ifsc_code", "routing_code", "swift_code", "iban",
    "branch_name", "bank_address", "account_type", "upi_id", "paypal_email", "wise_email",
)
BANK_READ_ONLY_FIELDS = (
    "id", "freelancer", "payment_status", "verification_remarks", "verified_at", "verified_by_name",
    "tax_type", "tax_label", "tax_number_masked", "has_tax_number",
    "pan_verification_status", "pan_verification_remarks",
    "account_number_masked", "has_account_number", "created_at", "updated_at",
)
BANK_FIELD_LABELS = {
    "payment_method": "payment method", "bank_country": "bank country", "account_holder_name": "account holder",
    "bank_name": "bank name", "account_number": "account number", "ifsc_code": "IFSC", "routing_code": "routing code",
    "swift_code": "SWIFT / BIC", "iban": "IBAN", "branch_name": "branch", "bank_address": "bank address",
    "account_type": "account type", "upi_id": "UPI ID", "paypal_email": "PayPal email", "wise_email": "Wise email",
    "tax_number": "tax ID", "payment_terms": "payment terms",
}


def _drop_inapplicable_bank_fields(attrs, instance, bank_country):
    """Identifiers the bank's country doesn't use are blanked (e.g. an IFSC on a US account)."""
    code = countries.resolve_country(bank_country)
    if not code:
        return
    cfg = countries.bank_config(code)
    routing_field = (cfg.get("routing") or {}).get("field")
    clear = []
    if routing_field != "ifsc_code":
        clear.append("ifsc_code")
    if routing_field != "routing_code":
        clear.append("routing_code")
    if cfg["iban"] == "hidden":
        clear.append("iban")
    if cfg["swift"] == "hidden":
        clear.append("swift_code")
    if not cfg.get("account_types"):
        clear.append("account_type")
    country_changed = instance is not None and "bank_country" in attrs and \
        countries.resolve_country(instance.bank_country) != code
    for field in clear:
        if field in attrs or (country_changed and getattr(instance, field, "")):
            attrs[field] = ""


class _BankDetailWriteSerializer(serializers.ModelSerializer):
    """Shared validation for the admin and portal bank-detail serializers. The account
    number, PAN / tax ID are write-only and masked on read; a blank value keeps what is
    on file. Expects context["freelancer"]."""

    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=40)
    confirm_account_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=40)
    tax_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=60)
    account_number_masked = serializers.SerializerMethodField()
    has_account_number = serializers.SerializerMethodField()
    tax_number_masked = serializers.SerializerMethodField()
    has_tax_number = serializers.SerializerMethodField()
    tax_label = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()

    changed_fields = ()
    verification_reset = False
    pan_reset = False
    # (payment_status, pan_verification_status) before an update - for the audit trail.
    previous_statuses = ("", "")

    def _freelancer(self):
        return self.context.get("freelancer") or getattr(self.instance, "freelancer", None)

    def get_account_number_masked(self, obj):
        return obj.mask_account_number()

    def get_has_account_number(self, obj):
        return bool(obj.account_number)

    def get_tax_number_masked(self, obj):
        return obj.mask_tax_number()

    def get_has_tax_number(self, obj):
        return bool(obj.tax_number)

    def get_tax_label(self, obj):
        return kyc.tax_rule(obj.freelancer)["label"]

    def get_verified_by_name(self, obj):
        return _user_name(obj.verified_by)

    def validate(self, attrs):
        instance = self.instance
        freelancer = self._freelancer()
        errors = {}

        confirm_account_number(self.initial_data, "account_number", "confirm_account_number", errors)
        attrs.pop("confirm_account_number", None)
        for field in ("account_number", "tax_number"):
            if field in attrs and not (attrs[field] or "").strip():
                attrs.pop(field)

        def merged(field):
            if field in attrs:
                return attrs[field]
            return getattr(instance, field, "") if instance is not None else ""

        normalize_country_fields(attrs, "bank_country")
        check_country(attrs, "bank_country", errors)
        method = merged("payment_method")
        bank_country = merged("bank_country") or (freelancer.residence_country if freelancer else "")

        # Bank identifiers follow the bank country's rules - only when paid by bank transfer.
        if method == "bank_transfer" and "bank_country" not in errors:
            _drop_inapplicable_bank_fields(attrs, instance, bank_country)
            clean_bank_details(
                attrs, bank_country, errors, instance=instance, partial=True,
                has_saved_account_number=bool(instance is not None and instance.account_number),
            )
            account_type = attrs.get("account_type")
            code = countries.resolve_country(bank_country)
            allowed_types = (countries.bank_config(code).get("account_types") or []) if code else []
            if account_type and allowed_types and account_type not in {value for value, _ in allowed_types}:
                errors["account_type"] = "Select an account type from the list."

        if attrs.get("upi_id"):
            attrs["upi_id"] = attrs["upi_id"].strip()
            message = kyc.validate_upi_id(attrs["upi_id"])
            if message:
                errors["upi_id"] = message
        for field in ("paypal_email", "wise_email"):
            if attrs.get(field):
                attrs[field] = attrs[field].strip().lower()

        if "tax_number" in attrs and freelancer is not None:
            value, message, tax_type = kyc.clean_tax_number(attrs["tax_number"], freelancer)
            if message:
                errors["tax_number"] = message
            else:
                attrs["tax_number"] = value
                attrs["tax_type"] = tax_type

        if freelancer is not None:
            self._check_duplicates(attrs, merged, freelancer, errors)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def _check_duplicates(self, attrs, merged, freelancer, errors):
        others = FreelancerBankDetail.objects.filter(freelancer__is_archived=False).exclude(freelancer=freelancer)
        tax_number = attrs.get("tax_number")
        if tax_number and "tax_number" not in errors and others.filter(tax_number__iexact=tax_number).exists():
            label = "PAN" if kyc.uses_india_rules(freelancer) else "tax ID"
            errors["tax_number"] = f"This {label} is already registered to another freelancer."
        account_number = attrs.get("account_number")
        if account_number and "account_number" not in errors:
            matches = others.filter(account_number=account_number)
            if merged("ifsc_code"):
                matches = matches.filter(ifsc_code__iexact=merged("ifsc_code"))
            elif merged("routing_code"):
                matches = matches.filter(routing_code__iexact=merged("routing_code"))
            elif merged("bank_name"):
                matches = matches.filter(bank_name__iexact=merged("bank_name"))
            if matches.exists():
                errors["account_number"] = "This bank account is already registered to another freelancer."
        iban = attrs.get("iban")
        if iban and "iban" not in errors and others.filter(iban__iexact=iban).exists():
            errors["iban"] = "This IBAN is already registered to another freelancer."

    def create(self, validated_data):
        bank = super().create(validated_data)
        self.changed_fields = tuple(
            f for f, v in validated_data.items() if f not in ("freelancer", "tax_type") and v not in ("", None)
        )
        _mirror_payment_method(bank)
        return bank

    def update(self, instance, validated_data):
        changed = tuple(
            f for f, v in validated_data.items()
            if f not in ("freelancer", "tax_type") and getattr(instance, f, None) != v
        )
        self.previous_statuses = (instance.payment_status, instance.pan_verification_status)
        if instance.payment_status in ("verified", "rejected") and any(f in BANK_IDENTITY_FIELDS for f in changed):
            validated_data.update(payment_status="pending", verified_by=None, verified_at=None)
            self.verification_reset = True
        if "tax_number" in changed and instance.pan_verification_status in ("verified", "rejected"):
            validated_data["pan_verification_status"] = "pending"
            self.pan_reset = True
        self.changed_fields = changed
        bank = super().update(instance, validated_data)
        _mirror_payment_method(bank)
        return bank


def _mirror_payment_method(bank):
    """Freelancer.payment_method is a read-only mirror of the bank detail's method."""
    if bank.freelancer.payment_method != bank.payment_method:
        Freelancer.objects.filter(pk=bank.freelancer_id).update(payment_method=bank.payment_method)
        bank.freelancer.payment_method = bank.payment_method


class FreelancerBankDetailSerializer(_BankDetailWriteSerializer):
    """Admin (masked) bank / tax serializer - mirrors VendorBankDetailSerializer: never
    exposes the full account number or tax ID, only accepts new ones on write. The
    verification statuses are read-only here - only the verify endpoint sets them."""

    class Meta:
        model = FreelancerBankDetail
        fields = BANK_WRITABLE_FIELDS + ("payment_terms",) + BANK_READ_ONLY_FIELDS
        read_only_fields = BANK_READ_ONLY_FIELDS
        extra_kwargs = {"freelancer": {"required": False}}


class FreelancerBankDetailPublicSerializer(_BankDetailWriteSerializer):
    """Portal counterpart - no payment terms (a commercial term the company sets) and no
    way to set a verification status or reassign the record."""

    class Meta:
        model = FreelancerBankDetail
        fields = BANK_WRITABLE_FIELDS + BANK_READ_ONLY_FIELDS
        read_only_fields = BANK_READ_ONLY_FIELDS


class FreelancerBankDetailUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated bank-account reveal endpoint -
    deliberately excludes tax_number (PAN), which has its own separate
    reveal endpoint/permission (FreelancerPANUnmaskedSerializer)."""

    class Meta:
        model = FreelancerBankDetail
        fields = (
            "id", "freelancer", "payment_method", "payment_terms", "payment_status",
            "bank_country", "account_holder_name", "bank_name", "account_number", "ifsc_code",
            "routing_code", "swift_code", "iban", "branch_name", "account_type",
            "upi_id", "paypal_email", "wise_email", "created_at", "updated_at",
        )
        read_only_fields = fields


class FreelancerPANUnmaskedSerializer(serializers.ModelSerializer):
    """Only ever instantiated by the dedicated PAN reveal endpoint, gated by
    its own permission code independent of the bank-account reveal."""

    class Meta:
        model = FreelancerBankDetail
        fields = ("id", "freelancer", "tax_type", "tax_number", "pan_verification_status")
        read_only_fields = fields


class BankVerificationSerializer(serializers.Serializer):
    """Reviewer decision on the payout details ('bank') or the PAN / tax ID ('pan')."""
    target = serializers.ChoiceField(choices=[("bank", "Payout details"), ("pan", "PAN / tax ID")])
    status = serializers.ChoiceField(choices=[
        ("pending", "Pending"), ("verified", "Verified"), ("rejected", "Rejected"), ("on_hold", "On Hold"),
    ])
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        attrs["remarks"] = (attrs.get("remarks") or "").strip()
        if attrs["target"] == "pan" and attrs["status"] == "on_hold":
            raise serializers.ValidationError({"status": "A PAN / tax ID is pending, verified or rejected."})
        if attrs["status"] == "rejected" and not attrs["remarks"]:
            raise serializers.ValidationError({"remarks": "A reason is required when rejecting."})
        return attrs


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


class FreelancerAuditLogSerializer(serializers.ModelSerializer):
    """Read-only - entries are written internally by the views / services that perform
    the actual mutation (services.log_audit), never via a client-facing create/update
    path. Values are already masked when the field is sensitive."""

    action_display = serializers.CharField(source="get_action_display", read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerAuditLog
        fields = (
            "id", "freelancer", "action", "action_display", "field_name",
            "old_value", "new_value", "remarks", "performed_by_name", "created_at",
        )
        read_only_fields = fields

    def get_performed_by_name(self, obj):
        user = obj.performed_by
        if not user:
            return obj.actor_label or "System"
        return getattr(user, "display_name", None) or getattr(user, "username", None) or str(user)


class FreelancerEquipmentSerializer(serializers.ModelSerializer):
    """Laptop/equipment detail - nothing sensitive here, no masking needed."""

    class Meta:
        model = FreelancerEquipment
        fields = (
            "id", "freelancer", "ownership", "brand", "model", "serial_number",
            "processor", "ram", "storage", "operating_system", "asset_id",
            "issue_date", "return_date", "condition", "remarks",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"freelancer": {"required": False}}
