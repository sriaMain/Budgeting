/**
 * "Selected period" figures for the Project Details date filter (Overview and Financials):
 * GET /projects/<id>/financial-summary/?date_from&date_to -> `period`, each record by its own date.
 */
import React from 'react';
import { useApiData } from '../../hooks/useApiData';
import type { ProjectFinancialSummary } from '../../types/financials.types';
import { formatDate as toDMY } from '../../utils/date';
import { formatMoney } from '../../utils/format';

interface Props {
    projectId: string;
    currency: string;
    dateFrom: string;
    dateTo: string;
    action?: React.ReactNode;
}

const Line: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
        <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}>{value}</dd>
    </div>
);

export const PeriodSummaryCard: React.FC<Props> = ({ projectId, currency, dateFrom, dateTo, action }) => {
    const { data, loading, error } = useApiData<ProjectFinancialSummary>(
        `/projects/${projectId}/financial-summary/`,
        { ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) },
        'Failed to load the figures for these dates',
    );
    const p = data?.period;
    const fmt = (v: number) => formatMoney(v, currency, 2);
    return (
        <section aria-label="Selected period" className="rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-500/30 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">
                    Selected period · {dateFrom ? toDMY(dateFrom) : 'project start'} – {dateTo ? toDMY(dateTo) : 'today'}
                </h3>
                {action}
            </div>
            {loading && !p ? (
                <div className="h-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : error ? (
                <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
            ) : p ? (
                <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
                    <Line label={`Invoiced (${p.invoice_count})`} value={fmt(Number(p.invoiced_amount))} strong />
                    <Line label="Received" value={fmt(Number(p.received_amount))} />
                    <Line label={`Resource cost (${p.resource_count})`} value={fmt(Number(p.resource_cost))} />
                    <Line label="Expenses" value={fmt(Number(p.expenses_amount))} />
                    <Line label="Vendor bills paid" value={fmt(Number(p.bills_paid_amount))} />
                    <Line label="Actual cost" value={fmt(Number(p.actual_cost))} strong />
                    <Line label="Net cash (received − bills paid)" value={fmt(Number(p.net_cash))} />
                </dl>
            ) : null}
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                Invoices by invoice date (Cancelled excluded) · payments by payment date (confirmed receipts only) · expenses by expense date · resources whose assignment starts and ends within the dates. Project totals elsewhere on the page don’t change.
            </p>
        </section>
    );
};
