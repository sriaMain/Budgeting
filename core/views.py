import logging

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import CallCenter, ProfitCenter, GLAccount, Notification
from .serializers import CallCenterSerializer, ProfitCenterSerializer, GLAccountSerializer, NotificationSerializer
from .email_service import send_email

logger = logging.getLogger("core.email")


class MasterDataListCreateView(APIView):
    """Shared list/create/update/delete behaviour for the small lookup
    tables (Call Center, Profit Center, GL Account) used on Project and
    Pipeline forms. Subclasses only need to set `model` and `serializer_class`."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    model = None
    serializer_class = None

    def get(self, request, pk=None):
        if pk is not None:
            try:
                instance = self.model.objects.get(pk=pk)
            except self.model.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response(self.serializer_class(instance).data)

        active_only = request.query_params.get("active_only")
        queryset = self.model.objects.all()
        if active_only and active_only.lower() != "false":
            queryset = queryset.filter(is_active=True)

        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        try:
            instance = self.model.objects.get(pk=pk)
        except self.model.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.serializer_class(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            instance = self.model.objects.get(pk=pk)
        except self.model.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CallCenterListCreateView(MasterDataListCreateView):
    model = CallCenter
    serializer_class = CallCenterSerializer


class ProfitCenterListCreateView(MasterDataListCreateView):
    model = ProfitCenter
    serializer_class = ProfitCenterSerializer


class GLAccountListCreateView(MasterDataListCreateView):
    model = GLAccount
    serializer_class = GLAccountSerializer


class TestEmailAPIView(APIView):
    """
    API point for the configured email backend (see core/email_service.py
    and EMAIL_BACKEND/EMAIL_HOST_* in settings.py - currently plain SMTP).

    GET  -> which email backend is currently active.
    POST -> actually sends a test email through that backend, so delivery
            can be confirmed end-to-end without needing to trigger a real
            onboarding/invoice/invite email.
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        return Response({
            "email_backend": settings.EMAIL_BACKEND,
            "default_from_email": settings.DEFAULT_FROM_EMAIL,
        })

    def post(self, request):
        to = request.data.get("to") or getattr(request.user, "email", None)
        if not to:
            return Response(
                {"error": "No recipient email - pass \"to\" in the request body, or set an email on your account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        company_name = getattr(settings, "COMPANY_NAME", "the app")
        try:
            send_email(
                to=to,
                subject=f"Test email from {company_name}",
                html=(
                    "<p>This is a test email confirming the configured email "
                    f"backend ({settings.EMAIL_BACKEND}) is working.</p>"
                ),
            )
        except Exception as exc:
            logger.exception("Test email failed | to=%s", to)
            return Response(
                {"error": "Failed to send test email.", "detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY
            )

        return Response({
            "message": "Test email sent.",
            "to": to,
            "email_backend": settings.EMAIL_BACKEND,
        }, status=status.HTTP_200_OK)


class NotificationListAPIView(APIView):
    """
    The header bell's data source. Notifications are created by
    core.notifications.notify() at the same trigger points the app's
    existing email tasks fire from (vendor approvals, task assignment, etc.)
    - see core/notifications.py.

    GET /notifications/?unread_only=true&limit=20
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        queryset = Notification.objects.filter(recipient=request.user)
        if str(request.query_params.get("unread_only", "")).lower() == "true":
            queryset = queryset.filter(is_read=False)

        return Response({
            "results": NotificationSerializer(queryset[:limit], many=True).data,
            "unread_count": Notification.objects.filter(recipient=request.user, is_read=False).count(),
        })


class NotificationMarkReadAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request, pk):
        updated = Notification.objects.filter(pk=pk, recipient=request.user).update(is_read=True)
        if not updated:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Marked as read."})


class NotificationMarkAllReadAPIView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"message": "All notifications marked as read."})
