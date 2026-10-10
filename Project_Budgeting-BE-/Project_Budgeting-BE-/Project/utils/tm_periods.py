"""
Time & Material multi-month tracking.

    sync_tm_periods(project)          create / update / retire the monthly ProjectPeriod rows
    period_financials(project)        per-month figures + project totals (sum of all months)
    period_detail(project, period)    one month's figures with the transactions behind them

A period stores only its configured budget and billing amount. Everything
else is derived from real transactions, bucketed into the month of their
date - nothing is generated, and each transaction lands in exactly one month
(dates before the first / after the last month fall into that first / last
month), so the sum of the months is the project total:

    expenses       Expense.expense_date (cost-bearing; employee/freelancer
                   categories excluded - that cost is the resource cost)
    vendor_bills   OutgoingPayment.payment_date (paid amounts only)
    labour         task allocated hours x assignee rate, in the task's due-date
                   month, else its creation month (utils/labour_cost.py)
    resources      flat-fee / vendor / external project resources: assigned
                   (monthly) cost for each started month they're active in
    invoices       finances.Invoice.billing_period (cancelled ones excluded);
                   received = payments on those invoices, so partial payments count

Timers and timesheets are never used.
"""
from calendar import monthrange
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .labour_cost import is_task_costed, task_labour_lines

ZERO = Decimal("0.00")
Q2 = Decimal("0.01")
# Resource expense categories - their cost reaches the period as resource cost.
RESOURCE_EXPENSE_CATEGORIES = ('employee_cost', 'freelancer')


def month_start(d):
    return d.replace(day=1)


def month_end(d):
    return d.replace(day=monthrange(d.year, d.month)[1])


def next_month(d):
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def project_months(project):
    """First day of every month from the project's start month through its end month."""
    if not (project.start_date and project.end_date) or project.end_date < project.start_date:
        return []
    months, m, last = [], month_start(project.start_date), month_start(project.end_date)
    while m <= last:
        months.append(m)
        m = next_month(m)
    return months


def default_amounts(project):
    """(budget, billing) a new month starts with - monthly_budget falls back to the billing amount."""
    billing = project.monthly_billing_amount or ZERO
    budget = project.monthly_budget if project.monthly_budget is not None else billing
    return budget, billing


@transaction.atomic
def sync_tm_periods(project, today=None):
    """
    Make the project's periods match its dates and monthly amounts. Safe to
    call any number of times:
      - missing months are created with the project's monthly budget / billing
      - current and future months follow amount changes, unless edited by hand;
        a month's billing amount is frozen once it has an open invoice
      - past months keep their amounts
      - months that fall outside the dates are deleted, or deactivated when
        they have invoices (history is never removed)
      - invoices raised before periods existed are linked by their period start
    """
    from finances.models import Invoice
    from Project.models import Project, ProjectPeriod

    if project.engagement_type != 'time_and_material':
        return
    current = month_start(today or timezone.localdate())
    # Lock the project row so two concurrent syncs can't both create a month.
    Project.objects.select_for_update().filter(pk=project.pk).first()

    existing = {p.month: p for p in ProjectPeriod.objects.filter(project=project)}
    budget, billing = default_amounts(project)

    for m in project_months(project):
        start, end = max(m, project.start_date), min(month_end(m), project.end_date)
        period = existing.pop(m, None)
        if period is None:
            ProjectPeriod.objects.create(
                project=project, month=m, period_start=start, period_end=end,
                budget_amount=budget, billing_amount=billing,
            )
            continue

        changed = []
        if (period.period_start, period.period_end, period.is_active) != (start, end, True):
            period.period_start, period.period_end, period.is_active = start, end, True
            changed += ['period_start', 'period_end', 'is_active']
        if m >= current and not period.amounts_overridden:
            if period.budget_amount != budget:
                period.budget_amount = budget
                changed.append('budget_amount')
            if period.billing_amount != billing and not period.invoices.exclude(status='Cancelled').exists():
                period.billing_amount = billing
                changed.append('billing_amount')
        if changed:
            period.save(update_fields=changed + ['updated_at'])

    # Months no longer inside the project dates
    for period in existing.values():
        if period.invoices.exists():
            if period.is_active:
                period.is_active = False
                period.save(update_fields=['is_active', 'updated_at'])
        else:
            period.delete()

    # Link invoices raised before periods existed (only billing_period_start set)
    periods = {p.month: p for p in ProjectPeriod.objects.filter(project=project)}
    legacy = (
        Invoice.objects
        .filter(project=project, billing_period__isnull=True, billing_period_start__isnull=False)
        .order_by('created_at')
    )
    for invoice in legacy:
        period = periods.get(month_start(invoice.billing_period_start))
        if period is None:
            continue
        if invoice.status != 'Cancelled' and period.invoices.exclude(status='Cancelled').exists():
            continue  # month already has its open invoice - leave the extra one unlinked
        Invoice.objects.filter(pk=invoice.pk).update(billing_period=period)


def _collect(project, periods, today, with_items=False):
    """Bucket every cost transaction of the project into its period month."""
    from finances.models import OutgoingPayment, project_vendor_bills

    months = [p.month for p in periods]

    def bucket(d):
        m = month_start(d)
        return min(max(m, months[0]), months[-1])

    totals = defaultdict(lambda: defaultdict(lambda: ZERO))
    items = defaultdict(lambda: defaultdict(list))

    expenses = (
        project.expenses.cost_bearing()
        .exclude(category__in=RESOURCE_EXPENSE_CATEGORIES)
        .values('id', 'expense_date', 'amount', 'category', 'description')
    )
    for e in expenses:
        m = bucket(e['expense_date'])
        totals[m]['expenses'] += e['amount'] or ZERO
        if with_items:
            items[m]['expenses'].append({
                "id": e['id'], "date": e['expense_date'], "amount": e['amount'],
                "category": e['category'], "description": e['description'],
            })

    payments = (
        OutgoingPayment.objects.filter(vendor_bill__in=project_vendor_bills(project))
        .values('id', 'payment_date', 'amount', 'vendor_bill_id', 'vendor_bill__bill_no', 'vendor__name')
    )
    for pay in payments:
        m = bucket(pay['payment_date'])
        totals[m]['vendor_bills'] += pay['amount'] or ZERO
        if with_items:
            items[m]['vendor_bills'].append({
                "id": pay['id'], "date": pay['payment_date'], "amount": pay['amount'],
                "vendor_bill": pay['vendor_bill_id'], "bill_no": pay['vendor_bill__bill_no'],
                "vendor": pay['vendor__name'],
            })

    for line in task_labour_lines(project):
        m = bucket(line.date)
        totals[m]['labour'] += line.cost
        totals[m]['labour_hours'] += line.hours
        if line.unrated:
            totals[m]['unrated_hours'] += line.hours
        if with_items:
            items[m]['labour'].append({
                "task": line.task_id, "title": line.title, "assignee": line.assignee,
                "is_freelancer": line.is_freelancer, "date": line.date, "hours": line.hours,
                "rate": line.rate, "cost": line.cost.quantize(Q2), "unrated": line.unrated,
            })

    # Resources not costed from tasks: their monthly assigned cost, for each
    # month that has started and that they're staffed in. Future months keep
    # actual cost at 0 and carry the same amount as planned (committed) cost.
    assignments = (
        project.resource_assignments
        .filter(is_active=True, milestone__isnull=True)
        .exclude(status='removed')
    )
    for a in assignments:
        if is_task_costed(a):
            continue
        for p in periods:
            if a.start_date > p.period_end or (a.end_date and a.end_date < p.period_start):
                continue
            if p.period_start > today:
                totals[p.month]['planned_resources'] += a.assigned_cost
                continue
            totals[p.month]['resources'] += a.assigned_cost
            if with_items:
                items[p.month]['resources'].append({
                    "id": a.id, "name": a.resource_name, "resource_type": a.resource_type,
                    "role": a.role, "amount": a.assigned_cost,
                })

    return totals, items


def _pct(part, whole):
    return (part / whole * 100).quantize(Q2) if whole else None


def _period_row(project, period, costs, invoices, current):
    labour = costs['labour'].quantize(Q2)
    resource_cost = labour + costs['resources']
    expenses = costs['expenses']
    vendor_bills = costs['vendor_bills']
    actual_cost = resource_cost + expenses + vendor_bills
    budget = period.budget_amount

    invoiced = sum((i.total_amount for i in invoices), ZERO)
    revenue = sum((i.total_amount - i.tax_amount for i in invoices), ZERO)  # tax is not income
    received = sum((i.paid_amount for i in invoices), ZERO)
    outstanding = sum((i.balance_amount for i in invoices), ZERO)
    profit = revenue - actual_cost
    invoice = invoices[0] if invoices else None

    if invoice is None:
        payment_status = 'not_invoiced'
    elif outstanding <= 0:
        payment_status = 'paid'
    elif received > 0:
        payment_status = 'partially_paid'
    else:
        payment_status = 'unpaid'

    if period.month < current:
        timing = 'past'
    elif period.month == current:
        timing = 'current'
    else:
        timing = 'future'

    return {
        "id": period.id,
        "month": period.month,
        "label": period.month.strftime('%b %Y'),
        "period_start": period.period_start,
        "period_end": period.period_end,
        "timing": timing,
        "is_active": period.is_active,
        "amounts_overridden": period.amounts_overridden,
        "budget_amount": budget,
        "billing_amount": period.billing_amount,
        "labour_cost": labour,
        "labour_hours": costs['labour_hours'].quantize(Q2),
        "unrated_hours": costs['unrated_hours'].quantize(Q2),
        "assigned_resource_cost": costs['resources'],
        "resource_cost": resource_cost,
        "expenses": expenses,
        "vendor_bills": vendor_bills,
        "actual_cost": actual_cost,
        "planned_cost": costs['planned_resources'],  # future months: committed resource cost, not yet incurred
        "remaining_budget": budget - actual_cost,
        "budget_used_percent": _pct(actual_cost, budget),
        "invoiced_amount": invoiced,
        "revenue": revenue,
        "received_amount": received,
        "outstanding_amount": outstanding,
        "profit": profit,
        "profit_margin": _pct(profit, revenue),
        "invoice": {
            "id": invoice.id,
            "invoice_no": invoice.invoice_no,
            "status": invoice.status,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "total_amount": invoice.total_amount,
            "paid_amount": invoice.paid_amount,
            "balance_amount": invoice.balance_amount,
        } if invoice else None,
        "invoice_status": invoice.status if invoice else 'Not Invoiced',
        "payment_status": payment_status,
        "can_generate_invoice": (
            period.is_active and invoice is None and period.billing_amount > 0
            and period.month <= current and bool(project.client_id)
        ),
    }


TOTAL_FIELDS = (
    'budget_amount', 'billing_amount', 'labour_cost', 'labour_hours', 'unrated_hours',
    'assigned_resource_cost', 'resource_cost', 'expenses', 'vendor_bills', 'actual_cost', 'planned_cost',
    'remaining_budget', 'invoiced_amount', 'revenue', 'received_amount', 'outstanding_amount', 'profit',
)


def _totals(rows):
    totals = {f: sum((r[f] for r in rows), ZERO) for f in TOTAL_FIELDS}
    totals["budget_used_percent"] = _pct(totals['actual_cost'], totals['budget_amount'])
    totals["profit_margin"] = _pct(totals['profit'], totals['revenue'])
    totals["months"] = len(rows)
    totals["months_invoiced"] = sum(1 for r in rows if r['invoice'])
    totals["months_paid"] = sum(1 for r in rows if r['payment_status'] == 'paid')
    return totals


def _invoices_by_period(periods):
    from finances.models import Invoice
    by_period = defaultdict(list)
    for invoice in Invoice.objects.filter(billing_period__in=periods).exclude(status='Cancelled').order_by('created_at'):
        by_period[invoice.billing_period_id].append(invoice)
    return by_period


def period_financials(project, today=None):
    """(rows, totals) - one row per month (inactive ones included, they hold history)."""
    from Project.models import ProjectPeriod

    today = today or timezone.localdate()
    periods = list(ProjectPeriod.objects.filter(project=project).order_by('month'))
    if not periods:
        return [], _totals([])
    costs, _ = _collect(project, periods, today)
    invoices = _invoices_by_period(periods)
    current = month_start(today)
    rows = [_period_row(project, p, costs[p.month], invoices.get(p.id, []), current) for p in periods]
    return rows, _totals(rows)


def period_detail(project, period, today=None):
    """One month's row plus the transactions behind each figure."""
    from finances.models import InvoicePayment
    from Project.models import ProjectPeriod

    today = today or timezone.localdate()
    periods = list(ProjectPeriod.objects.filter(project=project).order_by('month'))
    costs, items = _collect(project, periods, today, with_items=True)
    invoices = _invoices_by_period([period]).get(period.id, [])
    row = _period_row(project, period, costs[period.month], invoices, month_start(today))

    all_invoices = list(period.invoices.order_by('created_at'))  # cancelled ones too, for history
    payments = defaultdict(list)
    for pay in InvoicePayment.objects.filter(invoice__in=all_invoices).order_by('payment_date'):
        payments[pay.invoice_id].append({
            "id": pay.id, "payment_date": pay.payment_date, "amount": pay.amount,
            "payment_method": pay.payment_method, "reference_no": pay.reference_no,
        })
    row["items"] = {
        "expenses": items[period.month]['expenses'],
        "vendor_bills": items[period.month]['vendor_bills'],
        "labour": items[period.month]['labour'],
        "resources": items[period.month]['resources'],
        "invoices": [
            {
                "id": inv.id, "invoice_no": inv.invoice_no, "status": inv.status,
                "issue_date": inv.issue_date, "due_date": inv.due_date,
                "total_amount": inv.total_amount, "paid_amount": inv.paid_amount,
                "balance_amount": inv.balance_amount, "payments": payments[inv.id],
            }
            for inv in all_invoices
        ],
    }
    return row
