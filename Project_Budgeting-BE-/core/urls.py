from django.urls import path
from .views import (
    CallCenterListCreateView, ProfitCenterListCreateView, GLAccountListCreateView,
    TestEmailAPIView, NotificationListAPIView, NotificationMarkReadAPIView,
    NotificationMarkAllReadAPIView,
)

urlpatterns = [
    path("call-centers/", CallCenterListCreateView.as_view(), name="call-center-list-create"),
    path("call-centers/<int:pk>/", CallCenterListCreateView.as_view(), name="call-center-detail"),

    path("profit-centers/", ProfitCenterListCreateView.as_view(), name="profit-center-list-create"),
    path("profit-centers/<int:pk>/", ProfitCenterListCreateView.as_view(), name="profit-center-detail"),

    path("gl-accounts/", GLAccountListCreateView.as_view(), name="gl-account-list-create"),
    path("gl-accounts/<int:pk>/", GLAccountListCreateView.as_view(), name="gl-account-detail"),

    # GET -> which email backend is active (SMTP vs console).
    # POST -> send a real test email through it.
    path("test-email/", TestEmailAPIView.as_view(), name="test-email"),

    # Header bell notifications
    path("notifications/", NotificationListAPIView.as_view(), name="notification-list"),
    path("notifications/<int:pk>/read/", NotificationMarkReadAPIView.as_view(), name="notification-mark-read"),
    path("notifications/mark-all-read/", NotificationMarkAllReadAPIView.as_view(), name="notification-mark-all-read"),
]
