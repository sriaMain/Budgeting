/**
 * The project-level money figures the Project Details page shows, read from the one backend
 * summary (GET /projects/<id>/financial-summary/) for both engagement types, so the KPI cards,
 * Overview and Financials tab always agree. Nothing is recalculated here except percentages.
 */
import type { ProjectFinancialSummary } from '../types/financials.types';

export interface ProjectMoney {
    budget: number;
    actualCost: number;
    remainingBudget: number;
    /** actualCost / budget x 100; null when there is no budget. */
    usedPercent: number | null;
    resourceCost: number;
    /** Expenses + paid vendor bills. */
    otherCost: number;
    /** Planned client billing: contract value (fixed) or planned monthly billing so far (T&M). */
    plannedBilling: number;
    invoiced: number;
    received: number;
    outstanding: number;
    /** received / invoiced x 100; null when nothing is invoiced. */
    collectedPercent: number | null;
    margin: number;
    marginPercent: number | null;
}

const n = (v: unknown) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(x) ? x : 0;
};

export const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

export function projectMoney(s: ProjectFinancialSummary): ProjectMoney {
    if (s.engagement_type === 'time_and_material') {
        const budget = n(s.total_budget);
        const actual = n(s.total_cost);
        const invoiced = n(s.billed_amount);
        const received = n(s.received_amount);
        return {
            budget, actualCost: actual, remainingBudget: n(s.remaining_budget), usedPercent: pct(actual, budget),
            resourceCost: n(s.resource_cost), otherCost: n(s.misc_expenses) + n(s.vendor_bills_amount),
            plannedBilling: n(s.planned_billing), invoiced, received, outstanding: n(s.outstanding_amount),
            collectedPercent: pct(received, invoiced), margin: n(s.net_profit),
            marginPercent: s.net_margin_percent == null ? null : n(s.net_margin_percent),
        };
    }
    const budget = n(s.budget);
    const actual = n(s.actual_cost);
    const invoiced = n(s.billed_amount);
    const received = n(s.received_amount);
    return {
        budget, actualCost: actual, remainingBudget: n(s.remaining_budget), usedPercent: pct(actual, budget),
        resourceCost: n(s.resource_cost), otherCost: n(s.expenses_amount) + n(s.bills_amount),
        plannedBilling: n(s.contract_value), invoiced, received, outstanding: n(s.outstanding_amount),
        collectedPercent: pct(received, invoiced), margin: n(s.gross_margin),
        marginPercent: s.margin_percent == null ? null : n(s.margin_percent),
    };
}

/** Bar colour for "share of budget used": green under 80%, amber 80-100%, red over. */
export const usedTone = (percent: number | null): 'green' | 'amber' | 'risk' =>
    percent == null || percent < 80 ? 'green' : percent <= 100 ? 'amber' : 'risk';

export const percentText = (p: number | null, digits = 0) => (p == null ? '—' : `${p.toFixed(digits)}%`);
