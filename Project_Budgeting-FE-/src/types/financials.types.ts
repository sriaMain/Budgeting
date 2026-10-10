/**
 * Shared types for the Project Financial Management module (Expenses,
 * Invoices, Payments, Budget, Financial Summary). Previously these were
 * redeclared locally (often as `any`) in every component that needed them -
 * this file is the single source of truth going forward.
 */

export interface ExpensePayment {
    id: number;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_no: string;
    created_at: string;
}

export type ExpenseCategory =
    | 'rent' | 'travel' | 'food' | 'internet' | 'electricity' | 'software'
    | 'maintenance' | 'equipment' | 'vendor' | 'employee_cost' | 'freelancer' | 'other';

export type ExpenseStatus = 'unpaid' | 'partially_paid' | 'paid';

export interface Expense {
    id: number;
    expense_no: string;
    category: ExpenseCategory;
    project: number | null;
    vendor: number | null;
    vendor_name?: string | null;
    freelancer: number | null;
    freelancer_name?: string | null;
    employee: number | null;
    employee_name?: string | null;
    gl_account: number | null;
    milestone: number | null;
    expense_date: string;
    description: string;
    amount: number;
    notes?: string;
    status: ExpenseStatus;
    total_paid: number;
    balance_amount: number;
    is_fully_paid: boolean;
    payment_count: number;
    payments: ExpensePayment[];
    created_by: number | null;
    created_at: string;
}

export interface InvoicePayment {
    id: number;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_no: string;
    notes?: string;
    created_at: string;
}

export type InvoiceStatus = 'Draft' | 'Issued' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface Invoice {
    id: number;
    invoice_no: string;
    project: number | null;
    client: number;
    issue_date: string;
    due_date: string;
    status: InvoiceStatus;
    sub_total: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
}

export interface OutgoingPayment {
    id: number;
    vendor_bill: number;
    bill_no?: string;
    vendor: number;
    vendor_name?: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_no: string;
    created_at: string;
}

export interface BudgetLine {
    id: number;
    description: string;
    gl_account: number;
    gl_account_code: string;
    gl_account_name: string;
    gl_account_type: string;
    gl_account_is_active: boolean;
    planned_amount: number;
    /** Expenses + paid bill amounts under this line's GL Account (backend-computed). */
    actual_amount?: number | string;
    variance?: number | string;
}

/** One row of the project Expenses tab (/projects/<id>/cost-entries/) - an
 * existing Expense or VendorBill, never a copy. */
export interface CostEntry {
    key: string;
    type: 'expense' | 'bill';
    id: number;
    ref_no: string;
    date: string;
    description: string;
    category: string | null;
    payee: string | null;
    gl_account: number | null;
    gl_account_label: string | null;
    milestone: number | null;
    milestone_name: string | null;
    amount: number;
    paid_amount: number;
    status: 'unpaid' | 'partially_paid' | 'paid';
    /** Expense only: its cost is carried by this bill, so it isn't counted twice. */
    linked_bill_no?: string | null;
    /** Bill only: the expense recorded against this bill, if any. */
    linked_expense_no?: string | null;
}

/** One row of Section 15's Financial Breakdown -> Revenue Breakdown table. */
export interface InvoiceBreakdownRow {
    invoice_no: string;
    amount: number;
    paid: number;
    outstanding: number;
}

/** Section 15's Financial Breakdown -> Cost Breakdown. */
export interface CostBreakdown {
    resource_cost: number;
    employee_cost: number;
    freelancer_cost: number;
    miscellaneous: number;
    by_gl_account: { gl_account: string; amount: number }[];
}

export interface FixedFinancialSummary {
    engagement_type: 'fixed';
    contract_value: number;
    budget: number;
    resource_cost: number;
    /** Cost of task allocated hours x assignee cost rate - part of resource_cost. */
    labour_cost: number;
    allocated_hours: number;
    /** Allocated hours with no cost rate (unassigned task, or no assignment rate / user charges/hour). */
    unrated_hours: number;
    actual_cost: number;
    billed_amount: number;
    received_amount: number;
    outstanding_amount: number;
    remaining_budget: number;
    variance: number;
    gross_margin: number;
    margin_percent: number | null;
    is_over_budget: boolean;
    outgoing_payments: number;
    net_cash_position: number;
    cost_breakdown: CostBreakdown;
    invoice_breakdown: InvoiceBreakdownRow[];
}

export interface TMFinancialSummary {
    engagement_type: 'time_and_material';
    monthly_revenue: number;
    monthly_budget: number | null;
    /** Project totals below are the sum of the monthly periods (see TMPeriodRow). */
    months: number;
    months_invoiced: number;
    months_paid: number;
    total_budget: number;
    planned_billing: number;
    remaining_budget: number;
    budget_used_percent: number | null;
    resource_cost: number;
    labour_cost: number;
    allocated_hours: number;
    unrated_hours: number;
    misc_expenses: number;
    vendor_bills_amount: number;
    /** Billed amount excluding tax. */
    revenue: number;
    net_margin_percent: number | null;
    /** Invoices not tied to a month - shown separately, never folded into the months. */
    other_billed_amount: number;
    other_received_amount: number;
    total_cost: number;
    gross_margin: number;
    net_profit: number;
    margin_percent: number | null;
    billed_amount: number;
    received_amount: number;
    outstanding_amount: number;
    outgoing_payments: number;
    net_cash_position: number;
    cost_breakdown: CostBreakdown;
    invoice_breakdown: InvoiceBreakdownRow[];
}

export type ProjectFinancialSummary = FixedFinancialSummary | TMFinancialSummary;

/** One month of a Time & Material project - GET /projects/<id>/periods/. */
export interface TMPeriodRow {
    id: number;
    /** First day of the month (YYYY-MM-01). */
    month: string;
    label: string;
    period_start: string;
    period_end: string;
    timing: 'past' | 'current' | 'future';
    /** False when the month is outside the project dates but kept for its invoices. */
    is_active: boolean;
    amounts_overridden: boolean;
    budget_amount: number;
    billing_amount: number;
    labour_cost: number;
    labour_hours: number;
    unrated_hours: number;
    assigned_resource_cost: number;
    resource_cost: number;
    expenses: number;
    vendor_bills: number;
    actual_cost: number;
    /** Future months: committed resource cost not yet incurred (0 for started months). */
    planned_cost: number;
    remaining_budget: number;
    budget_used_percent: number | null;
    invoiced_amount: number;
    /** Invoiced amount excluding tax. */
    revenue: number;
    received_amount: number;
    outstanding_amount: number;
    profit: number;
    profit_margin: number | null;
    invoice: {
        id: number;
        invoice_no: string;
        status: string;
        issue_date: string;
        due_date: string;
        total_amount: number;
        paid_amount: number;
        balance_amount: number;
    } | null;
    invoice_status: string;
    payment_status: 'not_invoiced' | 'unpaid' | 'partially_paid' | 'paid';
    can_generate_invoice: boolean;
}

export type TMPeriodTotals = Pick<TMPeriodRow,
    'budget_amount' | 'billing_amount' | 'labour_cost' | 'labour_hours' | 'unrated_hours' |
    'assigned_resource_cost' | 'resource_cost' | 'expenses' | 'vendor_bills' | 'actual_cost' | 'planned_cost' |
    'remaining_budget' | 'budget_used_percent' | 'invoiced_amount' | 'revenue' | 'received_amount' |
    'outstanding_amount' | 'profit' | 'profit_margin'
> & { months: number; months_invoiced: number; months_paid: number };

export interface TMPeriodsResponse {
    current_month: string;
    /** Default tax % for Generate Invoice - the project quotation's tax (0 without one). */
    tax_percentage: number;
    quotation: { quote_no: number; quote_name: string } | null;
    periods: TMPeriodRow[];
    totals: TMPeriodTotals;
}

/** GET /projects/<id>/periods/<period_id>/ - a month plus the transactions behind it. */
export interface TMPeriodDetail extends TMPeriodRow {
    items: {
        expenses: { id: number; date: string; amount: number; category: string; description: string }[];
        vendor_bills: { id: number; date: string; amount: number; vendor_bill: number; bill_no: string; vendor: string }[];
        labour: { task: number; title: string; assignee: string; is_freelancer: boolean; date: string; hours: number; rate: number; cost: number; unrated: boolean }[];
        resources: { id: number; name: string | null; resource_type: string; role: string; amount: number }[];
        invoices: {
            id: number; invoice_no: string; status: string; issue_date: string; due_date: string;
            total_amount: number; paid_amount: number; balance_amount: number;
            payments: { id: number; payment_date: string; amount: number; payment_method: string; reference_no: string }[];
        }[];
    };
}

export interface FinancialAuditLogEntry {
    id: number;
    entity_type: 'expense' | 'invoice' | 'payment';
    entity_type_display: string;
    entity_id: number;
    project: number | null;
    action: string;
    action_display: string;
    field_name: string;
    old_value: string;
    new_value: string;
    performed_by_name: string;
    created_at: string;
}
