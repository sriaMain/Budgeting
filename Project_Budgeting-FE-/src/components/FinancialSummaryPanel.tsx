/**
 * FinancialSummaryPanel
 * Project Types and Project Financial Management module - the type-aware
 * financial summary (Sections 5, 8, 9): one KPI shape for Fixed Budget
 * projects, a different one for Time & Material, both sourced from the
 * same /projects/<id>/financial-summary/ endpoint, which itself derives
 * every figure from the shared Invoice/InvoicePayment/Expense/GLAccount
 * records (Section 13) rather than a duplicate ledger.
 *
 * Presentation only: every figure below comes straight from that endpoint.
 * Laid out as open ERP-style sections (heading + rows/tables) rather than a
 * card per value.
 */

import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import type {
    FixedFinancialSummary, TMFinancialSummary, ProjectFinancialSummary,
} from '../types/financials.types';

type FixedSummary = FixedFinancialSummary;
type TMSummary = TMFinancialSummary;
type Summary = ProjectFinancialSummary;

interface FinancialSummaryPanelProps {
    projectId: string;
    engagementType: 'fixed' | 'time_and_material';
    currency?: string;
}

const n = (v: number | string | undefined | null) => Number(v) || 0;
const fmt = (v: number | string | undefined | null, currency: string) =>
    `${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);

type Tone = 'default' | 'good' | 'bad' | 'warn';

const TONE_CLASS: Record<Tone, string> = {
    default: 'text-gray-900 dark:text-white',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-amber-600 dark:text-amber-400',
};

const signTone = (v: number | string | null | undefined): Tone => (n(v) < 0 ? 'bad' : 'good');

/* ---------- Layout primitives (open sections, no cards) ---------- */

const SectionHeading: React.FC<{ title: string; aside?: React.ReactNode }> = ({ title, aside }) => (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">{title}</h3>
        {aside}
    </div>
);

/** Label-over-value figure used in the overview grid. */
const Stat: React.FC<{ label: string; value: string; tone?: Tone }> = ({ label, value, tone = 'default' }) => (
    <div className="min-w-0">
        <dt className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</dt>
        <dd className={`mt-0.5 text-lg font-semibold tabular-nums truncate ${TONE_CLASS[tone]}`} title={value}>{value}</dd>
    </div>
);

/** Label ... value financial row, statement style. */
const Row: React.FC<{ label: string; value: string; tone?: Tone; strong?: boolean }> = ({ label, value, tone = 'default', strong }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
        <dt className={`text-sm ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{label}</dt>
        <dd className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-bold' : 'font-medium'} ${TONE_CLASS[tone]}`}>{value}</dd>
    </div>
);

const RowRule = () => <div className="border-t border-gray-200 dark:border-gray-800 my-1" />;

/** How much of the cost comes from task allocated hours, plus a warning for hours with no rate. */
const LabourNote: React.FC<{ labourCost: number; allocatedHours: number; unratedHours: number; currency: string }> = ({ labourCost, allocatedHours, unratedHours, currency }) => (
    <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>Includes {fmt(labourCost, currency)} labour from {n(allocatedHours).toFixed(2)} h allocated to tasks (allocated hours x assignee rate).</p>
        {n(unratedHours) > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
                {n(unratedHours).toFixed(2)} allocated h are not costed (task unassigned, or assignee has no cost rate) - assign the task and set a rate on the resource assignment, user profile or freelancer's hourly rate.
            </p>
        )}
    </div>
);

const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => {
    const cls: Record<Tone, string> = {
        default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        good: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
        bad: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
        warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    };
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls[tone]}`}>{children}</span>;
};

/** Overview figures: one row of budget figures, one row of billing figures. */
const OVERVIEW_ROW = 'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4';

/** Overview (wide) beside Profitability (narrow) on large screens. */
const PAGE_GRID = 'grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-8';

export const FinancialSummaryPanel: React.FC<FinancialSummaryPanelProps> = ({ projectId, currency = 'INR' }) => {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // T&M monthly spending budget (Project.monthly_budget) - separate from the billing amount
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [budgetInput, setBudgetInput] = useState('');
    const [isSavingBudget, setIsSavingBudget] = useState(false);

    const fetchSummary = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<Summary>(`/projects/${projectId}/financial-summary/`);
            setSummary(res.data);
        } catch (error) {
            console.error('Failed to fetch financial summary:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const saveMonthlyBudget = async (value: string | null) => {
        const amount = value === null ? null : parseFloat(value);
        if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
            toast.error('Enter a valid monthly budget');
            return;
        }
        setIsSavingBudget(true);
        try {
            await axiosInstance.put(`/projects/${projectId}/`, { monthly_budget: amount });
            toast.success(amount === null ? 'Monthly budget now follows the billing amount' : 'Monthly budget updated');
            setIsEditingBudget(false);
            await fetchSummary();
        } catch (error: any) {
            const data = error?.response?.data;
            toast.error(data?.monthly_budget?.[0] || data?.error || 'Failed to update monthly budget');
        } finally {
            setIsSavingBudget(false);
        }
    };

    // Only the first load blanks the panel - refreshes keep the monthly table (and its drawers) mounted.
    if (!summary) {
        return <p className="text-sm text-gray-500 dark:text-gray-400 p-4">{isLoading ? 'Loading financial summary...' : 'Financial summary is unavailable.'}</p>;
    }

    if (summary.engagement_type === 'fixed') {
        const s = summary as FixedSummary;
        return (
            <div className="space-y-8">
                <div className={PAGE_GRID}>
                    <section className="lg:col-span-2">
                        <SectionHeading
                            title="Financial Overview"
                            aside={s.is_over_budget ? <Badge tone="bad">Over Budget</Badge> : undefined}
                        />
                        <dl className={OVERVIEW_ROW}>
                            <Stat label="User Budget" value={fmt(s.budget, currency)} />
                            <Stat label="Actual Cost" value={fmt(s.actual_cost, currency)} tone={s.is_over_budget ? 'bad' : 'default'} />
                            <Stat label="Remaining Budget" value={fmt(s.remaining_budget, currency)} tone={n(s.remaining_budget) < 0 ? 'bad' : 'default'} />
                        </dl>
                        <LabourNote labourCost={s.labour_cost} allocatedHours={s.allocated_hours} unratedHours={s.unrated_hours} currency={currency} />
                        <div className="border-t border-gray-100 dark:border-gray-800/70 my-4" />
                        <dl className={OVERVIEW_ROW}>
                            <Stat label="Invoiced" value={fmt(s.billed_amount, currency)} />
                            <Stat label="Received" value={fmt(s.received_amount, currency)} tone={n(s.received_amount) > 0 ? 'good' : 'default'} />
                            <Stat label="Outstanding" value={fmt(s.outstanding_amount, currency)} tone={n(s.outstanding_amount) > 0 ? 'warn' : 'default'} />
                        </dl>
                    </section>

                    <section>
                        <SectionHeading title="Profitability" />
                        <dl>
                            <Row label="Revenue (Invoiced)" value={fmt(s.billed_amount, currency)} />
                            <Row label="Actual Cost" value={`- ${fmt(s.actual_cost, currency)}`} />
                            <RowRule />
                            <Row label="Gross Profit" value={fmt(s.gross_margin, currency)} tone={signTone(s.gross_margin)} strong />
                            <Row label="Margin" value={pct(s.margin_percent)} tone={s.margin_percent == null ? 'default' : signTone(s.margin_percent)} strong />
                        </dl>
                    </section>
                </div>
            </div>
        );
    }

    const t = summary as TMSummary;
    const overBudget = n(t.remaining_budget) < 0;
    return (
        <div className="space-y-8">
            <div className={PAGE_GRID}>
                <section className="lg:col-span-2">
                    <SectionHeading
                        title="Financial Overview"
                        aside={overBudget ? <Badge tone="bad">Over Budget</Badge> : undefined}
                    />
                    <dl className={OVERVIEW_ROW}>
                        <Stat label={`Total Budget (${t.months} months)`} value={fmt(t.total_budget, currency)} />
                        <Stat label="Actual Cost" value={fmt(t.total_cost, currency)} tone={overBudget ? 'bad' : 'default'} />
                        <Stat label="Remaining Budget" value={fmt(t.remaining_budget, currency)} tone={overBudget ? 'bad' : 'default'} />
                    </dl>
                    <LabourNote labourCost={t.labour_cost} allocatedHours={t.allocated_hours} unratedHours={t.unrated_hours} currency={currency} />
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                        <span>
                            Billing: <span className="font-medium text-gray-900 dark:text-white">{fmt(t.monthly_revenue, currency)}</span> / month
                            {' · '}Spending budget:{' '}
                            <span className="font-medium text-gray-900 dark:text-white">{fmt(t.monthly_budget ?? t.monthly_revenue, currency)}</span> / month
                            {t.monthly_budget == null && <span className="text-gray-400"> (same as billing)</span>}
                        </span>
                        {isEditingBudget ? (
                            <span className="inline-flex items-center gap-2">
                                <input
                                    type="number" min={0} step="0.01"
                                    value={budgetInput}
                                    onChange={(e) => setBudgetInput(e.target.value)}
                                    aria-label="Monthly spending budget"
                                    className="w-36 px-2 py-1 text-xs text-right tabular-nums border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                />
                                <button type="button" onClick={() => saveMonthlyBudget(budgetInput)} disabled={isSavingBudget} className="px-2.5 py-1 font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                                    {isSavingBudget ? 'Saving...' : 'Save'}
                                </button>
                                {t.monthly_budget != null && (
                                    <button type="button" onClick={() => saveMonthlyBudget(null)} disabled={isSavingBudget} className="px-2.5 py-1 font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                                        Use billing amount
                                    </button>
                                )}
                                <button type="button" onClick={() => setIsEditingBudget(false)} disabled={isSavingBudget} className="px-2 py-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                                    Cancel
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setBudgetInput(String(n(t.monthly_budget ?? t.monthly_revenue))); setIsEditingBudget(true); }}
                                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                                Adjust budget
                            </button>
                        )}
                    </div>
                    {isEditingBudget && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Applies to the current and upcoming months (months edited individually keep their own budget). Past months and the billing amount don't change.
                        </p>
                    )}
                    <div className="border-t border-gray-100 dark:border-gray-800/70 my-4" />
                    <dl className={OVERVIEW_ROW}>
                        <Stat label="Invoiced" value={fmt(t.billed_amount, currency)} />
                        <Stat label="Received" value={fmt(t.received_amount, currency)} tone={n(t.received_amount) > 0 ? 'good' : 'default'} />
                        <Stat label="Outstanding" value={fmt(t.outstanding_amount, currency)} tone={n(t.outstanding_amount) > 0 ? 'warn' : 'default'} />
                    </dl>
                    {n(t.other_billed_amount) > 0 && (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            Not included above: {fmt(t.other_billed_amount, currency)} invoiced ({fmt(t.other_received_amount, currency)} received) on invoices that aren't linked to a month.
                        </p>
                    )}
                </section>

                <section>
                    <SectionHeading title="Profitability" />
                    <dl>
                        <Row label="Revenue (invoiced, excl. tax)" value={fmt(t.revenue, currency)} />
                        <Row label="Resource Cost" value={`- ${fmt(t.resource_cost, currency)}`} />
                        <RowRule />
                        <Row label="Gross Profit" value={fmt(t.gross_margin, currency)} tone={signTone(t.gross_margin)} strong />
                        <Row label="Expenses & Vendor Bills" value={`- ${fmt(n(t.misc_expenses) + n(t.vendor_bills_amount), currency)}`} />
                        <RowRule />
                        <Row label="Net Profit" value={fmt(t.net_profit, currency)} tone={signTone(t.net_profit)} strong />
                        <Row label="Net Margin" value={pct(t.net_margin_percent)} tone={t.net_margin_percent == null ? 'default' : signTone(t.net_margin_percent)} strong />
                    </dl>
                </section>
            </div>
        </div>
    );
};

export default FinancialSummaryPanel;
