from django.urls import path
from .views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    NotificationDeleteView,
    NotificationClearAllView,
)

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    path('notifications/read-all/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('notifications/<int:pk>/', NotificationDeleteView.as_view(), name='notification-delete'),
    path('notifications/clear-all/', NotificationClearAllView.as_view(), name='notification-clear-all'),
]
