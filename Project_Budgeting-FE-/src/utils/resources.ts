/** Resources tab (Project Details): shared types and helpers. Data comes from
 * /projects/<id>/resources/?page=… (Project/resource_service.py). */
import axios from 'axios';
import type { AxiosResponse } from 'axios';

export type ResourceType = 'employee' | 'freelancer' | 'vendor' | 'external';

export interface ResourceRow {
    id: number;
    project: number;
    milestone: number | null;
    milestone_name: string | null;
    resource_type: ResourceType;
    resource_type_display: string;
    resource_id: number | null;
    external_name: string;
    resource_name: string;
    /** AIRA employee ID / freelancer code / vendor reference. */
    resource_code: string | null;
    designation: string;
    department: string;
    /** Freelancer skills. */
    resource_detail: string;
    /** Still active in its master record (AIRA HRMS / freelancer / vendor); null for external. */
    resource_active: boolean | null;
    cost_rate: string;
    working_hours: string;
    cost_amount: string | null;
    is_cost_overridden: boolean;
    total_cost: string;
    /** Removed assignments stay listed but carry no cost. */
    counts_in_cost: boolean;
    allocation_percent: number;
    start_date: string;
    end_date: string | null;
    status: string;
    status_display: string;
    created_at: string;
    updated_at: string;
    created_by_name: string | null;
    updated_by_name: string | null;
}

export interface ResourceTableResponse {
    count: number;
    page: number;
    page_size: number;
    total_pages: number;
    results: ResourceRow[];
    filtered: { count: number; total_cost: string };
    summary: {
        resources: number;
        total_cost: string;
        by_type: Record<string, { label: string; count: number; total_cost: string }>;
    };
    currency: string;
    period: string;
    can_import: boolean;
}

/** /projects/poc-options/ - existing Employee (AIRA HRMS) / Freelancer / Vendor masters. */
export interface PocOption {
    id: number;
    type: 'employee' | 'vendor' | 'freelancer';
    name: string;
    subtitle: string;
    department?: string;
    designation?: string;
    code?: string | null;
    skills?: string;
    active?: boolean;
    default_cost_rate?: string | number | null;
    rate_unit?: string | null;
}

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'external', label: 'External' },
];

export const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'removed', label: 'Removed' },
];

export const STATUS_BADGE: Record<string, string> = {
    active: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/20',
    on_hold: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    completed: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20',
    removed: 'bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-500/20',
};

export const TYPE_BADGE: Record<ResourceType, string> = {
    employee: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    freelancer: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
    vendor: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
    external: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/** Cost rates are per hour; a daily master rate (freelancer rate card) is converted at this many hours/day. */
export const HOURS_PER_DAY = 8;

export const num = (v: string | number | undefined | null): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** ₹1,23,456.00 (INR) / USD 1,234.00 - always two decimals, Indian grouping. */
export const money = (v: string | number | null | undefined, currency = 'INR') => {
    const amount = num(v);
    const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try {
        return amount.toLocaleString('en-IN', { style: 'currency', currency: currency || 'INR', ...digits });
    } catch {
        return `${currency} ${amount.toLocaleString('en-IN', digits)}`;
    }
};

/** Whole days in an assignment period, both ends included. */
export const periodDays = (start: string, end: string | null) => {
    if (!start || !end) return null;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
    return Number.isFinite(days) && days > 0 ? days : null;
};

/** The API's error message - also when the response was requested as a blob. */
export const errorText = async (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (data instanceof Blob) {
            try { return JSON.parse(await data.text())?.error || fallback; } catch { return fallback; }
        }
        if (data?.error) return String(data.error);
        if (data?.detail) return String(data.detail);
        if (data && typeof data === 'object') {
            const first = Object.values(data).flat().find((v) => typeof v === 'string');
            if (first) return String(first);
        }
    }
    return fallback;
};

/** Saves a blob response under the server's Content-Disposition filename. Returns the name. */
export const saveDownload = (res: AxiosResponse<Blob>, fallbackName: string) => {
    const header = String(res.headers['content-disposition'] || '');
    const name = /filename="?([^";]+)"?/.exec(header)?.[1] || fallbackName;
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return name;
};
