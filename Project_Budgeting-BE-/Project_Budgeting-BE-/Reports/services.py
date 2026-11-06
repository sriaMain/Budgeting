"""Reports page (Reports > All / Financial / Project / Payment / PO & Invoice).

One engine for the screen and the downloads: FinanceOverviewAPIView pages through
`report_rows`, ReportExportAPIView writes every matching row to Excel / PDF - so an export
always holds exactly the records the page's filters show.

Reporting period: `date_from` / `date_to` (YYYY-MM-DD, both days included), applied to each
record's own date - invoice issue date, payment date, expense date, PO issue date, vendor bill
date. A project is in the period when it runs during it (start <= To and end >= From), and its
figures count only that period's invoices, payments and costs.

KPIs, in the base currency (INR - expenses, vendor bills and POs carry no currency of their own):
  Revenue          invoices issued in the period (not Draft / Cancelled), excluding tax
  Expenses         cost-bearing expenses + vendor bill payments in the period. An expense linked
                   to a vendor bill is that bill's cost, so only the bill payment is counted.
  Profit           Revenue - Expenses
  Outstanding      what is still unpaid today on the invoices issued in the period
  Collection Rate  received so far / amount due (incl. tax) on the invoices issued in the period
Invoices in other currencies are summarised on their own - never added to the INR figures.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db.models import CharField, DecimalField, F, Max, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date

from finances.models import Expense, Invoice, InvoicePayment, OutgoingPayment, PurchaseOrder, VendorBill
from Project.models import Project

BASE_CURRENCY = 'INR'
ZERO = Decimal('0.00')
MONEY = DecimalField(max_digits=15, decimal_places=2)
# Invoices that count as revenue / amounts due - a Draft isn't issued, a Cancelled one is void.
REVENUE_STATUSES = ('Issued', 'Partially Paid', 'Paid', 'Overdue')
OPEN_INVOICE_STATUSES = ('Issued', 'Partially Paid', 'Overdue')

CATEGORIES = {
    'financial': 'Financial Reports',
    'project': 'Project Reports',
    'payment': 'Payment Reports',
    'po_invoice': 'PO & Invoice Reports',
}
# The page's `section` values and the export URL's slugs, old and new.
SECTIONS = {
    'all': 'all',
    'financial': 'financial', 'financial_reports': 'financial',
    'project': 'project', 'project_reports': 'project',
    'payment': 'payment', 'payment_reports': 'payment',
    'po_invoice': 'po_invoice', 'po-invoice': 'po_invoice', 'po_invoice_reports': 'po_invoice',
}

# Every category's fields, in order: (row key, label, kind). Drives the details drawer, the
# Excel sheet columns and (with PDF_FIELDS) the PDF tables. kind: text / date / money (the row's
# currency) / base_money (always INR - costs carry no currency of their own) / number.
FIELDS = {
    'financial': [
        ('reference', 'Invoice No', 'text'), ('party', 'Client', 'text'), ('project', 'Project', 'text'),
        ('date', 'Invoice Date', 'date'), ('due_date', 'Due Date', 'date'),
        ('revenue', 'Amount excl. Tax', 'money'), ('tax', 'Tax', 'money'), ('amount', 'Invoice Total', 'money'),
        ('received', 'Received', 'money'), ('balance', 'Balance', 'money'), ('status_label', 'Status', 'text'),
        ('days_overdue', 'Days Overdue', 'number'), ('last_payment_date', 'Last Payment', 'date'),
    ],
    'project': [
        ('reference', 'Project No', 'text'), ('project', 'Project', 'text'), ('party', 'Client', 'text'),
        ('date', 'Start Date', 'date'), ('end_date', 'End Date', 'date'), ('status_label', 'Status', 'text'),
        ('budget', 'Budget (excl. tax & margin)', 'money'), ('amount', 'Revenue in Period (excl. tax)', 'money'),
        ('received', 'Received in Period', 'money'), ('expenses', 'Expenses in Period (INR)', 'base_money'),
        ('profit', 'Profit in Period', 'money'), ('forecasted_profit', 'Forecasted Profit', 'money'),
    ],
    'payment': [
        ('date', 'Payment Date', 'date'), ('reference', 'Invoice No', 'text'), ('party', 'Client', 'text'),
        ('project', 'Project', 'text'), ('method', 'Method', 'text'), ('payment_ref', 'Payment Reference', 'text'),
        ('amount', 'Amount', 'money'), ('status_label', 'Payment Status', 'text'), ('invoice_status', 'Invoice Status', 'text'),
    ],
    'po_invoice': [
        ('record_type', 'Type', 'text'), ('reference', 'Number', 'text'), ('party', 'Vendor', 'text'),
        ('project', 'Project', 'text'), ('date', 'Date', 'date'), ('due_date', 'Due Date', 'date'),
        ('amount', 'Total', 'money'), ('paid', 'Paid', 'money'), ('balance', 'Balance', 'money'),
        ('status_label', 'Status', 'text'),
    ],
}
# The columns that fit a landscape PDF page.
PDF_FIELDS = {
    'financial': ['reference', 'party', 'project', 'date', 'due_date', 'amount', 'received', 'balance', 'status_label'],
    'project': ['reference', 'project', 'party', 'status_label', 'amount', 'received', 'expenses', 'profit'],
    'payment': ['date', 'reference', 'party', 'project', 'method', 'amount', 'status_label'],
    'po_invoice': ['record_type', 'reference', 'party', 'project', 'date', 'amount', 'paid', 'balance', 'status_label'],
}
# The All tab's columns (also its PDF / Excel overview).
OVERVIEW_FIELDS = [
    ('category_label', 'Report Type', 'text'), ('reference', 'Reference Number', 'text'),
    ('project_or_party', 'Project / Client', 'text'), ('date', 'Report Date', 'date'),
    ('amount', 'Amount', 'money'), ('status_label', 'Status', 'text'),
]
ORDERINGS = {'date', 'amount', 'reference', 'party', 'status', 'type'}
SEARCH_KEYS = ('reference', 'party', 'project', 'record_type', 'status_label')


class ReportFilterError(ValueError):
    """Bad filter input - the message is safe to show the user."""


@dataclass(frozen=True)
class ReportFilters:
    date_from: date | None = None
    date_to: date | None = None
    search: str = ''
    status: str = ''        # a status label, e.g. "Paid"
    record_type: str = ''   # All tab only: one of CATEGORIES
    ordering: str = '-date'


def parse_filters(params):
    """ReportFilters from query params, or ReportFilterError."""
    def day(name, label):
        raw = (params.get(name) or '').strip()
        if not raw:
            return None
        try:
            value = parse_date(raw)
        except ValueError:
            value = None
        if value is None:
            raise ReportFilterError(f"{label} must be a date (YYYY-MM-DD).")
        return value

    date_from, date_to = day('date_from', 'From Date'), day('date_to', 'To Date')
    if date_from and date_to and date_to < date_from:
        raise ReportFilterError("To Date can't be earlier than From Date.")
    ordering = (params.get('ordering') or '-date').strip()
    if ordering.lstrip('-') not in ORDERINGS:
        raise ReportFilterError(f"ordering must be one of: {', '.join(sorted(ORDERINGS))} (prefix - for descending).")
    record_type = (params.get('type') or '').strip().lower()
    if record_type and record_type not in CATEGORIES:
        raise ReportFilterError(f"type must be one of: {', '.join(CATEGORIES)}.")
    return ReportFilters(
        date_from=date_from, date_to=date_to, search=(params.get('search') or '').strip(),
        status=(params.get('status') or '').strip(), record_type=record_type, ordering=ordering,
    )


def _period(qs, field, f):
    if f.date_from:
        qs = qs.filter(**{f'{field}__gte': f.date_from})
    if f.date_to:
        qs = qs.filter(**{f'{field}__lte': f.date_to})
    return qs


def _total(qs, field='amount'):
    return qs.aggregate(t=Coalesce(Sum(field), Value(ZERO), output_field=MONEY))['t']


def _currency(prefix=''):
    """An invoice's currency - invoices carry none of their own: their project's, else their quote's,
    else their client's (the currency the invoice was raised in)."""
    return Coalesce(f'{prefix}project__currency', f'{prefix}quote__currency', f'{prefix}client__currency',
                    Value(BASE_CURRENCY), output_field=CharField())


def _received():
    """Confirmed (Completed) payments on an invoice - pending ones aren't money received."""
    return Coalesce(
        Sum('payments__amount', filter=Q(payments__status=InvoicePayment.STATUS_COMPLETED)),
        Value(ZERO), output_field=MONEY,
    )


def _bill_project():
    """A vendor payment's project - standalone bills carry it, older PO bills only via the PO."""
    return Coalesce('vendor_bill__project', 'vendor_bill__purchase_order__project')


def period_expenses(f):
    return (_total(_period(Expense.objects.cost_bearing(), 'expense_date', f))
            + _total(_period(OutgoingPayment.objects.all(), 'payment_date', f)))


def summary(f):
    """The five KPIs (INR) for the period, plus a summary per other invoice currency."""
    invoices = _period(Invoice.objects.filter(status__in=REVENUE_STATUSES), 'issue_date', f).annotate(
        received=_received(), inv_currency=_currency())
    per_currency = {}
    for inv in invoices.values('inv_currency', 'total_amount', 'tax_amount', 'received'):
        s = per_currency.setdefault(inv['inv_currency'] or BASE_CURRENCY,
                                    {'revenue': ZERO, 'amount_due': ZERO, 'received': ZERO, 'invoice_count': 0})
        total = inv['total_amount'] or ZERO
        s['revenue'] += total - (inv['tax_amount'] or ZERO)
        s['amount_due'] += total
        s['received'] += min(inv['received'] or ZERO, total)  # an overpayment doesn't collect more than is due
        s['invoice_count'] += 1
    for s in per_currency.values():
        s['outstanding'] = s['amount_due'] - s['received']
        s['collection_rate'] = round(float(s['received'] / s['amount_due'] * 100), 1) if s['amount_due'] else None

    base = per_currency.pop(BASE_CURRENCY, {'revenue': ZERO, 'amount_due': ZERO, 'received': ZERO,
                                             'invoice_count': 0, 'outstanding': ZERO, 'collection_rate': None})
    expenses = period_expenses(f)
    return {
        'currency': BASE_CURRENCY,
        'revenue': base['revenue'],
        'expenses': expenses,
        'profit': base['revenue'] - expenses,
        'outstanding': base['outstanding'],
        'amount_due': base['amount_due'],
        'received': base['received'],
        'collection_rate': base['collection_rate'],
        'invoice_count': base['invoice_count'],
        'other_currencies': [{'currency': c, **s} for c, s in sorted(per_currency.items())],
    }


def _row(category, record_type, key, **fields):
    row = {'key': key, 'category': category, 'category_label': CATEGORIES[category].replace(' Reports', ''),
           'record_type': record_type, **fields}
    row['project_or_party'] = ' · '.join(v for v in (row.get('project'), row.get('party')) if v)
    return row


def financial_rows(f):
    today = timezone.localdate()
    invoices = _period(Invoice.objects.select_related('client', 'project'), 'issue_date', f).annotate(
        received_total=_received(), inv_currency=_currency(),
        last_payment=Max('payments__payment_date', filter=Q(payments__status=InvoicePayment.STATUS_COMPLETED)),
    )
    rows = []
    for inv in invoices:
        total, tax = inv.total_amount or ZERO, inv.tax_amount or ZERO
        received = min(inv.received_total or ZERO, total)
        counts = inv.status in REVENUE_STATUSES
        balance = total - received if counts else ZERO
        overdue = inv.status in OPEN_INVOICE_STATUSES and balance > 0 and inv.due_date and inv.due_date < today
        rows.append(_row(
            'financial', 'Invoice', f'invoice-{inv.pk}',
            reference=inv.invoice_no, party=inv.client.company_name if inv.client_id else None,
            project=inv.project.project_name if inv.project_id else None, project_no=inv.project_id,
            date=inv.issue_date, amount=total, currency=inv.inv_currency or BASE_CURRENCY,
            status=inv.status, status_label=inv.get_status_display(),
            revenue=total - tax, tax=tax, received=received, balance=balance, due_date=inv.due_date,
            days_overdue=(today - inv.due_date).days if overdue else 0, last_payment_date=inv.last_payment,
        ))
    return rows


def project_rows(f):
    projects = Project.objects.select_related('client', 'budget')
    if f.date_to:
        projects = projects.filter(start_date__lte=f.date_to)
    if f.date_from:
        projects = projects.filter(end_date__gte=f.date_from)
    projects = list(projects)
    ids = [p.project_no for p in projects]

    # Revenue (excl. tax) and payments received in the period - in the project's own currency.
    revenue = {r['project']: r['t'] or ZERO for r in
               _period(Invoice.objects.filter(status__in=REVENUE_STATUSES, project__in=ids), 'issue_date', f)
               .values('project').annotate(t=Sum(F('total_amount') - F('tax_amount'), output_field=MONEY))}
    received = {r['invoice__project']: r['t'] or ZERO for r in
                _period(InvoicePayment.objects.confirmed().filter(invoice__project__in=ids), 'payment_date', f)
                .values('invoice__project').annotate(t=Sum('amount'))}
    # Costs (INR): cost-bearing expenses + vendor bill payments in the period.
    costs = {}
    for r in (_period(Expense.objects.cost_bearing().filter(project__in=ids), 'expense_date', f)
              .values('project').annotate(t=Sum('amount'))):
        costs[r['project']] = costs.get(r['project'], ZERO) + (r['t'] or ZERO)
    for r in (_period(OutgoingPayment.objects.annotate(pid=_bill_project()).filter(pid__in=ids), 'payment_date', f)
              .values('pid').annotate(t=Sum('amount'))):
        costs[r['pid']] = costs.get(r['pid'], ZERO) + (r['t'] or ZERO)

    rows = []
    for p in projects:
        budget = getattr(p, 'budget', None)
        currency = p.currency or (budget.currency if budget else None) or BASE_CURRENCY
        rev = revenue.get(p.project_no, ZERO)
        spent = costs.get(p.project_no, ZERO)
        forecast = budget.forecasted_profit if budget else None
        rows.append(_row(
            'project', 'Project', f'project-{p.project_no}',
            reference=f'#{p.project_no}', party=p.client.company_name if p.client_id else None,
            project=p.project_name, project_no=p.project_no, date=p.start_date, end_date=p.end_date,
            amount=rev, currency=currency, status=p.status, status_label=p.get_status_display(),
            budget=budget.cost_budget if budget else None, received=received.get(p.project_no, ZERO),
            # Costs are INR: a project billed in another currency has no comparable profit.
            expenses=spent, profit=rev - spent if currency == BASE_CURRENCY else None, forecasted_profit=forecast,
        ))
    return rows


def payment_rows(f):
    payments = _period(InvoicePayment.objects.select_related('invoice', 'invoice__client', 'invoice__project'),
                       'payment_date', f).annotate(inv_currency=_currency('invoice__'))
    rows = []
    for pay in payments:
        inv = pay.invoice
        rows.append(_row(
            'payment', 'Customer Payment', f'payment-{pay.pk}',
            reference=inv.invoice_no, party=inv.client.company_name if inv.client_id else None,
            project=inv.project.project_name if inv.project_id else None, project_no=inv.project_id,
            date=pay.payment_date, amount=pay.amount or ZERO, currency=pay.inv_currency or BASE_CURRENCY,
            status=pay.status, status_label=pay.get_status_display(),
            method=pay.get_payment_method_display(), payment_ref=pay.reference_no or None,
            invoice_status=inv.get_status_display(),
        ))
    return rows


def po_invoice_rows(f):
    rows = []
    pos = _period(PurchaseOrder.objects.select_related('vendor', 'project'), 'issue_date', f).annotate(
        paid=Coalesce(Sum('vendorbill__payments__amount'), Value(ZERO), output_field=MONEY))
    for po in pos:
        total = po.total_amount or ZERO
        rows.append(_row(
            'po_invoice', 'Purchase Order', f'po-{po.pk}',
            reference=po.po_no, party=po.vendor.name if po.vendor_id else None,
            project=po.project.project_name if po.project_id else None, project_no=po.project_id,
            date=po.issue_date, due_date=None, amount=total, currency=BASE_CURRENCY,
            status=po.status, status_label=po.get_status_display(),
            paid=po.paid, balance=max(total - po.paid, ZERO) if po.status != 'cancelled' else ZERO,
        ))
    bills = _period(VendorBill.objects.select_related('vendor', 'project', 'purchase_order__project'), 'bill_date', f)
    for bill in bills:
        project = bill.project or (bill.purchase_order.project if bill.purchase_order_id else None)
        rows.append(_row(
            'po_invoice', 'Vendor Bill', f'bill-{bill.pk}',
            reference=bill.bill_no, party=bill.vendor.name if bill.vendor_id else None,
            project=project.project_name if project else None, project_no=project.project_no if project else None,
            date=bill.bill_date, due_date=bill.due_date, amount=bill.total_amount or ZERO, currency=BASE_CURRENCY,
            status=bill.status, status_label=bill.get_status_display(),
            paid=bill.paid_amount or ZERO, balance=bill.balance_amount or ZERO,
        ))
    return rows


BUILDERS = {'financial': financial_rows, 'project': project_rows, 'payment': payment_rows, 'po_invoice': po_invoice_rows}


def _sort_key(field):
    if field == 'amount':
        return lambda r: r['amount'] or ZERO
    if field == 'party':
        return lambda r: (r['project_or_party'] or '').lower()
    if field == 'status':
        return lambda r: (r['status_label'] or '').lower()
    if field == 'type':
        return lambda r: (r['category_label'], r['record_type'])
    return lambda r: (r['reference'] or '').lower()


def report_rows(section, f):
    """(rows, status_options) for a section ('all' or a category) - every row that matches the
    filters, sorted; status_options are the statuses present before the status filter."""
    categories = list(CATEGORIES) if section == 'all' else [section]
    if section == 'all' and f.record_type:
        categories = [f.record_type]
    rows = [row for c in categories for row in BUILDERS[c](f)]
    if f.search:
        q = f.search.lower()
        rows = [r for r in rows if any(q in str(r.get(k) or '').lower() for k in SEARCH_KEYS)]
    status_options = sorted({r['status_label'] for r in rows if r['status_label']})
    if f.status:
        wanted = f.status.lower()
        rows = [r for r in rows if (r['status_label'] or '').lower() == wanted]
    field, descending = f.ordering.lstrip('-'), f.ordering.startswith('-')
    if field == 'date':
        # Undated rows (none today) stay last in either direction.
        dated = sorted((r for r in rows if r['date']), key=lambda r: r['date'], reverse=descending)
        rows = dated + [r for r in rows if not r['date']]
    else:
        rows.sort(key=_sort_key(field), reverse=descending)
    return rows, status_options


def totals_by_currency(rows, keys=('amount',), base_keys=()):
    """[{currency, count, <key>: sum, ...}] for the rows, one entry per currency (INR first).
    `base_keys` are always INR (costs), so they add up in the INR entry whatever the row's currency.
    A key no row has a value for stays None (e.g. profit on projects billed in another currency)."""
    out = {}

    def bucket(currency):
        return out.setdefault(currency, {'currency': currency, 'count': 0, **{k: None for k in keys}})

    def add(t, k, value):
        if value is not None:
            t[k] = (t[k] or ZERO) + value

    for r in rows:
        t = bucket(r['currency'])
        t['count'] += 1
        for k in keys:
            if k not in base_keys:
                add(t, k, r.get(k))
        for k in base_keys:
            add(bucket(BASE_CURRENCY), k, r.get(k))
    return sorted(out.values(), key=lambda t: (t['currency'] != BASE_CURRENCY, t['currency']))


def money_keys(category):
    return [k for k, _, kind in FIELDS[category] if kind in ('money', 'base_money')]


def base_money_keys(category):
    return [k for k, _, kind in FIELDS[category] if kind == 'base_money']
