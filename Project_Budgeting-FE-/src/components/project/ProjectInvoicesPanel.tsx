/**
 * Project Details -> Invoices. Filtering, sorting, paging and totals run on the server
 * (GET /projects/<id>/invoices/); Export Excel sends the same filters, so the file matches.
 * Remount (key) when the page's filters change.
 */
import React, { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../../utils/axiosInstance';
import { DataTable, type DataColumn, type DataTableSort } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import { useApiData } from '../../hooks/useApiData';
import { filterParams, type ProjectFilterValues } from '../../hooks/useProjectFilters';
import { formatDate as toDMY } from '../../utils/date';
import { errorText, saveDownload } from '../../utils/resources';
import { invoiceStatusVariant, PAYMENT_STATUS_LABEL } from '../../utils/statusStyles';

interface InvoiceRow {
    id: number;
    invoice_no: string;
    issue_date: string;
    due_date: string;
    status_value: string;
    status: string;
    payment_status: string;
    billed_for: string;
    currency: string;
    total_amount: string;
    paid_amount: string;
    balance_amount: string;
}

interface InvoiceListResponse {
    count: number;
    page: number;
    page_size: number;
    results: InvoiceRow[];
    totals: { currency: string; count: number; total_amount: string; paid_amount: string; balance_amount: string }[];
}

interface Props {
    projectId: string;
    filters: ProjectFilterValues;
    onOpenInvoice: (id: number) => void;
    onGenerateInvoice: () => void;
    canGenerate: boolean;
    reloadToken: number;
}

const PAGE_SIZE = 25;
const money = (v: string | number, currency: string) => {
    const amount = typeof v === 'number' ? v : parseFloat(v) || 0;
    try {
        return amount.toLocaleString('en-IN', { style: 'currency', currency: currency || 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
};

export const ProjectInvoicesPanel: React.FC<Props> = ({ projectId, filters, onOpenInvoice, onGenerateInvoice, canGenerate, reloadToken }) => {
    const [sort, setSort] = useState<DataTableSort>({ key: 'issue_date', direction: 'desc' });
    const [page, setPage] = useState(1);
    const [exporting, setExporting] = useState(false);
    const query = filterParams(filters);
    const params = { ...query, page, page_size: PAGE_SIZE, ordering: `${sort.direction === 'desc' ? '-' : ''}${sort.key}`, _r: reloadToken };
    const { data, staleData, loading, error, reload } = useApiData<InvoiceListResponse>(`/projects/${projectId}/invoices/`, params, 'Failed to load invoices');
    const shown = data ?? staleData;
    const rows = error ? [] : shown?.results ?? [];

    const changeSort = (key: string) => {
        setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key.includes('date') ? 'desc' : 'asc' }));
        setPage(1);
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await axiosInstance.get<Blob>(`/projects/${projectId}/invoices/export/`, { params: query, responseType: 'blob' });
            toast.success(`Downloaded ${saveDownload(res, 'Invoices.xlsx')}`);
        } catch (err) {
            toast.error(await errorText(err, 'Export failed'));
        } finally {
            setExporting(false);
        }
    };

    const columns: DataColumn<InvoiceRow>[] = [
        { key: 'no', header: 'Invoice No', sortKey: 'invoice_no', width: '140px', cell: (r) => <span className="font-medium text-gray-900 dark:text-white">{r.invoice_no}</span> },
        { key: 'issue', header: 'Invoice Date', sortKey: 'issue_date', width: '112px', cell: (r) => <span className="tabular-nums">{toDMY(r.issue_date, '—')}</span> },
        { key: 'due', header: 'Due Date', sortKey: 'due_date', width: '112px', cell: (r) => <span className="tabular-nums">{toDMY(r.due_date, '—')}</span> },
        { key: 'for', header: 'Billed For', sortKey: 'milestone', cell: (r) => <span className="text-gray-600 dark:text-gray-300">{r.billed_for || '—'}</span> },
        {
            key: 'status', header: 'Status', sortKey: 'status', width: '170px',
            cell: (r) => (
                <div className="flex flex-col items-start gap-0.5">
                    <StatusBadge status={r.status_value} variant={invoiceStatusVariant(r.status_value)} label={r.status} />
                    {r.payment_status && <span className="text-[11px] text-gray-500 dark:text-gray-400">Payment: {PAYMENT_STATUS_LABEL[r.payment_status] ?? r.payment_status}</span>}
                </div>
            ),
        },
        { key: 'total', header: 'Amount', sortKey: 'total_amount', align: 'right', width: '140px', cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900 dark:text-white">{money(r.total_amount, r.currency)}</span> },
        { key: 'paid', header: 'Paid', sortKey: 'paid_amount', align: 'right', width: '130px', cell: (r) => <span className="whitespace-nowrap tabular-nums">{money(r.paid_amount, r.currency)}</span> },
        { key: 'balance', header: 'Outstanding', sortKey: 'balance_amount', align: 'right', width: '130px', cell: (r) => <span className={`whitespace-nowrap tabular-nums ${parseFloat(r.balance_amount) > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{money(r.balance_amount, r.currency)}</span> },
    ];

    const totals = shown?.totals ?? [];
    const footer = totals.length > 0 && rows.length > 0 ? totals.map((t) => (
        <tr key={t.currency} className="border-t border-gray-200 bg-gray-50 text-[13px] font-semibold dark:border-gray-800 dark:bg-gray-800/40">
            <td colSpan={5} className="px-4 py-2.5 text-gray-700 dark:text-gray-200">
                Total {t.currency} · {t.count} billed {t.count === 1 ? 'invoice' : 'invoices'} <span className="font-normal text-gray-500 dark:text-gray-400">(all pages; Draft and Cancelled not included)</span>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{money(t.total_amount, t.currency)}</td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{money(t.paid_amount, t.currency)}</td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{money(t.balance_amount, t.currency)}</td>
        </tr>
    )) : undefined;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-gray-500 dark:text-gray-400" aria-live="polite">
                    {loading && !shown ? 'Loading invoices…' : `${shown?.count ?? 0} ${shown?.count === 1 ? 'invoice' : 'invoices'}`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={exportExcel} disabled={exporting || !shown?.count}
                        title={shown?.count ? 'Download the invoices matching the filters as Excel' : 'No invoices to export'}
                        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                        <Download size={14} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export Excel'}
                    </button>
                    {canGenerate && (
                        <button type="button" onClick={onGenerateInvoice}
                            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 text-[13px] font-medium text-white hover:bg-blue-700">
                            <Plus size={14} aria-hidden="true" /> Generate Invoice
                        </button>
                    )}
                </div>
            </div>
            <DataTable<InvoiceRow>
                label="Invoices"
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={loading && !shown}
                error={error}
                onRetry={reload}
                sort={sort}
                onSort={changeSort}
                minWidth={980}
                dense
                stickyHeader
                empty={<p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No invoices match these filters.</p>}
                footer={footer}
                page={shown?.page ?? page}
                pageSize={PAGE_SIZE}
                total={shown?.count ?? 0}
                onPageChange={setPage}
                onRowClick={(r) => onOpenInvoice(r.id)}
            />
        </div>
    );
};
