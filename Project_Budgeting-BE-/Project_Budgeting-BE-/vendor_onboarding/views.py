import logging
import os
import re
import time
from datetime import timedelta

import cloudinary.utils
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.models import Vendor
from core import countries as country_rules
from core.app_constants import CURRENCY_CHOICES
from core.document_security import check_document_upload, effective_document_status, parse_expiry_date
from core.notifications import notify
from roles.permission import HasPermissionCode

from .access import (
    EDIT_PERMISSION_CODES, VENDOR_MASTER_FIELDS, can_edit, can_edit_master_fields, is_editable_status,
)
from .audit import changed_fields, log_vendor_audit
from .models import (
    VendorOnboardingProfile, VendorDocument, VendorKYC, VendorBankDetail, VendorProcurementDetail,
    VendorApprovalWorkflowConfig, VendorApprovalLevel, VendorChangeRequest,
)
from .progress import (
    BANK_PROOF_CATEGORIES, EXPIRY_TRACKED_CATEGORIES, INCORPORATED_VENDOR_TYPES, INDIVIDUAL_VENDOR_TYPES,
    MAX_VENDOR_KYC_DOCUMENTS, NON_KYC_DOCUMENT_CATEGORIES, ONBOARDING_CURRENCIES, PAYMENT_TERM_CHOICES,
    VENDOR_ONBOARDING_STEPS, build_vendor_financials, count_kyc_documents, vendor_requirement_issues,
)
from .serializers import (
    RequestChangesSerializer, VendorApprovalHistorySerializer, VendorApprovalLevelSerializer,
    VendorApprovalWorkflowConfigSerializer, VendorAuditLogSerializer, VendorBankDetailSerializer,
    VendorBankDetailUnmaskedSerializer, VendorDocumentSerializer, VendorDocumentVerifySerializer,
    VendorIdentitySerializer, VendorKYCSerializer, VendorOnboardingDetailSerializer,
    VendorOnboardingProfileSerializer, VendorProcurementDetailSerializer, VendorPublicDetailSerializer,
    VendorPublicDocumentSerializer, VendorPublicIdentitySerializer, VendorPublicOnboardingProfileSerializer,
    VendorPublicProcurementDetailSerializer, VendorRaiseRequestSerializer, VendorReviewSerializer,
    VendorSubmissionVersionSerializer,
)
from .services import (
    submit_vendor_for_approval, apply_approval_action, apply_request_changes_action,
    user_is_authorized_for_level, raise_vendor_request, generate_access_token,
    validate_public_token, ensure_draft_status, InvalidTokenError,
    level_recipient_accounts,
)
from .tasks import (
    send_vendor_invited_notification, send_vendor_submitted_notification,
    send_vendor_approval_advanced_notification, send_vendor_approved_notification,
    send_vendor_request_changes_notification, send_vendor_resubmitted_notification,
    send_vendor_approval_in_progress_notification, _badge,
)
from .throttling import VendorPortalThrottle, throttles_available

logger = logging.getLogger(__name__)

# Minimum gap between onboarding emails to the same vendor (spam guard).
ONBOARDING_EMAIL_COOLDOWN = timedelta(seconds=60)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _error(message, code="invalid", http_status=400, **extra):
    """Error body in the shape every client reads: `error` (the message, like the global DRF
    exception handler), `detail` / `message` for older callers, and a machine-readable `code`."""
    return Response({"error": message, "detail": message, "message": message, "code": code, **extra}, status=http_status)


def _fresh_vendor(pk):
    """The vendor with everything the detail serializers read, loaded after a write so the
    response (and its onboarding summary) reflects what is now stored."""
    return (
        Vendor.objects.select_related(
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "approval_instance",
            "approval_instance__resolved_config",
        )
        .prefetch_related("documents", "documents__verified_by", "change_requests", "product_groups")
        .get(pk=pk)
    )


def _admin_detail(pk, request, http_status=status.HTTP_200_OK):
    return Response(VendorOnboardingDetailSerializer(_fresh_vendor(pk), context={"request": request}).data, status=http_status)


def _public_detail(pk, request):
    return Response(VendorPublicDetailSerializer(_fresh_vendor(pk), context={"request": request}).data)


# ===========================================================================
# Section saving - one implementation for the admin wizard, the vendor portal
# and the legacy per-step endpoints
# ===========================================================================

# section -> (related name on Vendor, or None for the Vendor row itself; admin serializer;
#             portal serializer; audit action)
SECTIONS = {
    "identity": (None, VendorIdentitySerializer, VendorPublicIdentitySerializer, "updated"),
    "profile": ("onboarding_profile", VendorOnboardingProfileSerializer, VendorPublicOnboardingProfileSerializer, "updated"),
    "kyc": ("kyc", VendorKYCSerializer, VendorKYCSerializer, "kyc_updated"),
    "bank_detail": ("bank_detail", VendorBankDetailSerializer, VendorBankDetailSerializer, "updated"),
    "procurement_detail": (
        "procurement_detail", VendorProcurementDetailSerializer, VendorPublicProcurementDetailSerializer, "contract_updated",
    ),
}

# Changing any of these after a reviewer acted on the account means the review no longer applies.
BANK_FINGERPRINT_FIELDS = ("account_number", "ifsc_code", "routing_code", "swift_code", "iban", "account_holder_name", "bank_name")
RESETTABLE_BANK_STATUSES = ("verified", "under_review", "rejected")


def _section_context(vendor, sections, internal):
    """Vendor-level facts the section validators need (country, vendor type), taking the values
    from this request first - e.g. bank / postal / tax rules follow a country changed in the
    same save."""
    profile = getattr(vendor, "onboarding_profile", None) if vendor.pk else None
    identity = sections.get("identity") if isinstance(sections.get("identity"), dict) else {}
    profile_data = sections.get("profile") if isinstance(sections.get("profile"), dict) else {}
    raw_country = profile_data["country"] if "country" in profile_data else (profile.country if profile else "")
    country = country_rules.normalize_country_value(str(raw_country)) if raw_country else ""
    vendor_type = identity["vendor_type"] if internal and "vendor_type" in identity else vendor.vendor_type
    return {"vendor": vendor, "vendor_country": country, "vendor_type": str(vendor_type or ""), "internal": internal}


def _bank_fingerprint(bank, fallback_country):
    if bank is None or not bank.pk:
        return None
    values = {}
    for field in BANK_FINGERPRINT_FIELDS:
        value = getattr(bank, field, "") or ""
        if field in ("account_holder_name", "bank_name"):
            values[field] = re.sub(r"\s+", " ", value).strip().casefold()
        else:
            values[field] = country_rules.normalize_bank_value(field, value)
    # Compared by ISO code, so "" (= the vendor's country) and "India" are the same bank country.
    values["bank_country"] = (country_rules.resolve_country(bank.bank_country)
                              or country_rules.resolve_country(fallback_country) or "")
    return values


def _reset_bank_verification_if_changed(vendor, bank, before, fallback_country, user, actor_label):
    """Bank details changed after a reviewer verified / reviewed / rejected them -> the account
    is not verified any more. Audited with the field names only (never the values)."""
    if before is None or bank is None or bank.verification_status not in RESETTABLE_BANK_STATUSES:
        return
    after = _bank_fingerprint(bank, fallback_country)
    changed = [field for field, value in after.items() if before.get(field) != value]
    if not changed:
        return
    previous = bank.verification_status
    bank.verification_status = "not_verified"
    bank.verification_remarks = ""
    bank.save(update_fields=["verification_status", "verification_remarks", "updated_at"])
    log_vendor_audit(
        vendor, "banking_reset", user, field_name="verification_status", old_value=previous, new_value="not_verified",
        remarks=f"Bank details changed after review ({', '.join(changed)}) - the account must be verified again.",
        actor_label=actor_label,
    )


def _save_sections(vendor, payload, *, user=None, actor_label="", internal=True, flat_errors=False, allowed_sections=None):
    """Validates every section in `payload` ({identity, profile, kyc, bank_detail,
    procurement_detail, last_saved_step}) before saving any of them, then saves them in one
    transaction - so one request carries a whole wizard step. Raises a ValidationError keyed
    {section: {field: [messages]}} (flat for the single-section legacy endpoints)."""
    if not isinstance(payload, dict):
        raise serializers.ValidationError({"non_field_errors": ["Expected an object of sections."]})
    errors = {}
    sections = {}
    for key, value in payload.items():
        if key == "last_saved_step":
            continue
        if key not in SECTIONS:
            errors[key] = ["Unknown section."]
        elif allowed_sections is not None and key not in allowed_sections:
            errors[key] = ["This section can't be changed in the vendor's current state."]
        elif not isinstance(value, dict):
            errors[key] = ["Expected an object."]
        else:
            sections[key] = value

    context = _section_context(vendor, sections, internal)
    bound = []
    for key in SECTIONS:
        if key not in sections:
            continue
        related, admin_cls, portal_cls, action = SECTIONS[key]
        instance = vendor if related is None else getattr(vendor, related, None)
        serializer = (admin_cls if internal else portal_cls)(instance, data=sections[key], partial=True, context=context)
        if not serializer.is_valid():
            errors[key] = serializer.errors
        bound.append((key, related, action, instance, serializer))

    step = payload.get("last_saved_step")
    if step not in (None, ""):
        try:
            step = int(step)
        except (TypeError, ValueError):
            step = 0
        if not 1 <= step <= len(VENDOR_ONBOARDING_STEPS):
            errors["last_saved_step"] = [f"Enter a step between 1 and {len(VENDOR_ONBOARDING_STEPS)}."]
    else:
        step = None

    if errors:
        if flat_errors and len(sections) == 1 and set(errors) <= set(sections):
            raise serializers.ValidationError(next(iter(errors.values())))
        raise serializers.ValidationError(errors)

    was_invited = vendor.status == "invited"
    fallback_country = context["vendor_country"]
    try:
        with transaction.atomic():
            ensure_draft_status(vendor)
            for key, related, action, instance, serializer in bound:
                before = _bank_fingerprint(instance, fallback_country) if key == "bank_detail" else None
                if instance is not None:
                    changes = [field for field, _old, _new in changed_fields(instance, serializer.validated_data)]
                else:
                    changes = [field for field, value in serializer.validated_data.items() if value not in ("", None, False)]
                if related is None:
                    serializer.save()
                else:
                    serializer.save(vendor=vendor)
                if changes:
                    # Field names only - values (bank / tax identifiers) are never written to the audit log.
                    log_vendor_audit(vendor, action, user, field_name=key, new_value=", ".join(changes), actor_label=actor_label)
                if key == "bank_detail":
                    _reset_bank_verification_if_changed(vendor, serializer.instance, before, fallback_country, user, actor_label)
            if step is not None and step != vendor.last_saved_step:
                vendor.last_saved_step = step
                vendor.save(update_fields=["last_saved_step", "updated_at"])
            if was_invited and vendor.status == "draft":
                log_vendor_audit(vendor, "onboarding_started", user, actor_label=actor_label)
    except IntegrityError:
        # Two saves racing for the same (unique) vendor name.
        logger.warning("Vendor %s section save hit an integrity error", vendor.pk)
        raise serializers.ValidationError({"identity": {"first_name": ["A vendor with this name already exists."]}})


def _only_master_fields(payload):
    """True when a save touches nothing but the internal vendor-master fields (rating, headcount,
    manual spend) - the only data still editable once a vendor is submitted or approved."""
    if not isinstance(payload, dict) or set(payload) != {"profile"} or not isinstance(payload["profile"], dict):
        return False
    return bool(payload["profile"]) and set(payload["profile"]) <= set(VENDOR_MASTER_FIELDS)


# ===========================================================================
# Documents
# ===========================================================================

DOCUMENT_CATEGORY_VALUES = {value for value, _label in VendorDocument.CATEGORY_CHOICES}


def _upload_vendor_document(request, vendor, *, user=None, actor_label="", portal=False):
    """Shared by the admin and portal upload endpoints.

    multipart: `file`, `category`, optional `replaces` (id of a document of this vendor - stored
    first, then the replaced document is deleted in the same transaction; it is excluded from the
    document cap and the duplicate check), optional `expiry_date` (YYYY-MM-DD, not in the past),
    optional `document_number`. A portal caller can't replace a verified document. Uploading never
    verifies anything."""
    file = request.FILES.get("file")
    category = (request.data.get("category") or "").strip()
    if category not in DOCUMENT_CATEGORY_VALUES:
        return _error("Please select a valid document type.", "invalid_document_type")
    problem = check_document_upload(file)
    if problem:
        code, message = problem
        return _error(message, code)

    replaced = None
    replaces = request.data.get("replaces")
    if replaces not in (None, "", "null", "undefined"):
        try:
            replaced = vendor.documents.get(pk=int(replaces))
        except (TypeError, ValueError, VendorDocument.DoesNotExist):
            return _error("The document being replaced was not found.", "replace_not_found", status.HTTP_404_NOT_FOUND)
        if portal and replaced.status == "verified":
            return _error("A verified document can't be replaced. Contact the team that invited you.", "document_locked",
                          status.HTTP_403_FORBIDDEN)

    try:
        expiry_date = parse_expiry_date(request.data.get("expiry_date"))
    except (TypeError, ValueError):
        return _error("Enter the expiry date as YYYY-MM-DD.", "invalid_expiry_date")
    if expiry_date and expiry_date < timezone.localdate():
        return _error("This document has already expired - upload one that is still valid.", "document_expired")
    document_number = re.sub(r"\s+", " ", str(request.data.get("document_number") or "")).strip()
    if len(document_number) > 100:
        return _error("The document number can be at most 100 characters.", "invalid_document_number")

    existing = list(vendor.documents.all())
    exclude = {replaced.id} if replaced else set()
    if category not in NON_KYC_DOCUMENT_CATEGORIES and count_kyc_documents(existing, exclude_ids=exclude) >= MAX_VENDOR_KYC_DOCUMENTS:
        return _error(
            f"A vendor can have at most {MAX_VENDOR_KYC_DOCUMENTS} KYC documents (rejected and replaced documents don't count). "
            "Replace or remove a document to upload another.",
            "document_limit_reached",
        )
    # The same file may serve two document types (e.g. one PDF holding PAN and GST); only an exact
    # repeat within one document type is a duplicate.
    if any(d.category == category and d.file_name == file.name and d.file_size == file.size and d.id not in exclude for d in existing):
        return _error("This file is already uploaded for this document type.", "duplicate_document")

    authenticated = user is not None and user.is_authenticated
    was_invited = vendor.status == "invited"
    try:
        with transaction.atomic():
            ensure_draft_status(vendor)
            document = VendorDocument.objects.create(
                vendor=vendor,
                file=file,
                file_name=os.path.basename(file.name or "")[:255],
                file_size=file.size,
                file_type=(getattr(file, "content_type", "") or "")[:100],
                category=category,
                expiry_date=expiry_date,
                document_number=document_number,
                uploaded_by=user if authenticated else None,
                uploaded_by_role="admin" if authenticated else "vendor",
            )
            replaced_info = (replaced.get_category_display(), replaced.file_name) if replaced else None
            if replaced:
                replaced.delete()
    except Exception:  # noqa: BLE001 - storage (Cloudinary) or database failure
        logger.exception("Vendor %s document upload failed while storing the file", vendor.id)
        return _error("The server could not store the document. Please try again.", "storage_failed", status.HTTP_502_BAD_GATEWAY)

    if was_invited:
        log_vendor_audit(vendor, "onboarding_started", user, actor_label=actor_label)
    if replaced_info:
        log_vendor_audit(vendor, "document_replaced", user, field_name=document.category, old_value=replaced_info[0],
                         new_value=document.get_category_display(), remarks=f"{replaced_info[1]} -> {document.file_name}",
                         actor_label=actor_label)
    else:
        log_vendor_audit(vendor, "document_uploaded", user, field_name=document.category,
                         new_value=document.get_category_display(), remarks=document.file_name, actor_label=actor_label)
    # A bank proof on file moves bank verification from "not verified" to "documents uploaded".
    if document.category in BANK_PROOF_CATEGORIES:
        bank = getattr(vendor, "bank_detail", None)
        if bank and bank.verification_status == "not_verified":
            bank.verification_status = "documents_uploaded"
            bank.save(update_fields=["verification_status", "updated_at"])
    serializer_class = VendorPublicDocumentSerializer if portal else VendorDocumentSerializer
    return Response(serializer_class(document, context={"request": request}).data, status=status.HTTP_201_CREATED)


def _signed_download(document):
    signed_url, _ = cloudinary.utils.cloudinary_url(
        document.file.public_id,
        resource_type="raw",
        sign_url=True,
        expires_at=int(time.time()) + 300,
    )
    return Response({"file_name": document.file_name, "download_url": signed_url})


def _submission_blocked(vendor):
    """400 listing everything still missing (structured, so the wizard can point at each step / field)."""
    issues = [i for i in vendor_requirement_issues(vendor) if i["stage"] == "submission"]
    if not issues:
        return None
    errors = {}
    for issue in issues:
        errors.setdefault(issue["key"], [f"{issue['message']} is required." if issue["kind"] == "missing" else f"{issue['message']}."])
    message = "Complete the missing items before submitting."
    return _error(message, "submission_incomplete", missing=[i["message"] for i in issues], issues=issues, errors=errors)


# ===========================================================================
# Admin (JWT-authenticated) endpoints
# ===========================================================================

class VendorOnboardingListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "vendor.view", "POST": "vendor.create"}

    def get(self, request):
        qs = Vendor.objects.select_related(
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail", "approval_instance"
        ).prefetch_related("documents", "documents__verified_by", "change_requests", "product_groups")

        status_filter = request.GET.get("status")
        vendor_type = request.GET.get("vendor_type")
        company_code = request.GET.get("company_code")
        plant = request.GET.get("plant")
        gst_registered = request.GET.get("gst_registered")
        msme_registered = request.GET.get("msme_registered")
        search = request.GET.get("search")
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")
        archived = request.GET.get("archived")

        # Archived requests are hidden from the default list/tabs - pass
        # archived=true to see only archived ones, or archived=all for both.
        if archived == "true":
            qs = qs.filter(is_archived=True)
        elif archived != "all":
            qs = qs.filter(is_archived=False)

        if status_filter:
            # Comma-separated for the dashboard's grouped filters (e.g. "Action Required"
            # covers submitted + resubmitted + action_required).
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if vendor_type:
            qs = qs.filter(vendor_type=vendor_type)
        if company_code:
            qs = qs.filter(Q(company_code=company_code) | Q(onboarding_profile__company_code=company_code))
        if plant:
            qs = qs.filter(Q(plant=plant) | Q(onboarding_profile__plant=plant))
        if gst_registered is not None:
            qs = qs.filter(onboarding_profile__gst_registered=gst_registered.lower() == "true")
        if msme_registered is not None:
            qs = qs.filter(onboarding_profile__msme_registered=msme_registered.lower() == "true")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(vendor_reference_no__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(kyc__pan__icontains=search)
                | Q(onboarding_profile__gstin__icontains=search)
            )

        vendors = list(qs.distinct())
        serializer = VendorOnboardingDetailSerializer(
            vendors,
            many=True,
            context={"request": request, "vendor_financials": build_vendor_financials(v.id for v in vendors)},
        )
        return Response(serializer.data)

    def post(self, request):
        """An internal user creates the vendor directly (no self-service link needed) - it starts
        as a DRAFT and goes through the same submission / approval pipeline.

        Body: the identity fields, or {identity: {...}, profile: {...}, kyc: {...}, ...} to create
        the vendor and save its first wizard step in one request."""
        data = request.data
        sectioned = isinstance(data, dict) and isinstance(data.get("identity"), dict)
        sections = {k: v for k, v in data.items() if k != "identity"} if sectioned else {}
        identity = data["identity"] if sectioned else data
        context = _section_context(Vendor(), {"identity": identity, **sections}, internal=True)
        serializer = VendorIdentitySerializer(data=identity, context=context)
        if not serializer.is_valid():
            raise serializers.ValidationError({"identity": serializer.errors} if sectioned else serializer.errors)
        try:
            with transaction.atomic():
                vendor = serializer.save(created_by=request.user, status="draft")
                vendor.assign_reference_number()
                vendor.save(update_fields=["vendor_reference_no"])
                log_vendor_audit(vendor, "created", request.user, remarks="Created by an internal user")
                if sections:
                    _save_sections(vendor, sections, user=request.user, internal=True)
        except IntegrityError:
            raise serializers.ValidationError(
                {"identity": {"first_name": ["A vendor with this name already exists."]}} if sectioned
                else {"first_name": ["A vendor with this name already exists."]}
            )
        return _admin_detail(vendor.pk, request, http_status=status.HTTP_201_CREATED)


class VendorRaiseRequestView(APIView):
    """Admin 'Raise Vendor Request' - the lightweight self-service invite path."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.create"

    def post(self, request):
        serializer = VendorRaiseRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            vendor, raw_token = raise_vendor_request(serializer.validated_data, request.user)
        except IntegrityError:
            return Response({"first_name": ["A vendor with this name already exists."]}, status=status.HTTP_400_BAD_REQUEST)
        log_vendor_audit(vendor, "created", request.user, remarks="Vendor request raised - onboarding link emailed")

        transaction.on_commit(
            lambda: send_vendor_invited_notification.delay(vendor.id, raw_token)
        )
        return _admin_detail(vendor.pk, request, http_status=status.HTTP_201_CREATED)


class VendorResendInviteView(APIView):
    """Rotates the access token (revoking the old one) and resends the invite
    email with the new link - used when the original link expired or the
    vendor lost the email."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.create"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if vendor.status == "approved":
            return _error("This vendor request has already been approved.")
        if not vendor.email:
            return _error("Add the vendor's contact email before sending the onboarding email.")
        last = vendor.email_logs.filter(template="vendor_invited.html").first()
        if last and timezone.now() - last.created_at < ONBOARDING_EMAIL_COOLDOWN:
            return _error("An onboarding email was just sent. Please wait a minute before resending.", "email_cooldown",
                          status.HTTP_429_TOO_MANY_REQUESTS)

        raw_token = generate_access_token(vendor, created_by=request.user)
        transaction.on_commit(
            lambda: send_vendor_invited_notification.delay(vendor.id, raw_token, request.user.id)
        )
        # In dev (eager Celery) the send has already happened; in production it's queued.
        latest = vendor.email_logs.filter(template="vendor_invited.html").first()
        return Response({
            "detail": "Invitation resent.",
            "email_status": latest.status if latest else "queued",
        })


class VendorArchiveView(APIView):
    """Hides a request from the default Vendor Requests list/tabs - does not
    delete anything or touch status/workflow state."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.delete"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        vendor.is_archived = True
        vendor.save(update_fields=["is_archived"])
        return _admin_detail(vendor.pk, request)


class VendorUnarchiveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.delete"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        vendor.is_archived = False
        vendor.save(update_fields=["is_archived"])
        return _admin_detail(vendor.pk, request)


class VendorRequestSummaryView(APIView):
    """Powers the admin dashboard's status summary cards."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.view"

    def get(self, request):
        # Mirrors the default (non-archived) list view, so "Total Requests"
        # here matches what the "All" tab actually shows.
        active_qs = Vendor.objects.filter(is_archived=False)
        counts = dict(active_qs.values_list("status").annotate(count=Count("id")))
        data = {"total": sum(counts.values())}
        for key, _label in Vendor.STATUS_CHOICES:
            data[key] = counts.get(key, 0)
        data["archived"] = Vendor.objects.filter(is_archived=True).count()
        return Response(data)


class VendorOnboardingDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    # PATCH is not in the map, so HasPermissionCode falls back to permission_codes: a role
    # holding EITHER vendor.edit_own or vendor.edit_any may edit (own vs any is checked below).
    permission_map = {"GET": "vendor.view", "DELETE": "vendor.delete"}
    permission_codes = list(EDIT_PERMISSION_CODES)

    def get(self, request, pk):
        get_object_or_404(Vendor, pk=pk)
        return _admin_detail(pk, request)

    def patch(self, request, pk):
        """Identity fields (name parts, type, contact, internal references, last_saved_step)."""
        vendor = get_object_or_404(Vendor, pk=pk)
        if not can_edit(vendor, request.user):
            return _error("This vendor is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        _save_sections(vendor, {"identity": request.data}, user=request.user, internal=True, flat_errors=True)
        return _admin_detail(vendor.pk, request)

    def delete(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if vendor.status not in ("invited", "draft"):
            return _error("Only invited or draft requests can be deleted.", "not_deletable", status.HTTP_403_FORBIDDEN)
        if not (request.user.is_superuser or vendor.created_by_id == request.user.id):
            return _error("You cannot delete another user's vendor.", "forbidden", status.HTTP_403_FORBIDDEN)
        vendor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorSectionsView(APIView):
    """PATCH {identity, profile, kyc, bank_detail, procurement_detail, last_saved_step} - the
    onboarding wizard's save: every section sent is validated first and all are saved together.
    Returns the full vendor detail, so a save needs no follow-up GET."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_codes = list(EDIT_PERMISSION_CODES)

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if can_edit(vendor, request.user):
            _save_sections(vendor, request.data, user=request.user, internal=True)
        elif _only_master_fields(request.data) and can_edit_master_fields(vendor, request.user):
            # Submitted / approved vendor - only the internal vendor-master fields may change.
            _save_sections(vendor, request.data, user=request.user, internal=True, allowed_sections={"profile"})
        else:
            return _error("This vendor is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        return _admin_detail(vendor.pk, request)


class _VendorStepDetailView(APIView):
    """Base class for the per-step PATCH endpoints (kept for older clients - the wizard uses
    VendorSectionsView). Same validation and saving as /sections/."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_codes = list(EDIT_PERMISSION_CODES)

    section = None
    response_serializer = None

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        payload = {self.section: request.data}
        if can_edit(vendor, request.user):
            _save_sections(vendor, payload, user=request.user, internal=True, flat_errors=True)
        elif self.section == "profile" and _only_master_fields(payload) and can_edit_master_fields(vendor, request.user):
            _save_sections(vendor, payload, user=request.user, internal=True, flat_errors=True, allowed_sections={"profile"})
        else:
            return _error("This vendor is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        vendor = _fresh_vendor(vendor.pk)
        return Response(self.response_serializer(getattr(vendor, SECTIONS[self.section][0])).data)


class VendorProfileStepView(_VendorStepDetailView):
    section = "profile"
    response_serializer = VendorOnboardingProfileSerializer


class VendorKYCStepView(_VendorStepDetailView):
    section = "kyc"
    response_serializer = VendorKYCSerializer


class VendorBankDetailStepView(_VendorStepDetailView):
    section = "bank_detail"
    response_serializer = VendorBankDetailSerializer


class VendorProcurementStepView(_VendorStepDetailView):
    section = "procurement_detail"
    response_serializer = VendorProcurementDetailSerializer


class VendorBankDetailUnmaskedView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.bank.view_unmasked"

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        bank = getattr(vendor, "bank_detail", None)
        if not bank:
            return _error("No bank details on file.", "not_found", status.HTTP_404_NOT_FOUND)
        return Response(VendorBankDetailUnmaskedSerializer(bank).data)


class VendorDocumentListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "vendor.document.view", "POST": "vendor.document.upload"}

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        docs = vendor.documents.select_related("verified_by")
        return Response(VendorDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        request.FILES.get("file")  # consume the upload body before any early return
        vendor = get_object_or_404(Vendor, pk=pk)
        if not can_edit(vendor, request.user):
            return _error("This vendor is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        return _upload_vendor_document(request, vendor, user=request.user)


class VendorDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"DELETE": "vendor.document.delete"}

    def delete(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if not can_edit(vendor, request.user):
            return _error("This vendor is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        log_vendor_audit(vendor, "document_deleted", request.user, field_name=document.category,
                         old_value=document.get_category_display(), remarks=document.file_name)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.document.view"

    def get(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        return _signed_download(document)


class VendorSubmitForApprovalView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.submit"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if not can_edit(vendor, request.user):
            return _error("This vendor cannot be submitted in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)

        blocked = _submission_blocked(vendor)
        if blocked:
            return blocked

        was_resubmission = vendor.change_requests.exists()
        try:
            submit_vendor_for_approval(vendor, actor=request.user)
        except ValueError as exc:
            return _error(str(exc), "no_approval_workflow")
        log_vendor_audit(vendor, "submitted", request.user, remarks="Resubmitted" if was_resubmission else "")

        if was_resubmission:
            transaction.on_commit(lambda: send_vendor_resubmitted_notification.delay(vendor.id))
        else:
            transaction.on_commit(lambda: send_vendor_submitted_notification.delay(vendor.id))

        # In-app bell notification, alongside the email above, to whoever is
        # the approver at the vendor's current stage.
        level = vendor.approval_instance.current_level() if hasattr(vendor, "approval_instance") else None
        notify(
            level_recipient_accounts(level),
            title=f"Vendor onboarding {'resubmitted' if was_resubmission else 'submitted'}: {vendor.name}",
            message=f"{vendor.vendor_reference_no or vendor.name} is awaiting your approval.",
            category="vendor_approval",
            link="/vendors/approvals",
        )

        return _admin_detail(vendor.pk, request)


class VendorSubmissionVersionListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.view"

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        versions = vendor.versions.all()
        return Response(VendorSubmissionVersionSerializer(versions, many=True).data)


class VendorApprovalQueueView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.approve"

    def get(self, request):
        qs = Vendor.objects.filter(
            status__in=["submitted", "resubmitted", "approval_in_progress"],
            approval_instance__isnull=False,
        ).select_related(
            "approval_instance", "approval_instance__resolved_config",
            "onboarding_profile", "kyc", "bank_detail", "procurement_detail",
        ).prefetch_related("documents", "documents__verified_by", "change_requests", "product_groups")

        assigned = [
            v for v in qs
            if v.approval_instance.current_level_order is not None
            and user_is_authorized_for_level(request.user, v.approval_instance.current_level())
        ]
        serializer = VendorOnboardingDetailSerializer(assigned, many=True, context={"request": request})
        return Response(serializer.data)


class VendorApproveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.approve"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        instance = getattr(vendor, "approval_instance", None)
        if not instance or not user_is_authorized_for_level(request.user, instance.current_level()):
            return _error("You are not the approver for this vendor's current stage.", "not_approver", status.HTTP_403_FORBIDDEN)

        # Final approval needs everything submitted AND verified (documents, KYC, bank account).
        outstanding = vendor_requirement_issues(vendor)
        if outstanding:
            return _error("Vendor cannot be approved yet.", "approval_blocked",
                          missing=[issue["message"] for issue in outstanding], issues=outstanding)

        comments = request.data.get("comments", "")
        apply_approval_action(vendor, request.user, comments=comments)
        log_vendor_audit(
            vendor, "approved", request.user, remarks=comments,
            new_value="Approved" if vendor.status == "approved" else "Approval level advanced",
        )

        if vendor.status == "approved":
            transaction.on_commit(lambda: send_vendor_approved_notification.delay(vendor.id))
            notify(
                vendor.created_by,
                title=f"Vendor approved: {vendor.name}",
                message=f"{vendor.vendor_reference_no or vendor.name} has been fully approved.",
                category="vendor_approval",
                link=f"/vendors/{vendor.id}",
            )
        else:
            transaction.on_commit(lambda: send_vendor_approval_advanced_notification.delay(vendor.id))
            transaction.on_commit(lambda: send_vendor_approval_in_progress_notification.delay(vendor.id))
            next_level = vendor.approval_instance.current_level() if hasattr(vendor, "approval_instance") else None
            notify(
                level_recipient_accounts(next_level),
                title=f"Vendor awaiting your approval: {vendor.name}",
                message=f"{vendor.vendor_reference_no or vendor.name} advanced to the next approval stage.",
                category="vendor_approval",
                link="/vendors/approvals",
            )

        return _admin_detail(vendor.pk, request)


class VendorRequestChangesView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.request_changes"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        instance = getattr(vendor, "approval_instance", None)
        if not instance or not user_is_authorized_for_level(request.user, instance.current_level()):
            return _error("You are not the approver for this vendor's current stage.", "not_approver", status.HTTP_403_FORBIDDEN)

        serializer = RequestChangesSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        change_request = apply_request_changes_action(vendor, request.user, **serializer.validated_data)
        log_vendor_audit(vendor, "changes_requested", request.user, field_name=change_request.section,
                         remarks=change_request.required_changes)

        transaction.on_commit(
            lambda: send_vendor_request_changes_notification.delay(vendor.id, change_request.id)
        )
        notify(
            vendor.created_by,
            title=f"Changes requested: {vendor.name}",
            message=f"The approver requested changes on {vendor.vendor_reference_no or vendor.name}.",
            category="vendor_approval",
            link=f"/vendors/{vendor.id}",
        )

        return _admin_detail(vendor.pk, request)


class VendorApprovalHistoryView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.approval_history.view"

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        history = vendor.approval_history.all()
        return Response(VendorApprovalHistorySerializer(history, many=True).data)


class VendorApprovalConfigListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "vendor.approval_config.view", "POST": "vendor.approval_config.manage"}

    def get(self, request):
        configs = VendorApprovalWorkflowConfig.objects.all()
        return Response(VendorApprovalWorkflowConfigSerializer(configs, many=True).data)

    def post(self, request):
        serializer = VendorApprovalWorkflowConfigSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class VendorApprovalConfigDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "vendor.approval_config.view",
        "PUT": "vendor.approval_config.manage",
        "DELETE": "vendor.approval_config.manage",
    }

    def get(self, request, pk):
        config = get_object_or_404(VendorApprovalWorkflowConfig, pk=pk)
        return Response(VendorApprovalWorkflowConfigSerializer(config).data)

    def put(self, request, pk):
        config = get_object_or_404(VendorApprovalWorkflowConfig, pk=pk)
        serializer = VendorApprovalWorkflowConfigSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        config = get_object_or_404(VendorApprovalWorkflowConfig, pk=pk)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorApprovalLevelListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "vendor.approval_config.view", "POST": "vendor.approval_config.manage"}

    def get(self, request, config_id):
        levels = VendorApprovalLevel.objects.filter(config_id=config_id)
        return Response(VendorApprovalLevelSerializer(levels, many=True).data)

    def post(self, request, config_id):
        data = request.data.copy()
        data["config"] = config_id
        serializer = VendorApprovalLevelSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class VendorApprovalLevelDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"PUT": "vendor.approval_config.manage", "DELETE": "vendor.approval_config.manage"}

    def put(self, request, config_id, level_id):
        level = get_object_or_404(VendorApprovalLevel, pk=level_id, config_id=config_id)
        serializer = VendorApprovalLevelSerializer(level, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, config_id, level_id):
        level = get_object_or_404(VendorApprovalLevel, pk=level_id, config_id=config_id)
        level.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorApprovalConfigResolveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.approval_config.view"

    def get(self, request):
        from .services import resolve_approval_chain
        config = resolve_approval_chain(
            request.GET.get("company_code"), request.GET.get("plant"), request.GET.get("vendor_type"),
        )
        if not config:
            return _error("No matching approval configuration.", "not_found", status.HTTP_404_NOT_FOUND)
        return Response(VendorApprovalWorkflowConfigSerializer(config).data)


def _choices_payload():
    currency_names = dict(CURRENCY_CHOICES)
    return {
        "vendor_types": [{"value": k, "label": v} for k, v in Vendor.VENDOR_TYPE_CHOICES],
        "vendor_statuses": [{"value": k, "label": v} for k, v in Vendor.STATUS_CHOICES],
        "msme_categories": [{"value": k, "label": v} for k, v in VendorOnboardingProfile.MSME_CATEGORY_CHOICES],
        "document_categories": [{"value": k, "label": v} for k, v in VendorDocument.CATEGORY_CHOICES],
        "change_request_sections": [{"value": k, "label": v} for k, v in VendorChangeRequest.SECTION_CHOICES],
        "currencies": [{"value": k, "label": v} for k, v in CURRENCY_CHOICES],
        "onboarding_currencies": [
            {"value": code, "label": f"{code} - {currency_names[code]}" if currency_names.get(code) and currency_names[code] != code else code}
            for code in ONBOARDING_CURRENCIES
        ],
        "payment_terms": [{"value": k, "label": v} for k, v in PAYMENT_TERM_CHOICES],
        "billing_frequencies": [{"value": k, "label": v} for k, v in VendorProcurementDetail.BILLING_FREQUENCY_CHOICES],
        "kyc_statuses": [{"value": k, "label": v} for k, v in VendorKYC.KYC_STATUS_CHOICES],
        "risk_ratings": [{"value": k, "label": v} for k, v in VendorKYC.RISK_RATING_CHOICES],
        "bank_verification_statuses": [{"value": k, "label": v} for k, v in VendorBankDetail.VERIFICATION_STATUS_CHOICES],
        "document_statuses": [{"value": k, "label": v} for k, v in VendorDocument.STATUS_CHOICES],
        # Rule inputs the wizard mirrors (vendor_onboarding/progress.py is the authority).
        "individual_vendor_types": list(INDIVIDUAL_VENDOR_TYPES),
        "incorporated_vendor_types": list(INCORPORATED_VENDOR_TYPES),
        "max_kyc_documents": MAX_VENDOR_KYC_DOCUMENTS,
        "non_kyc_document_categories": list(NON_KYC_DOCUMENT_CATEGORIES),
        "expiry_tracked_document_categories": list(EXPIRY_TRACKED_CATEGORIES),
    }


class VendorOnboardingChoicesView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response(_choices_payload())


# ===========================================================================
# Public (token-authenticated, no login) endpoints
# ===========================================================================

class _VendorPublicThrottledView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [VendorPortalThrottle]
    throttle_scope = "vendor_portal"

    def get_throttles(self):
        return super().get_throttles() if throttles_available() else []


class VendorPublicChoicesView(_VendorPublicThrottledView):
    """Static reference data (vendor types, document categories, currencies) - not
    vendor-specific, so no token is required."""

    def get(self, request):
        payload = _choices_payload()
        for internal in ("vendor_statuses", "change_request_sections", "kyc_statuses", "risk_ratings", "bank_verification_statuses"):
            payload.pop(internal, None)
        return Response(payload)


class _VendorPublicView(_VendorPublicThrottledView):
    def get_vendor(self, request, token):
        try:
            return validate_public_token(
                token,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except InvalidTokenError as exc:
            if exc.reason == "expired":
                raise NotFound(
                    "This vendor onboarding link has expired. Please contact the organization that sent the invitation."
                )
            raise NotFound("Invalid or unavailable vendor onboarding link.")

    def get_editable_vendor(self, request, token):
        """(vendor, None) or (vendor, 403 response) when the request is locked for review."""
        vendor = self.get_vendor(request, token)
        if not is_editable_status(vendor):
            return vendor, _error("This request is not editable in its current state.", "not_editable", status.HTTP_403_FORBIDDEN)
        return vendor, None


class VendorPublicDetailView(_VendorPublicView):
    def get(self, request, token):
        vendor = self.get_vendor(request, token)
        return _public_detail(vendor.pk, request)


class VendorPublicSectionsView(_VendorPublicView):
    """PATCH {identity, profile, kyc, bank_detail, procurement_detail, last_saved_step} - one
    request per wizard save (the portal used to send ~8). Only vendor-facing fields are accepted;
    internal ones are ignored. Returns the refreshed public detail."""

    def patch(self, request, token):
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked
        _save_sections(vendor, request.data, actor_label="vendor", internal=False)
        return _public_detail(vendor.pk, request)


class _VendorPublicStepDetailView(_VendorPublicView):
    """Per-step PATCH endpoints kept for older clients - same rules as /sections/."""
    section = None
    response_serializer = None

    def patch(self, request, token):
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked
        _save_sections(vendor, {self.section: request.data}, actor_label="vendor", internal=False, flat_errors=True)
        vendor = _fresh_vendor(vendor.pk)
        return Response(self.response_serializer(getattr(vendor, SECTIONS[self.section][0])).data)


class VendorPublicProfileStepView(_VendorPublicStepDetailView):
    # Portal-safe: company code / plant / rating / headcount / spend are internal and ignored here.
    section = "profile"
    response_serializer = VendorPublicOnboardingProfileSerializer


class VendorPublicKYCStepView(_VendorPublicStepDetailView):
    section = "kyc"
    response_serializer = VendorKYCSerializer


class VendorPublicBankDetailStepView(_VendorPublicStepDetailView):
    section = "bank_detail"
    response_serializer = VendorBankDetailSerializer


class VendorPublicProcurementStepView(_VendorPublicStepDetailView):
    section = "procurement_detail"
    response_serializer = VendorPublicProcurementDetailSerializer


class VendorPublicIdentityView(_VendorPublicView):
    """PATCH the vendor-facing identity fields (name parts, phone, contact person). The vendor type,
    contact email, company code / plant, requester and internal comments are set by the inviting
    team and can't be changed through the link."""

    def patch(self, request, token):
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked
        _save_sections(vendor, {"identity": request.data}, actor_label="vendor", internal=False, flat_errors=True)
        return _public_detail(vendor.pk, request)


class VendorPublicDocumentListView(_VendorPublicView):
    def get(self, request, token):
        vendor = self.get_vendor(request, token)
        docs = vendor.documents.all()
        return Response(VendorPublicDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, token):
        request.FILES.get("file")  # consume the upload body before any early return
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked
        return _upload_vendor_document(request, vendor, actor_label="vendor", portal=True)


class VendorPublicDocumentDetailView(_VendorPublicView):
    def delete(self, request, token, doc_id):
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if document.status == "verified":
            return _error("A verified document can't be removed. Contact the team that invited you.", "document_locked",
                          status.HTTP_403_FORBIDDEN)
        log_vendor_audit(vendor, "document_deleted", actor_label="vendor", field_name=document.category,
                         old_value=document.get_category_display(), remarks=document.file_name)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorPublicDocumentDownloadView(_VendorPublicView):
    def get(self, request, token, doc_id):
        vendor = self.get_vendor(request, token)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        return _signed_download(document)


class VendorPublicSubmitView(_VendorPublicView):
    def post(self, request, token):
        vendor, blocked = self.get_editable_vendor(request, token)
        if blocked:
            return blocked

        blocked = _submission_blocked(vendor)
        if blocked:
            return blocked

        was_resubmission = vendor.change_requests.exists()
        try:
            submit_vendor_for_approval(vendor, actor=None)
        except ValueError:
            # The workflow configuration is internal - don't show it to the vendor.
            logger.warning("Vendor %s self-service submission has no approval workflow", vendor.id)
            return _error("Your information couldn't be submitted right now. Please contact the team that invited you.",
                          "no_approval_workflow")
        log_vendor_audit(vendor, "submitted", actor_label="vendor", remarks="Resubmitted" if was_resubmission else "")

        if was_resubmission:
            transaction.on_commit(lambda: send_vendor_resubmitted_notification.delay(vendor.id))
        else:
            transaction.on_commit(lambda: send_vendor_submitted_notification.delay(vendor.id))

        return _public_detail(vendor.pk, request)


# ===========================================================================
# Email template preview (developer tool - DEBUG only)
# ===========================================================================

def vendor_email_preview(request, template_key=None):
    """Renders a Vendor Onboarding email template with realistic sample data
    so it can be checked in a browser before shipping template changes.
    Never touches real vendor records, and is unavailable unless DEBUG is on
    so it can't leak into a production deployment."""
    if not settings.DEBUG:
        return HttpResponseNotFound()

    sample_base = {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "vendor_name": "Acme Manufacturing Pvt Ltd",
        "vendor_contact_name": "Rahul Sharma",
        "vendor_email": "rahul.sharma@acmemfg.example",
        "vendor_type": "Company",
        "vendor_reference": "VR-2026-000042",
    }
    sample_vendor_url = f"{settings.VENDOR_PORTAL_URL}/vendor-onboarding/sample-preview-token"
    sample_admin_url = f"{settings.VENDOR_PORTAL_URL}/vendors/1"
    sample_level = {"name": "Finance Approval"}

    previews = {
        "invited": ("vendor_invited.html", {
            **sample_base, "secure_vendor_url": sample_vendor_url,
        }),
        "submitted": ("vendor_submitted_for_approval.html", {
            **sample_base, **_badge("submitted"), "level": sample_level,
            "extra_label": "Submitted On", "extra_value": "20 Aug 2026, 03:45 PM",
            "admin_review_url": sample_admin_url,
        }),
        "request_changes": ("vendor_request_changes.html", {
            **sample_base, **_badge("action_required"),
            "change_requests": [
                {
                    "section_display": "KYV / Compliance",
                    "required_changes": "Please upload the latest GST certificate.",
                    "comments": "The uploaded copy has expired.",
                },
                {
                    "section_display": "Vendor Details",
                    "required_changes": "Please correct the registered office address.",
                    "comments": "",
                },
            ],
            "secure_vendor_url": sample_vendor_url,
        }),
        "resubmitted": ("vendor_resubmitted.html", {
            **sample_base, **_badge("resubmitted"), "level": sample_level,
            "extra_label": "Resubmitted On", "extra_value": "21 Aug 2026, 10:15 AM",
            "admin_review_url": sample_admin_url,
        }),
        "approval_in_progress": ("vendor_approval_in_progress.html", {
            **sample_base, **_badge("approval_in_progress"),
        }),
        "approved": ("vendor_fully_approved.html", {
            **sample_base, **_badge("approved"),
            "extra_label": "Approved On", "extra_value": "22 Aug 2026, 05:30 PM",
        }),
    }

    if not template_key:
        links = "".join(f'<li><a href="{key}/">{key}</a></li>' for key in previews)
        return HttpResponse(f"<h1>Vendor Onboarding Email Previews</h1><ul>{links}</ul>")

    entry = previews.get(template_key)
    if not entry:
        return HttpResponseNotFound(
            f"Unknown preview key '{template_key}'. Valid keys: {', '.join(previews)}"
        )

    template, context = entry
    return HttpResponse(render_to_string(f"emails/vendor_onboarding/{template}", context))


class VendorReviewView(APIView):
    """Internal reviewer update: KYC status, risk rating, compliance remarks, bank verification.
    Allowed at any stage before approval - review happens while the vendor is under approval."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.verify"

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if vendor.status == "approved":
            return _error("This vendor is already approved.", "already_approved")
        serializer = VendorReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # "Verified" is a reviewer's statement about complete data - it can't be recorded on gaps.
        if data.get("kyc_status") == "verified" or data.get("bank_verification_status") == "verified":
            gaps = [i for i in vendor_requirement_issues(vendor) if i["stage"] == "submission"]
            if data.get("kyc_status") == "verified" and any(i["step"] == "kyc" for i in gaps):
                return _error("Complete the vendor's identity & KYC details before marking KYC verified.", "kyc_incomplete",
                              issues=[i for i in gaps if i["step"] == "kyc"])
            if data.get("bank_verification_status") == "verified" and any(i["step"] == "banking" for i in gaps):
                return _error("Complete the bank details before marking the bank account verified.", "bank_incomplete",
                              issues=[i for i in gaps if i["step"] == "banking"])

        kyc_fields = {k: data[k] for k in ("kyc_status", "risk_rating", "compliance_remarks") if k in data}
        if kyc_fields:
            kyc, _ = VendorKYC.objects.get_or_create(vendor=vendor)
            for field, old, new in changed_fields(kyc, kyc_fields):
                log_vendor_audit(vendor, "kyc_updated", request.user, field_name=field, old_value=old, new_value=new)
            for field, value in kyc_fields.items():
                setattr(kyc, field, value)
            kyc.save()

        bank_fields = {
            model_field: data[key]
            for key, model_field in (("bank_verification_status", "verification_status"),
                                     ("bank_verification_remarks", "verification_remarks"))
            if key in data
        }
        if bank_fields:
            bank, _ = VendorBankDetail.objects.get_or_create(vendor=vendor)
            for field, old, new in changed_fields(bank, bank_fields):
                action = "banking_verified" if field == "verification_status" and new == "verified" else "banking_updated"
                log_vendor_audit(vendor, action, request.user, field_name=field, old_value=old, new_value=new,
                                 remarks=bank_fields.get("verification_remarks", ""))
            for field, value in bank_fields.items():
                setattr(bank, field, value)
            bank.save()

        return _admin_detail(vendor.pk, request)


class VendorDocumentVerifyView(APIView):
    """Marks a document Under Review / Verified / Rejected (rejection needs a reason) and records
    the reviewer and time. Uploading never verifies - this is the only way a document becomes Verified."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.verify"

    def post(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if vendor.status == "approved":
            return _error("This vendor is already approved.", "already_approved")
        serializer = VendorDocumentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        if new_status == "verified" and effective_document_status(document.status, document.expiry_date) == "expired":
            return _error("This document has expired - ask the vendor for a current one instead of verifying it.",
                          "document_expired")
        old_status = document.status
        document.status = new_status
        document.remarks = serializer.validated_data["remarks"].strip()
        document.verified_by = request.user
        document.verified_at = timezone.now()
        document.save(update_fields=["status", "remarks", "verified_by", "verified_at"])

        action = {"verified": "document_verified", "rejected": "document_rejected"}.get(new_status, "document_under_review")
        log_vendor_audit(vendor, action, request.user, field_name=document.category,
                         old_value=old_status, new_value=new_status, remarks=document.remarks or document.file_name)
        return Response(VendorDocumentSerializer(document, context={"request": request}).data)


class VendorAuditLogListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.view"

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        logs = vendor.audit_logs.select_related("performed_by")[:200]
        return Response(VendorAuditLogSerializer(logs, many=True).data)
