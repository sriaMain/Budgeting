/**
 * ResourcesPanel - Project Details > Resources ("Resource Allocation"), for Fixed Budget and Time &
 * Material projects. Every row is an existing ResourceAssignment; people come from the existing
 * masters (AIRA HRMS employees, freelancers, vendors) and are never copied. Search, filters, sorting,
 * paging, totals, Excel export and import all run on the server (/projects/<id>/resources/?page=…,
 * …/export/, …/import/ - Project/resource_service.py), so the table, the export and the import agree.
 *
 * Resource cost = the assignment's specific cost amount, else cost rate × planned hours - never timers
 * or timesheets. It feeds the milestone / project Actual Cost server-side.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Eye, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { formatDate as toDMY } from '../utils/date';
import type { ProjectFilterValues } from '../hooks/useProjectFilters';
import { DataTable } from './DataTable';
import type { DataColumn, DataTableSort } from './DataTable';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';
import { ResourceFormDrawer } from './ResourceFormDrawer';
import type { ResourceDrawerMode } from './ResourceFormDrawer';
import { ResourceImportDrawer } from './ResourceImportDrawer';
import {
    RESOURCE_TYPES, STATUS_BADGE, STATUS_OPTIONS, TYPE_BADGE, errorText, money, num, periodDays, saveDownload,
} from '../utils/resources';
import type { PocOption, ResourceRow, ResourceTableResponse } from '../utils/resources';

interface ResourcesPanelProps {
    projectId: string;
    currency?: string;
    /** Fixed Budget projects tie each resource to a milestone; T&M hours are per billing period. */
    engagementType?: 'fixed' | 'time_and_material';
    /** After add / edit / remove / import, so the page can refresh cost figures. */
    onChanged?: () => void;
    /** Project Details filter toolbar (search, status, milestone, resource, assignment period);
     * when given, it replaces this tab's own filter inputs (Resource Type stays here). */
    pageFilters?: ProjectFilterValues;
}

const PAGE_SIZE = 25;
const controlClass = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const labelClass = 'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400';
const secondaryButton = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';
const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';

export const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ projectId, currency: currencyProp = 'INR', engagementType = 'fixed', onChanged, pageFilters }) => {
    const isFixed = engagementType === 'fixed';

    /* ---------------- filters (all applied on the server) ---------------- */
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [resourceType, setResourceType] = useState('');
    const [milestone, setMilestone] = useState('');
    const [status, setStatus] = useState('');
    // Assignment period: draft = the inputs, applied = what the data uses (Apply Filters).
    const [draftFrom, setDraftFrom] = useState('');
    const [draftTo, setDraftTo] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sort, setSort] = useState<DataTableSort>({ key: 'start_date', direction: 'desc' });
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);

    const rangeError = draftFrom && draftTo && draftTo < draftFrom ? "To Date can't be earlier than From Date." : '';
    const datesDirty = !pageFilters && (draftFrom !== dateFrom || draftTo !== dateTo);
    // The page's filters, when present, win over this tab's own inputs (which are then hidden).
    const eff = pageFilters
        ? { search: pageFilters.search, milestone: pageFilters.milestone, status: pageFilters.status, dateFrom: pageFilters.dateFrom, dateTo: pageFilters.dateTo, resource: pageFilters.resource }
        : { search, milestone, status, dateFrom, dateTo, resource: '' };
    const anyFilter = Boolean(eff.search || resourceType || eff.milestone || eff.status || eff.dateFrom || eff.dateTo || eff.resource);

    // Search applies 300 ms after typing stops (the page resets as soon as typing starts).
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const params = useMemo(() => {
        const p: Record<string, string | number> = {
            page, page_size: PAGE_SIZE, ordering: `${sort.direction === 'desc' ? '-' : ''}${sort.key}`,
        };
        if (eff.search) p.search = eff.search;
        if (resourceType) p.resource_type = resourceType;
        if (eff.milestone) p.milestone = eff.milestone;
        if (eff.status) p.status = eff.status;
        if (eff.dateFrom) p.date_from = eff.dateFrom;
        if (eff.dateTo) p.date_to = eff.dateTo;
        if (eff.resource) p.resource = eff.resource;
        return p;
    }, [page, sort, resourceType, eff.search, eff.milestone, eff.status, eff.dateFrom, eff.dateTo, eff.resource]);

    /* ---------------- data ---------------- */
    const requestKey = `${projectId}|${JSON.stringify(params)}|${reloadKey}`;
    const [result, setResult] = useState<{ key: string; data?: ResourceTableResponse; error?: string } | null>(null);

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        axiosInstance.get<ResourceTableResponse>(`/projects/${projectId}/resources/`, { params })
            .then((res) => { if (!cancelled) setResult({ key: requestKey, data: res.data }); })
            .catch(async (err) => {
                const message = await errorText(err, 'Failed to load resources');
                if (!cancelled) setResult((prev) => ({ key: requestKey, data: prev?.data, error: message }));
            });
        return () => { cancelled = true; };
    }, [projectId, params, requestKey]);

    const loading = result?.key !== requestKey;
    const data = result?.data;
    const error = !loading ? result?.error : undefined;
    const rows = useMemo(() => (error ? [] : data?.results ?? []), [data, error]);
    const currency = data?.currency || currencyProp;

    const [milestones, setMilestones] = useState<{ id: number; name: string }[]>([]);
    const [pocOptions, setPocOptions] = useState<PocOption[]>([]);
    useEffect(() => {
        let cancelled = false;
        axiosInstance.get<PocOption[]>('/projects/poc-options/')
            .then((res) => { if (!cancelled) setPocOptions(Array.isArray(res.data) ? res.data : []); })
            .catch((err) => console.error('Failed to fetch resource options:', err));
        if (isFixed && projectId) {
            axiosInstance.get<{ id: number; name: string }[]>(`/projects/${projectId}/milestones/`)
                .then((res) => { if (!cancelled) setMilestones(Array.isArray(res.data) ? res.data : []); })
                .catch((err) => console.error('Failed to fetch milestones:', err));
        }
        return () => { cancelled = true; };
    }, [projectId, isFixed]);

    const refresh = () => {
        setReloadKey((k) => k + 1);
        onChanged?.();
    };

    /* ---------------- filter actions ---------------- */
    const applyDates = () => {
        if (rangeError) return;
        setDateFrom(draftFrom);
        setDateTo(draftTo);
        setPage(1);
    };
    const resetFilters = () => {
        setSearchInput('');
        setSearch('');
        setResourceType('');
        setMilestone('');
        setStatus('');
        setDraftFrom('');
        setDraftTo('');
        setDateFrom('');
        setDateTo('');
        setPage(1);
    };
    const changeSort = (key: string) => {
        setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
        setPage(1);
    };

    /* ---------------- drawers, remove, export ---------------- */
    const [drawer, setDrawer] = useState<ResourceDrawerMode | null>(null);
    const [drawerKey, setDrawerKey] = useState(0);
    const openDrawer = (mode: ResourceDrawerMode) => {
        setDrawer(mode);
        setDrawerKey((k) => k + 1);
    };
    const [importOpen, setImportOpen] = useState(false);
    const [removing, setRemoving] = useState<ResourceRow | null>(null);
    const [exporting, setExporting] = useState(false);

    const remove = async () => {
        if (!removing) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/resources/${removing.id}/`);
            toast.success(`${removing.resource_name || 'Resource'} removed from the project`);
            if (drawer && drawer.kind !== 'add' && drawer.row.id === removing.id) setDrawer(null);
            setRemoving(null);
            refresh();
        } catch (err) {
            toast.error(await errorText(err, 'Failed to remove the assignment'));
        }
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const filters = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'page' && key !== 'page_size'));
            const res = await axiosInstance.get<Blob>(`/projects/${projectId}/resources/export/`, { params: filters, responseType: 'blob' });
            toast.success(`Downloaded ${saveDownload(res, 'Resources.xlsx')}`);
        } catch (err) {
            toast.error(await errorText(err, 'Export failed'));
        } finally {
            setExporting(false);
        }
    };

    /* ---------------- table ---------------- */
    const columns: DataColumn<ResourceRow>[] = [
        {
            key: 'resource', header: 'Resource', sortKey: 'name', width: '210px',
            cell: (a) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => openDrawer({ kind: 'view', row: a })}
                            className="truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-white dark:hover:text-blue-300"
                            title={a.resource_name}>
                            {a.resource_name || '—'}
                        </button>
                        {a.resource_active === false && (
                            <span className="shrink-0 rounded bg-red-50 px-1 py-px text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
                                title={a.resource_type === 'employee' ? 'No longer active in AIRA HRMS' : 'Inactive in its master record'}>
                                Inactive
                            </span>
                        )}
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{a.department || (a.resource_type === 'external' ? 'External resource' : ' ')}</p>
                </div>
            ),
        },
        {
            key: 'type', header: 'Type', sortKey: 'type', width: '108px',
            cell: (a) => <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[a.resource_type]}`}>{a.resource_type_display === 'External Resource' ? 'External' : a.resource_type_display}</span>,
        },
        {
            key: 'code', header: 'Resource ID', sortKey: 'code', width: '120px',
            cell: (a) => a.resource_code ? <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{a.resource_code}</span> : <span className="text-gray-400">—</span>,
        },
        {
            key: 'designation', header: 'Designation', sortKey: 'designation', width: '150px',
            cell: (a) => <span className="line-clamp-2" title={a.designation}>{a.designation || '—'}</span>,
        },
        ...(isFixed ? [{
            key: 'milestone', header: 'Milestone', sortKey: 'milestone', width: '120px',
            cell: (a: ResourceRow) => a.milestone_name
                ? <span className="line-clamp-2">{a.milestone_name}</span>
                : <span className="text-amber-600 dark:text-amber-400" title="Edit this assignment and pick its milestone so its cost counts in that milestone">Not linked</span>,
        }] : []),
        {
            key: 'cost_rate', header: 'Cost Rate', sortKey: 'cost_rate', align: 'right', width: '120px',
            cell: (a) => (
                <div className="tabular-nums">
                    <p>{a.is_cost_overridden && !num(a.cost_rate) ? '—' : <>{money(a.cost_rate, currency)}<span className="text-xs text-gray-500">/h</span></>}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{a.is_cost_overridden ? 'Specific amount' : `× ${num(a.working_hours).toLocaleString('en-IN')} h`}</p>
                </div>
            ),
        },
        {
            key: 'total_cost', header: 'Total Cost', sortKey: 'total_cost', align: 'right', width: '130px',
            cell: (a) => a.counts_in_cost
                ? <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{money(a.total_cost, currency)}</span>
                : (
                    <div className="tabular-nums">
                        <p className="text-gray-400 line-through">{money(a.total_cost, currency)}</p>
                        <p className="text-xs text-gray-500">Not costed</p>
                    </div>
                ),
        },
        {
            key: 'period', header: 'Assignment Period', sortKey: 'start_date', width: '190px',
            cell: (a) => {
                const days = periodDays(a.start_date, a.end_date);
                return (
                    <div className="tabular-nums">
                        <p className="whitespace-nowrap">{toDMY(a.start_date, '—')} – {a.end_date ? toDMY(a.end_date, '—') : 'Ongoing'}</p>
                        {days && <p className="text-xs text-gray-500 dark:text-gray-400">{days} {days === 1 ? 'day' : 'days'}</p>}
                    </div>
                );
            },
        },
        {
            key: 'status', header: 'Status', sortKey: 'status', width: '104px',
            cell: (a) => <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_BADGE[a.status] || STATUS_BADGE.removed}`}>{a.status_display}</span>,
        },
        {
            key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: '112px',
            cell: (a) => (
                <div className="flex justify-end gap-0.5">
                    <button type="button" className={iconButton} onClick={() => openDrawer({ kind: 'view', row: a })} aria-label={`View ${a.resource_name}`} title="View resource">
                        <Eye size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={iconButton} onClick={() => openDrawer({ kind: 'edit', row: a })} aria-label={`Edit ${a.resource_name}'s assignment`} title="Edit assignment">
                        <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button type="button" className={`${iconButton} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10 dark:hover:!text-red-400`}
                        onClick={() => setRemoving(a)} aria-label={`Remove ${a.resource_name}'s assignment`} title="Remove assignment">
                        <Trash2 size={15} aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];
    const totalIndex = columns.findIndex((c) => c.key === 'total_cost');

    const summary = data?.summary;
    const filtered = data?.filtered;

    return (
        <section aria-labelledby="resources-heading" className="space-y-3">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="resources-heading" className="text-base font-semibold text-gray-900 dark:text-white">Resource Allocation</h3>
                    <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
                        {summary ? (
                            <>
                                <span className="font-medium text-gray-700 dark:text-gray-300">{summary.resources.toLocaleString('en-IN')}</span> assigned {summary.resources === 1 ? 'resource' : 'resources'}
                                {' · '}Total resource cost <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{money(summary.total_cost, currency)}</span>
                            </>
                        ) : 'Loading…'}
                    </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 min-[480px]:grid-cols-3 sm:flex sm:w-auto">
                    <button type="button" onClick={exportExcel} disabled={exporting || !data} className={secondaryButton}>
                        <Download size={16} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export Excel'}
                    </button>
                    {data?.can_import && (
                        <button type="button" onClick={() => setImportOpen(true)} className={secondaryButton}>
                            <Upload size={16} aria-hidden="true" /> Import Excel
                        </button>
                    )}
                    <button type="button" onClick={() => openDrawer({ kind: 'add' })}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
                        <Plus size={16} aria-hidden="true" /> Add Resource
                    </button>
                </div>
            </div>

            {/* Filters - with the page's filter toolbar only Resource Type is set here */}
            {pageFilters ? (
                <div className="flex flex-wrap items-end gap-2">
                    <div className="w-full sm:w-56">
                        <label htmlFor="res-type" className={labelClass}>Resource Type</label>
                        <select id="res-type" value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(1); }} className={controlClass}>
                            <option value="">All types</option>
                            {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                </div>
            ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(200px,1.6fr)_repeat(3,minmax(130px,1fr))_repeat(2,minmax(140px,1fr))_auto]">
                    <div>
                        <label htmlFor="res-search" className={labelClass}>Search</label>
                        <div className="relative">
                            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input id="res-search" type="search" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                                placeholder="Name or employee ID" className={`${controlClass} pl-9`} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="res-type" className={labelClass}>Resource Type</label>
                        <select id="res-type" value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(1); }} className={controlClass}>
                            <option value="">All types</option>
                            {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    {isFixed ? (
                        <div>
                            <label htmlFor="res-milestone-filter" className={labelClass}>Milestone</label>
                            <select id="res-milestone-filter" value={milestone} onChange={(e) => { setMilestone(e.target.value); setPage(1); }} className={controlClass}>
                                <option value="">All milestones</option>
                                {milestones.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                                <option value="none">Not linked</option>
                            </select>
                        </div>
                    ) : <div className="hidden xl:block" aria-hidden="true" />}
                    <div>
                        <label htmlFor="res-status-filter" className={labelClass}>Status</label>
                        <select id="res-status-filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={controlClass}>
                            <option value="">All statuses</option>
                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="res-from" className={labelClass}>From Date <span className="font-normal text-gray-400">(start)</span></label>
                        <input id="res-from" type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDraftFrom(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
                            aria-invalid={Boolean(rangeError)} className={`${controlClass} ${rangeError ? 'border-red-400 dark:border-red-500' : ''}`} />
                    </div>
                    <div>
                        <label htmlFor="res-to" className={labelClass}>To Date <span className="font-normal text-gray-400">(end)</span></label>
                        <input id="res-to" type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDraftTo(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyDates(); }}
                            aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? 'res-range-error' : undefined}
                            className={`${controlClass} ${rangeError ? 'border-red-400 dark:border-red-500' : ''}`} />
                    </div>
                    <div className="flex items-end gap-2 min-[480px]:col-span-2 md:col-span-3 xl:col-span-1">
                        <button type="button" onClick={applyDates} disabled={!datesDirty || Boolean(rangeError)}
                            className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-gray-900 px-3.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40 xl:flex-none dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                            Apply Filters
                        </button>
                        <button type="button" onClick={resetFilters} disabled={!anyFilter && !searchInput && !draftFrom && !draftTo}
                            className={`${secondaryButton} flex-1 xl:flex-none`}>
                            Reset
                        </button>
                    </div>
                </div>
                {rangeError && <p id="res-range-error" role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{rangeError}</p>}
            </div>
            )}

            {/* What's shown */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-600 dark:text-gray-400" aria-live="polite">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    {eff.dateFrom || eff.dateTo
                        ? `Assignment period: ${eff.dateFrom ? toDMY(eff.dateFrom) : 'any start'} – ${eff.dateTo ? toDMY(eff.dateTo) : 'any end'}`
                        : 'All assignment dates'}
                </span>
                {datesDirty && !rangeError && <span className="text-xs text-amber-600 dark:text-amber-400">Date changes not applied yet</span>}
                {filtered && !error && (
                    <span>
                        {filtered.count.toLocaleString('en-IN')} {anyFilter ? 'matching' : 'listed'}
                        {eff.status !== 'removed' && ' (removed ones shown, not costed)'} · cost <span className="font-medium tabular-nums text-gray-900 dark:text-white">{money(filtered.total_cost, currency)}</span>
                    </span>
                )}
            </div>

            <DataTable
                label="Project resources"
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                loading={loading}
                error={error}
                onRetry={() => setReloadKey((k) => k + 1)}
                sort={sort}
                onSort={changeSort}
                minWidth={isFixed ? 1220 : 1100}
                rowClassName={(a) => (a.status === 'removed' ? 'opacity-70' : '')}
                page={data?.page ?? page}
                pageSize={PAGE_SIZE}
                total={data?.count}
                onPageChange={setPage}
                empty={summary && summary.resources === 0 && !anyFilter ? (
                    <EmptyState
                        icon={<Users size={22} />}
                        title="No resources assigned yet"
                        description={isFixed ? 'Add employees, freelancers or vendors to a milestone - their cost counts in its Actual Cost.' : 'Add employees, freelancers or vendors to this project.'}
                        action={(
                            <button type="button" onClick={() => openDrawer({ kind: 'add' })} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
                                <Plus size={16} aria-hidden="true" /> Add Resource
                            </button>
                        )}
                    />
                ) : (
                    <EmptyState
                        icon={<Search size={22} />}
                        title="No resources match these filters"
                        description="Try another name, type, status or assignment period."
                        action={<button type="button" onClick={resetFilters} className={secondaryButton}>Reset filters</button>}
                    />
                )}
                footer={filtered && (
                    <tr className="h-11 border-t border-gray-200 bg-gray-50 text-[13px] dark:border-gray-800 dark:bg-gray-800/60">
                        <td colSpan={totalIndex} className="px-4 font-semibold text-gray-900 dark:text-white">
                            Total · {filtered.count.toLocaleString('en-IN')} {filtered.count === 1 ? 'resource' : 'resources'}
                            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(all pages; removed ones not costed)</span>
                        </td>
                        <td className="px-4 text-right font-bold tabular-nums text-gray-900 dark:text-white">{money(filtered.total_cost, currency)}</td>
                        <td colSpan={columns.length - totalIndex - 1} />
                    </tr>
                )}
            />

            <ResourceFormDrawer
                key={drawerKey}
                mode={drawer}
                projectId={projectId}
                currency={currency}
                isFixed={isFixed}
                milestones={milestones}
                pocOptions={pocOptions}
                onClose={() => setDrawer(null)}
                onSaved={() => { setDrawer(null); refresh(); }}
                onEdit={(row) => openDrawer({ kind: 'edit', row })}
                onRemove={(row) => setRemoving(row)}
            />

            <ResourceImportDrawer
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                projectId={projectId}
                currency={currency}
                onImported={refresh}
            />

            <ConfirmDialog
                isOpen={!!removing}
                onClose={() => setRemoving(null)}
                onConfirm={remove}
                title="Remove this assignment?"
                message={removing ? (
                    <span>
                        <strong>{removing.resource_name}</strong> will be taken off {removing.milestone_name ? `milestone ${removing.milestone_name}` : 'this project'}
                        {' '}and their {money(removing.total_cost, currency)} stops counting in the Actual Cost.
                        {' '}The employee, freelancer or vendor record isn't changed, and the assignment's history is kept.
                    </span>
                ) : ''}
                confirmLabel="Remove Assignment"
            />
        </section>
    );
};
