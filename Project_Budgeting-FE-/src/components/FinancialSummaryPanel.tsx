/**
 * FinancialSummaryPanel
 * Project Types and Project Financial Management module - the type-aware
 * financial summary (Sections 5, 8, 9): one KPI shape for Fixed Budget
 * projects, a different one for Time & Material, both sourced from the
 * same /projects/<id>/financial-summary/ endpoint, which itself derives
 * every figure from the shared Invoice/InvoicePayment/Expense/GLAccount
 * records (Section 13) rather than a duplicate ledger.
 */

import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { BudgetLinesPanel } from './BudgetLinesPanel';

interface FixedSummary {
    engagement_type: 'fixed';
    contract_value: number;
    budget: number;
    actual_cost: number;
    billed_amount: number;
    received_amount: number;
    outstanding_amount: number;
    remaining_budget: number;
    variance: number;
    gross_margin: number;
    margin_percent: number | null;
    is_over_budget: boolean;
}

interface TMSummary {
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
}

type Summary = FixedSummary | TMSummary;

interface FinancialSummaryPanelProps {
    projectId: string;
    engagementType: 'fixed' | 'time_and_material';
    currency?: string;
}

const fmt = (v: number | undefined | null, currency: string) => `${(Number(v) || 0).toLocaleString()} ${currency}`;
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);

const KpiCard: React.FC<{ label: string; value: string; tone?: 'default' | 'good' | 'bad' }> = ({ label, value, tone = 'default' }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`text-xl font-bold ${tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'}`}>
            {value}
        </p>
    </div>
);

export const FinancialSummaryPanel: React.FC<FinancialSummaryPanelProps> = ({ projectId, engagementType, currency = 'INR' }) => {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const [showTMInvoiceModal, setShowTMInvoiceModal] = useState(false);
    const [tmAmount, setTmAmount] = useState('');
    const [tmPeriodStart, setTmPeriodStart] = useState('');
    const [tmPeriodEnd, setTmPeriodEnd] = useState('');
    const [tmDueDays, setTmDueDays] = useState('30');
    const [isCreatingTMInvoice, setIsCreatingTMInvoice] = useState(false);

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

    const openTMInvoiceModal = () => {
        if (summary && summary.engagement_type === 'time_and_material') {
            setTmAmount(String(summary.monthly_revenue || ''));
        }
        setTmPeriodStart('');
        setTmPeriodEnd('');
        setTmDueDays('30');
        setShowTMInvoiceModal(true);
    };

    const handleCreateTMInvoice = async () => {
        const amount = parseFloat(tmAmount);
        if (!tmAmount || Number.isNaN(amount) || amount <= 0) {
            toast.error('Invoice amount must be greater than 0');
            return;
        }
        setIsCreatingTMInvoice(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/generate-tm-invoice/`, {
                amount,
                period_start: tmPeriodStart || undefined,
                period_end: tmPeriodEnd || undefined,
                due_days: parseInt(tmDueDays, 10) || 30,
            });
            toast.success('Invoice created (Draft)');
            setShowTMInvoiceModal(false);
            fetchSummary();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to create invoice');
        } finally {
            setIsCreatingTMInvoice(false);
        }
    };

    if (isLoading || !summary) {
        return <p className="text-sm text-gray-500 p-4">Loading financial summary...</p>;
    }

    if (summary.engagement_type === 'fixed') {
        const s = summary as FixedSummary;
        return (
            <div className="space-y-6">
                {/* Revenue / Cost / Profit / Margin / Billed / Received / Outstanding */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <KpiCard label="Contract Value" value={fmt(s.contract_value, currency)} />
                    <KpiCard label="Cost" value={fmt(s.actual_cost, currency)} />
                    <KpiCard label="Profit" value={fmt(s.gross_margin, currency)} tone={s.gross_margin < 0 ? 'bad' : 'good'} />
                    <KpiCard label="Margin %" value={pct(s.margin_percent)} tone={(s.margin_percent ?? 0) < 0 ? 'bad' : 'good'} />
                    <KpiCard label="Billed" value={fmt(s.billed_amount, currency)} />
                    <KpiCard label="Received" value={fmt(s.received_amount, currency)} />
                    <KpiCard label="Outstanding" value={fmt(s.outstanding_amount, currency)} tone={s.outstanding_amount > 0 ? 'bad' : 'default'} />
                </div>

                {/* Budget vs Actual */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-gray-900">Budget vs Actual</p>
                        {s.is_over_budget && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Over Budget</span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-gray-500">Budget</p>
                            <p className="font-semibold text-gray-900">{fmt(s.budget, currency)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Actual Cost</p>
                            <p className={`font-semibold ${s.is_over_budget ? 'text-red-600' : 'text-gray-900'}`}>{fmt(s.actual_cost, currency)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Remaining Budget</p>
                            <p className="font-semibold text-gray-900">{fmt(s.remaining_budget, currency)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Variance</p>
                            <p className={`font-semibold ${s.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(s.variance, currency)}</p>
                        </div>
                    </div>
                </div>

                {/* GL Account budget lines (Budget vs Actual by GL Account) */}
                <BudgetLinesPanel projectId={projectId} currency={currency} />
            </div>
        );
    }

    const t = summary as TMSummary;
    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={openTMInvoiceModal}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                    + Generate Period Invoice
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <KpiCard label="Revenue" value={fmt(t.monthly_revenue, currency)} />
                <KpiCard label="Cost" value={fmt(t.total_cost, currency)} />
                <KpiCard label="Profit" value={fmt(t.net_profit, currency)} tone={t.net_profit < 0 ? 'bad' : 'good'} />
                <KpiCard label="Margin %" value={pct(t.margin_percent)} tone={(t.margin_percent ?? 0) < 0 ? 'bad' : 'good'} />
                <KpiCard label="Billed" value={fmt(t.billed_amount, currency)} />
                <KpiCard label="Received" value={fmt(t.received_amount, currency)} />
                <KpiCard label="Outstanding" value={fmt(t.outstanding_amount, currency)} tone={t.outstanding_amount > 0 ? 'bad' : 'default'} />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Cost Breakdown</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-xs text-gray-500">Resource Cost</p>
                        <p className="font-semibold text-gray-900">{fmt(t.resource_cost, currency)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Miscellaneous Expenses</p>
                        <p className="font-semibold text-gray-900">{fmt(t.misc_expenses, currency)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Gross Margin</p>
                        <p className={`font-semibold ${t.gross_margin < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(t.gross_margin, currency)}</p>
                    </div>
                </div>
            </div>

            {showTMInvoiceModal && (
                <div
                    className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowTMInvoiceModal(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-base font-semibold text-gray-900 mb-4">Generate Period Invoice</p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Amount</label>
                                <input
                                    type="number"
                                    value={tmAmount}
                                    onChange={(e) => setTmAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Period Start</label>
                                    <input
                                        type="date"
                                        value={tmPeriodStart}
                                        onChange={(e) => setTmPeriodStart(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Period End</label>
                                    <input
                                        type="date"
                                        value={tmPeriodEnd}
                                        onChange={(e) => setTmPeriodEnd(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Due in (days)</label>
                                <input
                                    type="number"
                                    value={tmDueDays}
                                    onChange={(e) => setTmDueDays(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setShowTMInvoiceModal(false)}
                                disabled={isCreatingTMInvoice}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateTMInvoice}
                                disabled={isCreatingTMInvoice}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isCreatingTMInvoice ? 'Creating...' : 'Create Invoice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialSummaryPanel;
