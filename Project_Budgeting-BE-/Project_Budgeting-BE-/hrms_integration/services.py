"""HRMS employee sync and Budgeting access management.

Rules (from the HRMS integration contract):
  1. HRMS only returns active employees - an exited one is absent, not flagged.
  2. Absent from a fresh fetch == deactivated: access is revoked automatically.
  3. Eligibility and Budgeting roles are managed only here, never in HRMS.
  4. Sync runs only when an admin clicks Refresh - no polling.
  5. Login stays Budgeting's own (Account + password); HRMS is not involved.
"""
import logging
import secrets
import string
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from accounts.models import Account
from product_group.models import Product_Services
from roles.models import Role

from .client import HrmsError, fetch_active_employees
from .models import HrmsEmployee, HrmsSyncRun

logger = logging.getLogger(__name__)

# A run left in 'running' longer than this (e.g. the worker was killed) no
# longer blocks a new Refresh.
STALE_RUN_AFTER = timedelta(minutes=5)

SYNCED_FIELDS = ('full_name', 'email', 'department', 'designation', 'hrms_role', 'branch')


class HrmsAccessError(Exception):
    """A grant/revoke request that can't be applied. The message is safe to show an admin."""


class HrmsSyncInProgress(Exception):
    pass


def _clean(value):
    return (value or '').strip() if isinstance(value, str) else ''


def _normalize(record):
    """Maps one HRMS record onto HrmsEmployee fields, or raises HrmsError if unusable."""
    employee_id = _clean(record.get('employee_id')) if isinstance(record, dict) else ''
    if not employee_id:
        # Can't match this person to a local row - aborting is safer than
        # silently treating them as "missing" and revoking their access.
        raise HrmsError("HRMS returned an employee without an employee_id; sync aborted.")
    return employee_id, {
        'full_name': _clean(record.get('full_name')),
        'email': _clean(record.get('email')).lower(),
        'department': _clean(record.get('department')),
        'designation': _clean(record.get('designation')),
        'hrms_role': _clean(record.get('role')),
        'branch': _clean(record.get('branch')),
    }


def _invalidate_user_caches(account):
    account.clear_permission_cache()
    try:
        cache.delete("users_list")
    except Exception as exc:
        logger.warning(f"Failed to delete users_list cache: {exc}")


def _revoke(employee, reason, now):
    """Removes Budgeting access: account deactivated (blocks login and every
    JWT-authenticated request immediately) and its roles cleared, so access
    is never silently restored if the account is re-enabled later."""
    account = employee.account
    if account is not None:
        account.is_active = False
        account.is_staff = False
        account.save(update_fields=['is_active', 'is_staff', 'modified_at'])
        account.roles.clear()
        _invalidate_user_caches(account)

    employee.is_eligible = False
    employee.access_revoked_at = now
    employee.access_revoked_reason = reason
    employee.save(update_fields=['is_eligible', 'access_revoked_at', 'access_revoked_reason', 'updated_at'])


def sync_employees(triggered_by):
    """Re-fetches the HRMS employee list and re-applies the revocation rule.

    Returns the finished HrmsSyncRun (status 'success' or 'failed').
    Raises HrmsSyncInProgress if another Refresh is already running.
    """
    with transaction.atomic():
        running = HrmsSyncRun.objects.select_for_update().filter(
            status='running', started_at__gte=timezone.now() - STALE_RUN_AFTER
        )
        if running.exists():
            raise HrmsSyncInProgress("A refresh is already in progress. Please wait for it to finish.")
        run = HrmsSyncRun.objects.create(triggered_by=triggered_by)

    try:
        records = fetch_active_employees()
        incoming = {}
        for record in records:
            if isinstance(record, dict) and record.get('is_active') is False:
                continue  # Contract says this never happens; treat it as absent if it does.
            employee_id, fields = _normalize(record)
            incoming[employee_id] = fields
        run.fetched_count = len(incoming)

        if not incoming and HrmsEmployee.objects.filter(is_active_in_hrms=True).exists():
            # An empty list almost certainly means an HRMS-side problem, and
            # applying it would lock out every HRMS-linked user at once.
            raise HrmsError(
                "HRMS returned no active employees. No changes were made - "
                "confirm with the HRMS team before refreshing again."
            )

        now = timezone.now()
        with transaction.atomic():
            existing = {e.employee_id: e for e in HrmsEmployee.objects.select_for_update()}

            for employee_id, fields in incoming.items():
                employee = existing.get(employee_id)
                if employee is None:
                    HrmsEmployee.objects.create(employee_id=employee_id, last_seen_at=now, **fields)
                    run.created_count += 1
                    continue

                changed = [f for f in SYNCED_FIELDS if getattr(employee, f) != fields[f]]
                for f in changed:
                    setattr(employee, f, fields[f])
                if not employee.is_active_in_hrms:
                    # Back in HRMS - listed again, but access is NOT restored
                    # automatically; an admin has to grant it again.
                    employee.is_active_in_hrms = True
                    employee.removed_from_hrms_at = None
                    changed += ['is_active_in_hrms', 'removed_from_hrms_at']
                    run.returned_count += 1
                elif changed:
                    run.updated_count += 1
                employee.last_seen_at = now
                employee.save(update_fields=changed + ['last_seen_at', 'updated_at'])

            newly_missing = HrmsEmployee.objects.filter(is_active_in_hrms=True).exclude(
                employee_id__in=incoming.keys()
            )
            run.removed_count = newly_missing.update(is_active_in_hrms=False, removed_from_hrms_at=now)

            # Every absent employee who still has any access loses it - this
            # also catches an account someone re-enabled by hand since the
            # last Refresh.
            to_revoke = (
                HrmsEmployee.objects.filter(is_active_in_hrms=False)
                .filter(Q(is_eligible=True) | Q(account__is_active=True))
                .select_related('account')
            )
            for employee in to_revoke:
                _revoke(employee, 'hrms_missing', now)
                run.access_revoked_count += 1

            run.status = 'success'
            run.finished_at = timezone.now()
            run.save()

    except HrmsError as exc:
        run.status = 'failed'
        run.error_message = str(exc)
        run.finished_at = timezone.now()
        run.save()
    except Exception:
        logger.exception("HRMS sync #%s crashed", run.pk)
        # The atomic block rolled back, so the partial counts are meaningless.
        run.created_count = run.updated_count = run.returned_count = 0
        run.removed_count = run.access_revoked_count = 0
        run.status = 'failed'
        run.error_message = "Unexpected error during refresh. No changes were applied."
        run.finished_at = timezone.now()
        run.save()

    logger.info(
        "HRMS sync #%s %s: fetched=%s created=%s updated=%s returned=%s removed=%s revoked=%s",
        run.pk, run.status, run.fetched_count, run.created_count, run.updated_count,
        run.returned_count, run.removed_count, run.access_revoked_count,
    )
    return run


def _unique_username(email):
    base = ''.join(c for c in email.split('@')[0].lower() if c.isalnum() or c in '._-') or 'employee'
    username, counter = base, 1
    while Account.objects.filter(username=username).exists():
        username = f"{base}{counter}"
        counter += 1
    return username


def _send_account_created_email(employee, account, password):
    context = {
        "company_name": settings.COMPANY_NAME,
        "company_logo": settings.COMPANY_LOGO_URL,
        "company_email": settings.COMPANY_EMAIL,
        "company_phone": settings.COMPANY_PHONE,
        "company_website": settings.COMPANY_WEBSITE,
        "employee_name": account.get_full_name() or account.username,
        "employee_id": employee.employee_id,
        "position": account.position,
        "department": employee.department,
        "username_or_email": account.email or account.username,
        "temporary_password": password,
        "production_login_url": settings.EMPLOYEE_PORTAL_URL,
    }
    html_message = render_to_string("emails/accounts/employee_account_created.html", context)
    email = EmailMultiAlternatives(
        subject=f"Welcome to {settings.COMPANY_NAME} – Your Employee Account Details",
        body=strip_tags(html_message),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[account.email],
    )
    email.attach_alternative(html_message, "text/html")
    try:
        email.send(fail_silently=False)
    except Exception as mail_err:
        # Access is already granted; a mail failure shouldn't undo it.
        logger.warning(f"Failed to send welcome email to {account.email}: {mail_err}")


def grant_access(employee, role_ids, granted_by, module_ids, charges_per_hour, currency='INR'):
    """Marks an HRMS employee eligible and sets their Budgeting roles, module(s) and
    hourly cost rate - the Budgeting-only fields HRMS doesn't provide.

    Links to an existing Account with the same email, or creates one (with a
    temporary password emailed to them). Calling it again replaces the roles,
    modules and rate. Returns the Account.
    """
    if not employee.is_active_in_hrms:
        raise HrmsAccessError("This employee is no longer active in HRMS, so access can't be granted.")
    if not employee.email:
        raise HrmsAccessError("This employee has no email in HRMS; an email is needed for Budgeting login.")

    roles = list(Role.objects.filter(id__in=set(role_ids)))
    if not roles or len(roles) != len(set(role_ids)):
        raise HrmsAccessError("Select at least one valid role.")
    inactive = [r.role_name for r in roles if not r.is_active]
    if inactive:
        raise HrmsAccessError(f"Inactive roles cannot be assigned: {', '.join(inactive)}.")

    modules = list(Product_Services.objects.filter(id__in=set(module_ids)))
    if not modules or len(modules) != len(set(module_ids)):
        raise HrmsAccessError("Select at least one valid module.")
    inactive_modules = [m.product_service_name for m in modules if not m.is_active]
    if inactive_modules:
        raise HrmsAccessError(f"Inactive modules cannot be assigned: {', '.join(inactive_modules)}.")

    new_password = None
    with transaction.atomic():
        employee = HrmsEmployee.objects.select_for_update().select_related('account').get(pk=employee.pk)
        account = employee.account
        if account is None:
            account = Account.objects.filter(email__iexact=employee.email).first()
            if account is not None:
                if account.is_superuser:
                    raise HrmsAccessError("A superuser account uses this email; superusers are managed outside HRMS.")
                if HrmsEmployee.objects.filter(account=account).exclude(pk=employee.pk).exists():
                    raise HrmsAccessError("This email's Budgeting account is already linked to another HRMS employee.")

        if account is None:
            first_name, _, last_name = employee.full_name.partition(' ')
            new_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
            account = Account.objects.create_user(
                username=_unique_username(employee.email),
                email=employee.email,
                password=new_password,
                first_name=first_name[:150],
                last_name=last_name.strip()[:150],
                position=employee.designation[:100],
            )

        account.is_active = True
        account.is_staff = any(role.role_name == "Admin" for role in roles)
        account.charges_per_hour = charges_per_hour
        account.currency = currency
        account.save(update_fields=['is_active', 'is_staff', 'charges_per_hour', 'currency', 'modified_at'])
        account.roles.set(roles)
        account.modules.set(modules)
        _invalidate_user_caches(account)

        employee.account = account
        employee.is_eligible = True
        employee.access_granted_at = timezone.now()
        employee.access_granted_by = granted_by
        employee.access_revoked_at = None
        employee.access_revoked_reason = ''
        employee.save()

    if new_password:
        _send_account_created_email(employee, account, new_password)
    return account


def revoke_access(employee):
    with transaction.atomic():
        employee = HrmsEmployee.objects.select_for_update().select_related('account').get(pk=employee.pk)
        _revoke(employee, 'manual', timezone.now())
    return employee
