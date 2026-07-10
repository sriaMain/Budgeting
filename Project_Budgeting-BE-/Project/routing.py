from django.urls import path
from .consumers import TaskTimerConsumer
from notifications.consumers import NotificationConsumer

websocket_urlpatterns = [
    path("ws/timer/", TaskTimerConsumer.as_asgi()),
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]
