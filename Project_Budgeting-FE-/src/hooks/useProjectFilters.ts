/**
 * Project Details filters, kept in the page URL so they survive tab switches, reloads and shared
 * links. Dates, milestone, resource and the payment / billing / financial statuses are shared by
 * every tab that uses them; search and status are per tab (an invoice status means nothing on the
 * Tasks tab). The backend applies the same names (Project/project_filters.py).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PROJECT_TABS = [
    'Overview', 'Tasks', 'Expenses', 'Resources', 'Invoices', 'Milestones', 'Budget', 'Financials', 'Payments', 'Activity',
] as const;
export type ProjectTab = typeof PROJECT_TABS[number];

/** Tabs a project shows. Client projects: no Budget / Activity; T&M: no Milestones.
 * Internal projects (no quotation): no client billing - no Invoices, Payments or Financials. */
export const CLIENT_TABS: ProjectTab[] = ['Overview', 'Tasks', 'Expenses', 'Resources', 'Invoices', 'Milestones', 'Financials', 'Payments'];
export const INTERNAL_TABS: ProjectTab[] = ['Overview', 'Tasks', 'Resources', 'Milestones', 'Expenses', 'Budget', 'Activity'];

export function tabsFor(isFixed: boolean, isInternal: boolean): ProjectTab[] {
    if (isInternal) return INTERNAL_TABS;
    return CLIENT_TABS.filter((t) => t !== 'Milestones' || isFixed);
}

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
    // No Resource filter here: Search already finds a person by name or employee ID.
    Resources: ['search', 'dateFrom', 'dateTo', 'status', 'milestone'],
    Invoices: ['search', 'dateFrom', 'dateTo', 'status', 'milestone', 'paymentStatus'],
    Milestones: ['search', 'dateFrom', 'dateTo', 'status', 'financialStatus', 'billingStatus', 'paymentStatus'],
    Budget: [],
    Financials: ['dateFrom', 'dateTo'],
    Payments: ['search', 'dateFrom', 'dateTo', 'status'],
    Activity: ['search', 'dateFrom', 'dateTo'],
};

/** The filters a tab shows for this project: an internal project's milestones have no billing or
 * client payment status. */
export function fieldsFor(tab: ProjectTab, isInternal: boolean): FilterField[] {
    if (isInternal && tab === 'Milestones') return ['search', 'dateFrom', 'dateTo', 'status', 'financialStatus'];
    return TAB_FIELDS[tab];
}

/** What each tab's date range filters on (shown as a hint next to the dates). */
export const DATE_MEANING: Record<ProjectTab, string> = {
    Overview: 'Money in and out between these dates',
    Tasks: 'Task due date',
    Expenses: 'Expense / bill date',
    Resources: 'Assignment starts on/after From and ends on/before To',
    Invoices: 'Invoice date',
    Milestones: 'Milestone due date',
    Budget: '',
    Financials: 'Money in and out between these dates',
    Payments: 'Payment date',
    Activity: 'When it happened',
};

const PER_TAB: FilterField[] = ['search', 'status'];
const URL_KEY: Record<FilterField, string> = {
    dateFrom: 'from', dateTo: 'to', search: 'q', status: 'status', milestone: 'milestone', resource: 'resource',
    paymentStatus: 'payment', billingStatus: 'billing', financialStatus: 'financial',
};
const urlKey = (field: FilterField, tab: ProjectTab) =>
    PER_TAB.includes(field) ? `${tab.toLowerCase()}_${URL_KEY[field]}` : URL_KEY[field];

/** Link to one tab of a project, with that tab's search box filled in (e.g. from the header search). */
export function projectTabPath(projectId: string | number, tab: ProjectTab, search = ''): string {
    const params = new URLSearchParams();
    if (tab !== 'Overview') params.set('tab', tab);
    if (search && TAB_FIELDS[tab].includes('search')) params.set(urlKey('search', tab), search);
    const qs = params.toString();
    return `/projects/${projectId}${qs ? `?${qs}` : ''}`;
}

/** The ?tab= value as one of this project's tabs (old values from earlier versions mapped). */
export function normaliseTab(raw: string | null, isFixed: boolean, isInternal = false): ProjectTab {
    if (!raw) return 'Overview';
    const allowed = tabsFor(isFixed, isInternal);
    if (['Payment', 'Finances', 'Details'].includes(raw)) return allowed.includes('Payments') ? 'Payments' : 'Overview';
    if (raw === 'Time') return 'Overview';
    const tab = PROJECT_TABS.find((t) => t === raw);
    return tab && allowed.includes(tab) ? tab : 'Overview';
}

export function useProjectFilters(isFixed: boolean, isInternal = false) {
    const [params, setParams] = useSearchParams();
    const tab = normaliseTab(params.get('tab'), isFixed, isInternal);
    const fields = useMemo(() => fieldsFor(tab, isInternal), [tab, isInternal]);

    const valuesFor = useCallback((t: ProjectTab): ProjectFilterValues => {
        const out = { ...EMPTY_FILTERS };
        (Object.keys(EMPTY_FILTERS) as FilterField[]).forEach((f) => { out[f] = params.get(urlKey(f, t)) ?? ''; });
        return out;
    }, [params]);

    const applied = useMemo(() => valuesFor(tab), [valuesFor, tab]);
    /** Only the filters this tab uses - what its API gets and what the count shows. */
    const effective = useMemo(() => {
        const out = { ...EMPTY_FILTERS };
        fields.forEach((f) => { out[f] = applied[f]; });
        return out;
    }, [applied, fields]);

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
        fields.forEach((f) => {
            const key = urlKey(f, tab);
            const v = values[f].trim();
            if (v) next.set(key, v); else next.delete(key);
        });
    }), [update, tab, fields]);

    /** Clear every filter on every tab. */
    const clearAll = useCallback(() => update((next) => {
        [...next.keys()].filter((k) => k !== 'tab').forEach((k) => next.delete(k));
    }), [update]);

    const activeCount = fields.filter((f) => effective[f]).length;
    /** Filters set for other tabs (kept, not used here). */
    const elsewhereCount = [...params.keys()].filter((k) => k !== 'tab').length - activeCount;

    return { tab, setTab, fields, applied, effective, apply, clearAll, activeCount, elsewhereCount: Math.max(0, elsewhereCount) };
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
