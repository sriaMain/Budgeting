/**
 * Project Details filters applied to milestones (all of a project's milestones are loaded, so this
 * runs in the browser): due date range, status, financial / billing / payment status, search.
 * Status words match the backend (Project/project_filters.py).
 */
import type { ProjectFilterValues } from '../hooks/useProjectFilters';

export interface MilestoneLike {
    name: string;
    description?: string;
    status: string;
    planned_end_date?: string | null;
    budget_amount?: string | number | null;
    actual_cost?: string | number | null;
    billing_status?: string;
    payment_status?: string;
}

const num = (v: unknown) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(x) ? x : 0;
};

/** not_invoiced / draft -> not_sent; sent / partially_paid / paid / overdue as they are. */
export const milestonePaymentStatus = (m: MilestoneLike) =>
    !m.payment_status || m.payment_status === 'not_invoiced' || m.payment_status === 'draft' ? 'not_sent' : m.payment_status;

/** no_budget | on_track (< 80% used) | at_risk (80-100%) | over_budget (> 100%). */
export const milestoneFinancialStatus = (m: MilestoneLike) => {
    const budget = num(m.budget_amount);
    if (budget <= 0) return 'no_budget';
    const used = (num(m.actual_cost) / budget) * 100;
    return used > 100 ? 'over_budget' : used >= 80 ? 'at_risk' : 'on_track';
};

export function matchesMilestoneFilters(m: MilestoneLike, f: ProjectFilterValues): boolean {
    if (f.status && m.status !== f.status) return false;
    if (f.dateFrom || f.dateTo) {
        const due = (m.planned_end_date || '').slice(0, 10);
        if (!due || (f.dateFrom && due < f.dateFrom) || (f.dateTo && due > f.dateTo)) return false;
    }
    if (f.billingStatus && m.billing_status !== f.billingStatus) return false;
    if (f.paymentStatus && milestonePaymentStatus(m) !== f.paymentStatus) return false;
    if (f.financialStatus && milestoneFinancialStatus(m) !== f.financialStatus) return false;
    const q = f.search.trim().toLowerCase();
    if (q && ![m.name, m.description].some((v) => (v || '').toLowerCase().includes(q))) return false;
    return true;
}
