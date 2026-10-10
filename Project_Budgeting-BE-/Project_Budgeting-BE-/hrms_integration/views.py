from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from roles.permission import HasPermissionCode

from .models import HrmsEmployee, HrmsSyncRun
from .serializers import GrantAccessSerializer, HrmsEmployeeSerializer, HrmsSyncRunSerializer
from .services import HrmsAccessError, HrmsSyncInProgress, grant_access, revoke_access, sync_employees


def _employee_queryset():
    return HrmsEmployee.objects.select_related('account', 'access_granted_by').prefetch_related(
        'account__roles', 'account__modules'
    )


def _latest_sync():
    run = HrmsSyncRun.objects.select_related('triggered_by').first()
    return HrmsSyncRunSerializer(run).data if run else None


class HrmsEmployeeListView(APIView):
    """The synced employee list plus the last Refresh result (for the "last refreshed" banner)."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasPermissionCode]
    permission_code = "hrms.employees.view"

    def get(self, request):
        employees = _employee_queryset()
        return Response({
            "employees": HrmsEmployeeSerializer(employees, many=True).data,
            "last_sync": _latest_sync(),
        })


class HrmsSyncView(APIView):
    """The manual Refresh button: re-fetch from HRMS and revoke anyone who has left."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasPermissionCode]
    permission_code = "hrms.employees.sync"

    def post(self, request):
        try:
            run = sync_employees(triggered_by=request.user)
        except HrmsSyncInProgress as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)

        data = HrmsSyncRunSerializer(run).data
        if run.status != 'success':
            return Response({"error": run.error_message, "sync": data}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"message": "Employee list refreshed.", "sync": data})


class HrmsEmployeeAccessView(APIView):
    """POST: mark eligible + set Budgeting roles, module(s) and hourly rate (grant or update). DELETE: revoke access."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasPermissionCode]
    permission_code = "hrms.employees.manage_access"

    def post(self, request, pk):
        employee = get_object_or_404(HrmsEmployee, pk=pk)
        serializer = GrantAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            grant_access(
                employee, data['roles'], granted_by=request.user,
                module_ids=data['modules'], charges_per_hour=data['charges_per_hour'], currency=data['currency'],
            )
        except HrmsAccessError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HrmsEmployeeSerializer(_employee_queryset().get(pk=pk)).data)

    def delete(self, request, pk):
        employee = get_object_or_404(HrmsEmployee, pk=pk)
        revoke_access(employee)
        return Response(HrmsEmployeeSerializer(_employee_queryset().get(pk=pk)).data)
