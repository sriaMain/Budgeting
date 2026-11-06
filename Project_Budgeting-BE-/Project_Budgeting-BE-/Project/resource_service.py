"""
Project Details > Resources tab: one engine for the table, the Excel export and the Excel import, so
all three agree on the same rows, filters and costs.

Rows are the project's existing ResourceAssignment records (deleted ones excluded). People come from
the existing masters, looked up in bulk and never copied: AIRA HRMS employees (HrmsEmployee ->
accounts.Account), freelancer_onboarding.Freelancer and accounts.Vendor. An external resource has no
master record and is named on the assignment.

Cost is the assignment's existing `assigned_cost` - its specific cost amount, else cost rate x planned
hours - the same figure the milestone and project Actual Cost use. Removed assignments are listed but
carry no cost. Nothing here reads timers or timesheets.
"""
import io
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import ResourceAssignment

logger = logging.getLogger('Project.resource_import')

ZERO = Decimal('0.00')
Q2 = Decimal('0.01')
RESOURCE_TYPES = dict(ResourceAssignment.RESOURCE_TYPE_CHOICES)
STATUSES = dict(ResourceAssignment.STATUS_CHOICES)
# Still holding the person's slot - a second overlapping assignment would be a duplicate.
OPEN_STATUSES = ('active', 'on_hold')
# Cost rates are per hour; a daily master rate (freelancer rate card) is converted at this many hours.
HOURS_PER_DAY = Decimal('8')
PAGE_SIZE, MAX_PAGE_SIZE = 25, 100
# Freelancers who can still be staffed (offboarded / blocked / inactive ones can't).
FREELANCER_CLOSED = ('offboarded', 'blocked', 'inactive')


class ResourceFilterError(ValueError):
    pass


class ImportFileError(ValueError):
    pass


# --------------------------------------------------------------------------------------------
# Filters
# --------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class ResourceFilters:
    search: str = ''
    resource_type: str = ''
    milestone: str = ''  # '' every milestone | 'none' project-level only | '<milestone id>'
    status: str = ''
    date_from: date | None = None  # assignment start date on/after
    date_to: date | None = None    # assignment end date on/before
    ordering: str = '-start_date'


ORDERINGS = (
    'name', 'type', 'code', 'designation', 'milestone', 'cost_rate', 'total_cost', 'start_date',
    'end_date', 'status',
)


def _date_param(params, key, label):
    raw = (params.get(key) or '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ResourceFilterError(f"{label} must be a valid date (YYYY-MM-DD).")


def parse_filters(params, project):
    resource_type = (params.get('resource_type') or '').strip().lower()
    if resource_type and resource_type not in RESOURCE_TYPES:
        raise ResourceFilterError(f"Resource type must be one of: {', '.join(RESOURCE_TYPES)}.")
    status = (params.get('status') or '').strip().lower()
    if status and status not in STATUSES:
        raise ResourceFilterError(f"Status must be one of: {', '.join(STATUSES)}.")
    milestone = (params.get('milestone') or '').strip().lower()
    if milestone in ('any', 'all'):
        milestone = ''  # the older Resources tab's "every resource" values
    if milestone and milestone != 'none':
        if not milestone.isdigit() or not project.milestones.filter(pk=int(milestone)).exists():
            raise ResourceFilterError("Milestone not found in this project.")
    date_from = _date_param(params, 'date_from', 'From Date')
    date_to = _date_param(params, 'date_to', 'To Date')
    if date_from and date_to and date_to < date_from:
        raise ResourceFilterError("To Date can't be earlier than From Date.")
    ordering = (params.get('ordering') or '-start_date').strip()
    if ordering.lstrip('-') not in ORDERINGS:
        raise ResourceFilterError(f"Sort by one of: {', '.join(ORDERINGS)}.")
    return ResourceFilters(
        search=(params.get('search') or '').strip()[:100],
        resource_type=resource_type, milestone=milestone, status=status,
        date_from=date_from, date_to=date_to, ordering=ordering,
    )


def paging(params):
    def whole(key, default):
        try:
            return max(1, int(params.get(key) or default))
        except (TypeError, ValueError):
            return default
    return whole('page', 1), min(whole('page_size', PAGE_SIZE), MAX_PAGE_SIZE)


# --------------------------------------------------------------------------------------------
# Who each resource is (bulk lookups in the existing masters)
# --------------------------------------------------------------------------------------------

@dataclass
class Profile:
    code: str | None = None  # AIRA employee ID / freelancer code / vendor reference
    name: str = ''
    designation: str = ''
    department: str = ''
    detail: str = ''          # freelancer skills
    active: bool | None = None  # still active in its master record (None: external, no record)


def profiles(assignments):
    """{(resource_type, resource_id): Profile} - one query per resource type."""
    from accounts.models import Account, Vendor
    from freelancer_onboarding.models import Freelancer

    ids = {}
    for a in assignments:
        if a.resource_type != 'external' and a.resource_id:
            ids.setdefault(a.resource_type, set()).add(a.resource_id)
    found = {}
    if ids.get('employee'):
        for acc in Account.objects.filter(pk__in=ids['employee']).select_related('hrms_employee'):
            hrms = getattr(acc, 'hrms_employee', None)
            found[('employee', acc.pk)] = Profile(
                code=hrms.employee_id if hrms else None,
                name=(hrms.full_name if hrms and hrms.full_name else acc.display_name) or acc.username,
                designation=(hrms.designation if hrms else '') or (getattr(acc, 'position', '') or ''),
                department=(hrms.department if hrms else '') or '',
                active=hrms.is_active_in_hrms if hrms else acc.is_active,
            )
    if ids.get('freelancer'):
        for f in Freelancer.objects.filter(pk__in=ids['freelancer']).only(
                'id', 'freelancer_code', 'full_name', 'professional_title', 'skills', 'status'):
            found[('freelancer', f.pk)] = Profile(
                code=f.freelancer_code or None, name=f.full_name, designation=f.professional_title or '',
                detail=(f.skills or '')[:200], active=f.status not in FREELANCER_CLOSED,
            )
    if ids.get('vendor'):
        for v in Vendor.objects.filter(pk__in=ids['vendor']):
            found[('vendor', v.pk)] = Profile(
                code=v.vendor_reference_no or None, name=v.name, designation=v.get_vendor_type_display(),
                active=v.status == 'approved' and not v.is_archived,
            )
    return found


def profile_of(a, found):
    if a.resource_type == 'external':
        return Profile(name=a.external_name or '', designation='External resource')
    return found.get((a.resource_type, a.resource_id)) or Profile(name=f"#{a.resource_id}")


def _person(user):
    return (user.get_full_name() or user.username) if user else None


def assignment_row(a, p):
    return {
        "id": a.id,
        "project": a.project_id,
        "milestone": a.milestone_id,
        "milestone_name": a.milestone.name if a.milestone_id else None,
        "resource_type": a.resource_type,
        "resource_type_display": RESOURCE_TYPES.get(a.resource_type, a.resource_type),
        "resource_id": a.resource_id,
        "external_name": a.external_name,
        "resource_name": p.name,
        "resource_code": p.code,
        "designation": p.designation,
        "department": p.department,
        "resource_detail": p.detail,
        "resource_active": p.active,
        "cost_rate": a.cost_rate,
        "working_hours": a.working_hours,
        "cost_amount": a.cost_amount,
        "is_cost_overridden": a.is_cost_overridden,
        "total_cost": (a.assigned_cost or ZERO).quantize(Q2),
        # Removed assignments stay listed for history but carry no cost.
        "counts_in_cost": a.status != 'removed',
        "allocation_percent": a.allocation_percent,
        "start_date": a.start_date,
        "end_date": a.end_date,
        "status": a.status,
        "status_display": STATUSES.get(a.status, a.status),
        "created_at": a.created_at,
        "updated_at": a.updated_at,
        "created_by_name": _person(a.created_by),
        "updated_by_name": _person(a.updated_by),
    }


SORT_KEYS = {
    'name': lambda r: (r['resource_name'] or '').lower(),
    'type': lambda r: r['resource_type_display'],
    'code': lambda r: (r['resource_code'] or '').lower(),
    'designation': lambda r: (r['designation'] or '').lower(),
    'milestone': lambda r: (r['milestone_name'] or '').lower(),
    'cost_rate': lambda r: r['cost_rate'] or ZERO,
    'total_cost': lambda r: r['total_cost'],
    'start_date': lambda r: r['start_date'],
    'end_date': lambda r: r['end_date'] or date.max,  # ongoing ones last
    'status': lambda r: r['status_display'],
}


def matching_rows(project, f):
    """Every assignment of the project matching the filters, sorted - the table pages through these
    and the export writes all of them."""
    qs = project.resource_assignments.filter(is_active=True).select_related('milestone', 'created_by', 'updated_by')
    if f.resource_type:
        qs = qs.filter(resource_type=f.resource_type)
    if f.milestone == 'none':
        qs = qs.filter(milestone__isnull=True)
    elif f.milestone:
        qs = qs.filter(milestone_id=int(f.milestone))
    if f.status:
        qs = qs.filter(status=f.status)
    # The assignment's own period - never the project's dates.
    if f.date_from:
        qs = qs.filter(start_date__gte=f.date_from)
    if f.date_to:
        qs = qs.filter(end_date__lte=f.date_to)  # an ongoing assignment (no end date) doesn't end by To Date
    assignments = list(qs)
    found = profiles(assignments)
    rows = [assignment_row(a, profile_of(a, found)) for a in assignments]
    if f.search:
        needle = f.search.lower()
        rows = [r for r in rows if needle in (r['resource_name'] or '').lower() or needle in (r['resource_code'] or '').lower()]
    key = f.ordering.lstrip('-')
    rows.sort(key=lambda r: r['id'], reverse=True)  # tie-break: newest first
    rows.sort(key=SORT_KEYS[key], reverse=f.ordering.startswith('-'))
    return rows


def totals(rows):
    return {
        "count": len(rows),
        "total_cost": sum((r['total_cost'] for r in rows if r['counts_in_cost']), ZERO),
    }


def project_summary(project):
    """The whole project (no filters): assigned resources and their cost, removed ones excluded."""
    by_type = {key: {"label": label, "count": 0, "total_cost": ZERO} for key, label in RESOURCE_TYPES.items()}
    for a in project.resource_assignments.filter(is_active=True).exclude(status='removed'):
        bucket = by_type.setdefault(a.resource_type, {"label": a.resource_type, "count": 0, "total_cost": ZERO})
        bucket["count"] += 1
        bucket["total_cost"] += (a.assigned_cost or ZERO).quantize(Q2)
    return {
        "resources": sum(b["count"] for b in by_type.values()),
        "total_cost": sum((b["total_cost"] for b in by_type.values()), ZERO),
        "by_type": by_type,
    }


def project_currency(project):
    budget = getattr(project, 'budget', None)
    return (getattr(budget, 'currency', None) or project.currency or 'INR') if project else 'INR'


# --------------------------------------------------------------------------------------------
# Default rates from the masters, duplicates, eligibility (shared by the API and the import)
# --------------------------------------------------------------------------------------------

def master_rate(resource_type, resource_id):
    """The resource master's default rate - pre-fills an assignment, which keeps its own copy:
      employee   -> accounts.Account.charges_per_hour
      freelancer -> current active FreelancerRateCard (with its pricing model)
      vendor / external -> none on file"""
    result = {"cost_rate": None, "billing_rate": None, "rate_unit": None, "source": None}
    if resource_type == 'employee':
        from accounts.models import Account
        account = Account.objects.filter(pk=resource_id).first()
        if account and account.charges_per_hour is not None:
            result.update(cost_rate=account.charges_per_hour, rate_unit='hourly', source='Employee cost rate')
    elif resource_type == 'freelancer':
        card = current_rate_card(resource_id)
        if card:
            result.update(
                cost_rate=card.cost_rate, billing_rate=card.billing_rate,
                rate_unit=card.pricing_model, source=f"Rate card ({card.get_pricing_model_display()})",
            )
    return result


def current_rate_card(freelancer_id):
    from freelancer_onboarding.models import FreelancerRateCard
    today = timezone.localdate()
    return (
        FreelancerRateCard.objects.filter(freelancer_id=freelancer_id, is_active=True, effective_from__lte=today)
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today))
        .order_by('-effective_from').first()
    )


def hourly(rate, unit):
    if rate is None:
        return None
    rate = Decimal(rate)
    return (rate / HOURS_PER_DAY).quantize(Q2) if unit == 'daily' else rate


def overlapping_assignment(project, resource_type, resource_id, external_name, milestone_id,
                           start, end, exclude_id=None):
    """An open (active / on hold) assignment of the same resource on the same milestone (or the same
    project level) whose period overlaps start..end - or None."""
    qs = project.resource_assignments.filter(
        is_active=True, status__in=OPEN_STATUSES, resource_type=resource_type, milestone_id=milestone_id,
    )
    if resource_type == 'external':
        qs = qs.filter(external_name__iexact=(external_name or '').strip())
    else:
        qs = qs.filter(resource_id=resource_id)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    if end:
        qs = qs.filter(start_date__lte=end)
    if start:
        qs = qs.filter(Q(end_date__isnull=True) | Q(end_date__gte=start))
    return qs.order_by('start_date').first()


def employee_can_be_assigned(account_id):
    """New assignments only for employees active in AIRA HRMS (same list as the employee picker)."""
    from hrms_integration.selectors import employee_accounts
    from accounts.models import Account
    return employee_accounts(Account.objects.filter(pk=account_id)).exists()


# --------------------------------------------------------------------------------------------
# Excel export
# --------------------------------------------------------------------------------------------

BRAND = 'Sria Infotech · ProjectBudget'
HEADER_FILL = 'EEF2FF'


def money_format(currency):
    # [$₹-4009] is Excel's Indian Rupee, shown with the reader's own digit grouping (lakhs on en-IN).
    symbol = '[$₹-4009] ' if (currency or 'INR') == 'INR' else f'"{currency} "'
    return f'{symbol}#,##0.00;-{symbol}#,##0.00'


def fmt_date(value):
    return value.strftime('%d/%m/%Y') if value else ''


def period_text(f):
    if f.date_from and f.date_to:
        return f"Assignments starting on/after {fmt_date(f.date_from)} and ending on/before {fmt_date(f.date_to)}"
    if f.date_from:
        return f"Assignments starting on/after {fmt_date(f.date_from)}"
    if f.date_to:
        return f"Assignments ending on/before {fmt_date(f.date_to)}"
    return "All assignment dates"


def filters_text(project, f):
    parts = []
    if f.resource_type:
        parts.append(f"Type: {RESOURCE_TYPES[f.resource_type]}")
    if f.milestone == 'none':
        parts.append("Milestone: none (project level)")
    elif f.milestone:
        m = project.milestones.filter(pk=int(f.milestone)).first()
        parts.append(f"Milestone: {m.name if m else f.milestone}")
    if f.status:
        parts.append(f"Status: {STATUSES[f.status]}")
    if f.search:
        parts.append(f'Search: "{f.search}"')
    return ' · '.join(parts)


def export_filename(project, f):
    name = re.sub(r'[^A-Za-z0-9]+', '-', project.project_name or '').strip('-')[:60] or f"Project-{project.pk}"
    if f.date_from or f.date_to:
        period = f"{f.date_from.isoformat() if f.date_from else 'start'}_to_{f.date_to.isoformat() if f.date_to else 'end'}"
    else:
        period = 'All-dates'
    return f"{name}_Resources_{period}.xlsx"


EXPORT_COLUMNS = (
    # header, row key, kind, width
    ('Project Name', 'project_name', 'text', 26),
    ('Resource Name', 'resource_name', 'text', 26),
    ('Resource ID', 'resource_code', 'text', 16),
    ('Resource Type', 'resource_type_display', 'text', 16),
    ('Designation / Role', 'designation', 'text', 24),
    ('Milestone', 'milestone_name', 'text', 20),
    ('Cost Rate (per hour)', 'cost_rate', 'money', 18),
    ('Planned Hours', 'working_hours', 'number', 14),
    ('Cost Basis', 'cost_basis', 'text', 18),
    ('Total Resource Cost', 'total_cost', 'money', 20),
    ('Assignment Start Date', 'start_date', 'date', 18),
    ('Assignment End Date', 'end_date', 'date', 18),
    ('Status', 'status_display', 'text', 13),
)


def build_export(project, f, rows):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    currency = project_currency(project)
    money = money_format(currency)
    bold = Font(bold=True)
    fill = PatternFill('solid', fgColor=HEADER_FILL)
    generated = timezone.localtime().strftime('%d/%m/%Y %I:%M %p')
    matching = totals(rows)
    summary = project_summary(project)

    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    ws['A1'] = BRAND
    ws['A1'].font = Font(bold=True, size=14)
    ws['A2'] = f"Resource Allocation - {project.project_name}"
    ws['A2'].font = Font(bold=True, size=12)
    ws['A3'] = f"Assignment period: {period_text(f)}"
    ws['A4'] = f"Filters: {filters_text(project, f) or 'None'}"
    ws['A5'] = f"Generated: {generated}"
    ws.append([])
    ws.append(['Metric', 'Value'])
    for cell in ws[ws.max_row]:
        cell.font, cell.fill = bold, fill
    lines = (
        ('Resources in this export', matching['count'], None),
        ('Resource cost in this export', matching['total_cost'], money),
        ('All assigned resources on the project', summary['resources'], None),
        ('Total resource cost of the project', summary['total_cost'], money),
    )
    for label, value, fmt in lines:
        ws.append([label, value])
        if fmt:
            ws.cell(ws.max_row, 2).number_format = fmt
    ws.append([])
    ws.append(['Resource Type', 'Resources', 'Resource Cost'])
    for cell in ws[ws.max_row]:
        cell.font, cell.fill = bold, fill
    for bucket in summary['by_type'].values():
        ws.append([bucket['label'], bucket['count'], bucket['total_cost']])
        ws.cell(ws.max_row, 3).number_format = money
    ws.append([])
    ws.append(["Cost = the assignment's specific cost amount, else cost rate x planned hours. "
               "Removed assignments are listed but not costed. Amounts in " + currency + "."])
    ws.column_dimensions['A'].width = 42
    ws.column_dimensions['B'].width = 22
    ws.column_dimensions['C'].width = 22

    ws = wb.create_sheet('Resources')
    ws['A1'] = f"Resource Allocation - {project.project_name}"
    ws['A1'].font = Font(bold=True, size=12)
    ws['A2'] = f"{period_text(f)}" + (f" · {filters_text(project, f)}" if filters_text(project, f) else '')
    header_row = 4
    for col, (title, _, kind, width) in enumerate(EXPORT_COLUMNS, 1):
        cell = ws.cell(header_row, col, title)
        cell.font, cell.fill = bold, fill
        cell.alignment = Alignment(horizontal='right' if kind in ('money', 'number') else 'left', vertical='center')
        ws.column_dimensions[get_column_letter(col)].width = width
    for r in rows:
        values = {
            **r, 'project_name': project.project_name,
            'cost_basis': 'Specific amount' if r['is_cost_overridden'] else 'Rate x hours',
            'milestone_name': r['milestone_name'] or ('' if project.engagement_type != 'fixed' else 'Not linked'),
        }
        ws.append([None] * len(EXPORT_COLUMNS))
        row_no = ws.max_row
        for col, (_, key, kind, _) in enumerate(EXPORT_COLUMNS, 1):
            cell = ws.cell(row_no, col, values.get(key))
            if kind == 'money':
                cell.number_format = money
            elif kind == 'number':
                cell.number_format = '#,##0.00'
            elif kind == 'date':
                cell.number_format = 'DD/MM/YYYY'
    last = ws.max_row
    ws.append([None] * len(EXPORT_COLUMNS))
    total_row = ws.max_row
    ws.cell(total_row, 1, f"Total ({matching['count']} resources, removed ones not costed)").font = bold
    cost_col = [k for _, k, _, _ in EXPORT_COLUMNS].index('total_cost') + 1
    total_cell = ws.cell(total_row, cost_col, matching['total_cost'])
    total_cell.font, total_cell.number_format = bold, money
    ws.freeze_panes = ws.cell(header_row + 1, 3)
    if last > header_row:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(EXPORT_COLUMNS))}{last}"

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


# --------------------------------------------------------------------------------------------
# Excel import
# --------------------------------------------------------------------------------------------

IMPORT_COLUMNS = (
    # header, key, required, help
    ('Resource Type', 'resource_type', True, "Employee, Freelancer, Vendor or External"),
    ('Resource ID', 'code', False,
     "AIRA Employee ID / Freelancer Code / Vendor Reference No. Leave blank for External"),
    ('External Name', 'external_name', False, "External resources only - the person's name"),
    ('Milestone', 'milestone', False, "Milestone name - required on milestone-based projects, blank otherwise"),
    ('Cost Rate', 'cost_rate', False, "Per hour. Blank = the default rate on the employee / freelancer record"),
    ('Planned Hours', 'hours', False, "Needed unless Cost Amount is given"),
    ('Cost Amount', 'cost_amount', False, "Optional project-specific total - overrides rate x hours"),
    ('Start Date', 'start_date', True, "DD/MM/YYYY - the assignment's start, not the project's"),
    ('End Date', 'end_date', True, "DD/MM/YYYY - on or after Start Date"),
    ('Status', 'status', False, "Active, On Hold or Completed. Blank = Active"),
)
MAX_IMPORT_ROWS = 1000
MAX_IMPORT_BYTES = 2 * 1024 * 1024
TYPE_LABELS = {**{k: k for k in RESOURCE_TYPES}, **{v.lower(): k for k, v in RESOURCE_TYPES.items()},
               'external resource': 'external'}
IMPORT_STATUSES = {'active': 'active', 'on hold': 'on_hold', 'on_hold': 'on_hold', 'completed': 'completed'}


def build_template(project):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = 'Resources'
    fill = PatternFill('solid', fgColor=HEADER_FILL)
    for col, (title, _, required, _) in enumerate(IMPORT_COLUMNS, 1):
        cell = ws.cell(1, col, title + (' *' if required else ''))
        cell.font, cell.fill = Font(bold=True), fill
        ws.column_dimensions[get_column_letter(col)].width = 22
    keys = [k for _, k, _, _ in IMPORT_COLUMNS]
    for key in ('start_date', 'end_date'):
        letter = get_column_letter(keys.index(key) + 1)
        for row in range(2, MAX_IMPORT_ROWS + 2):
            ws[f"{letter}{row}"].number_format = 'DD/MM/YYYY'
    ws.freeze_panes = 'A2'

    def dropdown(key, values):
        letter = get_column_letter(keys.index(key) + 1)
        dv = DataValidation(type='list', formula1='"' + ','.join(values) + '"', allow_blank=True)
        dv.add(f"{letter}2:{letter}{MAX_IMPORT_ROWS + 1}")
        ws.add_data_validation(dv)

    dropdown('resource_type', ['Employee', 'Freelancer', 'Vendor', 'External'])
    dropdown('status', ['Active', 'On Hold', 'Completed'])
    milestones = list(project.milestones.filter(is_active=True).order_by('sequence').values_list('name', flat=True))
    # Excel's inline list: under 255 characters, and no commas / quotes inside a name.
    if milestones and len(','.join(milestones)) < 250 and not any(',' in m or '"' in m for m in milestones):
        dropdown('milestone', milestones)

    info = wb.create_sheet('Instructions')
    info['A1'] = f"Import resource assignments - {project.project_name}"
    info['A1'].font = Font(bold=True, size=12)
    info['A2'] = ("Fill one row per assignment on the Resources sheet. Only assignments are imported - "
                  "employees, freelancers and vendors must already exist (employees come from AIRA HRMS).")
    info.append([])
    info.append(['Column', 'Required', 'How to fill it'])
    for cell in info[info.max_row]:
        cell.font, cell.fill = Font(bold=True), fill
    for title, key, required, help_text in IMPORT_COLUMNS:
        info.append([title, 'Yes' if required else ('On milestone projects' if key == 'milestone' else 'No'), help_text])
    info.append([])
    if project.engagement_type == 'fixed':
        info.append(['Milestones on this project:', ', '.join(milestones) or 'none yet - add one in the Milestones tab first'])
    else:
        info.append(['This project has no milestones - leave Milestone blank.'])
    info.append(['Rows that duplicate an existing open assignment (same person, same milestone, overlapping dates) are skipped.'])
    info.column_dimensions['A'].width = 26
    info.column_dimensions['B'].width = 22
    info.column_dimensions['C'].width = 90

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _norm_header(value):
    return re.sub(r'[^a-z ]', '', str(value or '').lower()).strip()


HEADER_KEYS = {_norm_header(title): key for title, key, _, _ in IMPORT_COLUMNS}


def _text(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def _decimal(value, label, errors):
    if value is None or _text(value) == '':
        return None
    try:
        number = Decimal(str(value).replace(',', '').strip())
    except InvalidOperation:
        errors.append(f"{label} must be a number.")
        return None
    if number < 0:
        errors.append(f"{label} can't be negative.")
        return None
    return number.quantize(Q2)


def _date(value, label, errors):
    if value is None or _text(value) == '':
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = _text(value)
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y'):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    errors.append(f"{label} must be a date (DD/MM/YYYY).")
    return None


@dataclass
class ImportRow:
    row: int
    values: dict
    status: str = 'valid'  # valid | duplicate | error ; after commit: created | skipped | failed
    errors: list = field(default_factory=list)
    payload: dict | None = None
    resource_name: str = ''
    assignment_id: int | None = None

    def as_dict(self):
        return {
            "row": self.row, "status": self.status, "errors": self.errors,
            "resource_name": self.resource_name, "assignment_id": self.assignment_id,
            "values": {k: (v.isoformat() if isinstance(v, date) else (str(v) if isinstance(v, Decimal) else v))
                       for k, v in self.values.items()},
        }


def read_rows(upload):
    """[(excel row number, {key: raw value})] from an uploaded .xlsx, or ImportFileError."""
    from openpyxl import load_workbook

    name = (getattr(upload, 'name', '') or '').lower()
    if not name.endswith('.xlsx'):
        raise ImportFileError("Upload an Excel .xlsx file (download the template to start).")
    if upload.size > MAX_IMPORT_BYTES:
        raise ImportFileError("The file is larger than 2 MB.")
    try:
        wb = load_workbook(io.BytesIO(upload.read()), read_only=True, data_only=True)
    except Exception:
        raise ImportFileError("This file couldn't be read as an Excel workbook.")
    ws = wb['Resources'] if 'Resources' in wb.sheetnames else wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header, header_row = None, 0
    for n, values in enumerate(rows, 1):
        if any(_text(v) for v in values or ()):
            header, header_row = values, n
            break
    if header is None:
        raise ImportFileError("The sheet is empty.")
    columns = {}
    for i, title in enumerate(header):
        key = HEADER_KEYS.get(_norm_header(title))
        if key and key not in columns:
            columns[key] = i
    missing = [title for title, key, required, _ in IMPORT_COLUMNS if (required or key == 'code') and key not in columns]
    if missing:
        raise ImportFileError(f"Missing column(s): {', '.join(missing)}. Use the template's headers.")
    out = []
    for n, values in enumerate(rows, header_row + 1):
        record = {key: (values[i] if values and i < len(values) else None) for key, i in columns.items()}
        if not any(_text(v) for v in record.values()):
            continue
        out.append((n, record))
        if len(out) > MAX_IMPORT_ROWS:
            raise ImportFileError(f"More than {MAX_IMPORT_ROWS} rows - split the file.")
    if not out:
        raise ImportFileError("No rows to import below the header.")
    return out


def _lookups(project, records):
    """Bulk lookups for the codes in the file: {type: {code (upper): object}}, milestones by name."""
    from accounts.models import Vendor
    from freelancer_onboarding.models import Freelancer
    from hrms_integration.models import HrmsEmployee

    codes = {'employee': set(), 'freelancer': set(), 'vendor': set()}
    for _, record in records:
        resource_type = TYPE_LABELS.get(_text(record.get('resource_type')).lower())
        code = _text(record.get('code'))
        if resource_type in codes and code:
            codes[resource_type].add(code.upper())

    def by_code(qs, attr):
        return {getattr(o, attr).upper(): o for o in qs if getattr(o, attr)}

    found = {
        'employee': by_code(HrmsEmployee.objects.filter(employee_id__in=_variants(codes['employee'])), 'employee_id'),
        'freelancer': by_code(Freelancer.objects.filter(freelancer_code__in=_variants(codes['freelancer'])), 'freelancer_code'),
        'vendor': by_code(Vendor.objects.filter(vendor_reference_no__in=_variants(codes['vendor'])), 'vendor_reference_no'),
    }
    milestones = {}
    for m in project.milestones.filter(is_active=True):
        milestones.setdefault(m.name.strip().lower(), []).append(m)
    return found, milestones


def _variants(codes):
    # Codes are matched case-insensitively; the DB lookup takes the common spellings.
    return {v for c in codes for v in (c, c.lower(), c.title())}


def _validate(project, n, record, found, milestones):
    errors = []
    values = {
        'resource_type': _text(record.get('resource_type')),
        'code': _text(record.get('code')),
        'external_name': _text(record.get('external_name')),
        'milestone': _text(record.get('milestone')),
    }
    row = ImportRow(row=n, values=values, errors=errors)

    resource_type = TYPE_LABELS.get(values['resource_type'].lower())
    if not resource_type:
        errors.append("Resource Type must be Employee, Freelancer, Vendor or External.")
    resource_id = None
    if resource_type == 'external':
        if values['code']:
            errors.append("Leave Resource ID blank for an External resource.")
        if not values['external_name']:
            errors.append("Enter the External Name.")
        row.resource_name = values['external_name']
    elif resource_type:
        code = values['code']
        if not code:
            errors.append({'employee': "Enter the AIRA Employee ID.", 'freelancer': "Enter the Freelancer Code.",
                           'vendor': "Enter the Vendor Reference No."}[resource_type])
        else:
            obj = found[resource_type].get(code.upper())
            if resource_type == 'employee':
                if obj is None:
                    errors.append(f"Employee ID {code} isn't in AIRA HRMS.")
                elif not obj.is_active_in_hrms:
                    errors.append(f"Employee {code} is no longer active in AIRA HRMS - can't be assigned.")
                elif not obj.account_id:
                    errors.append(f"Employee {code} isn't linked to a Project Budgeting record yet - open "
                                  "Administration > HRMS Employees to refresh.")
                else:
                    resource_id, row.resource_name = obj.account_id, obj.full_name or code
            elif resource_type == 'freelancer':
                if obj is None:
                    errors.append(f"Freelancer Code {code} not found.")
                elif obj.status in FREELANCER_CLOSED:
                    errors.append(f"Freelancer {code} is {obj.get_status_display().lower()} - can't be assigned.")
                else:
                    resource_id, row.resource_name = obj.pk, obj.full_name
            else:
                if obj is None:
                    errors.append(f"Vendor Reference No. {code} not found.")
                elif obj.status != 'approved' or obj.is_archived:
                    errors.append(f"Vendor {code} isn't an approved vendor - can't be assigned.")
                else:
                    resource_id, row.resource_name = obj.pk, obj.name
        if values['external_name']:
            errors.append("External Name is only for External resources.")

    milestone = None
    if project.engagement_type == 'fixed':
        if not values['milestone']:
            errors.append("Milestone is required on this project.")
        else:
            matches = milestones.get(values['milestone'].lower(), [])
            if len(matches) == 1:
                milestone = matches[0]
            elif not matches:
                errors.append(f"Milestone \"{values['milestone']}\" not found on this project.")
            else:
                errors.append(f"More than one milestone is named \"{values['milestone']}\".")
    elif values['milestone']:
        errors.append("This project has no milestones - leave Milestone blank.")

    cost_rate = _decimal(record.get('cost_rate'), 'Cost Rate', errors)
    hours = _decimal(record.get('hours'), 'Planned Hours', errors)
    cost_amount = _decimal(record.get('cost_amount'), 'Cost Amount', errors)
    start = _date(record.get('start_date'), 'Start Date', errors)
    end = _date(record.get('end_date'), 'End Date', errors)
    if _text(record.get('start_date')) == '':
        errors.append("Start Date is required.")
    if _text(record.get('end_date')) == '':
        errors.append("End Date is required.")
    if start and end and end < start:
        errors.append("End Date can't be before Start Date.")

    status_raw = _text(record.get('status')).lower()
    status = IMPORT_STATUSES.get(status_raw or 'active')
    if not status:
        errors.append("Status must be Active, On Hold or Completed.")

    if cost_rate is None and resource_type in ('employee', 'freelancer') and resource_id:
        default = master_rate(resource_type, resource_id)
        cost_rate = hourly(default['cost_rate'], default['rate_unit'])
    if cost_amount is None:
        if not cost_rate:
            errors.append("Enter a Cost Rate (no default rate on file) or a Cost Amount.")
        if not hours:
            errors.append("Enter Planned Hours (or a Cost Amount).")
    elif cost_amount <= 0:
        errors.append("Cost Amount must be more than 0.")

    values.update(cost_rate=cost_rate, hours=hours, cost_amount=cost_amount, start_date=start, end_date=end,
                  status=STATUSES.get(status, status_raw))
    if errors:
        row.status = 'error'
        return row
    row.payload = {
        'resource_type': resource_type,
        'resource_id': resource_id,
        'external_name': values['external_name'] if resource_type == 'external' else '',
        'milestone': milestone.pk if milestone else None,
        'cost_rate': str(cost_rate or ZERO),
        'working_hours': str(hours or ZERO),
        'cost_amount': str(cost_amount) if cost_amount is not None else None,
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'status': status,
    }
    return row


def _dup_key(payload):
    who = (payload['external_name'] or '').lower() if payload['resource_type'] == 'external' else payload['resource_id']
    return payload['resource_type'], who, payload['milestone']


def check_import(project, upload):
    """Validate every row (nothing saved). Rows: valid | duplicate | error."""
    records = read_rows(upload)
    found, milestones = _lookups(project, records)
    results, seen = [], []
    for n, record in records:
        row = _validate(project, n, record, found, milestones)
        if row.status == 'valid':
            p = row.payload
            start, end = date.fromisoformat(p['start_date']), date.fromisoformat(p['end_date'])
            if p['status'] in OPEN_STATUSES:
                existing = overlapping_assignment(project, p['resource_type'], p['resource_id'], p['external_name'],
                                                  p['milestone'], start, end)
                if existing:
                    row.status = 'duplicate'
                    row.errors.append(
                        f"Already assigned here from {fmt_date(existing.start_date)} to "
                        f"{fmt_date(existing.end_date) or 'ongoing'} - skipped.")
                else:
                    earlier = next((s for s in seen if s[0] == _dup_key(p) and s[1] <= end and start <= s[2]), None)
                    if earlier:
                        row.status = 'duplicate'
                        row.errors.append(f"Same resource and overlapping dates as row {earlier[3]} - skipped.")
                    else:
                        seen.append((_dup_key(p), start, end, n))
        results.append(row)
    return results


def counts(rows):
    out = {'total': len(rows)}
    for row in rows:
        out[row.status] = out.get(row.status, 0) + 1
    return out


def run_import(project, upload, user):
    """Validate again and create the valid rows - duplicates skipped, invalid rows failed, never
    silently dropped. Each row goes through the same serializer as the Add Resource form."""
    from .serializers import ResourceAssignmentSerializer

    rows = check_import(project, upload)
    with transaction.atomic():
        for row in rows:
            if row.status == 'duplicate':
                row.status = 'skipped'
                continue
            if row.status == 'error':
                row.status = 'failed'
                continue
            serializer = ResourceAssignmentSerializer(data=row.payload, context={'project': project})
            if not serializer.is_valid():
                row.status = 'failed'
                row.errors.extend(_messages(serializer.errors))
                continue
            try:
                with transaction.atomic():
                    assignment = serializer.save(project=project, created_by=user, updated_by=user)
            except Exception as exc:  # a row that fails at save time never takes the others down
                logger.exception("Resource import row %s failed to save", row.row)
                row.status = 'failed'
                row.errors.append(getattr(exc, 'message', None) or "Couldn't be saved.")
                continue
            row.status, row.assignment_id = 'created', assignment.pk
    result = counts(rows)
    logger.info(
        "Resource import: project %s (%s) by user %s, file %r - %s rows: created=%s skipped=%s failed=%s, "
        "assignment ids=%s",
        project.pk, project.project_name, getattr(user, 'pk', None), getattr(upload, 'name', ''), result['total'],
        result.get('created', 0), result.get('skipped', 0), result.get('failed', 0),
        [r.assignment_id for r in rows if r.assignment_id],
    )
    return rows


def _messages(errors):
    out = []
    for value in (errors.values() if isinstance(errors, dict) else [errors]):
        for item in (value if isinstance(value, (list, tuple)) else [value]):
            out.extend(_messages(item) if isinstance(item, dict) else [str(item)])
    return out
