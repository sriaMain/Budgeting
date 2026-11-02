from django.urls import path

from .external_api import HelpdeskProjectsView

# Mounted at /api/v1/ - APIs the helpdesk application calls on Project Budgeting.
urlpatterns = [
    path('projects/', HelpdeskProjectsView.as_view(), name='helpdesk-projects'),
]
