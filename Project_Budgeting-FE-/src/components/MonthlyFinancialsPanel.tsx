/**
 * MonthlyFinancialsPanel
 * Time & Material multi-month tracking: one row per month from the project's
 * start to its end (GET /projects/<id>/periods/), with filters, a per-month
 * details drawer (the transactions behind each figure, plus editable budget /
 * billing amounts) and a Generate Invoice action for each eligible month.
 *
 * Presentation only - every figure is computed server-side
 * (Project/utils/tm_periods.py); the totals row is the API's project total.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';
import type { TMPeriodDetail, TMPeriodRow, TMPeriodsResponse } from '../types/financials.types';

interface MonthlyFinancialsPanelProps {
    projectId: string;
    currency?: string;
    /** Called after an invoice is generated or a month's amounts change, so the summary can refresh. */
    onChanged?: () => void;
}

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | string | null | undefined) => (v == null ? '—' : `${n(v).toFixed(1)}%`);

type Filter = 'all' | 'past' | 'current' | 'future' | 'to_invoice' | 'outstanding';

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All months' },
    { value: 'past', label: 'Past' },
    { value: 'current', label: 'Current' },
    { value: 'future', label: 'Upcoming' },
    { value: 'to_invoice', label: 'To invoice' },
    { value: 'outstanding', label: 'Outstanding' },
];

const PAYMENT_BADGE: Record<TMPeriodRow['payment_status'], { label: string; cls: string }> = {
    not_invoiced: { label: 'Not invoiced', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    unpaid: { label: 'Unpaid', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    partially_paid: { label: 'Partially paid', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
    paid: { label: 'Paid', cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' },
};

const Pill: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
);

/** Short note under a month's actual cost: what it is made of, or the planned cost of an upcoming month. */
const costNote = (p: TMPeriodRow) => {
    if (p.timing === 'future') {
        return n(p.planned_cost) > 0 ? `Planned ${money(p.planned_cost)}` : 'Not started';
    }
    const parts = [
        ['Labour', p.labour_cost],
        ['Resources', p.assigned_resource_cost],
        ['Expenses', p.expenses],
        ['Bills', p.vendor_bills],
    ].filter(([, v]) => n(v) > 0).map(([label, v]) => `${label} ${money(v)}`);
    return parts.length ? parts.join(' · ') : 'No cost recorded';
};

const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap';
const TD = 'px-3 py-2 text-sm tabular-nums whitespace-nowrap';

/** Label ... value row used in the details drawer. */
const DetailRow: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
        <dt className={`text-sm ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{label}</dt>
        <dd className={`text-sm tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone || 'text-gray-900 dark:text-white'}`}>{value}</dd>
    </div>
);

const ItemList: React.FC<{ title: string; empty: string; children: React.ReactNode; count: number }> = ({ title, empty, children, count }) => (
    <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">{title}</h4>
        {count === 0
            ? <p className="text-xs text-gray-400 dark:text-gray-500">{empty}</p>
            : <ul className="divide-y divide-gray-100 dark:divide-gray-800">{children}</ul>}
    </div>
);

export const MonthlyFinancialsPanel: React.FC<MonthlyFinancialsPanelProps> = ({ projectId, currency = 'INR', onChanged }) => {
    const [data, setData] = useState<TMPeriodsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [monthFilter, setMonthFilter] = useState('');

    // Details drawer
    const [detail, setDetail] = useState<TMPeriodDetail | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [budgetInput, setBudgetInput] = useState('');
    const [billingInput, setBillingInput] = useState('');
    const [isSavingAmounts, setIsSavingAmounts] = useState(false);

    // Generate invoice drawer
    const [invoicePeriod, setInvoicePeriod] = useState<TMPeriodRow | null>(null);
    const [invoiceAmount, setInvoiceAmount] = useState('');
    const [taxPercent, setTaxPercent] = useState('');
    const [dueDays, setDueDays] = useState('30');
    const [isGenerating, setIsGenerating] = useState(false);

    const fetchPeriods = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<TMPeriodsResponse>(`/projects/${projectId}/periods/`);
            setData(res.data);
        } catch (error: any) {
            console.error('Failed to fetch monthly financials:', error);
            toast.error(error?.response?.data?.error || 'Failed to load monthly financials');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchPeriods();
    }, [fetchPeriods]);

    const rows = useMemo(() => {
        const periods = data?.periods ?? [];
        return periods.filter(p => {
            if (monthFilter && p.month !== monthFilter) return false;
            switch (filter) {
                case 'past': return p.timing === 'past';
                case 'current': return p.timing === 'current';
                case 'future': return p.timing === 'future';
                case 'to_invoice': return p.can_generate_invoice;
                case 'outstanding': return n(p.outstanding_amount) > 0;
                default: return true;
            }
        });
    }, [data, filter, monthFilter]);

    const openDetail = async (period: TMPeriodRow) => {
        setIsLoadingDetail(true);
        setDetail({ ...period, items: { expenses: [], vendor_bills: [], labour: [], resources: [], invoices: [] } });
        setBudgetInput(String(n(period.budget_amount)));
        setBillingInput(String(n(period.billing_amount)));
        try {
            const res = await axiosInstance.get<TMPeriodDetail>(`/projects/${projectId}/periods/${period.id}/`);
            setDetail(res.data);
        } catch (error) {
            console.error('Failed to fetch month details:', error);
            toast.error('Failed to load month details');
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const saveAmounts = async (reset = false) => {
        if (!detail) return;
        const payload: Record<string, unknown> = reset
            ? { reset_amounts: true }
            : { budget_amount: budgetInput, ...(detail.invoice ? {} : { billing_amount: billingInput }) };
        setIsSavingAmounts(true);
        try {
            const res = await axiosInstance.patch<TMPeriodDetail>(`/projects/${projectId}/periods/${detail.id}/`, payload);
            setDetail(res.data);
            setBudgetInput(String(n(res.data.budget_amount)));
            setBillingInput(String(n(res.data.billing_amount)));
            toast.success(reset ? `${detail.label} follows the project amounts again` : `${detail.label} updated`);
            fetchPeriods();
            onChanged?.();
        } catch (error: any) {
            const data = error?.response?.data;
            const message = data?.budget_amount?.[0] || data?.billing_amount?.[0] || data?.error;
            toast.error(message || 'Failed to update month');
        } finally {
            setIsSavingAmounts(false);
        }
    };

    const openGenerate = (period: TMPeriodRow) => {
        setInvoicePeriod(period);
        setInvoiceAmount(String(n(period.billing_amount)));
        setTaxPercent(String(n(data?.tax_percentage)));
        setDueDays('30');
    };

    const generateInvoice = async () => {
        if (!invoicePeriod) return;
        const amount = parseFloat(invoiceAmount);
        if (Number.isNaN(amount) || amount <= 0) {
            toast.error('Invoice amount must be greater than 0');
            return;
        }
        const tax = taxPercent === '' ? 0 : parseFloat(taxPercent);
        if (Number.isNaN(tax) || tax < 0 || tax > 100) {
            toast.error('Tax must be between 0 and 100%');
            return;
        }
        setIsGenerating(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/generate-tm-invoice/`, {
                period: invoicePeriod.id,
                amount,
                tax_percentage: tax,
                due_days: parseInt(dueDays, 10) || 30,
            });
            toast.success(`Invoice created for ${invoicePeriod.label} (Draft)`);
            setInvoicePeriod(null);
            fetchPeriods();
            onChanged?.();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to create invoice');
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading && !data) {
        return <p className="text-sm text-gray-500 dark:text-gray-400 p-4">Loading monthly financials...</p>;
    }
    if (!data) return null;

    const totals = data.totals;
    // Generate Invoice preview: amount is pre-tax, tax goes on top
    const invoiceSubTotal = n(invoiceAmount);
    const invoiceTax = Math.round(invoiceSubTotal * n(taxPercent)) / 100;
    const invoiceTotal = invoiceSubTotal + invoiceTax;

    return (
        <section>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                    Monthly Financials
                    <span className="ml-2 font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">
                        {totals.months} months · {totals.months_invoiced} invoiced · {totals.months_paid} paid
                    </span>
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex flex-wrap rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 text-xs" role="tablist">
                        {FILTERS.map(f => (
                            <button
                                key={f.value}
                                type="button"
                                role="tab"
                                aria-selected={filter === f.value}
                                onClick={() => setFilter(f.value)}
                                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${filter === f.value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <select
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        aria-label="Filter by month"
                        className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                    >
                        <option value="">Every month</option>
                        {data.periods.map(p => <option key={p.id} value={p.month}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-gray-200 dark:border-gray-800">
                        <tr>
                            <th className={TH}>Month</th>
                            <th className={`${TH} text-right`}>Budget</th>
                            <th className={`${TH} text-right`}>Actual Cost</th>
                            <th className={`${TH} text-right`}>Remaining</th>
                            <th className={`${TH} text-right`}>Used</th>
                            <th className={`${TH} text-right`}>Billing</th>
                            <th className={`${TH} text-right`}>Invoiced</th>
                            <th className={`${TH} text-right`}>Received</th>
                            <th className={`${TH} text-right`}>Outstanding</th>
                            <th className={`${TH} text-right`}>Profit</th>
                            <th className={TH}>Invoice</th>
                            <th className={TH}>Payment</th>
                            <th className={TH}><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={13} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No months match this filter.</td>
                            </tr>
                        )}
                        {rows.map(p => {
                            const over = n(p.remaining_budget) < 0;
                            const badge = PAYMENT_BADGE[p.payment_status];
                            return (
                                <tr
                                    key={p.id}
                                    onClick={() => openDetail(p)}
                                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 ${p.timing === 'current' ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''} ${!p.is_active ? 'opacity-60' : ''}`}
                                >
                                    <td className={`${TD} font-medium text-gray-900 dark:text-white`}>
                                        {p.label}
                                        {p.timing === 'current' && <span className="ml-1.5 text-[10px] uppercase text-blue-600 dark:text-blue-400">Now</span>}
                                        {!p.is_active && <span className="ml-1.5 text-[10px] uppercase text-gray-500">Outside dates</span>}
                                        {p.amounts_overridden && <span className="ml-1.5 text-[10px] uppercase text-gray-500" title="Amounts edited for this month">Edited</span>}
                                    </td>
                                    <td className={`${TD} text-right text-gray-700 dark:text-gray-300`}>{money(p.budget_amount)}</td>
                                    <td className={`${TD} text-right ${over ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                        {money(p.actual_cost)}
                                        <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">{costNote(p)}</span>
                                    </td>
                                    <td className={`${TD} text-right ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>{money(p.remaining_budget)}</td>
                                    <td className={`${TD} text-right ${n(p.budget_used_percent) > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>{pct(p.budget_used_percent)}</td>
                                    <td className={`${TD} text-right text-gray-700 dark:text-gray-300`}>{money(p.billing_amount)}</td>
                                    <td className={`${TD} text-right text-gray-900 dark:text-white`}>{money(p.invoiced_amount)}</td>
                                    <td className={`${TD} text-right ${n(p.received_amount) > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>{money(p.received_amount)}</td>
                                    <td className={`${TD} text-right ${n(p.outstanding_amount) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>{money(p.outstanding_amount)}</td>
                                    <td className={`${TD} text-right ${n(p.profit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                        {money(p.profit)}
                                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">{pct(p.profit_margin)}</span>
                                    </td>
                                    <td className={`${TD} text-gray-700 dark:text-gray-300`}>
                                        {p.invoice ? <span title={p.invoice.invoice_no}>{p.invoice_status}</span> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className={TD}><Pill cls={badge.cls}>{badge.label}</Pill></td>
                                    <td className={`${TD} text-right`}>
                                        {p.can_generate_invoice && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); openGenerate(p); }}
                                                className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                                            >
                                                Generate Invoice
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-300 dark:border-gray-700">
                        <tr className="font-semibold text-gray-900 dark:text-white">
                            <td className={TD}>Project total</td>
                            <td className={`${TD} text-right`}>{money(totals.budget_amount)}</td>
                            <td className={`${TD} text-right`}>
                                {money(totals.actual_cost)}
                                {n(totals.planned_cost) > 0 && (
                                    <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">+ {money(totals.planned_cost)} planned</span>
                                )}
                            </td>
                            <td className={`${TD} text-right ${n(totals.remaining_budget) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money(totals.remaining_budget)}</td>
                            <td className={`${TD} text-right`}>{pct(totals.budget_used_percent)}</td>
                            <td className={`${TD} text-right`}>{money(totals.billing_amount)}</td>
                            <td className={`${TD} text-right`}>{money(totals.invoiced_amount)}</td>
                            <td className={`${TD} text-right`}>{money(totals.received_amount)}</td>
                            <td className={`${TD} text-right`}>{money(totals.outstanding_amount)}</td>
                            <td className={`${TD} text-right ${n(totals.profit) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                {money(totals.profit)}
                                <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">{pct(totals.profit_margin)}</span>
                            </td>
                            <td colSpan={3} className={`${TD} text-xs font-normal text-gray-500 dark:text-gray-400`}>All amounts in {currency}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Actual cost is noted per month (labour from task hours, resources, expenses, vendor bills); upcoming months show their planned resource cost, which only counts once the month starts.
                Remaining is the month's budget minus its actual cost; Outstanding is invoiced but not yet received. Profit uses invoiced amounts excluding tax. Click a month for its details.
            </p>

            {/* Month details */}
            <Drawer
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail ? `${detail.label} - Monthly details` : ''}
                subtitle={detail ? `${detail.period_start} to ${detail.period_end}` : undefined}
                size="lg"
            >
                {detail && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                            <dl>
                                <DetailRow label="Budget" value={`${money(detail.budget_amount)} ${currency}`} />
                                <DetailRow label="Labour (task hours x rate)" value={money(detail.labour_cost)} />
                                <DetailRow label="Other resources" value={money(detail.assigned_resource_cost)} />
                                <DetailRow label="Expenses" value={money(detail.expenses)} />
                                <DetailRow label="Vendor bills (paid)" value={money(detail.vendor_bills)} />
                                <DetailRow label="Actual cost" value={money(detail.actual_cost)} strong />
                                <DetailRow
                                    label="Remaining budget"
                                    value={`${money(detail.remaining_budget)} (${pct(detail.budget_used_percent)} used)`}
                                    strong
                                    tone={n(detail.remaining_budget) < 0 ? 'text-red-600 dark:text-red-400' : undefined}
                                />
                            </dl>
                            <dl>
                                <DetailRow label="Billing amount" value={`${money(detail.billing_amount)} ${currency}`} />
                                <DetailRow label="Invoiced" value={money(detail.invoiced_amount)} />
                                <DetailRow label="Received" value={money(detail.received_amount)} tone="text-green-600 dark:text-green-400" />
                                <DetailRow label="Outstanding" value={money(detail.outstanding_amount)} tone={n(detail.outstanding_amount) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
                                <DetailRow label="Revenue (excl. tax)" value={money(detail.revenue)} />
                                <DetailRow
                                    label="Profit"
                                    value={`${money(detail.profit)} (${pct(detail.profit_margin)})`}
                                    strong
                                    tone={n(detail.profit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
                                />
                                <DetailRow label="Status" value={<>{detail.invoice_status} · <Pill cls={PAYMENT_BADGE[detail.payment_status].cls}>{PAYMENT_BADGE[detail.payment_status].label}</Pill></>} />
                            </dl>
                        </div>

                        {n(detail.unrated_hours) > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                {n(detail.unrated_hours).toFixed(2)} allocated task hours this month have no cost rate (unassigned task, or assignee without a rate) and aren't costed.
                            </p>
                        )}

                        <DrawerSection>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={drawerLabelClass}>Month budget ({currency})</label>
                                    <input type="number" min={0} step="0.01" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className={`${drawerInputClass} text-right tabular-nums`} />
                                </div>
                                <div>
                                    <label className={drawerLabelClass}>Month billing amount ({currency})</label>
                                    <input
                                        type="number" min={0} step="0.01"
                                        value={billingInput}
                                        onChange={(e) => setBillingInput(e.target.value)}
                                        disabled={!!detail.invoice}
                                        className={`${drawerInputClass} text-right tabular-nums disabled:opacity-60`}
                                    />
                                </div>
                            </div>
                            <FieldHint>
                                {detail.invoice
                                    ? 'This month is invoiced, so its billing amount is locked.'
                                    : detail.amounts_overridden
                                        ? 'Edited for this month - project-level changes no longer update it.'
                                        : 'Follows the project\'s monthly amounts until you edit it.'}
                            </FieldHint>
                            <div className="flex justify-end gap-2 mt-2">
                                {detail.amounts_overridden && (
                                    <button
                                        type="button"
                                        onClick={() => saveAmounts(true)}
                                        disabled={isSavingAmounts}
                                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        Use project amounts
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => saveAmounts(false)}
                                    disabled={isSavingAmounts}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {isSavingAmounts ? 'Saving...' : 'Save amounts'}
                                </button>
                            </div>
                        </DrawerSection>

                        {isLoadingDetail ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading transactions...</p>
                        ) : (
                            <div className="space-y-5">
                                <ItemList title="Invoices & payments" empty="No invoice for this month." count={detail.items.invoices.length}>
                                    {detail.items.invoices.map(inv => (
                                        <li key={inv.id} className="py-2 text-sm">
                                            <div className="flex justify-between gap-3">
                                                <span className="font-medium text-gray-900 dark:text-white">{inv.invoice_no} · {inv.status}</span>
                                                <span className="tabular-nums">{money(inv.total_amount)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Issued {inv.issue_date} · due {inv.due_date} · paid {money(inv.paid_amount)} · balance {money(inv.balance_amount)}</p>
                                            {inv.payments.map(pay => (
                                                <p key={pay.id} className="text-xs text-green-700 dark:text-green-400 tabular-nums">
                                                    {pay.payment_date} · {pay.payment_method}{pay.reference_no ? ` · ${pay.reference_no}` : ''} · {money(pay.amount)}
                                                </p>
                                            ))}
                                        </li>
                                    ))}
                                </ItemList>
                                <ItemList title="Labour (tasks)" empty="No tasks fall in this month." count={detail.items.labour.length}>
                                    {detail.items.labour.map(t => (
                                        <li key={t.task} className="py-1.5 flex justify-between gap-3 text-sm">
                                            <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                                                {t.title} <span className="text-xs text-gray-500">· {t.assignee || 'Unassigned'}{t.is_freelancer ? ' (freelancer)' : ''} · {n(t.hours).toFixed(2)} h × {money(t.rate)} · {t.date}</span>
                                            </span>
                                            <span className={`tabular-nums ${t.unrated ? 'text-amber-600 dark:text-amber-400' : ''}`}>{t.unrated ? 'No rate' : money(t.cost)}</span>
                                        </li>
                                    ))}
                                </ItemList>
                                <ItemList title="Other resources" empty="None this month." count={detail.items.resources.length}>
                                    {detail.items.resources.map(r => (
                                        <li key={r.id} className="py-1.5 flex justify-between gap-3 text-sm">
                                            <span className="text-gray-700 dark:text-gray-300">{r.name || 'Resource'} <span className="text-xs text-gray-500">· {r.resource_type}{r.role ? ` · ${r.role}` : ''}</span></span>
                                            <span className="tabular-nums">{money(r.amount)}</span>
                                        </li>
                                    ))}
                                </ItemList>
                                <ItemList title="Expenses" empty="No expenses this month." count={detail.items.expenses.length}>
                                    {detail.items.expenses.map(e => (
                                        <li key={e.id} className="py-1.5 flex justify-between gap-3 text-sm">
                                            <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{e.description} <span className="text-xs text-gray-500">· {e.category} · {e.date}</span></span>
                                            <span className="tabular-nums">{money(e.amount)}</span>
                                        </li>
                                    ))}
                                </ItemList>
                                <ItemList title="Vendor bill payments" empty="No vendor payments this month." count={detail.items.vendor_bills.length}>
                                    {detail.items.vendor_bills.map(b => (
                                        <li key={b.id} className="py-1.5 flex justify-between gap-3 text-sm">
                                            <span className="text-gray-700 dark:text-gray-300">{b.bill_no} <span className="text-xs text-gray-500">· {b.vendor} · {b.date}</span></span>
                                            <span className="tabular-nums">{money(b.amount)}</span>
                                        </li>
                                    ))}
                                </ItemList>
                            </div>
                        )}
                    </div>
                )}
            </Drawer>

            {/* Generate invoice */}
            <Drawer
                isOpen={!!invoicePeriod}
                onClose={() => setInvoicePeriod(null)}
                title="Generate Invoice"
                subtitle={invoicePeriod ? `${invoicePeriod.label} · ${invoicePeriod.period_start} to ${invoicePeriod.period_end}` : undefined}
                size="md"
                footer={(
                    <DrawerFormFooter
                        summary={<>Invoice total: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(invoiceTotal)} {currency}</span></>}
                        onCancel={() => setInvoicePeriod(null)}
                        onSubmit={generateInvoice}
                        submitLabel="Create Invoice"
                        busyLabel="Creating..."
                        isBusy={isGenerating}
                    />
                )}
            >
                <fieldset disabled={isGenerating} className="space-y-4">
                    <DrawerSection>
                        <div>
                            <label className={drawerLabelClass}>Invoice Amount (before tax) *</label>
                            <input
                                type="number" min={0} step="0.01"
                                value={invoiceAmount}
                                onChange={(e) => setInvoiceAmount(e.target.value)}
                                className={`${drawerInputClass} text-right tabular-nums`}
                            />
                            <FieldHint>Pre-filled with this month's billing amount.</FieldHint>
                        </div>
                    </DrawerSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={drawerLabelClass}>Tax (%)</label>
                            <input
                                type="number" min={0} max={100} step="0.01"
                                value={taxPercent}
                                onChange={(e) => setTaxPercent(e.target.value)}
                                className={`${drawerInputClass} text-right tabular-nums`}
                            />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Due in (days)</label>
                            <input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={`${drawerInputClass} text-right tabular-nums`} />
                        </div>
                    </div>
                    <FieldHint>
                        {data.quotation
                            ? `Tax pre-filled from quotation #${data.quotation.quote_no} (${data.quotation.quote_name}).`
                            : 'This project has no quotation - enter the tax % to apply.'}
                    </FieldHint>
                    <dl className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm">
                        <div className="flex justify-between py-0.5"><dt className="text-gray-600 dark:text-gray-400">Sub total</dt><dd className="tabular-nums">{money(invoiceSubTotal)}</dd></div>
                        <div className="flex justify-between py-0.5"><dt className="text-gray-600 dark:text-gray-400">Tax ({n(taxPercent)}%)</dt><dd className="tabular-nums">{money(invoiceTax)}</dd></div>
                        <div className="flex justify-between py-0.5 border-t border-gray-200 dark:border-gray-800 mt-1 pt-1 font-semibold text-gray-900 dark:text-white"><dt>Total</dt><dd className="tabular-nums">{money(invoiceTotal)} {currency}</dd></div>
                    </dl>
                    <FieldHint>The invoice is created as a Draft and linked to {invoicePeriod?.label}. A month can have only one open invoice.</FieldHint>
                </fieldset>
            </Drawer>
        </section>
    );
};

export default MonthlyFinancialsPanel;
