import logging
import os
import time
from datetime import timedelta

import cloudinary.utils
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.models import Vendor
from roles.permission import HasPermissionCode

from .models import (
    VendorOnboardingProfile, VendorDocument, VendorKYC, VendorBankDetail, VendorProcurementDetail,
    VendorApprovalWorkflowConfig, VendorApprovalLevel,
)
from .serializers import (
    VendorReviewSerializer, VendorDocumentVerifySerializer, VendorAuditLogSerializer,
    VendorRaiseRequestSerializer, VendorOnboardingDraftSerializer, VendorOnboardingProfileSerializer,
    VendorPublicOnboardingProfileSerializer,
    VendorKYCSerializer, VendorBankDetailSerializer, VendorBankDetailUnmaskedSerializer,
    VendorProcurementDetailSerializer, VendorDocumentSerializer, VendorOnboardingDetailSerializer,
    VendorPublicDetailSerializer, VendorSubmitForApprovalSerializer, RequestChangesSerializer,
    VendorApprovalHistorySerializer, VendorApprovalWorkflowConfigSerializer, VendorApprovalLevelSerializer,
    VendorSubmissionVersionSerializer,
)
from .audit import changed_fields, log_vendor_audit
from .progress import (
    build_vendor_financials, vendor_requirement_issues,
    MAX_VENDOR_KYC_DOCUMENTS, NON_KYC_DOCUMENT_CATEGORIES, BANK_PROOF_CATEGORIES,
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
from core.notifications import notify

logger = logging.getLogger(__name__)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


MAX_VENDOR_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB, same as client KYC documents
ALLOWED_VENDOR_DOCUMENT_TYPES = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg", "image/pjpeg"},
    ".jpeg": {"image/jpeg", "image/pjpeg"},
    ".png": {"image/png"},
}
# Minimum gap between onboarding emails to the same vendor (spam guard).
ONBOARDING_EMAIL_COOLDOWN = timedelta(seconds=60)
STEP_AUDIT_ACTIONS = {
    "onboarding_profile": "updated",
    "kyc": "kyc_updated",
    "bank_detail": "updated",
    "procurement_detail": "contract_updated",
}


def _document_error(message, error, http_status=400):
    return Response({"success": False, "message": message, "detail": message, "error": error}, status=http_status)


def _validate_vendor_upload(vendor, file, category):
    """Server-side checks for a vendor document upload. Returns an error Response, or None."""
    if not file:
        return _document_error("Please choose a file to upload.", "file_required")
    if file.size == 0:
        return _document_error("The selected file is empty.", "file_empty")
    if file.size > MAX_VENDOR_DOCUMENT_SIZE:
        return _document_error("File is too large. Maximum size is 10 MB.", "file_too_large")
    ext = os.path.splitext(file.name or "")[1].lower()
    content_type = (file.content_type or "").lower()
    allowed = ALLOWED_VENDOR_DOCUMENT_TYPES.get(ext)
    if not allowed or (content_type and content_type != "application/octet-stream" and content_type not in allowed):
        return _document_error("Only PDF, JPG, JPEG and PNG files are allowed.", "unsupported_file_type")
    if category not in NON_KYC_DOCUMENT_CATEGORIES:
        kyc_docs = vendor.documents.exclude(category__in=NON_KYC_DOCUMENT_CATEGORIES).count()
        if kyc_docs >= MAX_VENDOR_KYC_DOCUMENTS:
            return _document_error(
                f"Maximum {MAX_VENDOR_KYC_DOCUMENTS} KYC documents are allowed. Delete a document to upload another.",
                "document_limit_reached",
            )
    if vendor.documents.filter(file_name=file.name, file_size=file.size).exists():
        return _document_error("This document has already been uploaded for this vendor.", "duplicate_document")
    return None


def _save_vendor_document(request, vendor, user=None, actor_label=""):
    """Shared by the admin and portal upload endpoints. The file is read before any early
    return, so a rejected large upload still gets a proper JSON error instead of a dropped connection."""
    file = request.FILES.get("file")
    category = request.data.get("category", "")
    error = _validate_vendor_upload(vendor, file, category)
    if error:
        return error
    was_invited = vendor.status == "invited"
    ensure_draft_status(vendor)
    data = request.data.copy()
    data["vendor"] = vendor.id
    serializer = VendorDocumentSerializer(data=data, context={"request": request})
    if not serializer.is_valid():
        if "category" in serializer.errors:
            return _document_error("Please select a valid document type.", "invalid_document_type")
        return Response(serializer.errors, status=400)
    try:
        document = serializer.save()
    except Exception:
        logger.exception("Vendor %s document upload failed while storing the file", vendor.id)
        return _document_error("Server could not process the document. Please try again.", "storage_failed", 502)
    if was_invited:
        log_vendor_audit(vendor, "onboarding_started", user, actor_label=actor_label)
    log_vendor_audit(vendor, "document_uploaded", user, field_name=document.category,
                     new_value=document.get_category_display(), remarks=document.file_name, actor_label=actor_label)
    # A bank proof on file moves bank verification from "not verified" to "documents uploaded".
    if document.category in BANK_PROOF_CATEGORIES:
        bank = getattr(vendor, "bank_detail", None)
        if bank and bank.verification_status == "not_verified":
            bank.verification_status = "documents_uploaded"
            bank.save(update_fields=["verification_status"])
    return Response(VendorDocumentSerializer(document, context={"request": request}).data, status=status.HTTP_201_CREATED)


def _save_vendor_step(vendor, serializer_class, related_name, data, user=None, actor_label=""):
    """Shared by the admin and portal per-step PATCH endpoints (partial update + audit)."""
    was_invited = vendor.status == "invited"
    ensure_draft_status(vendor)
    instance = getattr(vendor, related_name, None)
    serializer = serializer_class(instance, data=data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    changes = changed_fields(instance, serializer.validated_data)
    serializer.save(vendor=vendor)
    if was_invited:
        log_vendor_audit(vendor, "onboarding_started", user, actor_label=actor_label)
    if changes:
        log_vendor_audit(
            vendor, STEP_AUDIT_ACTIONS.get(related_name, "updated"), user,
            field_name=related_name,
            new_value=", ".join(field for field, _old, _new in changes),
            actor_label=actor_label,
        )
    return Response(serializer.data)


def _can_edit_vendor(vendor):
    return vendor.status in ("invited", "draft", "action_required")


def _can_edit(vendor, user):
    if user.is_superuser or user.has_role_permission("vendor.edit_any"):
        return _can_edit_vendor(vendor)
    is_owner = vendor.created_by_id == user.id and user.has_role_permission("vendor.edit_own")
    if not is_owner:
        return False
    return _can_edit_vendor(vendor)


# Vendor-master attributes (not part of the reviewed submission), so they stay editable
# by an internal user after the vendor is submitted or approved.
VENDOR_MASTER_FIELDS = ("rating", "headcount")


def _can_edit_master_fields(vendor, user):
    if user.is_superuser or user.has_role_permission("vendor.edit_any"):
        return True
    return vendor.created_by_id == user.id and user.has_role_permission("vendor.edit_own")


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
        ).prefetch_related("documents", "change_requests", "product_groups")

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
            # Comma-separated for the dashboard's grouped filters (e.g. the
            # "Action Required" card/tab covers submitted + resubmitted +
            # action_required) - a single value works the same way via a
            # one-element list.
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
        """Admin fills the whole thing out directly on the vendor's behalf
        (no self-service link involved) - still funnels into the same
        Vendor -> approval pipeline."""
        serializer = VendorOnboardingDraftSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        vendor = serializer.save(created_by=request.user, status="draft")
        vendor.assign_reference_number()
        vendor.save(update_fields=["vendor_reference_no"])
        log_vendor_audit(vendor, "created", request.user, remarks="Created by an internal user")

        return Response(
            VendorOnboardingDetailSerializer(vendor, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class VendorRaiseRequestView(APIView):
    """Admin 'Raise Vendor Request' - the lightweight self-service invite path."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.create"

    def post(self, request):
        serializer = VendorRaiseRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        vendor, raw_token = raise_vendor_request(serializer.validated_data, request.user)
        log_vendor_audit(vendor, "created", request.user, remarks="Vendor request raised - onboarding link emailed")

        transaction.on_commit(
            lambda: send_vendor_invited_notification.delay(vendor.id, raw_token)
        )

        return Response(
            VendorOnboardingDetailSerializer(vendor, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


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
            return Response({"detail": "This vendor request has already been approved."}, status=400)
        if not vendor.email:
            return Response({"detail": "Add the vendor's contact email before sending the onboarding email."}, status=400)
        last = vendor.email_logs.filter(template="vendor_invited.html").first()
        if last and timezone.now() - last.created_at < ONBOARDING_EMAIL_COOLDOWN:
            return Response({"detail": "An onboarding email was just sent. Please wait a minute before resending."}, status=429)

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
        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


class VendorUnarchiveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.delete"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        vendor.is_archived = False
        vendor.save(update_fields=["is_archived"])
        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


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
    permission_map = {"GET": "vendor.view", "PATCH": "vendor.edit_own", "DELETE": "vendor.delete"}

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)

        ensure_draft_status(vendor)
        serializer = VendorOnboardingDraftSerializer(vendor, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)

    def delete(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if vendor.status not in ("invited", "draft"):
            return Response({"detail": "Only invited or draft requests can be deleted."}, status=403)
        if not (request.user.is_superuser or vendor.created_by_id == request.user.id):
            return Response({"detail": "You cannot delete another user's vendor."}, status=403)
        vendor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class _VendorStepDetailView(APIView):
    """Base class for the four admin per-step PATCH endpoints."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"PATCH": "vendor.edit_own"}

    serializer_class = None
    related_name = None

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)
        return _save_vendor_step(vendor, self.serializer_class, self.related_name, request.data, request.user)


class VendorProfileStepView(_VendorStepDetailView):
    serializer_class = VendorOnboardingProfileSerializer
    related_name = "onboarding_profile"

    def patch(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            # Locked for review/approval - only the vendor-master fields may still change.
            if not (set(request.data) <= set(VENDOR_MASTER_FIELDS) and _can_edit_master_fields(vendor, request.user)):
                return Response({"detail": "This vendor is not editable in its current state."}, status=403)
        return _save_vendor_step(vendor, self.serializer_class, self.related_name, request.data, request.user)


class VendorKYCStepView(_VendorStepDetailView):
    serializer_class = VendorKYCSerializer
    related_name = "kyc"


class VendorBankDetailStepView(_VendorStepDetailView):
    serializer_class = VendorBankDetailSerializer
    related_name = "bank_detail"


class VendorProcurementStepView(_VendorStepDetailView):
    serializer_class = VendorProcurementDetailSerializer
    related_name = "procurement_detail"


class VendorBankDetailUnmaskedView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.bank.view_unmasked"

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        bank = getattr(vendor, "bank_detail", None)
        if not bank:
            return Response({"detail": "No bank details on file."}, status=404)
        return Response(VendorBankDetailUnmaskedSerializer(bank).data)


class VendorDocumentListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "vendor.document.view", "POST": "vendor.document.upload"}

    def get(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        docs = vendor.documents.all()
        return Response(VendorDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        request.FILES.get("file")  # consume the upload body before any early return
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)
        return _save_vendor_document(request, vendor, request.user)


class VendorDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"DELETE": "vendor.document.delete"}

    def delete(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)
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

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class VendorSubmitForApprovalView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.submit"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor cannot be submitted in its current state."}, status=403)

        validator = VendorSubmitForApprovalSerializer(data={}, vendor=vendor)
        if not validator.is_valid():
            return Response(validator.errors, status=status.HTTP_400_BAD_REQUEST)

        was_resubmission = vendor.change_requests.exists()
        try:
            submit_vendor_for_approval(vendor, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
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

        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


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
        ).select_related("approval_instance", "approval_instance__resolved_config")

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
            return Response({"detail": "You are not the approver for this vendor's current stage."}, status=403)

        outstanding = vendor_requirement_issues(vendor)
        if outstanding:
            return Response(
                {
                    "detail": "Vendor cannot be approved.",
                    "missing": [issue["message"] for issue in outstanding],
                },
                status=400,
            )

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

        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


class VendorRequestChangesView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.request_changes"

    def post(self, request, pk):
        vendor = get_object_or_404(Vendor, pk=pk)
        instance = getattr(vendor, "approval_instance", None)
        if not instance or not user_is_authorized_for_level(request.user, instance.current_level()):
            return Response({"detail": "You are not the approver for this vendor's current stage."}, status=403)

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

        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


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
            return Response({"detail": "No matching approval configuration."}, status=404)
        return Response(VendorApprovalWorkflowConfigSerializer(config).data)


def _choices_payload():
    from core.app_constants import CURRENCY_CHOICES
    from .models import VendorChangeRequest
    return {
        "vendor_types": [{"value": k, "label": v} for k, v in Vendor.VENDOR_TYPE_CHOICES],
        "vendor_statuses": [{"value": k, "label": v} for k, v in Vendor.STATUS_CHOICES],
        "msme_categories": [{"value": k, "label": v} for k, v in VendorOnboardingProfile.MSME_CATEGORY_CHOICES],
        "document_categories": [{"value": k, "label": v} for k, v in VendorDocument.CATEGORY_CHOICES],
        "change_request_sections": [{"value": k, "label": v} for k, v in VendorChangeRequest.SECTION_CHOICES],
        "currencies": [{"value": k, "label": v} for k, v in CURRENCY_CHOICES],
        "onboarding_currencies": [{"value": c, "label": c} for c in ("INR", "USD", "EUR", "GBP", "AED", "SGD")],
        "payment_terms": [
            {"value": "due_on_receipt", "label": "Due on Receipt"}, {"value": "net_15", "label": "Net 15"},
            {"value": "net_30", "label": "Net 30"}, {"value": "net_45", "label": "Net 45"},
            {"value": "net_60", "label": "Net 60"}, {"value": "net_90", "label": "Net 90"},
            {"value": "custom", "label": "Custom"},
        ],
        "billing_frequencies": [{"value": k, "label": v} for k, v in VendorProcurementDetail.BILLING_FREQUENCY_CHOICES],
        "kyc_statuses": [{"value": k, "label": v} for k, v in VendorKYC.KYC_STATUS_CHOICES],
        "risk_ratings": [{"value": k, "label": v} for k, v in VendorKYC.RISK_RATING_CHOICES],
        "bank_verification_statuses": [{"value": k, "label": v} for k, v in VendorBankDetail.VERIFICATION_STATUS_CHOICES],
        "document_statuses": [{"value": k, "label": v} for k, v in VendorDocument.STATUS_CHOICES],
    }


class VendorOnboardingChoicesView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response(_choices_payload())


class VendorPublicChoicesView(APIView):
    """Static reference data (vendor types, document categories, currencies) -
    not vendor-specific, so no token is required, just like a public form
    needs to know its own dropdown options before a vendor identifies themselves."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "vendor_public"

    def get(self, request):
        payload = _choices_payload()
        payload.pop("vendor_statuses", None)
        payload.pop("change_request_sections", None)
        for internal in ("kyc_statuses", "risk_ratings", "bank_verification_statuses"):
            payload.pop(internal, None)
        return Response(payload)


# ===========================================================================
# Public (token-authenticated, no login) endpoints
# ===========================================================================

class _VendorPublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "vendor_public"

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


class VendorPublicDetailView(_VendorPublicView):
    def get(self, request, token):
        vendor = self.get_vendor(request, token)
        return Response(VendorPublicDetailSerializer(vendor, context={"request": request}).data)


class _VendorPublicStepDetailView(_VendorPublicView):
    serializer_class = None
    related_name = None

    def patch(self, request, token):
        vendor = self.get_vendor(request, token)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        return _save_vendor_step(vendor, self.serializer_class, self.related_name, request.data, actor_label="vendor")


class VendorPublicProfileStepView(_VendorPublicStepDetailView):
    serializer_class = VendorPublicOnboardingProfileSerializer
    related_name = "onboarding_profile"


class VendorPublicKYCStepView(_VendorPublicStepDetailView):
    serializer_class = VendorKYCSerializer
    related_name = "kyc"


class VendorPublicBankDetailStepView(_VendorPublicStepDetailView):
    serializer_class = VendorBankDetailSerializer
    related_name = "bank_detail"


class VendorPublicProcurementStepView(_VendorPublicStepDetailView):
    serializer_class = VendorProcurementDetailSerializer
    related_name = "procurement_detail"


class VendorPublicIdentityView(_VendorPublicView):
    """PATCH for the base identity fields (name/type/email/phone/contact
    person) collected on Step 1, mirroring the admin draft serializer."""

    def patch(self, request, token):
        vendor = self.get_vendor(request, token)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)

        ensure_draft_status(vendor)
        serializer = VendorOnboardingDraftSerializer(vendor, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(VendorPublicDetailSerializer(vendor, context={"request": request}).data)


class VendorPublicDocumentListView(_VendorPublicView):
    def get(self, request, token):
        vendor = self.get_vendor(request, token)
        docs = vendor.documents.all()
        return Response(VendorDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, token):
        request.FILES.get("file")  # consume the upload body before any early return
        vendor = self.get_vendor(request, token)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        return _save_vendor_document(request, vendor, actor_label="vendor")


class VendorPublicDocumentDetailView(_VendorPublicView):
    def delete(self, request, token, doc_id):
        vendor = self.get_vendor(request, token)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        if document.status == "verified":
            return Response({"detail": "A verified document can't be removed. Contact the team that invited you."}, status=403)
        log_vendor_audit(vendor, "document_deleted", actor_label="vendor", field_name=document.category,
                         old_value=document.get_category_display(), remarks=document.file_name)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorPublicDocumentDownloadView(_VendorPublicView):
    def get(self, request, token, doc_id):
        vendor = self.get_vendor(request, token)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class VendorPublicSubmitView(_VendorPublicView):
    def post(self, request, token):
        vendor = self.get_vendor(request, token)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request cannot be submitted in its current state."}, status=403)

        validator = VendorSubmitForApprovalSerializer(data={}, vendor=vendor)
        if not validator.is_valid():
            return Response(validator.errors, status=status.HTTP_400_BAD_REQUEST)

        was_resubmission = vendor.change_requests.exists()
        try:
            submit_vendor_for_approval(vendor, actor=None)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        log_vendor_audit(vendor, "submitted", actor_label="vendor", remarks="Resubmitted" if was_resubmission else "")

        if was_resubmission:
            transaction.on_commit(lambda: send_vendor_resubmitted_notification.delay(vendor.id))
        else:
            transaction.on_commit(lambda: send_vendor_submitted_notification.delay(vendor.id))

        return Response(VendorPublicDetailSerializer(vendor, context={"request": request}).data)


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
            return Response({"detail": "This vendor is already approved."}, status=400)
        serializer = VendorReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        data = serializer.validated_data

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

        vendor.refresh_from_db()
        return Response(VendorOnboardingDetailSerializer(vendor, context={"request": request}).data)


class VendorDocumentVerifyView(APIView):
    """Marks a document Under Review / Verified / Rejected (rejection needs a reason).
    Uploading never verifies - this is the only way a document becomes Verified."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "vendor.verify"

    def post(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if vendor.status == "approved":
            return Response({"detail": "This vendor is already approved."}, status=400)
        serializer = VendorDocumentVerifySerializer(data=request.data)
        if not serializer.is_valid():
            first = next(iter(serializer.errors.values()))
            message = first[0] if isinstance(first, list) else str(first)
            return Response({"success": False, "message": message, "detail": message, **serializer.errors}, status=400)

        new_status = serializer.validated_data["status"]
        old_status = document.status
        document.status = new_status
        document.remarks = serializer.validated_data["remarks"].strip()
        document.verified_by = request.user
        document.verified_at = timezone.now()
        document.save()

        action = {"verified": "document_verified", "rejected": "document_rejected"}.get(new_status, "updated")
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
