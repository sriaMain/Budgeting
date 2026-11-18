from django.urls import path

from .external_api import (HelpdeskProjectMilestonesView, HelpdeskProjectResourcesView, HelpdeskProjectsView,
                           HelpdeskProjectTasksView, HelpdeskTasksView)

# Mounted at /api/v1/ - APIs the helpdesk application calls on Project Budgeting.
urlpatterns = [
    path('projects/', HelpdeskProjectsView.as_view(), name='helpdesk-projects'),
    path('projects/<int:project_id>/milestones/', HelpdeskProjectMilestonesView.as_view(), name='helpdesk-project-milestones'),
    path('projects/<int:project_id>/resources/', HelpdeskProjectResourcesView.as_view(), name='helpdesk-project-resources'),
    path('projects/<int:project_id>/tasks/', HelpdeskProjectTasksView.as_view(), name='helpdesk-project-tasks'),
    path('tasks/', HelpdeskTasksView.as_view(), name='helpdesk-tasks-feed'),
]
