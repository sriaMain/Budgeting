"""Excel and PDF downloads of the Reports page (ReportExportAPIView): the rows and KPIs the page
shows for the same filters (Reports/services.py), laid out for a reader - period, generation
time, KPI summary, one section per category, totals per currency."""
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from xml.sax.saxutils import escape

from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import CondPageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .services import (
    BASE_CURRENCY, CATEGORIES, FIELDS, OVERVIEW_FIELDS, PDF_FIELDS, base_money_keys, money_keys, totals_by_currency,
)

BRAND = 'Sria Infotech · ProjectBudget'


@dataclass
class ExportData:
    section: str            # 'all' or a category
    filters: object         # services.ReportFilters
    summary: dict           # services.summary()
    rows: list              # services.report_rows() - every matching row
    generated_at: datetime


# ---------------------------------------------------------------- text helpers

def fmt_date(value):
    return value.strftime('%d/%m/%Y') if isinstance(value, date) else '—'


def period_text(f):
    if f.date_from and f.date_to:
        return f'{fmt_date(f.date_from)} – {fmt_date(f.date_to)}'
    if f.date_from:
        return f'From {fmt_date(f.date_from)}'
    if f.date_to:
        return f'Up to {fmt_date(f.date_to)}'
    return 'All dates'


def filters_text(f):
    parts = []
    if f.record_type:
        parts.append(f'type {CATEGORIES[f.record_type]}')
    if f.status:
        parts.append(f'status {f.status}')
    if f.search:
        parts.append(f'search "{f.search}"')
    return ', '.join(parts)


def title_of(section):
    return 'All Reports' if section == 'all' else CATEGORIES[section]


def export_filename(section, f, ext):
    """e.g. ProjectBudget_Reports_2026-10-01_to_2026-10-31.xlsx"""
    name = 'Reports' if section == 'all' else CATEGORIES[section].replace(' & ', '_').replace(' ', '_')
    if f.date_from and f.date_to:
        span = f'{f.date_from}_to_{f.date_to}'
    elif f.date_from:
        span = f'from_{f.date_from}'
    elif f.date_to:
        span = f'to_{f.date_to}'
    else:
        span = 'all_dates'
    return f'ProjectBudget_{name}_{span}.{ext}'


def indian_number(value):
    """1234567.5 -> '12,34,567.50' (Indian digit grouping)."""
    value = Decimal(value or 0).quantize(Decimal('0.01'))
    sign = '-' if value < 0 else ''
    whole, frac = f'{abs(value):.2f}'.split('.')
    if len(whole) > 3:
        head, groups = whole[:-3], []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        whole = ','.join(([head] if head else []) + groups + [whole[-3:]])
    return f'{sign}{whole}.{frac}'


def money_text(value, currency):
    # The PDF fonts have no ₹ glyph - the ISO code reads the same.
    return f'{currency or BASE_CURRENCY} {indian_number(value)}'


def rate_text(rate):
    return '—' if rate is None else f'{rate:.1f}%'


def kpis(summary):
    """(label, value text, explanation) for the five KPIs."""
    c = summary['currency']
    return [
        ('Total Revenue', money_text(summary['revenue'], c),
         'Invoices issued in the period (not Draft / Cancelled), excluding tax'),
        ('Total Expenses', money_text(summary['expenses'], c),
         'Cost-bearing expenses + vendor bill payments in the period'),
        ('Total Profit', money_text(summary['profit'], c), 'Revenue − Expenses'),
        ('Total Outstanding', money_text(summary['outstanding'], c),
         'Still unpaid today on the invoices issued in the period'),
        ('Collection Rate', rate_text(summary['collection_rate']),
         'Received so far ÷ amount due (incl. tax) on the invoices issued in the period'),
    ]


def _sections(data):
    """[(category, rows)] in page order - every category for All, else the one shown."""
    categories = list(CATEGORIES) if data.section == 'all' else [data.section]
    if data.section == 'all' and data.filters.record_type:
        categories = [data.filters.record_type]
    return [(c, [r for r in data.rows if r['category'] == c]) for c in categories]


# ---------------------------------------------------------------- Excel

HEADER_FILL = PatternFill('solid', fgColor='1F2937')
TOTAL_FILL = PatternFill('solid', fgColor='F3F4F6')
LINE = Side(style='thin', color='D1D5DB')
CELL_BORDER = Border(left=LINE, right=LINE, top=LINE, bottom=LINE)
DATE_FORMAT = 'DD/MM/YYYY'


def money_format(currency):
    # [$₹-4009] is Excel's Indian Rupee: shown with the reader's own digit grouping (lakhs on en-IN).
    symbol = '[$₹-4009] ' if (currency or BASE_CURRENCY) == 'INR' else f'"{currency} "'
    return f'{symbol}#,##0.00;-{symbol}#,##0.00'


def _excel_heading(ws, title, data):
    ws['A1'] = BRAND
    ws['A1'].font = Font(bold=True, size=14)
    ws['A2'] = title
    ws['A2'].font = Font(bold=True, size=12)
    ws['A3'] = f'Reporting period: {period_text(data.filters)}'
    ws['A4'] = f'Generated: {timezone.localtime(data.generated_at).strftime("%d/%m/%Y %I:%M %p")}'
    if filters_text(data.filters):
        ws['A5'] = f'Filters: {filters_text(data.filters)}'


def _excel_cell(cell, value, kind, currency):
    if kind == 'base_money':
        kind, currency = 'money', BASE_CURRENCY
    if kind == 'money':
        cell.value = value if value is not None else None
        cell.number_format = money_format(currency)
        cell.alignment = Alignment(horizontal='right')
    elif kind == 'date':
        cell.value = value if isinstance(value, date) else None
        cell.number_format = DATE_FORMAT
    elif kind == 'number':
        cell.value = value
        cell.alignment = Alignment(horizontal='right')
    else:
        cell.value = '' if value is None else str(value)
    cell.border = CELL_BORDER


def _excel_table(ws, start_row, fields, rows, total_keys, base_keys=()):
    """Header + rows + one totals row per currency; returns the last row written."""
    for col, (_, label, kind) in enumerate(fields, 1):
        cell = ws.cell(row=start_row, column=col, value=label)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = HEADER_FILL
        cell.border = CELL_BORDER
        cell.alignment = Alignment(horizontal='right' if kind in ('money', 'base_money', 'number') else 'left', vertical='center', wrap_text=True)
    row_no = start_row
    for r in rows:
        row_no += 1
        for col, (key, _, kind) in enumerate(fields, 1):
            _excel_cell(ws.cell(row=row_no, column=col), r.get(key), kind, r.get('currency'))
    if not rows:
        row_no += 1
        ws.cell(row=row_no, column=1, value='No records match these filters.').font = Font(italic=True, color='6B7280')
    for t in totals_by_currency(rows, total_keys, base_keys):
        row_no += 1
        for col, (key, _, kind) in enumerate(fields, 1):
            cell = ws.cell(row=row_no, column=col)
            if col == 1:
                cell.value = f'Total ({t["currency"]}) · {t["count"]} records'
            elif key in total_keys and t[key] is not None:
                cell.value = t[key]
                cell.number_format = money_format(t['currency'])
                cell.alignment = Alignment(horizontal='right')
            cell.font = Font(bold=True)
            cell.fill = TOTAL_FILL
            cell.border = CELL_BORDER
    return row_no


def _excel_widths(ws, fields, rows, header_row):
    for col, (key, label, kind) in enumerate(fields, 1):
        if kind in ('money', 'base_money'):
            width = 18
        elif kind == 'date':
            width = 13
        else:
            longest = max([len(str(r.get(key) or '')) for r in rows[:500]] + [len(label)])
            width = min(max(longest + 2, 10), 45)
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.column_dimensions['A'].width = max(ws.column_dimensions['A'].width or 0, 22)
    ws.row_dimensions[header_row].height = 30


def _excel_category_sheet(wb, title, fields, rows, total_keys, data, base_keys=()):
    ws = wb.create_sheet(title[:31])
    _excel_heading(ws, title, data)
    header_row = 7
    last = _excel_table(ws, header_row, fields, rows, total_keys, base_keys)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    if rows:
        ws.auto_filter.ref = f'A{header_row}:{get_column_letter(len(fields))}{header_row + len(rows)}'
    _excel_widths(ws, fields, rows, header_row)
    return last


def build_excel(data):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    _excel_heading(ws, f'{title_of(data.section)} – Summary', data)

    row = 7
    for col, label in enumerate(['Metric', 'Value', 'How it is calculated'], 1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font, cell.fill, cell.border = Font(bold=True, color='FFFFFF'), HEADER_FILL, CELL_BORDER
    s = data.summary
    kpi_values = [s['revenue'], s['expenses'], s['profit'], s['outstanding'], s['collection_rate']]
    for (label, _, how), value in zip(kpis(s), kpi_values):
        row += 1
        ws.cell(row=row, column=1, value=label).border = CELL_BORDER
        cell = ws.cell(row=row, column=2)
        if label == 'Collection Rate':
            cell.value = None if value is None else value / 100
            cell.number_format = '0.0%'
        else:
            cell.value = value
            cell.number_format = money_format(s['currency'])
        cell.alignment, cell.border = Alignment(horizontal='right'), CELL_BORDER
        ws.cell(row=row, column=3, value=how).border = CELL_BORDER

    if s['other_currencies']:
        row += 2
        ws.cell(row=row, column=1, value='Invoices in other currencies (not included in the INR figures above)').font = Font(bold=True)
        row += 1
        heads = ['Currency', 'Revenue (excl. tax)', 'Amount Due', 'Received', 'Outstanding', 'Collection Rate', 'Invoices']
        for col, label in enumerate(heads, 1):
            cell = ws.cell(row=row, column=col, value=label)
            cell.font, cell.fill, cell.border = Font(bold=True, color='FFFFFF'), HEADER_FILL, CELL_BORDER
        for oc in s['other_currencies']:
            row += 1
            values = [oc['currency'], oc['revenue'], oc['amount_due'], oc['received'], oc['outstanding'],
                      None if oc['collection_rate'] is None else oc['collection_rate'] / 100, oc['invoice_count']]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = CELL_BORDER
                if 2 <= col <= 5:
                    cell.number_format = money_format(oc['currency'])
                elif col == 6:
                    cell.number_format = '0.0%'

    row += 2
    ws.cell(row=row, column=1, value='Records in this export').font = Font(bold=True)
    row += 1
    for col, label in enumerate(['Category', 'Currency', 'Records', 'Total Amount'], 1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font, cell.fill, cell.border = Font(bold=True, color='FFFFFF'), HEADER_FILL, CELL_BORDER
    sections = _sections(data)
    for category, rows in sections:
        totals = totals_by_currency(rows) or [{'currency': BASE_CURRENCY, 'count': 0, 'amount': Decimal('0')}]
        for t in totals:
            t['amount'] = t['amount'] or Decimal('0')
        for t in totals:
            row += 1
            values = [CATEGORIES[category], t['currency'], t['count'], t['amount']]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = CELL_BORDER
                if col == 4:
                    cell.number_format = money_format(t['currency'])
    for col, width in zip('ABCD', (26, 22, 70, 18)):
        ws.column_dimensions[col].width = width

    if data.section == 'all':
        _excel_category_sheet(wb, 'All Records', OVERVIEW_FIELDS, data.rows, ('amount',), data)
    for category, rows in sections:
        _excel_category_sheet(wb, CATEGORIES[category], FIELDS[category], rows, money_keys(category), data, base_money_keys(category))

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


# ---------------------------------------------------------------- PDF

INK = colors.HexColor('#111827')
MUTED = colors.HexColor('#6B7280')
HEAD = colors.HexColor('#1F2937')
STRIPE = colors.HexColor('#F9FAFB')
RULE = colors.HexColor('#E5E7EB')

STYLE_TITLE = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=INK)
STYLE_META = ParagraphStyle('m', fontName='Helvetica', fontSize=9, leading=12, textColor=MUTED)
STYLE_H2 = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=INK, spaceBefore=6, spaceAfter=4)
STYLE_CELL = ParagraphStyle('c', fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=INK)
STYLE_CELL_BOLD = ParagraphStyle('cb', parent=STYLE_CELL, fontName='Helvetica-Bold')
STYLE_CELL_RIGHT = ParagraphStyle('cr', parent=STYLE_CELL, alignment=2)
STYLE_CELL_RIGHT_BOLD = ParagraphStyle('crb', parent=STYLE_CELL_RIGHT, fontName='Helvetica-Bold')
STYLE_HEAD = ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=7.5, leading=9.5, textColor=colors.white)
STYLE_HEAD_RIGHT = ParagraphStyle('hr', parent=STYLE_HEAD, alignment=2)
STYLE_KPI_LABEL = ParagraphStyle('kl', fontName='Helvetica', fontSize=8, leading=10, textColor=MUTED)
STYLE_KPI_VALUE = ParagraphStyle('kv', fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=INK)
STYLE_NOTE = ParagraphStyle('n', fontName='Helvetica', fontSize=7.5, leading=10, textColor=MUTED)

PAGE = landscape(A4)
MARGIN_X = 14 * mm
WIDTH = PAGE[0] - 2 * MARGIN_X
# Relative column widths by field.
WEIGHTS = {'party': 2.0, 'project': 2.0, 'project_or_party': 2.6, 'reference': 1.4, 'record_type': 1.2,
           'category_label': 1.2, 'status_label': 1.3, 'method': 1.2, 'payment_ref': 1.3, 'invoice_status': 1.2}
KIND_WEIGHTS = {'money': 1.35, 'base_money': 1.35, 'date': 1.0, 'number': 0.7, 'text': 1.3}
NUMERIC = ('money', 'base_money', 'number')


def _canvas_class(left, right, footer):
    """A canvas that draws the running header and 'Page X of Y' footer once the page count is known."""
    class NumberedCanvas(pdf_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_pages = []

        def showPage(self):
            self._saved_pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved_pages)
            for state in self._saved_pages:
                self.__dict__.update(state)
                self._chrome(total)
                super().showPage()
            super().save()

        def _chrome(self, total):
            w, h = PAGE
            self.setStrokeColor(RULE)
            self.setLineWidth(0.6)
            self.setFont('Helvetica-Bold', 8.5)
            self.setFillColor(INK)
            self.drawString(MARGIN_X, h - 11 * mm, left)
            self.setFont('Helvetica', 8.5)
            self.setFillColor(MUTED)
            self.drawRightString(w - MARGIN_X, h - 11 * mm, right)
            self.line(MARGIN_X, h - 12.8 * mm, w - MARGIN_X, h - 12.8 * mm)
            self.line(MARGIN_X, 11.5 * mm, w - MARGIN_X, 11.5 * mm)
            self.setFont('Helvetica', 7.5)
            self.drawString(MARGIN_X, 7.5 * mm, footer)
            self.drawRightString(w - MARGIN_X, 7.5 * mm, f'Page {self._pageNumber} of {total}')
    return NumberedCanvas


def _pdf_value(row, key, kind):
    value = row.get(key)
    if kind == 'money':
        return '—' if value is None else money_text(value, row.get('currency'))
    if kind == 'base_money':
        return '—' if value is None else money_text(value, BASE_CURRENCY)
    if kind == 'date':
        return fmt_date(value)
    if kind == 'number':
        return '' if value in (None, 0) else str(value)
    return '' if value is None else str(value)


def _pdf_table(fields, rows, total_keys, base_keys=()):
    weights = [WEIGHTS.get(key, KIND_WEIGHTS[kind]) for key, _, kind in fields]
    widths = [WIDTH * w / sum(weights) for w in weights]
    right = [i for i, (_, _, kind) in enumerate(fields) if kind in NUMERIC]
    header = [Paragraph(escape(label), STYLE_HEAD_RIGHT if i in right else STYLE_HEAD) for i, (_, label, _) in enumerate(fields)]
    body = []
    for r in rows:
        body.append([
            Paragraph(escape(_pdf_value(r, key, kind)), STYLE_CELL_RIGHT if kind in NUMERIC else STYLE_CELL)
            for key, _, kind in fields
        ])
    totals = []
    for t in totals_by_currency(rows, total_keys, base_keys):
        line = []
        for i, (key, _, kind) in enumerate(fields):
            if i == 0:
                line.append(Paragraph(escape(f'Total ({t["currency"]}) · {t["count"]}'), STYLE_CELL_BOLD))
            elif key in total_keys and t[key] is not None:
                line.append(Paragraph(escape(money_text(t[key], t['currency'])), STYLE_CELL_RIGHT_BOLD))
            else:
                line.append('')
        totals.append(line)
    table = Table([header] + body + totals, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEAD),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 7.5),
        ('TEXTCOLOR', (0, 1), (-1, -1), INK),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, RULE),
    ]
    for i in right:
        style.append(('ALIGN', (i, 1), (i, -1), 'RIGHT'))
    for n in range(1, len(body) + 1, 2):
        style.append(('BACKGROUND', (0, n), (-1, n), STRIPE))
    if totals:
        first_total = len(body) + 1
        style += [('FONTNAME', (0, first_total), (-1, -1), 'Helvetica-Bold'),
                  ('LINEABOVE', (0, first_total), (-1, first_total), 0.9, INK)]
    table.setStyle(TableStyle(style))
    return table


def build_pdf(data):
    out = io.BytesIO()
    title = title_of(data.section)
    generated = timezone.localtime(data.generated_at).strftime('%d/%m/%Y %I:%M %p')
    doc = SimpleDocTemplate(
        out, pagesize=PAGE, leftMargin=MARGIN_X, rightMargin=MARGIN_X, topMargin=17 * mm, bottomMargin=16 * mm,
        title=f'ProjectBudget – {title}', author='Sria Infotech',
    )
    meta = f'Reporting period: <b>{escape(period_text(data.filters))}</b> &nbsp;·&nbsp; Generated {escape(generated)}'
    if filters_text(data.filters):
        meta += f' &nbsp;·&nbsp; Filters: {escape(filters_text(data.filters))}'
    story = [Paragraph(escape(title), STYLE_TITLE), Spacer(1, 2), Paragraph(meta, STYLE_META), Spacer(1, 8)]

    cards = [[Paragraph(escape(label), STYLE_KPI_LABEL) for label, _, _ in kpis(data.summary)],
             [Paragraph(escape(value), STYLE_KPI_VALUE) for _, value, _ in kpis(data.summary)]]
    kpi_table = Table(cards, colWidths=[WIDTH / 5] * 5)
    kpi_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, RULE), ('INNERGRID', (0, 0), (-1, -1), 0.6, RULE),
        ('LINEBELOW', (0, 0), (-1, 0), 0, colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story += [kpi_table, Spacer(1, 4), Paragraph(
        escape('Revenue: invoices issued in the period (not Draft / Cancelled), excluding tax. Expenses: cost-bearing '
               'expenses + vendor bill payments in the period. Profit = Revenue − Expenses. Outstanding and Collection '
               'Rate: the invoices issued in the period - unpaid today, and received so far ÷ amount due.'), STYLE_NOTE)]
    for oc in data.summary['other_currencies']:
        story.append(Paragraph(escape(
            f'{oc["currency"]} invoices (not included above): revenue {money_text(oc["revenue"], oc["currency"])}, '
            f'outstanding {money_text(oc["outstanding"], oc["currency"])}, collection {rate_text(oc["collection_rate"])}, '
            f'{oc["invoice_count"]} invoices.'), STYLE_NOTE))

    for category, rows in _sections(data):
        fields = [next(fd for fd in FIELDS[category] if fd[0] == key) for key in PDF_FIELDS[category]]
        total_keys = [k for k in money_keys(category) if k in PDF_FIELDS[category]]
        base_keys = [k for k in base_money_keys(category) if k in total_keys]
        story += [Spacer(1, 6), CondPageBreak(35 * mm),
                  Paragraph(escape(f'{CATEGORIES[category]} · {len(rows)} {"record" if len(rows) == 1 else "records"}'), STYLE_H2)]
        if rows:
            story.append(_pdf_table(fields, rows, total_keys, base_keys))
        else:
            story.append(Paragraph('No records match these filters.', STYLE_META))

    doc.build(story, canvasmaker=_canvas_class(BRAND, f'{title} · {period_text(data.filters)}',
                                               f'Generated {generated} · Confidential – for internal use'))
    return out.getvalue()
