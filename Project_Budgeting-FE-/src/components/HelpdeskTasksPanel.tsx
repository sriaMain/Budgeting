/**
 * HelpdeskTasksPanel
 * The project's Tasks tab. Tasks are created and assigned in the helpdesk
 * application; this tab only reads them (data: hooks/useHelpdeskTasks).
 */

import React, { useMemo, useState } from 'react';
import { ListChecks, RefreshCw, Search } from 'lucide-react';
import type { HelpdeskTask } from '../utils/helpdeskTasks';
import { formatDateTime } from '../utils/date';
import { ErrorState } from './ErrorState';
import { HelpdeskTaskTable } from './HelpdeskTaskTable';
import type { ProjectFilterValues } from '../hooks/useProjectFilters';

/** A task's own date for the date filter: its due (end) date, else start, else created. */
const taskDate = (t: HelpdeskTask) => (t.end_date || t.start_date || t.created_at || '').slice(0, 10);

interface HelpdeskTasksPanelProps {
    tasks: HelpdeskTask[];
    loading: boolean;
    error: string | null;
    fetchedAt: string | null;
    onRefresh: () => void;
    /** Project Details filter toolbar: when given, it replaces this tab's own filter row. */
    filters?: ProjectFilterValues;
    /** The chosen Resource filter, matched on the task's assignee (type + employee code, else name). */
    resourceMatch?: { type: string; code?: string | null; label: string } | null;
    onClearFilters?: () => void;
}

const controlClass = 'h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

export const HelpdeskTasksPanel: React.FC<HelpdeskTasksPanelProps> = ({ tasks, loading, error, fetchedAt, onRefresh, filters, resourceMatch, onClearFilters }) => {
    const [search, setSearch] = useState('');
    const [milestone, setMilestone] = useState('all'); // 'all' | 'none' | milestone_id
    const [status, setStatus] = useState('all');

    // Filter options come from the tasks themselves, in the order the helpdesk returns them.
    const milestones = useMemo(() => {
        const seen = new Map<string, string>();
        tasks.forEach(t => { if (t.milestone_id && !seen.has(String(t.milestone_id))) seen.set(String(t.milestone_id), t.milestone_name || `Milestone ${t.milestone_id}`); });
        return [...seen.entries()];
    }, [tasks]);
    const hasUnplanned = tasks.some(t => !t.milestone_id);
    const statuses = useMemo(() => [...new Set(tasks.map(t => t.status).filter(Boolean))], [tasks]);

    const shown = useMemo(() => {
        if (filters) {
            const q = filters.search.trim().toLowerCase();
            return tasks.filter(t => {
                if (filters.milestone === 'none' ? !!t.milestone_id : filters.milestone && String(t.milestone_id) !== filters.milestone) return false;
                if (filters.status && t.status !== filters.status) return false;
                if (resourceMatch && !(t.resource_type === resourceMatch.type
                    && ((resourceMatch.code && t.resource_code === resourceMatch.code) || (t.resource_name || '').toLowerCase() === resourceMatch.label.toLowerCase()))) return false;
                if (filters.dateFrom || filters.dateTo) {
                    const d = taskDate(t);
                    if (!d || (filters.dateFrom && d < filters.dateFrom) || (filters.dateTo && d > filters.dateTo)) return false;
                }
                if (!q) return true;
                return [t.subject, t.task_id, t.resource_name, t.resource_code, t.milestone_name].some(v => (v || '').toLowerCase().includes(q));
            });
        }
        const q = search.trim().toLowerCase();
        return tasks.filter(t => {
            if (milestone === 'none' ? !!t.milestone_id : milestone !== 'all' && String(t.milestone_id) !== milestone) return false;
            if (status !== 'all' && t.status !== status) return false;
            if (!q) return true;
            return [t.subject, t.task_id, t.resource_name, t.resource_code, t.milestone_name]
                .some(v => (v || '').toLowerCase().includes(q));
        });
    }, [tasks, search, milestone, status, filters, resourceMatch]);

    const filtered = filters
        ? Object.values(filters).some(Boolean)
        : search.trim() !== '' || milestone !== 'all' || status !== 'all';
    const clearFilters = () => {
        if (filters) { onClearFilters?.(); return; }
        setSearch(''); setMilestone('all'); setStatus('all');
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                        Tasks
                        {!loading && !error && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {filtered ? `${shown.length} of ${tasks.length}` : tasks.length}
                            </span>
                        )}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
                        From the helpdesk. Tasks are created and assigned there.
                        {fetchedAt && !loading && !error && <span className="tabular-nums"> · Updated {formatDateTime(fetchedAt)}</span>}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                    <RefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {error ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800">
                    <ErrorState message={error} onRetry={onRefresh} />
                </div>
            ) : !loading && tasks.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                    <ListChecks size={28} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
                    <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No helpdesk tasks yet</p>
                    <p className="mt-1 max-w-sm text-[13px] text-gray-500 dark:text-gray-400">
                        Tasks created in the helpdesk for this project will appear here.
                    </p>
                </div>
            ) : (
                <>
                    {!loading && !filters && (
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search task, ID or assignee"
                                    aria-label="Search tasks"
                                    className={`${controlClass} w-full pl-9`}
                                />
                            </div>
                            {(milestones.length > 0) && (
                                <select value={milestone} onChange={(e) => setMilestone(e.target.value)} aria-label="Filter by milestone" className={controlClass}>
                                    <option value="all">All milestones</option>
                                    {milestones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                    {hasUnplanned && <option value="none">No milestone</option>}
                                </select>
                            )}
                            {statuses.length > 1 && (
                                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={controlClass}>
                                    <option value="all">All statuses</option>
                                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )}
                            {filtered && (
                                <button type="button" onClick={clearFilters} className="h-9 px-2 text-sm font-medium text-teal-700 hover:underline focus:outline-none focus-visible:underline dark:text-violet-300">
                                    Clear
                                </button>
                            )}
                        </div>
                    )}

                    <HelpdeskTaskTable tasks={shown} loading={loading} onClearFilters={clearFilters} />
                </>
            )}
        </div>
    );
};
