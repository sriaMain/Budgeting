from django.urls import path

from .views import HrmsEmployeeAccessView, HrmsEmployeeListView, HrmsSyncView

urlpatterns = [
    path('employees/', HrmsEmployeeListView.as_view(), name='hrms-employee-list'),
    path('employees/sync/', HrmsSyncView.as_view(), name='hrms-employee-sync'),
    path('employees/<int:pk>/access/', HrmsEmployeeAccessView.as_view(), name='hrms-employee-access'),
]
