import time

import cloudinary.utils
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
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
    VendorOnboardingProfile, VendorDocument,
    VendorApprovalWorkflowConfig, VendorApprovalLevel,
)
from .serializers import (
    VendorRaiseRequestSerializer, VendorOnboardingDraftSerializer, VendorOnboardingProfileSerializer,
    VendorKYCSerializer, VendorBankDetailSerializer, VendorBankDetailUnmaskedSerializer,
    VendorProcurementDetailSerializer, VendorDocumentSerializer, VendorOnboardingDetailSerializer,
    VendorPublicDetailSerializer, VendorSubmitForApprovalSerializer, RequestChangesSerializer,
    VendorApprovalHistorySerializer, VendorApprovalWorkflowConfigSerializer, VendorApprovalLevelSerializer,
    VendorSubmissionVersionSerializer,
)
from .services import (
    submit_vendor_for_approval, apply_approval_action, apply_request_changes_action,
    user_is_authorized_for_level, raise_vendor_request, generate_access_token,
    validate_public_token, ensure_draft_status, InvalidTokenError,
)
from .tasks import (
    send_vendor_invited_notification, send_vendor_submitted_notification,
    send_vendor_approval_advanced_notification, send_vendor_approved_notification,
    send_vendor_request_changes_notification, send_vendor_resubmitted_notification,
    send_vendor_approval_in_progress_notification, _badge,
)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _can_edit_vendor(vendor):
    return vendor.status in ("invited", "draft", "action_required")


def _can_edit(vendor, user):
    if user.is_superuser or user.has_role_permission("vendor.edit_any"):
        return _can_edit_vendor(vendor)
    is_owner = vendor.created_by_id == user.id and user.has_role_permission("vendor.edit_own")
    if not is_owner:
        return False
    return _can_edit_vendor(vendor)


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
        ).all()

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

        serializer = VendorOnboardingDetailSerializer(qs.distinct(), many=True, context={"request": request})
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

        raw_token = generate_access_token(vendor, created_by=request.user)
        transaction.on_commit(
            lambda: send_vendor_invited_notification.delay(vendor.id, raw_token)
        )
        return Response({"detail": "Invitation resent."})


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

        ensure_draft_status(vendor)
        instance = getattr(vendor, self.related_name, None)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(vendor=vendor)
        return Response(serializer.data)


class VendorProfileStepView(_VendorStepDetailView):
    serializer_class = VendorOnboardingProfileSerializer
    related_name = "onboarding_profile"


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
        vendor = get_object_or_404(Vendor, pk=pk)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        ensure_draft_status(vendor)
        data = request.data.copy()
        data["vendor"] = vendor.id
        serializer = VendorDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class VendorDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"DELETE": "vendor.document.delete"}

    def delete(self, request, pk, doc_id):
        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if not _can_edit(vendor, request.user):
            return Response({"detail": "This vendor is not editable in its current state."}, status=403)
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

        if was_resubmission:
            transaction.on_commit(lambda: send_vendor_resubmitted_notification.delay(vendor.id))
        else:
            transaction.on_commit(lambda: send_vendor_submitted_notification.delay(vendor.id))

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

        comments = request.data.get("comments", "")
        apply_approval_action(vendor, request.user, comments=comments)

        if vendor.status == "approved":
            transaction.on_commit(lambda: send_vendor_approved_notification.delay(vendor.id))
        else:
            transaction.on_commit(lambda: send_vendor_approval_advanced_notification.delay(vendor.id))
            transaction.on_commit(lambda: send_vendor_approval_in_progress_notification.delay(vendor.id))

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

        transaction.on_commit(
            lambda: send_vendor_request_changes_notification.delay(vendor.id, change_request.id)
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
        except InvalidTokenError:
            raise NotFound("This onboarding link is invalid or has expired.")


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

        ensure_draft_status(vendor)
        instance = getattr(vendor, self.related_name, None)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(vendor=vendor)
        return Response(serializer.data)


class VendorPublicProfileStepView(_VendorPublicStepDetailView):
    serializer_class = VendorOnboardingProfileSerializer
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
        vendor = self.get_vendor(request, token)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        ensure_draft_status(vendor)
        data = request.data.copy()
        data["vendor"] = vendor.id
        serializer = VendorDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class VendorPublicDocumentDetailView(_VendorPublicView):
    def delete(self, request, token, doc_id):
        vendor = self.get_vendor(request, token)
        document = get_object_or_404(VendorDocument, pk=doc_id, vendor=vendor)
        if not _can_edit_vendor(vendor):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
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
