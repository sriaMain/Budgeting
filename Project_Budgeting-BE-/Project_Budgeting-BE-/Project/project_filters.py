"""
Project Details page - one set of filters for every tab.

The page's filter toolbar sends the same query parameters to each tab's API:

    date_from, date_to   YYYY-MM-DD, both optional; To can't be before From
    search               free text (name / reference number), per tab
    status               the tab's own status (invoice, expense, payment, assignment, milestone ...)
    milestone            '' every milestone | 'none' not linked | '<milestone id>'
    resource             '' | '<resource_type>:<id>' (external: 'external:<name>')
    payment_status       not_sent | sent | partially_paid | paid | overdue
    billing_status       not_billed | partially_invoiced | invoiced
    financial_status     no_budget | on_track | at_risk | over_budget
    ordering, page, page_size

Each record is filtered by its own date (an invoice by its invoice date, an expense by its expense
date, a payment by its payment date, a milestone by its due date ...), never by the project's
dates. Parsing is strict: a bad value is a 400 with a message, not silently ignored. Read-only.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

PAGE_SIZE, MAX_PAGE_SIZE = 25, 100

PAYMENT_STATUSES = {
    'not_sent': 'Not Sent', 'sent': 'Sent', 'partially_paid': 'Partially Paid', 'paid': 'Paid', 'overdue': 'Overdue',
}
BILLING_STATUSES = {'not_billed': 'Not Billed', 'partially_invoiced': 'Partially Invoiced', 'invoiced': 'Invoiced'}
FINANCIAL_STATUSES = {
    'no_budget': 'No Budget', 'on_track': 'On Track', 'at_risk': 'At Risk (80%+ used)', 'over_budget': 'Over Budget',
}
# An invoice's payment status, from its own status (Cancelled invoices have none).
INVOICE_PAYMENT_STATUS = {
    'Draft': 'not_sent', 'Issued': 'sent', 'Partially Paid': 'partially_paid', 'Paid': 'paid', 'Overdue': 'overdue',
}
AT_RISK_PERCENT = 80


class FilterError(ValueError):
    pass


@dataclass(frozen=True)
class ProjectFilters:
    date_from: date | None = None
    date_to: date | None = None
    search: str = ''
    status: str = ''
    milestone: str = ''
    resource: str = ''
    payment_status: str = ''
    billing_status: str = ''
    financial_status: str = ''
    ordering: str = ''
    page: int = 1
    page_size: int = PAGE_SIZE

    @property
    def has_dates(self) -> bool:
        return bool(self.date_from or self.date_to)

    def in_range(self, value) -> bool:
        """A record's own date is inside From / To (both inclusive). No date = outside any range."""
        if not self.has_dates:
            return True
        if value is None:
            return False
        if isinstance(value, datetime):
            value = value.date()
        return (not self.date_from or value >= self.date_from) and (not self.date_to or value <= self.date_to)

    def matches(self, *texts) -> bool:
        """Search: any of the texts contains it (case-insensitive)."""
        if not self.search:
            return True
        needle = self.search.lower()
        return any(needle in str(t).lower() for t in texts if t)

    @property
    def milestone_id(self) -> int | None:
        return int(self.milestone) if self.milestone.isdigit() else None


def _date(params, key, label):
    raw = (params.get(key) or '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise FilterError(f"{label} must be a valid date (YYYY-MM-DD).")


def _choice(params, key, choices, label):
    value = (params.get(key) or '').strip()
    if value and value not in choices:
        raise FilterError(f"{label} must be one of: {', '.join(choices)}.")
    return value


def _whole(params, key, default):
    try:
        return max(1, int(params.get(key) or default))
    except (TypeError, ValueError):
        return default


def parse(params, project, *, statuses=None, orderings=None, default_ordering='') -> ProjectFilters:
    """The request's filters, validated against this project. `statuses` / `orderings` are the
    calling tab's own values (None: that filter isn't offered there and is ignored)."""
    date_from = _date(params, 'date_from', 'From Date')
    date_to = _date(params, 'date_to', 'To Date')
    if date_from and date_to and date_from > date_to:
        raise FilterError("From Date can't be later than To Date.")

    status = ''
    if statuses is not None:
        status = _choice(params, 'status', statuses, 'Status')

    milestone = (params.get('milestone') or '').strip().lower()
    if milestone in ('any', 'all'):
        milestone = ''
    if milestone and milestone != 'none':
        if not milestone.isdigit() or not project.milestones.filter(pk=int(milestone)).exists():
            raise FilterError("Milestone not found in this project.")

    resource = (params.get('resource') or '').strip()
    if resource:
        kind, _, ref = resource.partition(':')
        if kind not in ('employee', 'freelancer', 'vendor', 'external') or not ref or (kind != 'external' and not ref.isdigit()):
            raise FilterError("Resource must look like 'employee:12' (type:id).")

    ordering = (params.get('ordering') or default_ordering).strip()
    if orderings is not None and ordering and ordering.lstrip('-') not in orderings:
        raise FilterError(f"Sort by one of: {', '.join(orderings)}.")

    return ProjectFilters(
        date_from=date_from, date_to=date_to,
        search=(params.get('search') or '').strip()[:100],
        status=status, milestone=milestone, resource=resource,
        payment_status=_choice(params, 'payment_status', PAYMENT_STATUSES, 'Payment Status'),
        billing_status=_choice(params, 'billing_status', BILLING_STATUSES, 'Billing Status'),
        financial_status=_choice(params, 'financial_status', FINANCIAL_STATUSES, 'Financial Status'),
        ordering=ordering,
        page=_whole(params, 'page', 1),
        page_size=min(_whole(params, 'page_size', PAGE_SIZE), MAX_PAGE_SIZE),
    )


def sort_rows(rows, f: ProjectFilters, keys: dict, default: str):
    """Sort rows by the `ordering` key ('-' = descending); None values always last."""
    ordering = f.ordering or default
    name = ordering.lstrip('-')
    key = keys.get(name) or keys[default.lstrip('-')]
    descending = ordering.startswith('-')
    present = [r for r in rows if key(r) is not None]
    missing = [r for r in rows if key(r) is None]
    present.sort(key=key, reverse=descending)
    return present + missing


def page_of(rows, f: ProjectFilters) -> dict:
    count = len(rows)
    total_pages = max(1, -(-count // f.page_size))
    page = min(f.page, total_pages)
    start = (page - 1) * f.page_size
    return {
        "count": count, "page": page, "page_size": f.page_size, "total_pages": total_pages,
        "results": rows[start:start + f.page_size],
    }


def applied(f: ProjectFilters) -> dict:
    """The filters in effect, echoed back so exports and summaries can state them."""
    return {
        "date_from": f.date_from.isoformat() if f.date_from else None,
        "date_to": f.date_to.isoformat() if f.date_to else None,
        "search": f.search, "status": f.status, "milestone": f.milestone, "resource": f.resource,
        "payment_status": f.payment_status, "billing_status": f.billing_status,
        "financial_status": f.financial_status,
    }
