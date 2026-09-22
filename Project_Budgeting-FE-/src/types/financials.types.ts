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
    resource_cost: number;
    misc_expenses: number;
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
