/**
 * HelpdeskTaskTable
 * Read-only table of helpdesk tasks - Project Details > Tasks and Task Management's
 * list. Each task links to the helpdesk, where it is edited. With groupByProject the
 * rows sit under a collapsible header per project (in the order tasks arrive).
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { formatDate as toDMY } from '../utils/date';
import {
    PRIORITY_VARIANT, RESOURCE_TYPE_LABEL, initialsOf, isTaskOverdue, projectPath, statusVariant, taskProgress,
    type HelpdeskTask,
} from '../utils/helpdeskTasks';
import { StatusBadge } from './StatusBadge';

interface HelpdeskTaskTableProps {
    tasks: HelpdeskTask[];
    loading: boolean;
    groupByProject?: boolean;
    /** Shown (with a Clear filters button) when filters leave no rows. */
    onClearFilters: () => void;
}

const COLUMNS = 9;

const TaskRow: React.FC<{ task: HelpdeskTask }> = ({ task }) => {
    const assignee = task.resource_name || '';
    const overdue = isTaskOverdue(task);
    const progress = taskProgress(task);
    return (
        <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
            <td className="px-4 py-3">
                {task.url ? (
                    <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={task.subject}
                        className="block truncate font-medium text-gray-900 hover:text-teal-700 focus:outline-none focus-visible:underline dark:text-white dark:hover:text-violet-300"
                    >
                        {task.subject || 'Untitled task'}
                    </a>
                ) : (
                    <span title={task.subject} className="block truncate font-medium text-gray-900 dark:text-white">{task.subject || 'Untitled task'}</span>
                )}
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{task.task_id}</span>
            </td>
            <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5" title={assignee || 'Unassigned'}>
                    <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${assignee
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20'
                            : 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}
                    >
                        {assignee ? initialsOf(assignee) : '?'}
                    </span>
                    <div className="min-w-0">
                        <div className={`truncate ${assignee ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{assignee || 'Unassigned'}</div>
                        {assignee && (task.resource_code || task.resource_type) && (
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {[task.resource_code, task.resource_type ? RESOURCE_TYPE_LABEL[task.resource_type] ?? task.resource_type : null].filter(Boolean).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>
            </td>
            <td className="truncate px-4 py-3 text-gray-600 dark:text-gray-400" title={task.milestone_name || undefined}>
                {task.milestone_name || <span className="text-gray-400 dark:text-gray-500">—</span>}
            </td>
            <td className="px-4 py-3">
                {task.status
                    ? <StatusBadge status={task.status} label={task.status} variant={statusVariant(task.status)} className="!px-2 !py-0.5 whitespace-nowrap" />
                    : <span className="text-gray-400 dark:text-gray-500">—</span>}
            </td>
            <td className="px-4 py-3">
                {task.priority
                    ? <StatusBadge status={task.priority} label={task.priority} variant={PRIORITY_VARIANT[task.priority.toLowerCase()] ?? 'neutral'} className="!px-2 !py-0.5 whitespace-nowrap" />
                    : <span className="text-gray-400 dark:text-gray-500">—</span>}
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${task.subject} progress`}>
                        <div className="h-full rounded-full bg-teal-600 dark:bg-violet-400" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">{progress}%</span>
                </div>
            </td>
            <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-400">{toDMY(task.start_date)}</td>
            <td className={`px-4 py-3 tabular-nums ${overdue ? 'font-medium text-risk-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {toDMY(task.end_date)}
                {overdue && <span className="sr-only"> (overdue)</span>}
                {task.completed_on && <div className="whitespace-nowrap text-[11px] font-normal text-gray-500 dark:text-gray-400">Done {toDMY(task.completed_on)}</div>}
            </td>
            <td className="px-2 py-3">
                {task.url && (
                    <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${task.task_id} in the helpdesk`}
                        title="Open in helpdesk"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                )}
            </td>
        </tr>
    );
};

export const HelpdeskTaskTable: React.FC<HelpdeskTaskTableProps> = ({ tasks, loading, groupByProject = false, onClearFilters }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggle = (key: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const groups = new Map<string, HelpdeskTask[]>();
    if (groupByProject) {
        tasks.forEach(t => {
            const key = String(t.project_id ?? '');
            groups.set(key, [...(groups.get(key) ?? []), t]);
        });
    }

    return (
        // relative: keeps sr-only header text inside this scroll box.
        <div className="relative overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            {/* min width leaves the Task column ~250px when the table scrolls on small screens */}
            <table className="w-full min-w-[1200px] table-fixed text-sm">
                <colgroup>
                    <col />
                    <col className="w-[216px]" />
                    <col className="w-[140px]" />
                    <col className="w-[120px]" />
                    <col className="w-[92px]" />
                    <col className="w-[116px]" />
                    <col className="w-[100px]" />
                    <col className="w-[124px]" />
                    <col className="w-[48px]" />
                </colgroup>
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                    <tr className="h-11">
                        <th scope="col" className="px-4 text-left">Task</th>
                        <th scope="col" className="px-4 text-left">Assignee</th>
                        <th scope="col" className="px-4 text-left">Milestone</th>
                        <th scope="col" className="px-4 text-left">Status</th>
                        <th scope="col" className="px-4 text-left">Priority</th>
                        <th scope="col" className="px-4 text-left">Progress</th>
                        <th scope="col" className="px-4 text-left">Start</th>
                        <th scope="col" className="px-4 text-left">Due</th>
                        <th scope="col" className="px-2"><span className="sr-only">Open in helpdesk</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {loading ? (
                        [0, 1, 2].map(i => (
                            <tr key={i} className="h-14">
                                <td colSpan={COLUMNS} className="px-4"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" /></td>
                            </tr>
                        ))
                    ) : tasks.length === 0 ? (
                        <tr>
                            <td colSpan={COLUMNS} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                                No tasks match these filters.{' '}
                                <button type="button" onClick={onClearFilters} className="font-medium text-teal-700 hover:underline dark:text-violet-300">Clear filters</button>
                            </td>
                        </tr>
                    ) : !groupByProject ? (
                        tasks.map(task => <TaskRow key={task.task_id} task={task} />)
                    ) : (
                        [...groups.entries()].map(([key, rows]) => {
                            const isCollapsed = collapsed.has(key);
                            const name = rows[0].project_name || (key ? `Project #${key}` : 'No project');
                            const path = projectPath(rows[0]);
                            return (
                                <React.Fragment key={`group-${key}`}>
                                    <tr className="bg-gray-50/80 dark:bg-gray-800/40">
                                        <td colSpan={COLUMNS} className="px-4 py-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggle(key)}
                                                    aria-expanded={!isCollapsed}
                                                    className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-gray-900 focus:outline-none focus-visible:underline dark:text-white"
                                                >
                                                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                                    <span className="truncate" title={name}>{name}</span>
                                                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                                                        {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
                                                    </span>
                                                </button>
                                                {path && (
                                                    <Link to={path} className="shrink-0 text-xs font-medium text-teal-700 hover:underline focus:outline-none focus-visible:underline dark:text-violet-300">
                                                        Open project
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {!isCollapsed && rows.map(task => <TaskRow key={task.task_id} task={task} />)}
                                </React.Fragment>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};
