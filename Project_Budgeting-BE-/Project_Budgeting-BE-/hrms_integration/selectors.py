"""Who counts as an "employee" in pickers across the app.

With EMPLOYEES_FROM_HRMS on (the default) employees come from AIRA HRMS, not the old Manage
Users list:
- employee_accounts(): every employee active in HRMS. A Refresh links each one to an Account
  automatically (a no-login record when they have no Budgeting login), so they can be picked as
  a project resource or expense payee without any "Grant access" step.
- login_employee_accounts(): the subset who can actually log in - task assignees need this,
  since they run timers and fill timesheets themselves.
Set EMPLOYEES_FROM_HRMS=false to fall back to every active account (e.g. while the HRMS
connection isn't set up on a server yet).
"""
from django.conf import settings
from django.contrib.auth import get_user_model


def employees_from_hrms():
    return getattr(settings, 'EMPLOYEES_FROM_HRMS', True)


def employee_accounts(queryset=None):
    """Accounts that may be picked as a project resource / expense payee."""
    qs = queryset if queryset is not None else get_user_model().objects.all()
    if employees_from_hrms():
        return qs.filter(hrms_employee__is_active_in_hrms=True)
    return qs.filter(is_active=True)


def login_employee_accounts(queryset=None):
    """Employees who can log in (task assignees)."""
    qs = queryset if queryset is not None else get_user_model().objects.all()
    qs = qs.filter(is_active=True)
    if employees_from_hrms():
        qs = qs.filter(hrms_employee__is_active_in_hrms=True)
    return qs
