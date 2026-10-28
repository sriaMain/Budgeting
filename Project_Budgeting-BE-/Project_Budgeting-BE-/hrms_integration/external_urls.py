from django.urls import path

from .external_api import ProjectAssignmentsView, ResourceAssignmentsView

# Mounted at /api/v1/ - APIs that AIRA HRMS calls on Project Budgeting.
urlpatterns = [
    path('project-assignments/', ProjectAssignmentsView.as_view(), name='aira-project-assignments'),
    path('resource-assignments/', ResourceAssignmentsView.as_view(), name='aira-resource-assignments'),
]
