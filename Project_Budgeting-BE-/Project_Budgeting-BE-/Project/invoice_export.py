"""
Excel export of a project's invoices (Project Details -> Invoices tab -> Export Excel).

Lists the same invoices the tab shows (every status, newest first, the tab's search applied) with
the same amounts: total, paid (confirmed payments) and outstanding come from the stored invoice
fields. Totals leave out Draft and Cancelled invoices, which aren't amounts billed. Read-only.
"""
from __future__ import annotations

import io
import re
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from .resource_service import BRAND, HEADER_FILL, fmt_date, money_format

NOT_BILLED = ('Draft', 'Cancelled')
ZERO = Decimal('0.00')

COLUMNS = (
    # header, key, kind, width
    ('Invoice No', 'invoice_no', 'text', 18),
    ('Invoice Date', 'issue_date', 'date', 14),
    ('Due Date', 'due_date', 'date', 14),
    ('Status', 'status', 'text', 15),
    ('Billed For', 'billed_for', 'text', 30),
    ('Client', 'client', 'text', 28),
    ('Currency', 'currency', 'text', 10),
    ('Amount (before tax)', 'sub_total', 'money', 20),
    ('Discount', 'discount_amount', 'money', 16),
    ('Tax', 'tax_amount', 'money', 16),
    ('Total Amount', 'total_amount', 'money', 20),
    ('Paid', 'paid_amount', 'money', 18),
    ('Outstanding', 'balance_amount', 'money', 18),
)
MONEY_KEYS = ('sub_total', 'discount_amount', 'tax_amount', 'total_amount', 'paid_amount', 'balance_amount')


def matching_invoices(project, search: str = ''):
    """The Invoices tab's list: all of the project's invoices, its search on number / status."""
    qs = project.invoice_set.select_related('client', 'quote', 'milestone').order_by('-issue_date', '-id')
    search = (search or '').strip()
    if search:
        qs = qs.filter(Q(invoice_no__icontains=search) | Q(status__icontains=search))
    return list(qs)


def invoice_currency(invoice, project) -> str:
    """Invoices carry no currency of their own: the project's, else the quote's, else the client's
    (the same rule as the Reports page)."""
    return (project.currency or getattr(invoice.quote, 'currency', None)
            or getattr(invoice.client, 'currency', None) or 'INR')


def billed_for(invoice) -> str:
    if invoice.milestone_id:
        return f"Milestone: {invoice.milestone.name}"
    if invoice.billing_period_start or invoice.billing_period_end:
        return f"Period: {fmt_date(invoice.billing_period_start)} - {fmt_date(invoice.billing_period_end)}"
    return ''


def row(invoice, project) -> dict:
    return {
        'invoice_no': invoice.invoice_no or f"Invoice #{invoice.pk}",
        'issue_date': invoice.issue_date,
        'due_date': invoice.due_date,
        'status': invoice.get_status_display(),
        'billed_for': billed_for(invoice),
        'client': getattr(invoice.client, 'company_name', '') or '',
        'currency': invoice_currency(invoice, project),
        'billed': invoice.status not in NOT_BILLED,
        **{key: getattr(invoice, key) or ZERO for key in MONEY_KEYS},
    }


def totals_by_currency(rows) -> dict:
    """{currency: {count, sub_total, ..., balance_amount}} over billed invoices (not Draft / Cancelled)."""
    out: dict = {}
    for r in rows:
        if not r['billed']:
            continue
        bucket = out.setdefault(r['currency'], {'count': 0, **{k: ZERO for k in MONEY_KEYS}})
        bucket['count'] += 1
        for key in MONEY_KEYS:
            bucket[key] += r[key]
    return out


def export_filename(project) -> str:
    name = re.sub(r'[^A-Za-z0-9]+', '-', project.project_name or '').strip('-')[:60] or f"Project-{project.pk}"
    return f"{name}_Invoices_{timezone.localdate().isoformat()}.xlsx"


def build_export(project, rows, search: str = '') -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    bold = Font(bold=True)
    fill = PatternFill('solid', fgColor=HEADER_FILL)
    generated = timezone.localtime().strftime('%d/%m/%Y %I:%M %p')
    totals = totals_by_currency(rows)
    by_status: dict = {}
    for r in rows:
        by_status[r['status']] = by_status.get(r['status'], 0) + 1
    filter_text = f'Search: "{search.strip()}"' if (search or '').strip() else 'None (all invoices)'

    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    ws['A1'] = BRAND
    ws['A1'].font = Font(bold=True, size=14)
    ws['A2'] = f"Invoices - {project.project_name}"
    ws['A2'].font = Font(bold=True, size=12)
    ws['A3'] = f"Client: {getattr(project.client, 'company_name', '') or '-'}"
    ws['A4'] = f"Filter: {filter_text}"
    ws['A5'] = f"Generated: {generated}"
    ws.append([])
    ws.append(['Status', 'Invoices'])
    for cell in ws[ws.max_row]:
        cell.font, cell.fill = bold, fill
    for label, count in sorted(by_status.items()):
        ws.append([label, count])
    ws.append(['All listed', len(rows)])
    ws.cell(ws.max_row, 1).font = bold
    ws.append([])
    ws.append(['Currency', 'Billed invoices', 'Total Amount', 'Paid', 'Outstanding'])
    for cell in ws[ws.max_row]:
        cell.font, cell.fill = bold, fill
    for currency, t in sorted(totals.items()):
        ws.append([currency, t['count'], t['total_amount'], t['paid_amount'], t['balance_amount']])
        for col in (3, 4, 5):
            ws.cell(ws.max_row, col).number_format = money_format(currency)
    if not totals:
        ws.append(['No billed invoices in this export'])
    ws.append([])
    ws.append(['Billed = every status except Draft and Cancelled. Paid counts confirmed payments only; '
               'Outstanding = Total Amount - Paid.'])
    for col, width in zip('ABCDE', (34, 16, 20, 20, 20)):
        ws.column_dimensions[col].width = width

    ws = wb.create_sheet('Invoices')
    ws['A1'] = f"Invoices - {project.project_name}"
    ws['A1'].font = Font(bold=True, size=12)
    ws['A2'] = f"Filter: {filter_text} · Generated: {generated}"
    header_row = 4
    for col, (title, _, kind, width) in enumerate(COLUMNS, 1):
        cell = ws.cell(header_row, col, title)
        cell.font, cell.fill = bold, fill
        cell.alignment = Alignment(horizontal='right' if kind == 'money' else 'left', vertical='center')
        ws.column_dimensions[get_column_letter(col)].width = width
    for r in rows:
        ws.append([r[key] for _, key, _, _ in COLUMNS])
        row_no = ws.max_row
        for col, (_, _, kind, _) in enumerate(COLUMNS, 1):
            if kind == 'money':
                ws.cell(row_no, col).number_format = money_format(r['currency'])
            elif kind == 'date':
                ws.cell(row_no, col).number_format = 'DD/MM/YYYY'
    last = ws.max_row
    keys = [key for _, key, _, _ in COLUMNS]
    for currency, t in sorted(totals.items()):
        ws.append([None] * len(COLUMNS))
        total_row = ws.max_row
        label = f"Total {currency} ({t['count']} billed; Draft and Cancelled not included)"
        ws.cell(total_row, 1, label).font = bold
        for key in MONEY_KEYS:
            cell = ws.cell(total_row, keys.index(key) + 1, t[key])
            cell.font, cell.number_format = bold, money_format(currency)
    ws.freeze_panes = ws.cell(header_row + 1, 2)
    if last > header_row:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(COLUMNS))}{last}"

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
