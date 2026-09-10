import time
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import cloudinary.utils
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.app_constants import CURRENCY_CHOICES
from roles.permission import HasPermissionCode

from .models import (
    Freelancer, FreelancerDocument, FreelancerRateCard, FreelancerContract,
    FreelancerProjectAssignment, FreelancerTaskAssignment, FreelancerTimeEntry,
    FreelancerBankDetail,
)
from .serializers import (
    FreelancerInviteSerializer, FreelancerSerializer, FreelancerManualCreateSerializer,
    FreelancerAdminUpdateSerializer, FreelancerPublicUpdateSerializer, FreelancerDocumentSerializer,
    FreelancerRateCardSerializer, FreelancerContractSerializer, FreelancerProjectAssignmentSerializer,
    FreelancerTaskAssignmentSerializer, FreelancerTimeEntrySerializer,
    FreelancerBankDetailSerializer, FreelancerBankDetailUnmaskedSerializer,
    FreelancerBankDetailPublicSerializer,
)
from .services import (
    invite_freelancer, generate_access_token, validate_public_token,
    ensure_onboarding_status, InvalidTokenError, check_freelancer_capacity,
    submit_time_entry, approve_time_entry, reject_time_entry,
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
        "pricing_models": [{"value": k, "label": v} for k, v in FreelancerRateCard.PRICING_MODEL_CHOICES],
        "contract_types": [{"value": k, "label": v} for k, v in FreelancerContract.CONTRACT_TYPE_CHOICES],
        "contract_statuses": [{"value": k, "label": v} for k, v in FreelancerContract.STATUS_CHOICES],
        "assignment_statuses": [{"value": k, "label": v} for k, v in FreelancerProjectAssignment.STATUS_CHOICES],
        "task_assignment_statuses": [{"value": k, "label": v} for k, v in FreelancerTaskAssignment.STATUS_CHOICES],
        "time_entry_statuses": [{"value": k, "label": v} for k, v in FreelancerTimeEntry.STATUS_CHOICES],
        "bank_payment_methods": [{"value": k, "label": v} for k, v in FreelancerBankDetail.PAYMENT_METHOD_CHOICES],
        "bank_payment_statuses": [{"value": k, "label": v} for k, v in FreelancerBankDetail.PAYMENT_STATUS_CHOICES],
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
        archived = request.GET.get("archived")

        # Archived freelancers are hidden from the default list/tabs - pass
        # archived=true to see only archived ones, or archived=all for both.
        if archived == "true":
            qs = qs.filter(is_archived=True)
        elif archived != "all":
            qs = qs.filter(is_archived=False)

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
        return Response(FreelancerSerializer(freelancer).data)


class FreelancerUnarchiveView(APIView):
    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_code = "freelancer_onboarding.archive"

    def post(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        freelancer.is_archived = False
        freelancer.save(update_fields=["is_archived"])
        return Response(FreelancerSerializer(freelancer).data)


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
        serializer.save(created_by=request.user)
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
        serializer = FreelancerRateCardSerializer(card, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
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
        assignment.delete()
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
    """A single admin-editable KYC/banking record per freelancer (create-or-
    update via PATCH, same as VendorBankDetailStepView) - always returns the
    masked account number, never the raw one."""

    permission_classes = [IsAuthenticated, HasPermissionCode]
    authentication_classes = [JWTAuthentication]
    permission_map = {
        "GET": "freelancer_onboarding.bank_detail.view",
        "PATCH": "freelancer_onboarding.bank_detail.edit",
    }

    def get(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        bank = getattr(freelancer, "bank_detail", None)
        if not bank:
            return Response(None)
        return Response(FreelancerBankDetailSerializer(bank).data)

    def patch(self, request, pk):
        freelancer = get_object_or_404(Freelancer, pk=pk)
        instance = getattr(freelancer, "bank_detail", None)
        serializer = FreelancerBankDetailSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(freelancer=freelancer)
        return Response(serializer.data)


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
        bank = getattr(freelancer, "bank_detail", None)
        if not bank:
            return Response({"detail": "No bank details on file."}, status=404)
        return Response(FreelancerBankDetailUnmaskedSerializer(bank).data)


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


class FreelancerPublicBankDetailView(_FreelancerPublicView):
    """Public 'Save & Continue' counterpart to FreelancerBankDetailView -
    lets the freelancer fill in their own KYC/banking details via the secure
    link, always returning the masked account number, never the raw one."""

    def get(self, request, token):
        freelancer = self.get_freelancer(request, token)
        bank = getattr(freelancer, "bank_detail", None)
        if not bank:
            return Response(None)
        return Response(FreelancerBankDetailPublicSerializer(bank).data)

    def patch(self, request, token):
        freelancer = self.get_freelancer(request, token)
        if freelancer.status == "completed":
            return Response({"detail": "This onboarding has already been submitted."}, status=403)
        instance = getattr(freelancer, "bank_detail", None)
        serializer = FreelancerBankDetailPublicSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(freelancer=freelancer)
        return Response(serializer.data)


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
            "company_email": settings.COMPANY_EMAIL,
            "freelancer_name": "David Kumar",
            "freelancer_email": "david.kumar@example.com",
            "secure_freelancer_url": sample_freelancer_url,
            "token_expires_at": timezone.now() + timedelta(days=settings.FREELANCER_ONBOARDING_TOKEN_TTL_DAYS),
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
