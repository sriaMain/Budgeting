import time

import cloudinary.utils
from django.conf import settings
from django.db import transaction
from django.db.models import Q
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

from accounts.models import Account
from roles.permission import HasPermissionCode

from .models import EmployeeOnboardingRequest, EmployeeDocument, EmployeeChangeRequest, EmployeePersonalDetail
from .serializers import (
    EmployeeInviteSerializer, EmployeeEmploymentDetailsSerializer,
    EmployeePersonalDetailSerializer, EmployeeAddressDetailSerializer,
    EmployeeStatutoryDetailSerializer, EmployeeBankDetailSerializer, EmployeeEmergencyContactSerializer,
    EmployeeDocumentSerializer, EmployeeOnboardingDetailSerializer, EmployeePublicDetailSerializer,
    EmployeePublicIdentityUpdateSerializer, EmployeeSubmitSerializer, RequestEmployeeChangesSerializer,
    EmployeeOnboardingHistorySerializer, EmployeeSubmissionVersionSerializer,
)
from .services import (
    submit_employee_onboarding, apply_employee_approval, apply_employee_request_changes,
    send_or_resend_invite, validate_public_token, ensure_draft_status, InvalidTokenError,
)
from .tasks import (
    send_employee_invited_notification, send_employee_submitted_notification,
    send_employee_resubmitted_notification, send_employee_approved_notification,
    send_employee_request_changes_notification, _badge,
)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _can_edit_request(onboarding_request):
    return onboarding_request.status in ("invited", "draft", "action_required")


# ===========================================================================
# Admin (JWT-authenticated) endpoints
# ===========================================================================

class EmployeeOnboardingChoicesView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response(_choices_payload())


class EmployeeOnboardingListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.view"

    def get(self, request):
        qs = EmployeeOnboardingRequest.objects.select_related(
            "account", "reporting_manager", "personal_detail", "address_detail",
            "statutory_detail", "bank_detail", "emergency_contact",
        ).all()

        status_filter = request.GET.get("status")
        search = request.GET.get("search")

        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if search:
            qs = qs.filter(
                Q(employee_code__icontains=search)
                | Q(department__icontains=search)
                | Q(designation__icontains=search)
                | Q(account__first_name__icontains=search)
                | Q(account__last_name__icontains=search)
                | Q(account__email__icontains=search)
            )

        serializer = EmployeeOnboardingDetailSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)


class EmployeeSendInviteView(APIView):
    """Admin 'Send Onboarding Invite' action - works for both the first send
    and any resend, without ever creating a duplicate request for the same
    account (see services.send_or_resend_invite)."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.invite"

    def post(self, request, account_id):
        account = get_object_or_404(Account, pk=account_id)
        existing = EmployeeOnboardingRequest.objects.filter(account=account).first()

        serializer = EmployeeInviteSerializer(data=request.data, account=account)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        onboarding_request, raw_token = send_or_resend_invite(
            account, serializer.validated_data, created_by=request.user,
        )

        transaction.on_commit(
            lambda: send_employee_invited_notification.delay(onboarding_request.id, raw_token)
        )

        response_status = status.HTTP_200_OK if existing else status.HTTP_201_CREATED
        return Response(
            EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data,
            status=response_status,
        )


class EmployeeOnboardingDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "employee_onboarding.view", "PATCH": "employee_onboarding.edit"}

    def get(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        return Response(EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data)

    def patch(self, request, account_id):
        """Lets an admin fill in / correct the request's own employment
        fields (department, designation, employee_code, ...) on the
        employee's behalf - e.g. from the 'fill onboarding' wizard opened
        right after creating a bare Employee account."""
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)

        serializer = EmployeeEmploymentDetailsSerializer(onboarding_request, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data)


class _EmployeeStepDetailView(APIView):
    """Base class for the admin per-step PATCH endpoints."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.edit"

    serializer_class = None
    related_name = None

    def patch(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)

        ensure_draft_status(onboarding_request)
        instance = getattr(onboarding_request, self.related_name, None)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(request=onboarding_request)
        return Response(serializer.data)


class EmployeePersonalStepView(_EmployeeStepDetailView):
    serializer_class = EmployeePersonalDetailSerializer
    related_name = "personal_detail"


class EmployeeAddressStepView(_EmployeeStepDetailView):
    serializer_class = EmployeeAddressDetailSerializer
    related_name = "address_detail"


class EmployeeStatutoryStepView(_EmployeeStepDetailView):
    serializer_class = EmployeeStatutoryDetailSerializer
    related_name = "statutory_detail"


class EmployeeBankDetailStepView(_EmployeeStepDetailView):
    serializer_class = EmployeeBankDetailSerializer
    related_name = "bank_detail"


class EmployeeEmergencyContactStepView(_EmployeeStepDetailView):
    serializer_class = EmployeeEmergencyContactSerializer
    related_name = "emergency_contact"


class EmployeeDocumentListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "employee_onboarding.document.view", "POST": "employee_onboarding.document.upload"}

    def get(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        docs = onboarding_request.documents.all()
        return Response(EmployeeDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        ensure_draft_status(onboarding_request)
        data = request.data.copy()
        data["request"] = onboarding_request.id
        serializer = EmployeeDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class EmployeeDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.document.delete"

    def delete(self, request, account_id, doc_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        document = get_object_or_404(EmployeeDocument, pk=doc_id, request=onboarding_request)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.document.view"

    def get(self, request, account_id, doc_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        document = get_object_or_404(EmployeeDocument, pk=doc_id, request=onboarding_request)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class EmployeeSubmitView(APIView):
    """Only reachable if an admin fills the form out on the employee's behalf
    - kept for parity with the public submit endpoint."""
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.edit"

    def post(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request cannot be submitted in its current state."}, status=403)

        validator = EmployeeSubmitSerializer(data={}, onboarding_request=onboarding_request)
        if not validator.is_valid():
            return Response(validator.errors, status=status.HTTP_400_BAD_REQUEST)

        was_resubmission = onboarding_request.change_requests.exists()
        submit_employee_onboarding(onboarding_request, actor=request.user)

        if was_resubmission:
            transaction.on_commit(lambda: send_employee_resubmitted_notification.delay(onboarding_request.id))
        else:
            transaction.on_commit(lambda: send_employee_submitted_notification.delay(onboarding_request.id))

        return Response(EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data)


class EmployeeApproveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.approve"

    def post(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if onboarding_request.status not in ("submitted", "resubmitted"):
            return Response({"detail": "This request is not awaiting approval."}, status=403)

        comments = request.data.get("comments", "")
        apply_employee_approval(onboarding_request, request.user, comments=comments)

        transaction.on_commit(lambda: send_employee_approved_notification.delay(onboarding_request.id))

        return Response(EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data)


class EmployeeRequestChangesView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.request_changes"

    def post(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        if onboarding_request.status not in ("submitted", "resubmitted"):
            return Response({"detail": "This request is not awaiting approval."}, status=403)

        serializer = RequestEmployeeChangesSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        change_request = apply_employee_request_changes(
            onboarding_request, request.user, **serializer.validated_data
        )

        transaction.on_commit(
            lambda: send_employee_request_changes_notification.delay(onboarding_request.id, change_request.id)
        )

        return Response(EmployeeOnboardingDetailSerializer(onboarding_request, context={"request": request}).data)


class EmployeeOnboardingHistoryView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.approval_history.view"

    def get(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        history = onboarding_request.history.all()
        return Response(EmployeeOnboardingHistorySerializer(history, many=True).data)


class EmployeeSubmissionVersionListView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "employee_onboarding.view"

    def get(self, request, account_id):
        onboarding_request = get_object_or_404(EmployeeOnboardingRequest, account_id=account_id)
        versions = onboarding_request.versions.all()
        return Response(EmployeeSubmissionVersionSerializer(versions, many=True).data)


def _choices_payload():
    return {
        "genders": [{"value": k, "label": v} for k, v in EmployeePersonalDetail.GENDER_CHOICES],
        "employment_types": [{"value": k, "label": v} for k, v in EmployeeOnboardingRequest.EMPLOYMENT_TYPE_CHOICES],
        "employee_statuses": [{"value": k, "label": v} for k, v in EmployeeOnboardingRequest.STATUS_CHOICES],
        "document_categories": [{"value": k, "label": v} for k, v in EmployeeDocument.CATEGORY_CHOICES],
        "change_request_sections": [{"value": k, "label": v} for k, v in EmployeeChangeRequest.SECTION_CHOICES],
    }


class EmployeePublicChoicesView(APIView):
    """Static reference data - not request-specific, so no token is required,
    just like a public form needs to know its own dropdown options before an
    employee identifies themselves."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "employee_onboarding_public"

    def get(self, request):
        payload = _choices_payload()
        payload.pop("employee_statuses", None)
        payload.pop("change_request_sections", None)
        return Response(payload)


# ===========================================================================
# Public (token-authenticated, no login) endpoints
# ===========================================================================

class _EmployeePublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "employee_onboarding_public"

    def get_request_or_404(self, request, token):
        try:
            return validate_public_token(
                token,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except InvalidTokenError as exc:
            if exc.reason == "expired":
                raise NotFound(
                    "This employee onboarding link has expired. Please contact HR to request a new invitation."
                )
            raise NotFound("Invalid or unavailable employee onboarding link.")


class EmployeePublicDetailView(_EmployeePublicView):
    def get(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        return Response(EmployeePublicDetailSerializer(onboarding_request, context={"request": request}).data)


class _EmployeePublicStepDetailView(_EmployeePublicView):
    serializer_class = None
    related_name = None

    def patch(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)

        ensure_draft_status(onboarding_request)
        instance = getattr(onboarding_request, self.related_name, None)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(request=onboarding_request)
        return Response(serializer.data)


class EmployeePublicPersonalStepView(_EmployeePublicStepDetailView):
    serializer_class = EmployeePersonalDetailSerializer
    related_name = "personal_detail"


class EmployeePublicAddressStepView(_EmployeePublicStepDetailView):
    serializer_class = EmployeeAddressDetailSerializer
    related_name = "address_detail"


class EmployeePublicStatutoryStepView(_EmployeePublicStepDetailView):
    serializer_class = EmployeeStatutoryDetailSerializer
    related_name = "statutory_detail"


class EmployeePublicBankDetailStepView(_EmployeePublicStepDetailView):
    serializer_class = EmployeeBankDetailSerializer
    related_name = "bank_detail"


class EmployeePublicEmergencyContactStepView(_EmployeePublicStepDetailView):
    serializer_class = EmployeeEmergencyContactSerializer
    related_name = "emergency_contact"


class EmployeePublicIdentityView(_EmployeePublicView):
    """PATCH for the two base identity fields on Account (first/last name,
    Step 1) plus last_saved_step tracking on the onboarding request itself -
    mirrors Vendor's identity+progress bundling into a single call. Never
    touches any other Account field, and never touches admin-owned employment
    fields on the request."""

    def patch(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)

        ensure_draft_status(onboarding_request)

        identity_fields = {k: v for k, v in request.data.items() if k in ("first_name", "last_name")}
        if identity_fields:
            identity_serializer = EmployeePublicIdentityUpdateSerializer(
                onboarding_request.account, data=identity_fields, partial=True,
            )
            if not identity_serializer.is_valid():
                return Response(identity_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            identity_serializer.save()

        if "last_saved_step" in request.data:
            try:
                step = int(request.data["last_saved_step"])
            except (TypeError, ValueError):
                return Response({"last_saved_step": ["Must be an integer."]}, status=400)
            onboarding_request.last_saved_step = step
            onboarding_request.save(update_fields=["last_saved_step"])

        return Response(EmployeePublicDetailSerializer(onboarding_request, context={"request": request}).data)


class EmployeePublicDocumentListView(_EmployeePublicView):
    def get(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        docs = onboarding_request.documents.all()
        return Response(EmployeeDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        ensure_draft_status(onboarding_request)
        data = request.data.copy()
        data["request"] = onboarding_request.id
        serializer = EmployeeDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class EmployeePublicDocumentDetailView(_EmployeePublicView):
    def delete(self, request, token, doc_id):
        onboarding_request = self.get_request_or_404(request, token)
        document = get_object_or_404(EmployeeDocument, pk=doc_id, request=onboarding_request)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request is not editable in its current state."}, status=403)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeePublicDocumentDownloadView(_EmployeePublicView):
    def get(self, request, token, doc_id):
        onboarding_request = self.get_request_or_404(request, token)
        document = get_object_or_404(EmployeeDocument, pk=doc_id, request=onboarding_request)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class EmployeePublicSubmitView(_EmployeePublicView):
    def post(self, request, token):
        onboarding_request = self.get_request_or_404(request, token)
        if not _can_edit_request(onboarding_request):
            return Response({"detail": "This request cannot be submitted in its current state."}, status=403)

        validator = EmployeeSubmitSerializer(data={}, onboarding_request=onboarding_request)
        if not validator.is_valid():
            return Response(validator.errors, status=status.HTTP_400_BAD_REQUEST)

        was_resubmission = onboarding_request.change_requests.exists()
        submit_employee_onboarding(onboarding_request, actor=None)

        if was_resubmission:
            transaction.on_commit(lambda: send_employee_resubmitted_notification.delay(onboarding_request.id))
        else:
            transaction.on_commit(lambda: send_employee_submitted_notification.delay(onboarding_request.id))

        return Response(EmployeePublicDetailSerializer(onboarding_request, context={"request": request}).data)


# ===========================================================================
# Email template preview (developer tool - DEBUG only)
# ===========================================================================

def employee_email_preview(request, template_key=None):
    """Renders an Employee Onboarding email template with realistic sample
    data so it can be checked in a browser before shipping template changes.
    Never touches real employee records, and is unavailable unless DEBUG is
    on so it can't leak into a production deployment."""
    if not settings.DEBUG:
        return HttpResponseNotFound()

    sample_base = {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "employee_name": "Priya Nair",
        "employee_email": "priya.nair@example.com",
        "employee_id": "EMP-0042",
        "designation": "Software Engineer",
        "joining_date": "01 Sep 2026",
    }
    sample_employee_url = f"{settings.EMPLOYEE_PORTAL_URL}/employee-onboarding/sample-preview-token"

    previews = {
        "invited": ("employee_invited.html", {
            **sample_base, "secure_employee_url": sample_employee_url,
        }),
        "submitted": ("employee_submitted.html", {
            **sample_base, **_badge("submitted"),
            "extra_label": "Submitted On", "extra_value": "20 Aug 2026, 03:45 PM",
        }),
        "request_changes": ("employee_request_changes.html", {
            **sample_base, **_badge("action_required"),
            "section": "Bank Details", "field": "IFSC Code",
            "reason": "Incorrect IFSC code provided.",
            "comments": "Please provide the correct SBI branch IFSC code.",
            "secure_employee_url": sample_employee_url,
        }),
        "resubmitted": ("employee_resubmitted.html", {
            **sample_base, **_badge("resubmitted"),
            "extra_label": "Resubmitted On", "extra_value": "21 Aug 2026, 10:15 AM",
        }),
        "approved": ("employee_approved.html", {
            **sample_base, **_badge("approved"),
        }),
    }

    if not template_key:
        links = "".join(f'<li><a href="{key}/">{key}</a></li>' for key in previews)
        return HttpResponse(f"<h1>Employee Onboarding Email Previews</h1><ul>{links}</ul>")

    entry = previews.get(template_key)
    if not entry:
        return HttpResponseNotFound(
            f"Unknown preview key '{template_key}'. Valid keys: {', '.join(previews)}"
        )

    template, context = entry
    return HttpResponse(render_to_string(f"emails/employee_onboarding/{template}", context))
