/**
 * Project Details -> Payments: money received against the project's invoices and paid out for its
 * vendor bills and expenses (GET /projects/<id>/payments-list/ with the page's filters - payment
 * date range, status, search). Received counts confirmed (Completed) payments only.
 * Remount (key) when the filters change.
 */
import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DataTable, type DataColumn, type DataTableSort } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import { MetricCard } from '../StatCard';
import { useApiData } from '../../hooks/useApiData';
import { filterParams, type ProjectFilterValues } from '../../hooks/useProjectFilters';
import { formatDate as toDMY } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import { paymentStatusVariant } from '../../utils/paymentStatus';

interface Incoming {
    id: number; invoice_id: number; invoice_no: string; payment_date: string; amount: number; payment_method: string;
    reference_no: string; status: string; status_display: string; created_by: string | null;
}
interface Outgoing {
    type: 'purchase_order' | 'expense'; id: number; vendor_bill_id?: number; expense_id?: number; bill_no?: string;
    po_no?: string | null; expense_no?: string; category?: string; vendor?: string; amount: number; payment_method: string;
    reference_no: string; payment_date: string;
}
interface PaymentsResponse {
    incoming: { payment_count: number; total_received: string; payments: Incoming[] };
    outgoing: { purchase_order_payment_count: number; expense_payment_count: number; total_paid: string; payments: Outgoing[] };
    summary: { net_balance: string };
}

interface Row {
    key: string;
    direction: 'in' | 'out';
    reference: string;
    sub: string;
    party: string;
    date: string;
    amount: number;
    method: string;
    referenceNo: string;
    status: string;
    statusLabel: string;
    open: () => void;
}

interface Props {
    projectId: string;
    filters: ProjectFilterValues;
    currency: string;
    reloadToken: number;
    onOpenInvoice: (id: number) => void;
    onOpenBill: (id: number) => void;
    onOpenExpense: (id: number) => void;
}

const PAGE_SIZE = 25;
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

export const ProjectPaymentsPanel: React.FC<Props> = ({ projectId, filters, currency, reloadToken, onOpenInvoice, onOpenBill, onOpenExpense }) => {
    const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
    const [sort, setSort] = useState<DataTableSort>({ key: 'date', direction: 'desc' });
    const [page, setPage] = useState(1);
    const { data, loading, error, reload } = useApiData<PaymentsResponse>(
        `/projects/${projectId}/payments-list/`, { ...filterParams(filters), _r: reloadToken }, 'Failed to load payments',
    );

    const allRows = useMemo<Row[]>(() => {
        if (!data) return [];
        const incoming: Row[] = data.incoming.payments.map((p) => ({
            key: `in-${p.id}`, direction: 'in', reference: p.invoice_no, sub: 'Invoice payment', party: p.created_by ? `Recorded by ${p.created_by}` : '—',
            date: p.payment_date, amount: p.amount, method: p.payment_method || '—', referenceNo: p.reference_no || '—',
            status: p.status, statusLabel: p.status_display || p.status, open: () => onOpenInvoice(p.invoice_id),
        }));
        const outgoing: Row[] = data.outgoing.payments.map((p) => (p.type === 'purchase_order' ? {
            key: `bill-${p.id}`, direction: 'out', reference: p.bill_no || '—', sub: p.po_no ? `Bill · PO ${p.po_no}` : 'Vendor bill payment',
            party: p.vendor || '—', date: p.payment_date, amount: p.amount, method: cap(p.payment_method) || '—',
            referenceNo: p.reference_no || '—', status: 'Completed', statusLabel: 'Paid',
            open: () => { if (p.vendor_bill_id) onOpenBill(p.vendor_bill_id); },
        } : {
            key: `exp-${p.id}`, direction: 'out', reference: p.expense_no || '—', sub: `Expense · ${cap(p.category)}`,
            party: p.vendor || 'Internal', date: p.payment_date, amount: p.amount, method: cap(p.payment_method) || '—',
            referenceNo: p.reference_no || '—', status: 'Completed', statusLabel: 'Paid',
            open: () => { if (p.expense_id) onOpenExpense(p.expense_id); },
        }));
        return [...incoming, ...outgoing];
    }, [data, onOpenInvoice, onOpenBill, onOpenExpense]);

    const rows = useMemo(() => {
        const list = allRows.filter((r) => direction === 'all' || r.direction === direction);
        const dir = sort.direction === 'asc' ? 1 : -1;
        const key = (r: Row) => (sort.key === 'amount' ? r.amount : sort.key === 'reference' ? r.reference.toLowerCase() : r.date || '');
        return [...list].sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0));
    }, [allRows, direction, sort]);
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const received = parseFloat(data?.incoming.total_received ?? '0') || 0;
    const paidOut = parseFloat(data?.outgoing.total_paid ?? '0') || 0;
    const fmt = (v: number) => formatMoney(v, currency, 2);

    const columns: DataColumn<Row>[] = [
        {
            key: 'dir', header: 'Type', width: '110px',
            cell: (r) => (
                <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${r.direction === 'in' ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {r.direction === 'in' ? <ArrowDownLeft size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
                    {r.direction === 'in' ? 'Received' : 'Paid out'}
                </span>
            ),
        },
        {
            key: 'ref', header: 'Reference', sortKey: 'reference',
            cell: (r) => (<div><div className="font-medium text-gray-900 dark:text-white">{r.reference}</div><div className="text-[11px] text-gray-500 dark:text-gray-400">{r.sub}</div></div>),
        },
        { key: 'party', header: 'Party', cell: (r) => r.party },
        { key: 'date', header: 'Payment Date', sortKey: 'date', width: '120px', cell: (r) => <span className="tabular-nums">{toDMY(r.date, '—')}</span> },
        { key: 'method', header: 'Method', width: '120px', cell: (r) => r.method },
        { key: 'refno', header: 'Reference No', width: '140px', cell: (r) => <span className="text-gray-600 dark:text-gray-400">{r.referenceNo}</span> },
        { key: 'status', header: 'Status', width: '110px', cell: (r) => <StatusBadge status={r.status} variant={paymentStatusVariant(r.status)} label={r.statusLabel} /> },
        {
            key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', width: '140px',
            cell: (r) => <span className={`whitespace-nowrap font-semibold tabular-nums ${r.direction === 'in' ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>{r.direction === 'in' ? '+' : '−'}{fmt(r.amount)}</span>,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricCard compact label="Received" loading={loading && !data} value={fmt(received)} caption={`${data?.incoming.payment_count ?? 0} payments · confirmed only`} />
                <MetricCard compact label="Paid Out" loading={loading && !data} value={fmt(paidOut)}
                    caption={`${(data?.outgoing.purchase_order_payment_count ?? 0) + (data?.outgoing.expense_payment_count ?? 0)} bill and expense payments`} />
                <MetricCard compact label="Net Cash" loading={loading && !data} value={fmt(received - paidOut)} caption="Received − paid out" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label="Payment direction" className="inline-flex rounded-md border border-gray-300 p-0.5 dark:border-gray-700">
                    {([['all', 'All'], ['in', 'Received'], ['out', 'Paid out']] as const).map(([v, l]) => (
                        <button key={v} type="button" role="radio" aria-checked={direction === v} onClick={() => { setDirection(v); setPage(1); }}
                            className={`h-8 rounded px-3 text-[13px] font-medium ${direction === v ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">{rows.length} {rows.length === 1 ? 'payment' : 'payments'}</p>
            </div>
            <DataTable<Row>
                label="Payments"
                columns={columns}
                rows={pageRows}
                rowKey={(r) => r.key}
                loading={loading && !data}
                error={error}
                onRetry={reload}
                sort={sort}
                onSort={(key) => { setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' })); setPage(1); }}
                minWidth={960}
                dense
                stickyHeader
                onRowClick={(r) => r.open()}
                empty={<p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No payments match these filters.</p>}
                page={page}
                pageSize={PAGE_SIZE}
                total={rows.length}
                onPageChange={setPage}
            />
        </div>
    );
};
