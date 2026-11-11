/**
 * Project Details filters, kept in the page URL so they survive tab switches, reloads and shared
 * links. Dates, milestone, resource and the payment / billing / financial statuses are shared by
 * every tab that uses them; search and status are per tab (an invoice status means nothing on the
 * Tasks tab). The backend applies the same names (Project/project_filters.py).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PROJECT_TABS = ['Overview', 'Tasks', 'Expenses', 'Resources', 'Invoices', 'Milestones', 'Financials', 'Payments'] as const;
export type ProjectTab = typeof PROJECT_TABS[number];

export interface ProjectFilterValues {
    dateFrom: string;
    dateTo: string;
    search: string;
    status: string;
    milestone: string;
    resource: string;
    paymentStatus: string;
    billingStatus: string;
    financialStatus: string;
}

export type FilterField = keyof ProjectFilterValues;

export const EMPTY_FILTERS: ProjectFilterValues = {
    dateFrom: '', dateTo: '', search: '', status: '', milestone: '', resource: '',
    paymentStatus: '', billingStatus: '', financialStatus: '',
};

/** Which filters each tab uses (the toolbar shows only these; the rest are kept for other tabs). */
export const TAB_FIELDS: Record<ProjectTab, FilterField[]> = {
    Overview: ['dateFrom', 'dateTo'],
    Tasks: ['search', 'dateFrom', 'dateTo', 'status', 'resource', 'milestone'],
    Expenses: ['search', 'dateFrom', 'dateTo', 'status', 'milestone'],
    Resources: ['search', 'dateFrom', 'dateTo', 'status', 'resource', 'milestone'],
    Invoices: ['search', 'dateFrom', 'dateTo', 'status', 'milestone', 'paymentStatus'],
    Milestones: ['search', 'dateFrom', 'dateTo', 'status', 'financialStatus', 'billingStatus', 'paymentStatus'],
    Financials: ['dateFrom', 'dateTo'],
    Payments: ['search', 'dateFrom', 'dateTo', 'status'],
};

/** What each tab's date range filters on (shown as a hint next to the dates). */
export const DATE_MEANING: Record<ProjectTab, string> = {
    Overview: 'Money in and out between these dates',
    Tasks: 'Task due date',
    Expenses: 'Expense / bill date',
    Resources: 'Assignment starts on/after From and ends on/before To',
    Invoices: 'Invoice date',
    Milestones: 'Milestone due date',
    Financials: 'Money in and out between these dates',
    Payments: 'Payment date',
};

const PER_TAB: FilterField[] = ['search', 'status'];
const URL_KEY: Record<FilterField, string> = {
    dateFrom: 'from', dateTo: 'to', search: 'q', status: 'status', milestone: 'milestone', resource: 'resource',
    paymentStatus: 'payment', billingStatus: 'billing', financialStatus: 'financial',
};
const urlKey = (field: FilterField, tab: ProjectTab) =>
    PER_TAB.includes(field) ? `${tab.toLowerCase()}_${URL_KEY[field]}` : URL_KEY[field];

/** Old ?tab= values from earlier versions of the page. */
export function normaliseTab(raw: string | null, isFixed: boolean): ProjectTab {
    if (!raw) return 'Overview';
    if (['Payment', 'Finances', 'Details'].includes(raw)) return 'Payments';
    if (raw === 'Budget' || raw === 'Time') return 'Overview';
    const tab = PROJECT_TABS.find((t) => t === raw);
    if (!tab || (tab === 'Milestones' && !isFixed)) return 'Overview';
    return tab;
}

export function useProjectFilters(isFixed: boolean) {
    const [params, setParams] = useSearchParams();
    const tab = normaliseTab(params.get('tab'), isFixed);

    const valuesFor = useCallback((t: ProjectTab): ProjectFilterValues => {
        const out = { ...EMPTY_FILTERS };
        (Object.keys(EMPTY_FILTERS) as FilterField[]).forEach((f) => { out[f] = params.get(urlKey(f, t)) ?? ''; });
        return out;
    }, [params]);

    const applied = useMemo(() => valuesFor(tab), [valuesFor, tab]);
    /** Only the filters this tab uses - what its API gets and what the count shows. */
    const effective = useMemo(() => {
        const out = { ...EMPTY_FILTERS };
        TAB_FIELDS[tab].forEach((f) => { out[f] = applied[f]; });
        return out;
    }, [applied, tab]);

    const update = useCallback((mutate: (next: URLSearchParams) => void) => {
        setParams((prev) => {
            const next = new URLSearchParams(prev);
            mutate(next);
            return next;
        }, { replace: true });
    }, [setParams]);

    const setTab = useCallback((t: ProjectTab) => update((next) => { next.set('tab', t); }), [update]);

    /** Save this tab's filters (fields the tab doesn't use are left as they are). */
    const apply = useCallback((values: ProjectFilterValues) => update((next) => {
        TAB_FIELDS[tab].forEach((f) => {
            const key = urlKey(f, tab);
            const v = values[f].trim();
            if (v) next.set(key, v); else next.delete(key);
        });
    }), [update, tab]);

    /** Clear every filter on every tab. */
    const clearAll = useCallback(() => update((next) => {
        [...next.keys()].filter((k) => k !== 'tab').forEach((k) => next.delete(k));
    }), [update]);

    const activeCount = TAB_FIELDS[tab].filter((f) => effective[f]).length;
    /** Filters set for other tabs (kept, not used here). */
    const elsewhereCount = [...params.keys()].filter((k) => k !== 'tab').length - activeCount;

    return { tab, setTab, applied, effective, apply, clearAll, activeCount, elsewhereCount: Math.max(0, elsewhereCount) };
}

/** The API query parameters for these filters (only non-empty ones). */
export function filterParams(f: ProjectFilterValues): Record<string, string> {
    const map: Record<string, string> = {
        date_from: f.dateFrom, date_to: f.dateTo, search: f.search, status: f.status, milestone: f.milestone,
        resource: f.resource, payment_status: f.paymentStatus, billing_status: f.billingStatus,
        financial_status: f.financialStatus,
    };
    return Object.fromEntries(Object.entries(map).filter(([, v]) => v));
}
