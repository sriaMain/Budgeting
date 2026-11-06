from rest_framework.permissions import BasePermission

# Roles that manage a project's staffing in bulk (Excel import) - the same roles the Project Details
# page treats as managers (Admin; Manager / Project Manager).
RESOURCE_MANAGER_ROLES = {'admin', 'manager', 'project manager'}


def is_resource_manager(user):
    if not (user and user.is_authenticated):
        return False
    if user.is_superuser:
        return True
    return any(
        (name or '').strip().lower() in RESOURCE_MANAGER_ROLES
        for name in user.roles.values_list('role_name', flat=True)
    )


class CanManageResources(BasePermission):
    message = "Only an Admin, Manager or Project Manager can import resources."

    def has_permission(self, request, view):
        return is_resource_manager(request.user)
