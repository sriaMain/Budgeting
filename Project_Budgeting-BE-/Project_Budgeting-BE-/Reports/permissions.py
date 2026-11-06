from rest_framework.permissions import BasePermission

# Same people the frontend shows the Reports page to (auth/authThunk.ts normalizeRole: Admin -> admin,
# Manager / Project Manager -> manager); everyone else gets 403 from the financial report APIs.
REPORT_ROLES = {'admin', 'manager', 'project manager'}


class CanViewReports(BasePermission):
    message = "You don't have permission to view financial reports."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        return any((name or '').strip().lower() in REPORT_ROLES
                   for name in user.roles.values_list('role_name', flat=True))
