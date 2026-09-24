


from django.urls import path, include
from .views import (ProjectAPIView, ProjectBudgetAPIView, BudgetLineListCreateAPIView, BudgetLineDetailAPIView,
  BudgetLineSummaryAPIView, MilestoneListCreateAPIView, MilestoneDetailAPIView, MilestoneCreateInvoiceAPIView,
  ResourceAssignmentListCreateAPIView, ResourceAssignmentDetailAPIView, ProjectGenerateTMInvoiceAPIView,
  ProjectFinancialSummaryAPIView, StopTaskTimerAPIView, TaskAPIView, TaskTimerStateAPIView,
 TimesheetAPIView, TimesheetEntryAPIView, SubmitTimesheetAPIView, StartTaskTimerAPIView,
  PauseTaskTimerAPIView, PendingExtraHoursAPIView, ReviewExtraHoursAPIView, RequestExtraHoursAPIView, ExtraHoursHistoryAPIView,
  TaskStatusChoicesView, ServiceUsersAPIView, TaskGroupedByStatusAPIView, TimesheetWeeklySummaryAPIView, TimesheetEmployeeAPIView, ProjectStatusChoicesView, ProjectNamesAPIView,
  MyTaskExtrasAPIView, MyActiveTimerAPIView, ProjectManagerOptionsAPIView, ProjectPOCOptionsAPIView)


urlpatterns = [
    path('projects/', ProjectAPIView.as_view(), name='project-list-create'),
    path('projects/<int:project_id>/', ProjectAPIView.as_view(), name='project-detail'),
    path('projects/<int:project_no>/budget/', ProjectBudgetAPIView.as_view(), name='project-budget-detail'),
    path('budgets/<int:project_no>/', ProjectBudgetAPIView.as_view(), name='project-budget-detail-by-id'),
    path('budgets/', ProjectBudgetAPIView.as_view(), name='project-budget-list-create'),
    path('projects/<int:project_id>/budget/', ProjectBudgetAPIView.as_view()),

    # GL Account budget lines (Description / GL Account / Planned / Actual / Variance)
    path('projects/<int:project_no>/budget/lines/', BudgetLineListCreateAPIView.as_view(), name='project-budget-line-list-create'),
    path('projects/<int:project_no>/budget/lines/<int:line_id>/', BudgetLineDetailAPIView.as_view(), name='project-budget-line-detail'),
    path('budget-lines/summary/', BudgetLineSummaryAPIView.as_view(), name='budget-line-summary'),

    # Project Types and Project Financial Management
    path('projects/<int:project_no>/milestones/', MilestoneListCreateAPIView.as_view(), name='project-milestone-list-create'),
    path('projects/<int:project_no>/milestones/<int:milestone_id>/', MilestoneDetailAPIView.as_view(), name='project-milestone-detail'),
    path('projects/<int:project_no>/milestones/<int:milestone_id>/create-invoice/', MilestoneCreateInvoiceAPIView.as_view(), name='project-milestone-create-invoice'),
    path('projects/<int:project_no>/resources/', ResourceAssignmentListCreateAPIView.as_view(), name='project-resource-list-create'),
    path('projects/<int:project_no>/resources/<int:assignment_id>/', ResourceAssignmentDetailAPIView.as_view(), name='project-resource-detail'),
    path('projects/<int:project_no>/generate-tm-invoice/', ProjectGenerateTMInvoiceAPIView.as_view(), name='project-generate-tm-invoice'),
    path('projects/<int:project_no>/financial-summary/', ProjectFinancialSummaryAPIView.as_view(), name='project-financial-summary'),

    path('tasks/<int:project_id>/tasks/', TaskAPIView.as_view(), name='project-tasks-list'),  #project related tasks
    path('tasks/', TaskAPIView.as_view(), name='task-list-create'),
    path('services/users/', ServiceUsersAPIView.as_view(), name='service-users-list'),
    path('tasks/<int:task_id>/', TaskAPIView.as_view(), name='task-detail'),
    path('timesheet/', TimesheetAPIView.as_view(), name='timesheet-list-create'),
    path('timesheet/entry/', TimesheetEntryAPIView.as_view(), name='timesheet-entry-list-create'),
    path('timesheet/submit/', SubmitTimesheetAPIView.as_view(), name='submit-timesheet'),
    path("tasks/<int:task_id>/timer/start/",StartTaskTimerAPIView.as_view()),#start task timer
    path("tasks/<int:task_id>/timer/pause/", PauseTaskTimerAPIView.as_view()), #pause task timer
    path("tasks/<int:task_id>/extra-hours/request/", RequestExtraHoursAPIView.as_view()), #request extra hours
    path("tasks/extra-hours/pending/",  PendingExtraHoursAPIView.as_view()), #view pending extra hours requests
    path("tasks/extra-hours/history/",  ExtraHoursHistoryAPIView.as_view()), #view approved/rejected extra hours requests
    path("tasks/extra-hours/<request_id>/review/", ReviewExtraHoursAPIView.as_view()), #review extra hours requests
    path('task-status-choices/', TaskStatusChoicesView.as_view(), name='task-status-choices'), #get task status choices
    path('project-status-choices/', ProjectStatusChoicesView.as_view(), name='project-status-choices'),
    path('project-names/', ProjectNamesAPIView.as_view(), name='project-names'),
    path('projects/project-managers/', ProjectManagerOptionsAPIView.as_view(), name='project-manager-options'),
    path('projects/poc-options/', ProjectPOCOptionsAPIView.as_view(), name='project-poc-options'),
    path('tasks/grouped-by-status/', TaskGroupedByStatusAPIView.as_view(), name='tasks-grouped-by-status'),
    path("tasks/<int:task_id>/timer/state/",TaskTimerStateAPIView.as_view(),name="task-timer-state"),


    path("tasks/grouped-by-status/", TaskGroupedByStatusAPIView.as_view(), name="task-status-grouped"),


    path("tasks/<int:task_id>/timer/stop/", StopTaskTimerAPIView.as_view(), name="task-timer-stop"),
    path('timesheet/weekly-summary/', TimesheetWeeklySummaryAPIView.as_view(), name='timesheet-weekly-summary'),
    path('timesheet/employee/<int:user_id>/', TimesheetEmployeeAPIView.as_view(), name='timesheet-employee'),
    path('tasks/my-extras/', MyTaskExtrasAPIView.as_view(), name='my-task-extras'),
    path('tasks/my-active-timer/', MyActiveTimerAPIView.as_view(), name='my-active-timer'),

]