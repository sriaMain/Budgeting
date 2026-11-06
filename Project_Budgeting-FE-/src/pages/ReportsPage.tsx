/**
 * Reports - KPI summary and report records for one reporting period.
 * Data: GET finance/overview/ (KPIs + one page of rows); downloads: GET reports/<section>/export/.
 * Both take the same filters, applied on the server, so an Excel / PDF holds exactly the
 * records the table shows (every page of them). Calculations: backend Reports/services.py.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
    ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, ChevronLeft, ChevronRight, Clock, Eye, FileSpreadsheet,
    FileText, IndianRupee, Loader2, Percent, Receipt, Search, TrendingDown, TrendingUp,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { Drawer } from '../components/Drawer';
import axiosInstance from '../utils/axiosInstance';
import { formatDate as toDMY, formatDateTime } from '../utils/date';
import { formatMoney } from '../utils/format';

type Section = 'all' | 'financial' | 'project' | 'payment' | 'po_invoice';
/** money = the row's currency; base_money = always INR (costs carry no currency of their own). */
type FieldKind = 'text' | 'date' | 'money' | 'base_money' | 'number';
type Variant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

interface FieldSpec { key: string; label: string; kind: FieldKind }

interface ReportRow {
    key: string;
    category: Exclude<Section, 'all'>;
    category_label: string;
    record_type: string;
    reference: string;
    party: string | null;
    project: string | null;
    project_no: number | null;
    project_or_party: string;
    date: string | null;
    amount: number;
    currency: string;
    status: string;
    status_label: string;
    [field: string]: unknown;
}

interface CurrencySummary { currency: string; revenue: number; amount_due: number; received: number; outstanding: number; collection_rate: number | null; invoice_count: number }

interface Summary {
    currency: string;
    revenue: number;
    expenses: number;
    profit: number;
    outstanding: number;
    amount_due: number;
    received: number;
    collection_rate: number | null;
    invoice_count: number;
    other_currencies: CurrencySummary[];
}

interface OverviewResponse {
    summary: Summary;
    count: number;
    page: number;
    page_size: number;
    total_pages: number;
    results: ReportRow[];
    totals: { currency: string; count: number; amount: number }[];
    status_options: string[];
    type_options: { value: string; label: string }[];
    fields: Record<string, FieldSpec[]>;
    generated_at: string;
}

interface ReportsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const TABS: { id: Section; label: string; api: string; slug: string }[] = [
    { id: 'all', label: 'All', api: 'all', slug: 'all' },
    { id: 'financial', label: 'Financial Reports', api: 'financial_reports', slug: 'financial' },
    { id: 'project', label: 'Project Reports', api: 'project_reports', slug: 'project' },
    { id: 'payment', label: 'Payment Reports', api: 'payment_reports', slug: 'payment' },
    { id: 'po_invoice', label: 'PO & Invoice Reports', api: 'po_invoice_reports', slug: 'po-invoice' },
];

// ---- reporting period presets (local calendar dates; the backend includes both ends)

type Preset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'this_quarter', label: 'This Quarter' },
    { id: 'this_year', label: 'This Year' },
    { id: 'all_time', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
];
const DEFAULT_PRESET: Preset = 'this_year';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const presetRange = (preset: Preset, today = new Date()): { from: string; to: string } => {
    const y = today.getFullYear();
    const m = today.getMonth();
    switch (preset) {
        case 'today':
            return { from: isoDay(today), to: isoDay(today) };
        case 'this_week': {
            // Monday to Sunday; Date rolls over month and year ends.
            const monday = new Date(y, m, today.getDate() - ((today.getDay() + 6) % 7));
            return { from: isoDay(monday), to: isoDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
        }
        case 'this_month':
            return { from: isoDay(new Date(y, m, 1)), to: isoDay(new Date(y, m + 1, 0)) };
        case 'last_month':
            return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) };
        case 'this_quarter': {
            const q = Math.floor(m / 3) * 3;
            return { from: isoDay(new Date(y, q, 1)), to: isoDay(new Date(y, q + 3, 0)) };
        }
        case 'this_year':
            return { from: isoDay(new Date(y, 0, 1)), to: isoDay(new Date(y, 11, 31)) };
        default:
            return { from: '', to: '' };
    }
};

const periodLabel = (from: string, to: string) => {
    if (from && to) return `${toDMY(from)} – ${toDMY(to)}`;
    if (from) return `From ${toDMY(from)}`;
    if (to) return `Up to ${toDMY(to)}`;
    return 'All dates';
};

// ---- formatting

const money = (value: unknown, currency = 'INR') => formatMoney(Number(value) || 0, currency, 2);
/** KPI cards: whole rupees, so large totals fit; the table and exports keep paise. */
const kpiMoney = (value: unknown, currency = 'INR') => formatMoney(Math.round(Number(value) || 0), currency, 0);

const statusVariant = (status: string): Variant => {
    const s = status.trim().toLowerCase();
    if (/^(paid|completed|deployed)$/.test(s)) return 'success';
    if (/overdue|failed/.test(s)) return 'danger';
    if (/partially|pending|unpaid|processing|on hold/.test(s)) return 'warning';
    if (/draft|cancel/.test(s)) return 'neutral';
    return 'info';
};

const fieldValue = (row: ReportRow, field: FieldSpec): string => {
    const value = row[field.key];
    if (value === null || value === undefined || value === '') return '—';
    if (field.kind === 'money') return money(value, row.currency);
    if (field.kind === 'base_money') return money(value, 'INR');
    if (field.kind === 'date') return toDMY(String(value));
    if (field.kind === 'number') return Number(value) ? String(value) : '—';
    return String(value);
};

/** One extra line under a row's amount: what is still open, or how it was paid. */
const amountNote = (row: ReportRow): string | null => {
    if ((row.category === 'financial' || row.category === 'po_invoice') && Number(row.balance) > 0) return `Balance ${money(row.balance, row.currency)}`;
    if (row.category === 'project' && row.profit !== null && row.profit !== undefined) return `Profit ${money(row.profit, row.currency)}`;
    if (row.category === 'payment' && row.method) return String(row.method);
    return null;
};

type Tone = 'positive' | 'negative' | 'warning' | 'neutral';
const VALUE_TONES: Record<Tone, string> = {
    positive: 'text-green-700 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-700 dark:text-amber-400',
    neutral: 'text-gray-900 dark:text-white',
};
const ICON_TONES: Record<Tone, string> = {
    positive: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    negative: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    neutral: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
};

/** Compact KPI card (~108px): 16px padding, 13px label, 24px value. Green = good, red = bad, amber = pending. */
const KpiCard: React.FC<{ label: string; value: string; caption?: string; icon: React.ReactNode; tone?: Tone; iconTone?: Tone; loading?: boolean; className?: string }> = ({
    label, value, caption, icon, tone = 'neutral', iconTone, loading, className = '',
}) => (
    <div className={`min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
        {loading ? (
            <div className="animate-pulse space-y-2.5" aria-hidden="true">
                <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-7 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
        ) : (
            <>
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${ICON_TONES[iconTone ?? tone]}`}>{icon}</span>
                </div>
                <div className={`mt-1.5 truncate text-2xl font-semibold leading-[30px] tabular-nums ${VALUE_TONES[tone]}`} title={value}>{value}</div>
                {caption && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" title={caption}>{caption}</p>}
            </>
        )}
    </div>
);

const CONTROL = 'h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';
const PAGE_SIZE = 25;

type SortKey = 'type' | 'reference' | 'party' | 'date' | 'amount' | 'status';
const COLUMNS: { key: SortKey | 'actions'; label: string; align?: 'right'; width?: string }[] = [
    { key: 'type', label: 'Report Type', width: 'w-[176px]' },
    { key: 'reference', label: 'Reference Number', width: 'w-[170px]' },
    { key: 'party', label: 'Project / Client' },
    { key: 'date', label: 'Report Date', width: 'w-[148px]' },
    { key: 'amount', label: 'Amount', align: 'right', width: 'w-[170px]' },
    { key: 'status', label: 'Status', width: 'w-[150px]' },
    { key: 'actions', label: 'Actions', align: 'right', width: 'w-[76px]' },
];

const errorText = async (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (data instanceof Blob) {
            try { return JSON.parse(await data.text())?.error || fallback; } catch { return fallback; }
        }
        if (data?.error) return String(data.error);
        if (data?.detail) return String(data.detail);
    }
    return fallback;
};

const ReportsPage: React.FC<ReportsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<Section>('all');

    // Reporting period: `draft` is what the inputs show, `applied` is what the data uses.
    const [draft, setDraft] = useState(() => ({ preset: DEFAULT_PRESET as Preset, ...presetRange(DEFAULT_PRESET) }));
    const [applied, setApplied] = useState(() => ({ preset: DEFAULT_PRESET as Preset, ...presetRange(DEFAULT_PRESET) }));
    const rangeError = draft.from && draft.to && draft.to < draft.from ? "To Date can't be earlier than From Date." : null;
    const dirty = draft.from !== applied.from || draft.to !== applied.to;

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [recordType, setRecordType] = useState('');
    const [ordering, setOrdering] = useState('-date');
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [detail, setDetail] = useState<ReportRow | null>(null);
    const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

    const tabInfo = TABS.find(t => t.id === tab)!;
    const filterParams = useMemo(() => {
        const p: Record<string, string> = {};
        if (applied.from) p.date_from = applied.from;
        if (applied.to) p.date_to = applied.to;
        if (search) p.search = search;
        if (status) p.status = status;
        if (tab === 'all' && recordType) p.type = recordType;
        p.ordering = ordering;
        return p;
    }, [applied.from, applied.to, search, status, recordType, ordering, tab]);

    // Search waits until typing pauses.
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    // A response is shown only for the request it answers; `loading` = the current request hasn't answered yet.
    const requestKey = JSON.stringify([tabInfo.api, filterParams, page, reloadKey]);
    const [result, setResult] = useState<{ key: string; data?: OverviewResponse; error?: string } | null>(null);
    const [lastData, setLastData] = useState<OverviewResponse | null>(null);
    useEffect(() => {
        let cancelled = false;
        axiosInstance.get<OverviewResponse>('finance/overview/', { params: { section: tabInfo.api, ...filterParams, page, page_size: PAGE_SIZE } })
            .then(res => {
                if (cancelled) return;
                setResult({ key: requestKey, data: res.data });
                setLastData(res.data);
            })
            .catch(async err => {
                const message = await errorText(err, 'Could not load reports. Try again.');
                if (!cancelled) setResult({ key: requestKey, error: message });
            });
        return () => { cancelled = true; };
        // requestKey covers every input of the request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey]);
    const loading = result?.key !== requestKey;
    const error = !loading ? result?.error ?? null : null;
    const data = (!loading && result?.data) || lastData;

    const selectTab = (id: Section) => {
        setTab(id);
        setStatus('');
        setRecordType('');
        setOrdering('-date');
        setPage(1);
    };

    const choosePreset = (preset: Preset) => {
        if (preset === 'custom') {
            setDraft(d => ({ ...d, preset }));
            return;
        }
        const range = presetRange(preset);
        setDraft({ preset, ...range });
        setApplied({ preset, ...range });   // presets apply straight away
        setPage(1);
    };
    const applyDates = () => {
        if (rangeError) return;
        setApplied({ ...draft });
        setPage(1);
    };
    const resetFilters = () => {
        const range = presetRange(DEFAULT_PRESET);
        setDraft({ preset: DEFAULT_PRESET, ...range });
        setApplied({ preset: DEFAULT_PRESET, ...range });
        setSearchInput('');
        setSearch('');
        setStatus('');
        setRecordType('');
        setOrdering('-date');
        setPage(1);
    };

    const sortBy = (key: SortKey) => {
        setOrdering(current => (current === key ? `-${key}` : current === `-${key}` ? key : key === 'date' || key === 'amount' ? `-${key}` : key));
        setPage(1);
    };

    const handleExport = async (format: 'excel' | 'pdf') => {
        setExporting(format);
        try {
            const res = await axiosInstance.get(`reports/${tabInfo.slug}/export/`, {
                params: { ...filterParams, export_format: format },
                responseType: 'blob',
            });
            const header = String(res.headers['content-disposition'] || '');
            const name = /filename="?([^";]+)"?/.exec(header)?.[1]
                || `ProjectBudget_Reports_${applied.from || 'all'}_to_${applied.to || 'dates'}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
            const url = URL.createObjectURL(res.data as Blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast.success(`Downloaded ${name}`);
        } catch (err) {
            toast.error(await errorText(err, `Could not export the ${format === 'excel' ? 'Excel' : 'PDF'} report.`));
        } finally {
            setExporting(null);
        }
    };

    const summary = data?.summary;
    const firstLoad = !data && loading;
    const profitTone: Tone = summary ? (summary.profit > 0 ? 'positive' : summary.profit < 0 ? 'negative' : 'neutral') : 'neutral';
    const rate = summary?.collection_rate ?? null;
    const rateTone: Tone = rate === null ? 'neutral' : rate >= 80 ? 'positive' : rate >= 50 ? 'warning' : 'negative';
    const rows = data?.results ?? [];
    const hasFilters = !!(search || status || recordType);
    const firstRow = data && data.count ? (data.page - 1) * data.page_size + 1 : 0;
    const lastRow = data ? Math.min(data.page * data.page_size, data.count) : 0;
    const detailFields = detail ? data?.fields[detail.category] ?? [] : [];

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="w-full space-y-5">
                {/* Header: title + period filter + exports */}
                <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0">
                        <nav aria-label="Breadcrumb">
                            <ol className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <li><Link to="/dashboard" className="hover:text-gray-900 hover:underline dark:hover:text-white">Home</Link></li>
                                <li aria-hidden="true">/</li>
                                <li aria-current="page" className="font-medium text-gray-700 dark:text-gray-200">Reports</li>
                            </ol>
                        </nav>
                        <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">Reports</h1>
                        <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">Financial, Project, Payment &amp; Invoice Insights</p>
                    </div>

                    <div className="flex w-full flex-wrap items-end gap-2 min-[1280px]:w-auto">
                        <label className="flex w-full flex-col gap-1 min-[480px]:w-auto">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Period</span>
                            <select value={draft.preset} onChange={(e) => choosePreset(e.target.value as Preset)} className={`${CONTROL} min-[480px]:w-40`}>
                                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-1 flex-col gap-1 min-[480px]:flex-none">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">From Date</span>
                            <input
                                type="date"
                                value={draft.from}
                                max={draft.to || undefined}
                                onChange={(e) => setDraft(d => ({ ...d, preset: 'custom', from: e.target.value }))}
                                aria-invalid={!!rangeError}
                                className={`${CONTROL} w-full min-[480px]:w-40`}
                            />
                        </label>
                        <label className="flex flex-1 flex-col gap-1 min-[480px]:flex-none">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">To Date</span>
                            <input
                                type="date"
                                value={draft.to}
                                min={draft.from || undefined}
                                onChange={(e) => setDraft(d => ({ ...d, preset: 'custom', to: e.target.value }))}
                                aria-invalid={!!rangeError}
                                aria-describedby={rangeError ? 'report-range-error' : undefined}
                                className={`${CONTROL} w-full min-[480px]:w-40 ${rangeError ? 'border-red-400 dark:border-red-500' : ''}`}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={applyDates}
                            disabled={!!rangeError || !dirty}
                            className="h-10 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-950"
                        >
                            Apply Filters
                        </button>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Reset
                        </button>
                        <span className="mx-1 hidden h-8 w-px self-end bg-gray-200 min-[768px]:block dark:bg-gray-800" aria-hidden="true" />
                        {/* The two exports wrap together */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleExport('excel')}
                                disabled={exporting !== null}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-green-300 bg-white px-3 text-sm font-semibold text-green-800 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-500/40 dark:bg-gray-900 dark:text-green-300 dark:hover:bg-green-500/10"
                            >
                                {exporting === 'excel' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />}
                                Export Excel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExport('pdf')}
                                disabled={exporting !== null}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                                {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                                Export PDF
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <p className="text-gray-600 dark:text-gray-300">
                        <CalendarRange size={15} aria-hidden="true" className="-mt-0.5 mr-1.5 inline text-gray-400" />
                        Reporting period: <strong className="font-semibold tabular-nums text-gray-900 dark:text-white">{periodLabel(applied.from, applied.to)}</strong>
                        {' '}<span className="text-gray-500 dark:text-gray-400">({PRESETS.find(p => p.id === applied.preset)?.label})</span>
                    </p>
                    {rangeError ? (
                        <p id="report-range-error" role="alert" className="font-medium text-red-600 dark:text-red-400">{rangeError}</p>
                    ) : dirty ? (
                        <p className="text-amber-700 dark:text-amber-400">Dates changed. Click Apply Filters to update the report.</p>
                    ) : data?.generated_at ? (
                        <p className="tabular-nums text-gray-500 dark:text-gray-400">Updated {formatDateTime(data.generated_at)}</p>
                    ) : null}
                </div>

                {/* KPIs - from the backend, for the applied period */}
                <section aria-label="Financial summary" aria-busy={loading} className={`grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 xl:gap-4 ${loading && !firstLoad ? 'opacity-70' : ''}`}>
                    <KpiCard loading={firstLoad} label="Total Revenue" value={summary ? kpiMoney(summary.revenue) : '—'} icon={<IndianRupee size={13} />}
                        caption={summary ? `${summary.invoice_count} ${summary.invoice_count === 1 ? 'invoice' : 'invoices'} · excl. tax` : undefined} />
                    <KpiCard loading={firstLoad} label="Total Expenses" value={summary ? kpiMoney(summary.expenses) : '—'} icon={<Receipt size={13} />} iconTone="negative"
                        caption="Expenses + vendor bill payments" />
                    <KpiCard loading={firstLoad} label="Total Profit" value={summary ? kpiMoney(summary.profit) : '—'}
                        icon={summary && summary.profit < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />} tone={profitTone}
                        caption={summary && summary.revenue > 0 ? `Margin ${(summary.profit / summary.revenue * 100).toFixed(1)}% · Revenue − Expenses` : 'Revenue − Expenses'} />
                    <KpiCard loading={firstLoad} label="Total Outstanding" value={summary ? kpiMoney(summary.outstanding) : '—'} icon={<Clock size={13} />}
                        tone={summary && summary.outstanding > 0 ? 'warning' : 'neutral'} iconTone="warning"
                        caption={summary ? `of ${kpiMoney(summary.amount_due)} due` : undefined} />
                    <KpiCard loading={firstLoad} className="min-[480px]:max-[767px]:col-span-2" label="Collection Rate" value={rate === null ? '—' : `${rate.toFixed(1)}%`}
                        icon={<Percent size={13} />} tone={rateTone}
                        caption={summary ? `${kpiMoney(summary.received)} received` : undefined} />
                </section>
                <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Revenue: invoices issued in the period, excluding tax, Draft and Cancelled. Profit = Revenue − Expenses. Outstanding and Collection Rate cover the invoices issued in the period.
                </p>
                {summary && summary.other_currencies.length > 0 && (
                    <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        {summary.other_currencies.map(c => (
                            <p key={c.currency}>
                                {c.currency} invoices aren't included in the INR figures above: revenue {money(c.revenue, c.currency)}, outstanding {money(c.outstanding, c.currency)},
                                collection {c.collection_rate === null ? '—' : `${c.collection_rate.toFixed(1)}%`} ({c.invoice_count} {c.invoice_count === 1 ? 'invoice' : 'invoices'}).
                            </p>
                        ))}
                    </div>
                )}

                {/* Report categories + table */}
                <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    <div
                        role="tablist"
                        aria-label="Report categories"
                        className="flex overflow-x-auto border-b border-gray-200 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-800"
                        onKeyDown={(e) => {
                            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                            const at = TABS.findIndex(t => t.id === tab);
                            const next = TABS[(at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
                            selectTab(next);
                            requestAnimationFrame(() => document.getElementById(`report-tab-${next}`)?.focus());
                        }}
                    >
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                id={`report-tab-${t.id}`}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                aria-controls="report-tab-panel"
                                tabIndex={tab === t.id ? 0 : -1}
                                onClick={() => selectTab(t.id)}
                                className={`-mb-px h-12 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800 ${tab === t.id
                                    ? 'border-teal-600 text-gray-900 dark:border-violet-400 dark:text-white'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div id="report-tab-panel" role="tabpanel" aria-labelledby={`report-tab-${tab}`} className="space-y-3 p-3 sm:p-4">
                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full min-[640px]:w-72">
                                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    placeholder="Search reference, client, vendor, project…"
                                    aria-label="Search reports"
                                    className={`${CONTROL} w-full pl-9 placeholder:text-gray-400`}
                                />
                            </div>
                            {tab === 'all' && (
                                <select value={recordType} onChange={(e) => { setRecordType(e.target.value); setStatus(''); setPage(1); }} aria-label="Filter by report type" className={CONTROL}>
                                    <option value="">All report types</option>
                                    {(data?.type_options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            )}
                            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status" className={CONTROL}>
                                <option value="">All statuses</option>
                                {(data?.status_options ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                                {status && !(data?.status_options ?? []).includes(status) && <option value={status}>{status}</option>}
                            </select>
                            {hasFilters && (
                                <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setRecordType(''); setPage(1); }}
                                    className="h-10 px-2 text-sm font-medium text-teal-700 hover:underline focus:outline-none focus-visible:underline dark:text-violet-300">
                                    Clear
                                </button>
                            )}
                            <p className="ml-auto text-[13px] tabular-nums text-gray-500 dark:text-gray-400" aria-live="polite">
                                {data ? `${data.count.toLocaleString('en-IN')} ${data.count === 1 ? 'record' : 'records'}` : ''}
                            </p>
                        </div>

                        {error ? (
                            <div className="rounded-lg border border-gray-200 dark:border-gray-800">
                                <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
                            </div>
                        ) : (
                            // relative: keeps sr-only header text inside this scroll box
                            <div className={`relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 ${loading && !firstLoad ? 'opacity-60' : ''}`} aria-busy={loading}>
                                <table className="w-full min-w-[1080px] table-fixed text-sm">
                                    <colgroup>{COLUMNS.map(c => <col key={c.key} className={c.width} />)}</colgroup>
                                    <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                                        <tr className="h-11">
                                            {COLUMNS.map(c => {
                                                if (c.key === 'actions') return <th key={c.key} scope="col" className="px-3 text-right"><span className="sr-only">{c.label}</span></th>;
                                                const key = c.key;
                                                const active = ordering.replace('-', '') === key;
                                                const desc = ordering.startsWith('-');
                                                return (
                                                    <th key={key} scope="col" aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'} className={`px-3 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                                                        <button type="button" onClick={() => sortBy(key)}
                                                            className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800 focus:outline-none focus-visible:underline dark:hover:text-gray-200 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                                                            {c.label}
                                                            {active ? (desc ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />) : <ArrowUpDown size={12} aria-hidden="true" className="opacity-40" />}
                                                        </button>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {firstLoad ? (
                                            [0, 1, 2, 3, 4].map(i => (
                                                <tr key={i} className="h-14"><td colSpan={COLUMNS.length} className="px-3"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" /></td></tr>
                                            ))
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={COLUMNS.length} className="px-3 py-12 text-center">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{hasFilters ? 'No records match these filters' : 'No records in this period'}</p>
                                                    <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
                                                        {hasFilters ? 'Try another search or status, or clear the filters.' : 'Choose a wider reporting period, for example This Year or All Time.'}
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : rows.map(row => {
                                            const note = amountNote(row);
                                            return (
                                                <tr key={row.key} className="h-14 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                                    <td className="px-3 py-2.5">
                                                        <div className="truncate font-medium text-gray-900 dark:text-white" title={row.record_type}>{row.record_type}</div>
                                                        {tab === 'all' && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{row.category_label}</div>}
                                                    </td>
                                                    <td className="truncate px-3 py-2.5 tabular-nums text-gray-900 dark:text-gray-100" title={row.reference}>{row.reference || '—'}</td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="truncate text-gray-900 dark:text-gray-100" title={row.project || row.party || undefined}>{row.project || row.party || '—'}</div>
                                                        {row.project && row.party && <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={row.party}>{row.party}</div>}
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-gray-600 dark:text-gray-400">{toDMY(row.date)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        <div className="font-medium text-gray-900 dark:text-white">{money(row.amount, row.currency)}</div>
                                                        {note && <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={note}>{note}</div>}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <StatusBadge status={row.status_label} label={row.status_label} variant={statusVariant(row.status_label)} className="!px-2 !py-0.5 max-w-full truncate" />
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetail(row)}
                                                            aria-label={`View ${row.record_type} ${row.reference}`}
                                                            title="View details"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Totals + pagination */}
                        {!error && data && data.count > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-600 dark:text-gray-400">
                                <p className="tabular-nums">
                                    Showing {firstRow}–{lastRow} of {data.count.toLocaleString('en-IN')}
                                    <span className="mx-1.5 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
                                    Total {data.totals.map(t => money(t.amount, t.currency)).join(' + ')}
                                </p>
                                {data.total_pages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <span className="tabular-nums">Page {data.page} of {data.total_pages}</span>
                                        <button type="button" onClick={() => setPage(Math.max(1, data.page - 1))} disabled={data.page <= 1 || loading}
                                            className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 font-medium disabled:opacity-50`}>
                                            <ChevronLeft size={16} aria-hidden="true" /> Previous
                                        </button>
                                        <button type="button" onClick={() => setPage(Math.min(data.total_pages, data.page + 1))} disabled={data.page >= data.total_pages || loading}
                                            className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 font-medium disabled:opacity-50`}>
                                            Next <ChevronRight size={16} aria-hidden="true" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Record details */}
            <Drawer
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail ? `${detail.record_type} ${detail.reference || ''}`.trim() : ''}
                subtitle={detail ? `${detail.category_label} · ${toDMY(detail.date)}` : undefined}
                size="md"
                footer={detail?.project_no ? (
                    <div className="flex justify-end">
                        <button type="button" onClick={() => navigate(`/projects/${detail.project_no}`)}
                            className="h-10 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
                            Open project
                        </button>
                    </div>
                ) : undefined}
            >
                {detail && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <StatusBadge status={detail.status_label} label={detail.status_label} variant={statusVariant(detail.status_label)} />
                            <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{money(detail.amount, detail.currency)}</span>
                        </div>
                        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                            {detailFields.map(field => (
                                <div key={field.key} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                                    <dt className="text-gray-500 dark:text-gray-400">{field.label}</dt>
                                    <dd className={`text-right font-medium text-gray-900 dark:text-gray-100 ${field.kind === 'text' ? '' : 'tabular-nums'}`}>
                                        {fieldValue(detail, field)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
            </Drawer>
        </Layout>
    );
};

export default ReportsPage;
