/**
 * Project -> Activity: what happened on the project, newest first - milestones, resources,
 * expenses, vendor bills, payments and later finance changes (GET /projects/<id>/activity/,
 * built from the records themselves). The page's Search and dates filter it on the server.
 */
import React, { useState } from 'react';
import { Briefcase, CreditCard, FileText, Flag, PencilLine, Receipt, Users } from 'lucide-react';
import { useApiData } from '../../hooks/useApiData';
import { filterParams, type ProjectFilterValues } from '../../hooks/useProjectFilters';
import { formatDate as toDMY } from '../../utils/date';
import { LoadError, Skeleton } from './panelParts';

interface ActivityEvent {
    at: string;
    kind: string;
    action: string;
    title: string;
    detail: string;
    actor: string | null;
}

interface ActivityPage {
    count: number;
    page: number;
    page_size: number;
    total_pages: number;
    results: ActivityEvent[];
}

interface Props {
    projectId: string;
    filters: ProjectFilterValues;
    reloadToken: number;
}

const PAGE_SIZE = 50;

const ICON: Record<string, React.ReactNode> = {
    project: <Briefcase size={14} />,
    milestone: <Flag size={14} />,
    resource: <Users size={14} />,
    expense: <Receipt size={14} />,
    bill: <FileText size={14} />,
    payment: <CreditCard size={14} />,
};

const TONE: Record<string, string> = {
    removed: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
    archived: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
    paid: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
    updated: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
};

const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export const ProjectActivityPanel: React.FC<Props> = ({ projectId, filters, reloadToken }) => {
    const [page, setPage] = useState(1);
    const { data, staleData, loading, error, reload } = useApiData<ActivityPage>(
        `/projects/${projectId}/activity/`,
        { ...filterParams(filters), page, page_size: PAGE_SIZE, _r: reloadToken },
        'Failed to load the activity',
    );
    const shown = data ?? staleData;

    if (error && !shown) return <LoadError what="the activity" onRetry={reload} />;
    if (!shown) return <Skeleton h="h-48" />;

    // Group by local day, keeping the newest-first order.
    const days: { day: string; events: ActivityEvent[] }[] = [];
    for (const e of shown.results) {
        const day = localDay(e.at);
        const last = days[days.length - 1];
        if (last && last.day === day) last.events.push(e); else days.push({ day, events: [e] });
    }

    return (
        <section aria-label="Project activity" className="space-y-3">
            <p className="text-[13px] text-gray-500 dark:text-gray-400" aria-live="polite">
                {loading ? 'Loading…' : `${shown.count} ${shown.count === 1 ? 'event' : 'events'}`}
            </p>
            {shown.results.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No activity matches these filters.
                </p>
            ) : (
                <ol className="space-y-4">
                    {days.map(({ day, events }) => (
                        <li key={day}>
                            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{toDMY(day)}</h4>
                            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                                {events.map((e, i) => (
                                    <li key={`${e.at}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                                        <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE[e.action] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                                            {ICON[e.kind] ?? <PencilLine size={14} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-[13px] font-medium text-gray-900 dark:text-white">{e.title}</p>
                                            {e.detail && <p className="break-words text-[12px] text-gray-500 dark:text-gray-400">{e.detail}</p>}
                                        </div>
                                        <div className="shrink-0 text-right text-[11px] text-gray-500 dark:text-gray-400">
                                            <p className="tabular-nums">{timeOf(e.at)}</p>
                                            <p className="max-w-[9rem] truncate" title={e.actor ?? 'System'}>{e.actor ?? 'System'}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ol>
            )}
            {shown.total_pages > 1 && (
                <nav aria-label="Activity pages" className="flex items-center justify-between gap-2 text-[13px]">
                    <button type="button" disabled={shown.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="h-8 rounded-md border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Newer
                    </button>
                    <span className="tabular-nums text-gray-500 dark:text-gray-400">Page {shown.page} of {shown.total_pages}</span>
                    <button type="button" disabled={shown.page >= shown.total_pages} onClick={() => setPage((p) => p + 1)}
                        className="h-8 rounded-md border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Older
                    </button>
                </nav>
            )}
        </section>
    );
};
