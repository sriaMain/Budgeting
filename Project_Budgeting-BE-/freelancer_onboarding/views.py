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

from core.app_constants import CURRENCY_CHOICES
from roles.permission import HasPermissionCode

from .models import Freelancer, FreelancerDocument
from .serializers import (
    FreelancerInviteSerializer, FreelancerSerializer, FreelancerManualCreateSerializer,
    FreelancerAdminUpdateSerializer, FreelancerPublicUpdateSerializer, FreelancerDocumentSerializer,
)
from .services import (
    invite_freelancer, generate_access_token, validate_public_token,
    ensure_onboarding_status, InvalidTokenError,
)
from .tasks import send_freelancer_invited_notification


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _choices_payload():
    return {
        "availabilities": [{"value": k, "label": v} for k, v in Freelancer.AVAILABILITY_CHOICES],
        "currencies": [{"value": k, "label": v} for k, v in CURRENCY_CHOICES],
        "statuses": [{"value": k, "label": v} for k, v in Freelancer.STATUS_CHOICES],
    }


# ===========================================================================
# Admin (JWT-authenticated) endpoints
# ===========================================================================

class FreelancerListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "freelancer_onboarding.view", "POST": "freelancer_onboarding.create"}

    def get(self, request):
        qs = Freelancer.objects.all().order_by("-created_at")

        status_filter = request.GET.get("status")
        search = request.GET.get("search")

        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search))

        return Response(FreelancerSerializer(qs, many=True).data)

    def post(self, request):
        """'Add Manually' - internal user fills the whole profile directly,
        no invitation needed."""
        serializer = FreelancerManualCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        freelancer = serializer.save()
        return Response(FreelancerSerializer(freelancer).data, status=status.HTTP_201_CREATED)


class FreelancerInviteView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.create"

    def post(self, request):
        serializer = FreelancerInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        freelancer, raw_token = invite_freelancer(
            serializer.validated_data["full_name"],
            serializer.validated_data["email"],
            created_by=request.user,
        )

        transaction.on_commit(
            lambda: send_freelancer_invited_notification.delay(freelancer.id, raw_token)
        )

        return Response(FreelancerSerializer(freelancer).data, status=status.HTTP_201_CREATED)


class FreelancerDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {"GET": "freelancer_onboarding.view", "PATCH": "freelancer_onboarding.edit"}

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        return Response(FreelancerSerializer(freelancer).data)

    def patch(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        serializer = FreelancerAdminUpdateSerializer(freelancer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FreelancerSerializer(freelancer).data)


class FreelancerResendInviteView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.create"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if freelancer.status != "invited":
            return Response(
                {"detail": "Only freelancers awaiting their first response can be re-invited."},
                status=400,
            )

        raw_token = generate_access_token(freelancer, created_by=request.user)
        transaction.on_commit(
            lambda: send_freelancer_invited_notification.delay(freelancer.id, raw_token)
        )
        return Response({"detail": "Invitation resent."})


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
        docs = freelancer.documents.all()
        return Response(FreelancerDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        data = request.data.copy()
        data["freelancer"] = freelancer.id
        serializer = FreelancerDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class FreelancerDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.delete"

    def delete(self, request, pk, doc_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.document.view"

    def get(self, request, pk, doc_id):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


# ===========================================================================
# Public (token-authenticated, no login) endpoints
# ===========================================================================

class _FreelancerPublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "freelancer_onboarding_public"

    def get_freelancer(self, request, token):
        try:
            return validate_public_token(
                token,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except InvalidTokenError as exc:
            if exc.reason == "expired":
                raise NotFound(
                    "This freelancer onboarding link has expired. Please contact us to request a new invitation."
                )
            raise NotFound("Invalid or unavailable freelancer onboarding link.")


class FreelancerPublicChoicesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "freelancer_onboarding_public"

    def get(self, request):
        payload = _choices_payload()
        payload.pop("statuses", None)
        return Response(payload)


class FreelancerPublicDetailView(_FreelancerPublicView):
    def get(self, request, token):
        freelancer = self.get_freelancer(request, token)
        return Response(FreelancerSerializer(freelancer).data)


class FreelancerPublicUpdateView(_FreelancerPublicView):
    """Public 'Save & Continue' - one combined endpoint accepting any subset
    of the editable fields, since each section here is only 2-5 fields (no
    need for Vendor onboarding's one-endpoint-per-section split)."""

    def patch(self, request, token):
        freelancer = self.get_freelancer(request, token)
        if freelancer.status == "completed":
            return Response({"detail": "This onboarding has already been submitted."}, status=403)

        serializer = FreelancerPublicUpdateSerializer(freelancer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ensure_onboarding_status(freelancer)
        return Response(FreelancerSerializer(freelancer).data)


class FreelancerPublicDocumentListView(_FreelancerPublicView):
    def get(self, request, token):
        freelancer = self.get_freelancer(request, token)
        docs = freelancer.documents.all()
        return Response(FreelancerDocumentSerializer(docs, many=True, context={"request": request}).data)

    def post(self, request, token):
        freelancer = self.get_freelancer(request, token)
        if not request.FILES.get("file"):
            return Response({"file": ["This field is required."]}, status=400)

        data = request.data.copy()
        data["freelancer"] = freelancer.id
        serializer = FreelancerDocumentSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=400)


class FreelancerPublicDocumentDetailView(_FreelancerPublicView):
    def delete(self, request, token, doc_id):
        freelancer = self.get_freelancer(request, token)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FreelancerPublicDocumentDownloadView(_FreelancerPublicView):
    def get(self, request, token, doc_id):
        freelancer = self.get_freelancer(request, token)
        document = get_object_or_404(FreelancerDocument, pk=doc_id, freelancer=freelancer)

        signed_url, _ = cloudinary.utils.cloudinary_url(
            document.file.public_id,
            resource_type="raw",
            sign_url=True,
            expires_at=int(time.time()) + 300,
        )
        return Response({"file_name": document.file_name, "download_url": signed_url})


class FreelancerPublicSubmitView(_FreelancerPublicView):
    def post(self, request, token):
        freelancer = self.get_freelancer(request, token)
        if not freelancer.full_name or not freelancer.email:
            return Response(
                {"detail": "Full name and email are required before submitting."}, status=400
            )

        freelancer.status = "completed"
        freelancer.save(update_fields=["status"])
        return Response(FreelancerSerializer(freelancer).data)


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

    previews = {
        "invited": ("freelancer_invited.html", {
            "company_name": settings.COMPANY_NAME,
            "company_logo": settings.COMPANY_LOGO_URL,
            "freelancer_name": "David Kumar",
            "freelancer_email": "david.kumar@example.com",
            "secure_freelancer_url": sample_freelancer_url,
        }),
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
