import logging
import os
import re
import time
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import cloudinary.utils
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core import countries
from core.app_constants import CURRENCY_CHOICES
from core.document_security import check_document_upload, effective_document_status, parse_expiry_date
from roles.permission import HasPermissionCode

from . import kyc
from .models import (
    Freelancer, FreelancerDocument, FreelancerRateCard, FreelancerContract,
    FreelancerProjectAssignment, FreelancerTaskAssignment, FreelancerTimeEntry,
    FreelancerBankDetail, FreelancerEquipment, FreelancerAuditLog,
)
from .serializers import (
    FreelancerInviteSerializer, FreelancerListSerializer, FreelancerDetailSerializer,
    FreelancerAdminWriteSerializer, FreelancerPortalWriteSerializer, FreelancerPublicSerializer,
    FreelancerDocumentSerializer, FreelancerPublicDocumentSerializer, DocumentVerifySerializer,
    RequestChangesSerializer, ApproveSerializer, BankVerificationSerializer, BANK_FIELD_LABELS,
    FreelancerRateCardSerializer, FreelancerContractSerializer, FreelancerProjectAssignmentSerializer,
    FreelancerTaskAssignmentSerializer, FreelancerTimeEntrySerializer,
    FreelancerBankDetailSerializer, FreelancerBankDetailUnmaskedSerializer,
    FreelancerBankDetailPublicSerializer, FreelancerPANUnmaskedSerializer,
    FreelancerEquipmentSerializer, FreelancerAuditLogSerializer, portal_status_for,
)
from .services import (
    PORTAL_ACTOR, InvalidTokenError, approve_onboarding, apply_status_side_effects, check_freelancer_capacity,
    ensure_onboarding_status, generate_access_token, invite_freelancer, log_audit, mark_under_review,
    reject_time_entry, approve_time_entry, request_onboarding_changes, revoke_access_tokens, submit_onboarding,
    submit_time_entry, validate_public_token,
)
from .tasks import (
    send_freelancer_approved_notification, send_freelancer_changes_requested_notification,
    send_freelancer_invited_notification,
)

logger = logging.getLogger(__name__)

DOCUMENT_MIME_TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
MAX_DOCUMENTS_PER_FREELANCER = 30
PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024
# A secure link can be (re)sent while the onboarding is still with the freelancer.
LINK_STATUSES = ("draft", "invited", "onboarding", "changes_requested")


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _choices(pairs):
    return [{"value": k, "label": v} for k, v in pairs]


def _choices_payload():
    return {
        "availabilities": _choices(Freelancer.AVAILABILITY_CHOICES),
        "currencies": _choices(CURRENCY_CHOICES),
        "statuses": _choices(Freelancer.STATUS_CHOICES),
        "kyc_statuses": _choices(Freelancer.KYC_STATUS_CHOICES),
        "genders": _choices(Freelancer.GENDER_CHOICES),
        "id_document_types": _choices(Freelancer.ID_DOCUMENT_TYPE_CHOICES),
        "document_categories": _choices(FreelancerDocument.CATEGORY_CHOICES),
        "document_statuses": _choices(FreelancerDocument.STATUS_CHOICES),
        "onboarding_steps": _choices(kyc.STEP_LABELS.items()),
        "pricing_models": _choices(FreelancerRateCard.PRICING_MODEL_CHOICES),
        "contract_types": _choices(FreelancerContract.CONTRACT_TYPE_CHOICES),
        "contract_statuses": _choices(FreelancerContract.STATUS_CHOICES),
        "assignment_statuses": _choices(FreelancerProjectAssignment.STATUS_CHOICES),
        "task_assignment_statuses": _choices(FreelancerTaskAssignment.STATUS_CHOICES),
        "time_entry_statuses": _choices(FreelancerTimeEntry.STATUS_CHOICES),
        "bank_payment_methods": _choices(FreelancerBankDetail.PAYMENT_METHOD_CHOICES),
        "bank_payment_statuses": _choices(FreelancerBankDetail.PAYMENT_STATUS_CHOICES),
        "pan_verification_statuses": _choices(FreelancerBankDetail.PAN_VERIFICATION_STATUS_CHOICES),
        "equipment_ownerships": _choices(FreelancerEquipment.OWNERSHIP_CHOICES),
        "equipment_conditions": _choices(FreelancerEquipment.CONDITION_CHOICES),
    }


def _public_choices_payload():
    """Only what the portal renders - no internal statuses or commercial lists."""
    return {
        "availabilities": _choices(Freelancer.AVAILABILITY_CHOICES),
        "genders": _choices(Freelancer.GENDER_CHOICES),
        "id_document_types": _choices(Freelancer.ID_DOCUMENT_TYPE_CHOICES),
        "bank_payment_methods": _choices(FreelancerBankDetail.PAYMENT_METHOD_CHOICES),
        "document_categories": _choices(FreelancerDocument.CATEGORY_CHOICES),
        "onboarding_steps": _choices(kyc.STEP_LABELS.items()),
    }


def _log_freelancer_audit(freelancer, action, request, field_name="", old_value="", new_value=""):
    """Section 22 audit trail (see services.log_audit). Never pass a raw sensitive value."""
    log_audit(freelancer, action, user=getattr(request, "user", None),
              field_name=field_name, old_value=old_value, new_value=new_value)


def _error(message, status_code=400, *, field=None, code=None, **extra):
    """Error body in the shape the shared exception handler produces ({error, errors})."""
    body = {"error": message, "detail": message}
    if field:
        body["errors"] = {field: [message]}
    if code:
        body["code"] = code
    body.update(extra)
    return Response(body, status=status_code)


def _missing_response(message, issues):
    """400 listing what is still missing - `missing` for the checklist, `errors` for inline fields."""
    errors = {i["key"]: [i["message"]] for i in issues if not i["key"].startswith("document:")}
    return Response({"error": message, "missing": issues, "errors": errors}, status=400)


def _detail(pk, request):
    freelancer = Freelancer.objects.select_related("bank_detail", "reviewed_by").get(pk=pk)
    return FreelancerDetailSerializer(freelancer, context={"request": request}).data


def _public_detail(pk, request):
    freelancer = Freelancer.objects.select_related("bank_detail").get(pk=pk)
    return FreelancerPublicSerializer(freelancer, context={"request": request}).data


def _bank_or_none(freelancer):
    try:
        return freelancer.bank_detail
    except FreelancerBankDetail.DoesNotExist:
        return None


def _signed_download(document):
    signed_url, _ = cloudinary.utils.cloudinary_url(
        document.file.public_id,
        resource_type="raw",
        sign_url=True,
        expires_at=int(time.time()) + 300,
    )
    return Response({"file_name": document.file_name, "download_url": signed_url})


def save_document_upload(request, freelancer, *, portal):
    """The document upload contract shared by the admin and the portal endpoint.

    multipart: file, category, optional replaces (id of a document of this freelancer, same
    category - stored first, then the old one is deleted in the same request), optional
    expiry_date (YYYY-MM-DD, not in the past) and document_number. The file must pass
    core.document_security.check_document_upload (size, extension, MIME, magic bytes).
    Returns (document, None) or (None, error Response).
    """
    file = request.FILES.get("file")
    problem = check_document_upload(file)
    if problem:
        code, message = problem
        return None, _error(message, field="file", code=code)

    category = (request.data.get("category") or "").strip()
    if category not in dict(FreelancerDocument.CATEGORY_CHOICES):
        return None, _error("Choose a valid document type.", field="category")

    try:
        expiry_date = parse_expiry_date(request.data.get("expiry_date"))
    except ValueError:
        return None, _error("Enter the expiry date as YYYY-MM-DD.", field="expiry_date")
    if expiry_date and expiry_date < timezone.localdate():
        return None, _error("The expiry date is in the past - upload a document that is still valid.", field="expiry_date")

    document_number = re.sub(r"\s+", " ", str(request.data.get("document_number") or "")).strip()
    if len(document_number) > 100:
        return None, _error("The document number is too long.", field="document_number")
    if category == "government_id" and re.fullmatch(r"\d{12}", document_number.replace(" ", "")):
        return None, _error("Don't enter a full Aadhaar number - only the last 4 digits may be stored.", field="document_number")

    replaced = None
    raw_replaces = request.data.get("replaces")
    if raw_replaces not in (None, "", "null", "undefined"):
        try:
            replaced = freelancer.documents.get(pk=int(raw_replaces))
        except (TypeError, ValueError, FreelancerDocument.DoesNotExist):
            return None, _error("The document you are replacing was not found.", field="replaces")
        if replaced.category != category:
            return None, _error("A document can only be replaced by one of the same type.", field="replaces")
        if portal and replaced.status == "verified":
            return None, _error(
                "This document has already been verified and can't be replaced. Contact us if it needs to change.",
                status_code=403,
            )

    others = freelancer.documents.all()
    if replaced is not None:
        others = others.exclude(pk=replaced.pk)
    if others.count() >= MAX_DOCUMENTS_PER_FREELANCER:
        return None, _error(f"At most {MAX_DOCUMENTS_PER_FREELANCER} documents can be stored - remove one first.")
    file_name = os.path.basename(file.name or "document")[:255]
    if others.filter(category=category, file_name=file_name, file_size=file.size).exists():
        return None, _error("This file has already been uploaded for this document type.", field="file", code="duplicate_file")

    user = request.user if not portal and getattr(request.user, "is_authenticated", False) else None
    try:
        with transaction.atomic():
            document = FreelancerDocument.objects.create(
                freelancer=freelancer,
                file=file,
                file_name=file_name,
                file_size=file.size,
                file_type=DOCUMENT_MIME_TYPES.get(os.path.splitext(file_name)[1].lower(), "application/octet-stream"),
                category=category,
                expiry_date=expiry_date,
                document_number=document_number,
                uploaded_by=user,
            )
            if replaced is not None:
                replaced.delete()
    except Exception as exc:  # noqa: BLE001 - storage outage: never a 500 with internals
        logger.warning("Freelancer document upload failed (%s)", exc.__class__.__name__)
        return None, _error("The file could not be stored right now. Please try again.", status_code=502)

    log_audit(
        freelancer, "document_replaced" if replaced is not None else "document_uploaded",
        user=user, actor_label=PORTAL_ACTOR if portal else "",
        field_name=category, new_value=document.get_category_display(),
    )
    return document, None


def save_profile_photo(request, freelancer):
    """JPG / PNG up to 5 MB (content-checked) - JSON can't carry a file, so this is its own endpoint."""
    file = request.FILES.get("photo") or request.FILES.get("file")
    problem = check_document_upload(file, max_size=PROFILE_PHOTO_MAX_SIZE)
    if problem:
        code, message = problem
        return _error(message, field="photo", code=code)
    if os.path.splitext(file.name or "")[1].lower() not in (".jpg", ".jpeg", ".png"):
        return _error("Upload a JPG or PNG photo.", field="photo", code="unsupported_file_type")
    try:
        freelancer.profile_photo = file
        freelancer.save(update_fields=["profile_photo", "updated_at"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Freelancer profile photo upload failed (%s)", exc.__class__.__name__)
        return _error("The photo could not be stored right now. Please try again.", status_code=502)
    return None


def _audit_bank_change(freelancer, serializer, bank, *, user=None, actor_label=""):
    changed = [f for f in serializer.changed_fields if f in BANK_FIELD_LABELS]
    if changed:
        new_value = ""
        if "account_number" in changed and bank.account_number:
            new_value = f"Account {bank.mask_account_number()}"
        log_audit(freelancer, "bank_detail_updated", user=user, actor_label=actor_label,
                  field_name=", ".join(BANK_FIELD_LABELS[f] for f in changed), new_value=new_value)
    previous_payment, previous_pan = serializer.previous_statuses
    if serializer.verification_reset:
        log_audit(freelancer, "bank_detail_updated", user=user, actor_label=actor_label, field_name="payment_status",
                  old_value=previous_payment, new_value="pending",
                  remarks="Payout details changed - verification has to be repeated.")
    if serializer.pan_reset:
        log_audit(freelancer, "pan_verification_changed", user=user, actor_label=actor_label,
                  field_name="pan_verification_status", old_value=previous_pan, new_value="pending",
                  remarks="Tax ID changed - verification has to be repeated.")


# ===========================================================================
# Admin (JWT-authenticated) endpoints
# ===========================================================================

class FreelancerListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "freelancer_onboarding.view", "POST": "freelancer_onboarding.create"}

    def get(self, request):
        qs = (
            Freelancer.objects.select_related("bank_detail")
            .prefetch_related("documents")
            .annotate(_assigned_projects_count=Count("project_assignments", distinct=True))
            .order_by("-created_at")
        )

        status_filter = request.GET.get("status")
        kyc_filter = request.GET.get("kyc_status")
        search = request.GET.get("search")
        archived = request.GET.get("archived")
        location = request.GET.get("location")
        availability = request.GET.get("availability")

        # Archived freelancers are hidden from the default list/tabs - pass
        # archived=true to see only archived ones, or archived=all for both.
        if archived == "true":
            qs = qs.filter(is_archived=True)
        elif archived != "all":
            qs = qs.filter(is_archived=False)

        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if kyc_filter:
            qs = qs.filter(kyc_status__in=[s.strip() for s in kyc_filter.split(",") if s.strip()])
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search) | Q(email__icontains=search) | Q(freelancer_code__icontains=search)
            )
        if location:
            qs = qs.filter(location__icontains=location)
        if availability:
            qs = qs.filter(availability=availability)

        return Response(FreelancerListSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        """'Onboard Freelancer' - an internal user starts the record (status draft), then
        completes it in the wizard and submits it, or sends the freelancer the secure link."""
        serializer = FreelancerAdminWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        freelancer = serializer.save()
        log_audit(freelancer, "status_changed", user=request.user, field_name="status", new_value="draft")
        return Response(_detail(freelancer.pk, request), status=status.HTTP_201_CREATED)


class FreelancerInviteView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.create"

    def post(self, request):
        serializer = FreelancerInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        freelancer, raw_token = invite_freelancer(
            data["full_name"],
            data["email"],
            created_by=request.user,
            first_name=data.get("first_name", ""),
            middle_name=data.get("middle_name", ""),
            last_name=data.get("last_name", ""),
        )

        transaction.on_commit(
            lambda: send_freelancer_invited_notification.delay(freelancer.id, raw_token)
        )

        return Response(_detail(freelancer.pk, request), status=status.HTTP_201_CREATED)


class FreelancerDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "freelancer_onboarding.view", "PATCH": "freelancer_onboarding.edit"}

    def get(self, request, pk):
        get_object_or_404(Freelancer, pk=pk)
        return Response(_detail(pk, request))

    def patch(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        previous_status = freelancer.status
        serializer = FreelancerAdminWriteSerializer(
            freelancer, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            apply_status_side_effects(freelancer, previous_status, request.user)
        return Response(_detail(pk, request))


class FreelancerResendInviteView(APIView):
    """(Re)sends the secure link - also the first send for an admin-created draft. Allowed
    while the onboarding is with the freelancer; any earlier link stops working."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.create"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if freelancer.status not in LINK_STATUSES:
            return _error("An onboarding link can only be sent while the onboarding is in progress or changes are requested.")
        if not freelancer.email:
            return _error("Add the freelancer's email address first.", field="email")

        with transaction.atomic():
            raw_token = generate_access_token(freelancer, created_by=request.user)
            if freelancer.status == "draft":
                freelancer.status = "invited"
                freelancer.save(update_fields=["status", "updated_at"])
                log_audit(freelancer, "status_changed", user=request.user, field_name="status",
                          old_value="draft", new_value="invited")
            log_audit(freelancer, "invite_resent", user=request.user, field_name="invite", new_value="Invitation sent")
            transaction.on_commit(
                lambda: send_freelancer_invited_notification.delay(freelancer.id, raw_token)
            )
        return Response({"detail": f"Invitation sent to {freelancer.email}.", "freelancer": _detail(pk, request)})


class FreelancerRevokeLinkView(APIView):
    """Switches the freelancer's secure link off (e.g. sent to the wrong address)."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.create"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if not revoke_access_tokens(freelancer, "manual"):
            return _error("There is no active onboarding link to revoke.")
        log_audit(freelancer, "token_revoked", user=request.user, field_name="access_link",
                  new_value="Revoked by an administrator")
        return Response(_detail(pk, request))


class FreelancerSubmitView(APIView):
    """Admin 'Submit for review' for an onboarding filled in on the freelancer's behalf -
    the same requirement checks as the portal submit."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.edit"

    def post(self, request, pk):
        with transaction.atomic():
            freelancer = get_object_or_404(Freelancer.objects.select_for_update(), pk=pk)
            if freelancer.status not in Freelancer.SUBMITTABLE_STATUSES:
                return _error("Only an onboarding that is still in progress can be submitted.")
            issues = kyc.submission_issues(freelancer)
            if issues:
                return _missing_response("Complete the missing items before submitting.", issues)
            submit_onboarding(freelancer, user=request.user)
        return Response(_detail(pk, request))


class FreelancerApproveView(APIView):
    """Final approval: requires a submitted onboarding, every required document VERIFIED,
    the bank account verified (bank transfer) and the PAN verified (India)."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.freelancer.approve"

    def post(self, request, pk):
        serializer = ApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            freelancer = get_object_or_404(Freelancer.objects.select_for_update(), pk=pk)
            if freelancer.status != "completed":
                return _error("Only a submitted onboarding (pending review) can be approved.")
            issues = kyc.approval_issues(freelancer)
            if issues:
                return _missing_response("The onboarding can't be approved yet.", issues)
            approve_onboarding(freelancer, request.user, serializer.validated_data.get("remarks", ""))
            transaction.on_commit(lambda: send_freelancer_approved_notification.delay(freelancer.id))
        return Response(_detail(pk, request))


class FreelancerRequestChangesView(APIView):
    """Sends a submitted onboarding back to the freelancer with remarks and the steps to
    revisit; the secure link is reused (extended when expiring) or reissued and emailed."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.freelancer.request_changes"

    def post(self, request, pk):
        serializer = RequestChangesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            freelancer = get_object_or_404(Freelancer.objects.select_for_update(), pk=pk)
            if freelancer.status not in ("completed", "changes_requested"):
                return _error("Changes can only be requested on a submitted onboarding.")
            if not freelancer.email:
                return _error("Add the freelancer's email address first.", field="email")
            raw_token = request_onboarding_changes(freelancer, request.user, data["remarks"], data.get("sections", []))
            transaction.on_commit(
                lambda: send_freelancer_changes_requested_notification.delay(freelancer.id, raw_token)
            )
        return Response(_detail(pk, request))


class FreelancerIdentityUnmaskedView(APIView):
    """Reveals the full government ID number - its own permission, like the PAN reveal."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.identity.view_unmasked"

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if not freelancer.id_document_number:
            return Response({"detail": "No ID number on file."}, status=404)
        return Response({
            "id_document_type": freelancer.id_document_type,
            "id_document_number": freelancer.id_document_number,
        })


class FreelancerProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"POST": "freelancer_onboarding.edit", "DELETE": "freelancer_onboarding.edit"}

    def post(self, request, pk):
        request.FILES.get("photo")  # consume the upload body before any early return
        freelancer = get_object_or_404(Freelancer, pk=pk)
        error = save_profile_photo(request, freelancer)
        return error or Response(_detail(pk, request))

    def delete(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        freelancer.profile_photo = None
        freelancer.save(update_fields=["profile_photo", "updated_at"])
        return Response(_detail(pk, request))


class FreelancerArchiveView(APIView):
    """Hides a freelancer from the default Freelancers list/tabs - does not
    delete anything or touch status/workflow state."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.archive"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        freelancer.is_archived = True
        freelancer.save(update_fields=["is_archived"])
        return Response(_detail(pk, request))


class FreelancerUnarchiveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.archive"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if Freelancer.objects.filter(email__iexact=freelancer.email, is_archived=False).exclude(pk=pk).exists():
            return _error("Another active freelancer already uses this email address.", field="email")
        freelancer.is_archived = False
        freelancer.save(update_fields=["is_archived"])
        return Response(_detail(pk, request))


class FreelancerChoicesView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response(_choices_payload())


class FreelancerDocumentListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "freelancer_onboarding.document.view", "POST": "freelancer_onboarding.document.upload"}

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        docs = freelancer.documents.select_related("verified_by")
        return Response(FreelancerDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        request.FILES.get("file")  # consume the upload body before any early return
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document, error = save_document_upload(request, freelancer, portal=False)
        if error:
            return error
        return Response(FreelancerDocumentSerializer(document, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)


class FreelancerDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.delete"

    def delete(self, request, pk, doc_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        log_audit(freelancer, "document_deleted", user=request.user, field_name=document.category,
                  old_value=document.get_category_display())
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.view"

    def get(self, request, pk, doc_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        return _signed_download(document)


class FreelancerDocumentVerifyView(APIView):
    """Marks a document Under Review / Verified / Rejected (a reason is required to reject).
    Uploading never verifies - this is the only way a document becomes Verified."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.verify"

    def post(self, request, pk, doc_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        serializer = DocumentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        remarks = serializer.validated_data["remarks"]
        if new_status == "verified" and effective_document_status(document.status, document.expiry_date) == "expired":
            return _error("This document has expired and can't be verified - ask for a current one.")

        old_status = document.status
        document.status = new_status
        document.remarks = remarks
        document.verified_by = request.user
        document.verified_at = timezone.now()
        document.save(update_fields=["status", "remarks", "verified_by", "verified_at"])

        action = {
            "verified": "document_verified", "rejected": "document_rejected",
        }.get(new_status, "document_under_review")
        log_audit(freelancer, action, user=request.user, field_name=document.category,
                  old_value=old_status, new_value=new_status, remarks=remarks)
        mark_under_review(freelancer, request.user)
        return Response(FreelancerDocumentSerializer(document, context={"request": request}).data)


class FreelancerRateCardListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.rate_card.view",
        "POST": "freelancer_onboarding.rate_card.create",
    }

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        cards = freelancer.rate_cards.all()
        return Response(FreelancerRateCardSerializer(cards, many=True).data)

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        data = request.data.copy()
        data["freelancer"] = freelancer.id
        serializer = FreelancerRateCardSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        rate_card = serializer.save(created_by=request.user)
        _log_freelancer_audit(
            freelancer, "rate_changed", request, field_name="rate_card",
            new_value=f"{rate_card.get_pricing_model_display()} {rate_card.currency} {rate_card.cost_rate}/{rate_card.billing_rate}",
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FreelancerRateCardDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "PATCH": "freelancer_onboarding.rate_card.edit",
        "DELETE": "freelancer_onboarding.rate_card.delete",
    }

    def patch(self, request, pk, rate_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        card = get_object_or_404(FreelancerRateCard, pk=rate_id, freelancer=freelancer)
        old_summary = f"{card.currency} {card.cost_rate}/{card.billing_rate}"
        serializer = FreelancerRateCardSerializer(card, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log_freelancer_audit(
            freelancer, "rate_changed", request, field_name="rate_card",
            old_value=old_summary, new_value=f"{card.currency} {card.cost_rate}/{card.billing_rate}",
        )
        return Response(serializer.data)

    def delete(self, request, pk, rate_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        card = get_object_or_404(FreelancerRateCard, pk=rate_id, freelancer=freelancer)
        card.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerContractListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.contract.view",
        "POST": "freelancer_onboarding.contract.create",
    }

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        contracts = freelancer.contracts.all()
        return Response(FreelancerContractSerializer(contracts, many=True).data)

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        data = request.data.copy()
        data["freelancer"] = freelancer.id
        serializer = FreelancerContractSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FreelancerContractDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "PATCH": "freelancer_onboarding.contract.edit",
        "DELETE": "freelancer_onboarding.contract.delete",
    }

    def patch(self, request, pk, contract_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        contract = get_object_or_404(FreelancerContract, pk=contract_id, freelancer=freelancer)
        serializer = FreelancerContractSerializer(contract, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk, contract_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        contract = get_object_or_404(FreelancerContract, pk=contract_id, freelancer=freelancer)
        contract.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerCapacityCheckView(APIView):
    """Pre-flight, read-only check the frontend calls before submitting a new
    assignment, so the over-allocation warning (Rule 10) can be shown before
    the admin commits to it. The assignment POST itself also runs this and
    returns the result, since a slow admin could still create an assignment
    that pushes an *already-submitted* one over capacity in the meantime."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.assignment.view"

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)

        start_date = parse_date(request.GET.get("start_date") or "")
        end_date = parse_date(request.GET.get("end_date") or "") if request.GET.get("end_date") else None
        raw_hours = request.GET.get("allocated_hours")

        if not start_date or not raw_hours:
            return Response({"detail": "start_date and allocated_hours are required."}, status=400)
        try:
            allocated_hours = Decimal(raw_hours)
        except InvalidOperation:
            return Response({"detail": "allocated_hours must be a number."}, status=400)

        exclude_id = request.GET.get("exclude_assignment_id")
        result = check_freelancer_capacity(
            freelancer, start_date, end_date, allocated_hours,
            exclude_assignment_id=int(exclude_id) if exclude_id else None,
        )
        return Response(result)


class FreelancerProjectAssignmentListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.assignment.view",
        "POST": "freelancer_onboarding.assignment.create",
    }

    def get(self, request):
        qs = FreelancerProjectAssignment.objects.select_related("freelancer", "project").all()

        freelancer_id = request.GET.get("freelancer")
        project_id = request.GET.get("project")
        status_filter = request.GET.get("status")

        if freelancer_id:
            qs = qs.filter(freelancer_id=freelancer_id)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        return Response(FreelancerProjectAssignmentSerializer(qs, many=True).data)

    def post(self, request):
        serializer = FreelancerProjectAssignmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save()
        _log_freelancer_audit(
            assignment.freelancer, "project_assigned", request,
            field_name="project", new_value=assignment.project.project_name,
        )

        warning = check_freelancer_capacity(
            assignment.freelancer, assignment.start_date, assignment.end_date,
            assignment.allocated_hours, exclude_assignment_id=assignment.id,
        )
        payload = FreelancerProjectAssignmentSerializer(assignment).data
        payload["capacity_warning"] = warning if warning["is_over_allocated"] else None
        return Response(payload, status=status.HTTP_201_CREATED)


class FreelancerProjectAssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "PATCH": "freelancer_onboarding.assignment.edit",
        "DELETE": "freelancer_onboarding.assignment.delete",
    }

    def patch(self, request, pk):
        assignment = get_object_or_404(FreelancerProjectAssignment, pk=pk)
        serializer = FreelancerProjectAssignmentSerializer(
            assignment, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        assignment = get_object_or_404(FreelancerProjectAssignment, pk=pk)
        freelancer, project_name = assignment.freelancer, assignment.project.project_name
        assignment.delete()
        _log_freelancer_audit(
            freelancer, "project_removed", request, field_name="project", old_value=project_name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerTaskAssignmentListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.task_assignment.view",
        "POST": "freelancer_onboarding.task_assignment.create",
    }

    def get(self, request):
        qs = FreelancerTaskAssignment.objects.select_related("freelancer", "task", "task__project").all()

        freelancer_id = request.GET.get("freelancer")
        task_id = request.GET.get("task")
        project_id = request.GET.get("project")
        status_filter = request.GET.get("status")

        if freelancer_id:
            qs = qs.filter(freelancer_id=freelancer_id)
        if task_id:
            qs = qs.filter(task_id=task_id)
        if project_id:
            qs = qs.filter(task__project_id=project_id)
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        return Response(FreelancerTaskAssignmentSerializer(qs, many=True).data)

    def post(self, request):
        serializer = FreelancerTaskAssignmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FreelancerTaskAssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "PATCH": "freelancer_onboarding.task_assignment.edit",
        "DELETE": "freelancer_onboarding.task_assignment.delete",
    }

    def patch(self, request, pk):
        assignment = get_object_or_404(FreelancerTaskAssignment, pk=pk)
        serializer = FreelancerTaskAssignmentSerializer(
            assignment, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        assignment = get_object_or_404(FreelancerTaskAssignment, pk=pk)
        assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerTimeEntryListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.time_entry.view",
        "POST": "freelancer_onboarding.time_entry.create",
    }

    def get(self, request):
        qs = FreelancerTimeEntry.objects.select_related(
            "task_assignment", "task_assignment__freelancer", "task_assignment__task",
        ).all()

        freelancer_id = request.GET.get("freelancer")
        task_assignment_id = request.GET.get("task_assignment")
        status_filter = request.GET.get("status")
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")

        if freelancer_id:
            qs = qs.filter(task_assignment__freelancer_id=freelancer_id)
        if task_assignment_id:
            qs = qs.filter(task_assignment_id=task_assignment_id)
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return Response(FreelancerTimeEntrySerializer(qs, many=True).data)

    def post(self, request):
        serializer = FreelancerTimeEntrySerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FreelancerTimeEntryDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "PATCH": "freelancer_onboarding.time_entry.edit",
        "DELETE": "freelancer_onboarding.time_entry.delete",
    }

    def patch(self, request, pk):
        entry = get_object_or_404(FreelancerTimeEntry, pk=pk)
        serializer = FreelancerTimeEntrySerializer(
            entry, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        entry = get_object_or_404(FreelancerTimeEntry, pk=pk)
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerTimeEntrySubmitView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.time_entry.create"

    def post(self, request, pk):
        entry = get_object_or_404(FreelancerTimeEntry, pk=pk)
        submit_time_entry(entry)
        return Response(FreelancerTimeEntrySerializer(entry).data)


class FreelancerTimeEntryApproveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.time_entry.approve"

    def post(self, request, pk):
        entry = get_object_or_404(FreelancerTimeEntry, pk=pk)
        approve_time_entry(entry, reviewer=request.user)
        return Response(FreelancerTimeEntrySerializer(entry).data)


class FreelancerTimeEntryRejectView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.time_entry.approve"

    def post(self, request, pk):
        entry = get_object_or_404(FreelancerTimeEntry, pk=pk)
        reject_time_entry(entry, reviewer=request.user, reason=request.data.get("reason", ""))
        return Response(FreelancerTimeEntrySerializer(entry).data)


class FreelancerBankDetailView(APIView):
    """A single admin-editable payout / tax record per freelancer (create-or-update via
    PATCH, same as VendorBankDetailStepView) - always returns the masked account number
    and tax ID, never the raw ones. Verification statuses are set by the verify endpoint."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.bank_detail.view",
        "PATCH": "freelancer_onboarding.bank_detail.edit",
    }

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        bank = _bank_or_none(freelancer)
        if not bank:
            return Response(None)
        return Response(FreelancerBankDetailSerializer(bank, context={"freelancer": freelancer}).data)

    def patch(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        instance = _bank_or_none(freelancer)
        serializer = FreelancerBankDetailSerializer(
            instance, data=request.data, partial=True, context={"freelancer": freelancer, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            bank = serializer.save(freelancer=freelancer)
            _audit_bank_change(freelancer, serializer, bank, user=request.user)
        return Response(FreelancerBankDetailSerializer(bank, context={"freelancer": freelancer}).data)


class FreelancerBankVerifyView(APIView):
    """Reviewer decision on the payout details (target 'bank') or the PAN / tax ID
    (target 'pan'). Details are only ever 'verified' through this endpoint."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.verify"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        bank = _bank_or_none(freelancer)
        if bank is None:
            return _error("No payout or tax details are on file yet.", status_code=404)
        serializer = BankVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = serializer.validated_data["target"]
        new_status = serializer.validated_data["status"]
        remarks = serializer.validated_data["remarks"]

        if target == "bank":
            if new_status == "verified":
                problem = _payout_incomplete(freelancer, bank)
                if problem:
                    return _error(problem)
            old_status = bank.payment_status
            bank.payment_status = new_status
            bank.verification_remarks = remarks
            bank.verified_by = request.user
            bank.verified_at = timezone.now()
            bank.save(update_fields=["payment_status", "verification_remarks", "verified_by", "verified_at", "updated_at"])
            log_audit(freelancer, "bank_detail_updated", user=request.user, field_name="payment_status",
                      old_value=old_status, new_value=new_status, remarks=remarks)
        else:
            if not bank.tax_number:
                return _error("No PAN / tax ID is on file to verify.")
            old_status = bank.pan_verification_status
            bank.pan_verification_status = new_status
            bank.pan_verification_remarks = remarks
            bank.save(update_fields=["pan_verification_status", "pan_verification_remarks", "updated_at"])
            log_audit(freelancer, "pan_verification_changed", user=request.user, field_name="pan_verification_status",
                      old_value=old_status, new_value=new_status, remarks=remarks)

        mark_under_review(freelancer, request.user)
        return Response(FreelancerBankDetailSerializer(bank, context={"freelancer": freelancer}).data)


def _payout_incomplete(freelancer, bank):
    """Why the payout details can't be marked verified yet (None when they can)."""
    method = bank.payment_method
    if not method:
        return "No payment method has been chosen yet."
    if method == "bank_transfer":
        found = countries.validate_bank_details(
            {
                "account_holder_name": bank.account_holder_name, "account_number": bank.account_number,
                "ifsc_code": bank.ifsc_code, "routing_code": bank.routing_code, "swift_code": bank.swift_code,
                "iban": bank.iban, "bank_name": bank.bank_name,
            },
            bank.bank_country or freelancer.residence_country, partial=False,
        )
        if found:
            return "The bank details are incomplete - " + next(iter(found.values()))
    elif method == "upi" and not bank.upi_id:
        return "No UPI ID is on file."
    elif method == "paypal" and not bank.paypal_email:
        return "No PayPal email is on file."
    elif method == "wise" and not bank.wise_email:
        return "No Wise email is on file."
    return None


class FreelancerBankDetailUnmaskedView(APIView):
    """Reveals the raw account number - gated behind its own permission
    code, distinct from the generic view/edit codes above, so most roles
    that can manage a freelancer's payment setup still never see the raw
    number (mirrors vendor.bank.view_unmasked)."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.bank_detail.view_unmasked"

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        bank = _bank_or_none(freelancer)
        if not bank:
            return Response({"detail": "No bank details on file."}, status=404)
        return Response(FreelancerBankDetailUnmaskedSerializer(bank).data)


class FreelancerPANUnmaskedView(APIView):
    """Reveals the raw PAN (tax_number) - gated behind its own permission
    code, independent of bank_detail.view_unmasked (Section 7: PAN and bank
    account access are separately restricted)."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.bank_detail.view_pan_unmasked"

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        bank = _bank_or_none(freelancer)
        if not bank or not bank.tax_number:
            return Response({"detail": "No PAN on file."}, status=404)
        return Response(FreelancerPANUnmaskedSerializer(bank).data)


class FreelancerEquipmentView(APIView):
    """A single admin-editable equipment/laptop record per freelancer
    (create-or-update via PATCH) - same shape as FreelancerBankDetailView.
    Nothing sensitive here, so no masked/unmasked split is needed."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.equipment.view",
        "PATCH": "freelancer_onboarding.equipment.edit",
    }

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        equipment = getattr(freelancer, "equipment", None)
        if not equipment:
            return Response(None)
        return Response(FreelancerEquipmentSerializer(equipment).data)

    def patch(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        instance = getattr(freelancer, "equipment", None)
        serializer = FreelancerEquipmentSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(freelancer=freelancer)
        return Response(serializer.data)


class FreelancerAuditLogListView(APIView):
    """Section 22's Activity tab data - read-only, entries are written
    internally by _log_freelancer_audit() at each mutation point above."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.audit_log.view"

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        logs = freelancer.audit_logs.select_related("performed_by")
        return Response(FreelancerAuditLogSerializer(logs, many=True).data)



# ===========================================================================
# Public (token-authenticated, no login) endpoints
# ===========================================================================

def _token_not_found(exc):
    if exc.reason == "expired":
        return NotFound(
            "This freelancer onboarding link has expired. Please contact us to request a new invitation."
        )
    if exc.reason == "revoked":
        return NotFound(
            "This freelancer onboarding link is no longer active. If you received a newer link, please use that one."
        )
    return NotFound("Invalid or unavailable freelancer onboarding link.")


def _read_only_message(freelancer):
    if freelancer.status == "completed":
        return ("Your onboarding has been submitted and is being reviewed, so it can't be changed now. "
                "Contact us if something needs correcting.")
    if freelancer.status in Freelancer.APPROVED_STATUSES:
        return "Your onboarding has already been approved."
    return "This onboarding can no longer be changed."


class _FreelancerPublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "freelancer_onboarding_public"

    def get_freelancer(self, request, token, *, write=False):
        """Resolves the link. `write=True` also requires a status the freelancer may still
        edit in (invited / onboarding / changes requested) - after submission the link is
        read-only."""
        try:
            freelancer = validate_public_token(
                token,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except InvalidTokenError as exc:
            raise _token_not_found(exc)
        if write and freelancer.status not in Freelancer.PORTAL_EDITABLE_STATUSES:
            raise PermissionDenied(_read_only_message(freelancer))
        return freelancer


class FreelancerPublicChoicesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "freelancer_onboarding_public"

    def get(self, request):
        return Response(_public_choices_payload())


class FreelancerPublicDetailView(_FreelancerPublicView):
    def get(self, request, token):
        try:
            freelancer = validate_public_token(
                token, ip_address=_client_ip(request), user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except InvalidTokenError as exc:
            # A link switched off because the onboarding was approved / closed still shows the
            # outcome (and nothing else) instead of an error page.
            if exc.reason == "revoked" and exc.token is not None and exc.token.revoke_reason in ("approved", "closed"):
                state = portal_status_for(exc.token.freelancer.status)
                if state in ("approved", "closed"):
                    return Response({"portal_status": state, "can_edit": False, "link_active": False})
            raise _token_not_found(exc)
        return Response(_public_detail(freelancer.pk, request))


class FreelancerPublicUpdateView(_FreelancerPublicView):
    """Public 'Save draft' / 'Save & next' - one combined endpoint accepting any subset of
    the freelancer-facing fields (FreelancerPortalWriteSerializer)."""

    def patch(self, request, token):
        freelancer = self.get_freelancer(request, token, write=True)
        serializer = FreelancerPortalWriteSerializer(freelancer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ensure_onboarding_status(freelancer)
        return Response(_public_detail(freelancer.pk, request))


class FreelancerPublicBankDetailView(_FreelancerPublicView):
    """The freelancer's own payout / tax details - masked account number and tax ID on read."""

    def get(self, request, token):
        freelancer = self.get_freelancer(request, token)
        bank = _bank_or_none(freelancer)
        if not bank:
            return Response(None)
        return Response(FreelancerBankDetailPublicSerializer(bank, context={"freelancer": freelancer}).data)

    def patch(self, request, token):
        freelancer = self.get_freelancer(request, token, write=True)
        instance = _bank_or_none(freelancer)
        serializer = FreelancerBankDetailPublicSerializer(
            instance, data=request.data, partial=True, context={"freelancer": freelancer},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            bank = serializer.save(freelancer=freelancer)
            _audit_bank_change(freelancer, serializer, bank, actor_label=PORTAL_ACTOR)
        ensure_onboarding_status(freelancer)
        return Response(FreelancerBankDetailPublicSerializer(bank, context={"freelancer": freelancer}).data)


class FreelancerPublicDocumentListView(_FreelancerPublicView):
    def get(self, request, token):
        freelancer = self.get_freelancer(request, token)
        docs = freelancer.documents.all()
        return Response(FreelancerPublicDocumentSerializer(docs, many=True).data)

    def post(self, request, token):
        request.FILES.get("file")  # consume the upload body before any early return
        freelancer = self.get_freelancer(request, token, write=True)
        document, error = save_document_upload(request, freelancer, portal=True)
        if error:
            return error
        ensure_onboarding_status(freelancer)
        return Response(FreelancerPublicDocumentSerializer(document).data, status=status.HTTP_201_CREATED)


class FreelancerPublicDocumentDetailView(_FreelancerPublicView):
    def delete(self, request, token, doc_id):
        freelancer = self.get_freelancer(request, token, write=True)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        if document.status == "verified":
            return _error("A verified document can't be removed. Contact us if it needs to change.", status_code=403)
        log_audit(freelancer, "document_deleted", actor_label=PORTAL_ACTOR, field_name=document.category,
                  old_value=document.get_category_display())
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerPublicDocumentDownloadView(_FreelancerPublicView):
    def get(self, request, token, doc_id):
        freelancer = self.get_freelancer(request, token)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        return _signed_download(document)


class FreelancerPublicProfilePhotoView(_FreelancerPublicView):
    def post(self, request, token):
        request.FILES.get("photo")  # consume the upload body before any early return
        freelancer = self.get_freelancer(request, token, write=True)
        error = save_profile_photo(request, freelancer)
        if error:
            return error
        ensure_onboarding_status(freelancer)
        return Response(_public_detail(freelancer.pk, request))

    def delete(self, request, token):
        freelancer = self.get_freelancer(request, token, write=True)
        freelancer.profile_photo = None
        freelancer.save(update_fields=["profile_photo", "updated_at"])
        return Response(_public_detail(freelancer.pk, request))


class FreelancerPublicSubmitView(_FreelancerPublicView):
    """Submits for review once every requirement is met (kyc.submission_issues) - otherwise
    400 with `missing`. The link then stays readable but no longer accepts changes."""

    def post(self, request, token):
        freelancer = self.get_freelancer(request, token, write=True)
        with transaction.atomic():
            freelancer = Freelancer.objects.select_for_update().get(pk=freelancer.pk)
            if freelancer.status not in Freelancer.PORTAL_EDITABLE_STATUSES:
                raise PermissionDenied(_read_only_message(freelancer))
            issues = kyc.submission_issues(freelancer)
            if issues:
                return _missing_response("Some required information is still missing.", issues)
            submit_onboarding(freelancer, actor_label=PORTAL_ACTOR)
        return Response(_public_detail(freelancer.pk, request))


# ===========================================================================
# Email template preview (developer tool - DEBUG only)
# ===========================================================================

def freelancer_email_preview(request, template_key=None):
    """Renders a Freelancer Onboarding email template with realistic sample
    data so it can be checked in a browser before shipping template changes.
    Never touches real freelancer records, and is unavailable unless DEBUG is
    on so it can't leak into a production deployment."""
    if not settings.DEBUG:
        return HttpResponseNotFound()

    sample_freelancer_url = f"{settings.FREELANCER_PORTAL_URL}/freelancer-onboarding/sample-preview-token"
    base = {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "company_email": settings.COMPANY_EMAIL,
        "freelancer_name": "David Kumar",
        "freelancer_email": "david.kumar@example.com",
    }
    expires = timezone.now() + timedelta(days=settings.FREELANCER_ONBOARDING_TOKEN_TTL_DAYS)

    previews = {
        "invited": ("freelancer_invited.html", {
            **base, "secure_freelancer_url": sample_freelancer_url, "token_expires_at": expires,
        }),
        "changes_requested": ("freelancer_changes_requested.html", {
            **base, "secure_freelancer_url": sample_freelancer_url, "token_expires_at": expires,
            "review_remarks": "Please upload a clearer copy of your PAN card and re-check the IFSC code.",
            "sections": ["Identity & KYC", "Banking", "KYC Documents"],
        }),
        "approved": ("freelancer_approved.html", base),
    }

    if not template_key:
        links = "".join(f'<li><a href="{key}/">{key}</a></li>' for key in previews)
        return HttpResponse(f"<h1>Freelancer Onboarding Email Previews</h1><ul>{links}</ul>")

    entry = previews.get(template_key)
    if not entry:
        return HttpResponseNotFound(
            f"Unknown preview key '{template_key}'. Valid keys: {', '.join(previews)}"
        )

    template, context = entry
    return HttpResponse(render_to_string(f"emails/freelancer_onboarding/{template}", context))
