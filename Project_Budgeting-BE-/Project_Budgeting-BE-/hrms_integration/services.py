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
from django.utils.dateparse import parse_date, parse_datetime
from django.utils.html import strip_tags

from accounts.models import Account
from product_group.models import Product_Services
from roles.models import Role

from .client import HrmsError, HrmsNotFound, fetch_active_employees, fetch_employee
from .models import HrmsEmployee, HrmsSyncRun

logger = logging.getLogger(__name__)

# A run left in 'running' longer than this (e.g. the worker was killed) no
# longer blocks a new Refresh.
STALE_RUN_AFTER = timedelta(minutes=5)

SYNCED_FIELDS = (
    'full_name', 'email', 'department', 'designation', 'hrms_role', 'branch',
    'first_name', 'middle_name', 'last_name', 'phone', 'reporting_manager_employee_id',
    'date_of_joining', 'exit_date', 'employment_type', 'hrms_updated_at',
)


class HrmsAccessError(Exception):
    """A grant/revoke request that can't be applied. The message is safe to show an admin."""


class HrmsSyncInProgress(Exception):
    pass


def _clean(value):
    return (value or '').strip() if isinstance(value, str) else ''


def _date(value):
    try:
        return parse_date(value) if isinstance(value, str) and value else None
    except ValueError:
        return None


def _datetime(value):
    try:
        return parse_datetime(value) if isinstance(value, str) and value else None
    except ValueError:
        return None


def _normalize(record):
    """Maps one HRMS record onto HrmsEmployee fields, or raises HrmsError if unusable.

    Accepts the AIRA v2 fields (first/middle/last name, phone, reporting manager, joining /
    exit dates, employment type, updated_at) and still works with the original v1 payload
    (full_name only)."""
    employee_id = _clean(record.get('employee_id')) if isinstance(record, dict) else ''
    if not employee_id:
        # Can't match this person to a local row - aborting is safer than
        # silently treating them as "missing" and revoking their access.
        raise HrmsError("HRMS returned an employee without an employee_id; sync aborted.")

    first, middle, last = (_clean(record.get(k)) for k in ('first_name', 'middle_name', 'last_name'))
    full_name = _clean(record.get('full_name')) or ' '.join(p for p in (first, middle, last) if p)
    if not first and full_name:
        # v1 payload: derive the parts from the full name.
        first, _, rest = full_name.partition(' ')
        last = rest.rsplit(' ', 1)[-1] if rest else ''
        middle = rest.rsplit(' ', 1)[0] if ' ' in rest else ''

    return employee_id, {
        'full_name': full_name,
        'email': _clean(record.get('email')).lower(),
        'department': _clean(record.get('department')),
        'designation': _clean(record.get('designation')),
        'hrms_role': _clean(record.get('role')),
        'branch': _clean(record.get('branch')) or _clean(record.get('location')),
        'first_name': first[:150],
        'middle_name': middle[:150],
        'last_name': last[:150],
        'phone': _clean(record.get('phone'))[:30],
        'reporting_manager_employee_id': _clean(record.get('reporting_manager_employee_id'))[:50],
        'date_of_joining': _date(record.get('date_of_joining')),
        'exit_date': _date(record.get('exit_date')),
        'employment_type': _clean(record.get('employment_type'))[:30],
        'hrms_updated_at': _datetime(record.get('updated_at')),
    }


def _sync_account_profile(employee):
    """AIRA is the source of truth for who an employee is: a linked Budgeting account follows
    its name, position and (when no other account already uses it) email, so every screen
    that shows the user shows AIRA's data. Roles, modules and the hourly rate stay Budgeting's."""
    account = employee.account
    if account is None:
        return
    updates = {}
    first = (employee.first_name or employee.full_name.partition(' ')[0])[:150]
    last = (employee.last_name if employee.first_name else employee.full_name.partition(' ')[2].strip())[:150]
    if first and account.first_name != first:
        updates['first_name'] = first
    if account.last_name != last and (first or last):
        updates['last_name'] = last
    position = employee.designation[:100]
    if position and account.position != position:
        updates['position'] = position
    email = employee.email
    if email and (account.email or '').lower() != email:
        if not Account.objects.filter(email__iexact=email).exclude(pk=account.pk).exists():
            updates['email'] = email
        else:
            logger.warning("HRMS employee %s: new email is used by another account; kept the old one", employee.employee_id)
    if updates:
        for field, value in updates.items():
            setattr(account, field, value)
        account.save(update_fields=list(updates) + ['modified_at'])
        _invalidate_user_caches(account)


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


def sync_if_due(triggered_by=None, min_interval=None):
    """Automatic pull from AIRA (HRMS Employees tab opened, or the scheduled task) - there is
    no Refresh button any more.

    Skips the call when a pull started less than `min_interval` ago (success or failure), so
    opening the tab repeatedly or AIRA being down doesn't burn AIRA's 120 requests/hour.
    Returns (run, ran): the latest HrmsSyncRun and whether this call pulled from AIRA.
    """
    min_interval = min_interval or timedelta(seconds=settings.HRMS_AUTO_SYNC_MIN_INTERVAL_SECONDS)
    latest = HrmsSyncRun.objects.order_by('-started_at').first()
    if latest and timezone.now() - latest.started_at < min_interval:
        return latest, False
    try:
        return sync_employees(triggered_by), True
    except HrmsSyncInProgress:
        return HrmsSyncRun.objects.order_by('-started_at').first(), False


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
            existing = {e.employee_id: e for e in HrmsEmployee.objects.select_for_update(of=('self',)).select_related('account')}

            for employee_id, fields in incoming.items():
                employee = existing.get(employee_id)
                if employee is None:
                    employee = HrmsEmployee.objects.create(employee_id=employee_id, last_seen_at=now, **fields)
                    _ensure_resource_account(employee)
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
                if changed and employee.account_id:
                    _sync_account_profile(employee)
                _ensure_resource_account(employee)

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


def _ensure_resource_account(employee):
    """Gives an active AIRA employee a linked Account so they can be picked as a project
    resource / expense payee straight away - no "Grant access" step.

    Reuses the Account with the same email when there is one; otherwise creates one with
    NO login (inactive, unusable password, no roles, nothing emailed). Superuser accounts
    and accounts already linked to another HRMS employee are left alone.
    """
    if employee.account_id or not employee.is_active_in_hrms:
        return
    account = None
    if employee.email:
        account = Account.objects.filter(email__iexact=employee.email).first()
        if account is not None and (
            account.is_superuser
            or HrmsEmployee.objects.filter(account=account).exclude(pk=employee.pk).exists()
        ):
            logger.warning("HRMS employee %s: email belongs to an account that can't be linked", employee.employee_id)
            return
    if account is None:
        if employee.first_name:
            first_name, last_name = employee.first_name, employee.last_name
        else:
            first_name, _, last_name = employee.full_name.partition(' ')
        account = Account(
            username=_unique_username(employee.email or employee.employee_id),
            email=employee.email or None,
            first_name=first_name[:150],
            last_name=last_name.strip()[:150],
            position=employee.designation[:100],
            is_active=False,  # resource record only - no Budgeting login
        )
        account.set_unusable_password()
        account.save()
        _invalidate_user_caches(account)
    employee.account = account
    employee.save(update_fields=['account', 'updated_at'])


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
        employee = HrmsEmployee.objects.select_for_update(of=('self',)).select_related('account').get(pk=employee.pk)
        account = employee.account
        if account is None:
            account = Account.objects.filter(email__iexact=employee.email).first()
            if account is not None:
                if account.is_superuser:
                    raise HrmsAccessError("A superuser account uses this email; superusers are managed outside HRMS.")
                if HrmsEmployee.objects.filter(account=account).exclude(pk=employee.pk).exists():
                    raise HrmsAccessError("This email's Budgeting account is already linked to another HRMS employee.")

        if account is None:
            if employee.first_name:
                first_name, last_name = employee.first_name, employee.last_name
            else:
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

        elif not account.has_usable_password():
            # Auto-created resource record (no login yet) - give it a real password now.
            new_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
            account.set_password(new_password)
            account.save(update_fields=['password'])

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
        employee = HrmsEmployee.objects.select_for_update(of=('self',)).select_related('account').get(pk=employee.pk)
        _revoke(employee, 'manual', timezone.now())
    return employee



def refresh_employee(employee):
    """Re-reads ONE employee from the AIRA detail endpoint and applies it right away.

    - Found and active: the local record and the linked account's profile are updated.
    - Unknown to AIRA (404) or is_active false: marked as no longer in HRMS and any Budgeting
      access is revoked - the same rule a full Refresh applies.
    Raises HrmsError when AIRA can't be reached (nothing is changed then).
    """
    now = timezone.now()
    try:
        record = fetch_employee(employee.employee_id)
    except HrmsNotFound:
        record = None

    with transaction.atomic():
        employee = HrmsEmployee.objects.select_for_update(of=('self',)).select_related('account').get(pk=employee.pk)
        if record is None or record.get('is_active') is False:
            if record is not None:
                _, fields = _normalize(record)
                for field in SYNCED_FIELDS:
                    setattr(employee, field, fields[field])
            if employee.is_active_in_hrms:
                employee.is_active_in_hrms = False
                employee.removed_from_hrms_at = now
            employee.save()
            if employee.is_eligible or (employee.account and employee.account.is_active):
                _revoke(employee, 'hrms_missing', now)
            return employee

        employee_id, fields = _normalize(record)
        for field in SYNCED_FIELDS:
            setattr(employee, field, fields[field])
        # Back in HRMS: listed again, but access is NOT restored automatically (same as sync).
        employee.is_active_in_hrms = True
        employee.removed_from_hrms_at = None
        employee.last_seen_at = now
        employee.save()
        _sync_account_profile(employee)
        _ensure_resource_account(employee)
    return employee
