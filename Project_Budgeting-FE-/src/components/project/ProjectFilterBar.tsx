/**
 * Project Details filter toolbar. Shows the filters the active tab uses; edits are a draft until
 * Apply Filters (or Enter in Search). Reset Filters drops unapplied edits; Clear All removes every
 * filter on every tab. Remount it (key) when the applied filters change so the draft follows them.
 */
import React, { useState } from 'react';
import { Filter, RotateCcw, Search, X } from 'lucide-react';
import {
    DATE_MEANING, EMPTY_FILTERS, TAB_FIELDS,
    type FilterField, type ProjectFilterValues, type ProjectTab,
} from '../../hooks/useProjectFilters';

export interface FilterOption { value: string; label: string }

export interface ProjectFilterOptions {
    milestones: FilterOption[];
    resources: FilterOption[];
    /** Status choices for the active tab. */
    statuses: FilterOption[];
    paymentStatuses: FilterOption[];
    billingStatuses: FilterOption[];
    financialStatuses: FilterOption[];
}

interface Props {
    tab: ProjectTab;
    applied: ProjectFilterValues;
    options: ProjectFilterOptions;
    activeCount: number;
    elsewhereCount: number;
    onApply: (values: ProjectFilterValues) => void;
    onClearAll: () => void;
}

const control = 'h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const label = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

const SEARCH_HINT: Record<ProjectTab, string> = {
    Overview: '', Financials: '',
    Tasks: 'Task, ID or assignee',
    Expenses: 'Reference, description or payee',
    Resources: 'Name or employee ID',
    Invoices: 'Invoice no., milestone or client',
    Milestones: 'Milestone name',
    Payments: 'Invoice / bill no. or reference',
};

export const ProjectFilterBar: React.FC<Props> = ({ tab, applied, options, activeCount, elsewhereCount, onApply, onClearAll }) => {
    const [draft, setDraft] = useState<ProjectFilterValues>(applied);
    const fields = TAB_FIELDS[tab];
    const uses = (f: FilterField) => fields.includes(f);
    const set = (f: FilterField) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [f]: e.target.value }));
    const dateError = draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo ? 'From Date can’t be later than To Date.' : '';
    const dirty = fields.some((f) => draft[f] !== applied[f]);
    const apply = () => { if (!dateError) onApply(draft); };

    const select = (f: FilterField, title: string, opts: FilterOption[], all: string, extra?: FilterOption[]) => (
        <div className="min-w-[9rem] flex-1 sm:max-w-[13rem]">
            <label htmlFor={`pf-${f}`} className={label}>{title}</label>
            <select id={`pf-${f}`} value={draft[f]} onChange={set(f)} className={control}>
                <option value="">{all}</option>
                {extra?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );

    return (
        <form
            role="search"
            aria-label="Filter this tab"
            onSubmit={(e) => { e.preventDefault(); apply(); }}
            className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/60"
        >
            <div className="flex flex-wrap items-end gap-2.5">
                {uses('search') && (
                    <div className="min-w-[12rem] flex-[2_1_14rem]">
                        <label htmlFor="pf-search" className={label}>Search</label>
                        <div className="relative">
                            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input id="pf-search" type="search" value={draft.search} onChange={set('search')} placeholder={SEARCH_HINT[tab]} className={`${control} pl-8`} />
                        </div>
                    </div>
                )}
                <div className="min-w-[8.5rem] flex-1 sm:max-w-[10rem]">
                    <label htmlFor="pf-from" className={label}>From Date</label>
                    <input id="pf-from" type="date" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={set('dateFrom')}
                        aria-invalid={!!dateError} aria-describedby="pf-date-hint" className={`${control} ${dateError ? 'border-red-400 dark:border-red-500' : ''}`} />
                </div>
                <div className="min-w-[8.5rem] flex-1 sm:max-w-[10rem]">
                    <label htmlFor="pf-to" className={label}>To Date</label>
                    <input id="pf-to" type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={set('dateTo')}
                        aria-invalid={!!dateError} aria-describedby="pf-date-hint" className={`${control} ${dateError ? 'border-red-400 dark:border-red-500' : ''}`} />
                </div>
                {uses('status') && options.statuses.length > 0 && select('status', 'Status', options.statuses, 'All statuses')}
                {uses('resource') && options.resources.length > 0 && select('resource', 'Resource', options.resources, 'All resources')}
                {uses('milestone') && options.milestones.length > 0 && select('milestone', 'Milestone', options.milestones, 'All milestones', [{ value: 'none', label: 'Not linked to a milestone' }])}
                {uses('financialStatus') && select('financialStatus', 'Financial Status', options.financialStatuses, 'Any')}
                {uses('billingStatus') && select('billingStatus', 'Billing Status', options.billingStatuses, 'Any')}
                {uses('paymentStatus') && select('paymentStatus', 'Payment Status', options.paymentStatuses, 'Any')}

                <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" disabled={!!dateError}
                        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3.5 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                        <Filter size={14} aria-hidden="true" /> Apply Filters
                    </button>
                    <button type="button" onClick={() => setDraft(applied)} disabled={!dirty} title="Undo changes you haven't applied"
                        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                        <RotateCcw size={14} aria-hidden="true" /> Reset
                    </button>
                    {(activeCount > 0 || elsewhereCount > 0) && (
                        <button type="button" onClick={() => { setDraft(EMPTY_FILTERS); onClearAll(); }}
                            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                            <X size={14} aria-hidden="true" /> Clear All
                        </button>
                    )}
                </div>
            </div>
            <div id="pf-date-hint" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                {dateError
                    ? <span role="alert" className="font-medium text-red-600 dark:text-red-400">{dateError}</span>
                    : <span className="text-gray-500 dark:text-gray-400">Dates filter on: {DATE_MEANING[tab]}</span>}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${activeCount ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} active` : 'No filters'}
                </span>
                {elsewhereCount > 0 && <span className="text-gray-500 dark:text-gray-400">{elsewhereCount} more kept for other tabs</span>}
                {dirty && !dateError && <span className="text-amber-700 dark:text-amber-400">Changes not applied yet</span>}
            </div>
        </form>
    );
};
