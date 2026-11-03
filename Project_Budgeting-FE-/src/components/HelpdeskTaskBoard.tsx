/**
 * HelpdeskTaskBoard
 * Task Management's board: one column per helpdesk status (not started -> in
 * progress -> waiting -> done). Read-only - a task's status changes in the
 * helpdesk, so cards link there instead of being dragged.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate as toDMY } from '../utils/date';
import {
    PRIORITY_VARIANT, initialsOf, isTaskOverdue, projectPath, statusRank, statusVariant, taskProgress,
    type BadgeVariant, type HelpdeskTask,
} from '../utils/helpdeskTasks';
import { StatusBadge } from './StatusBadge';

// Column top edge per status tone (the column header still names the status).
const COLUMN_EDGE: Record<BadgeVariant, string> = {
    neutral: 'border-t-gray-400 dark:border-t-gray-500',
    info: 'border-t-blue-500 dark:border-t-blue-400',
    warning: 'border-t-amber-500 dark:border-t-amber-400',
    success: 'border-t-teal-600 dark:border-t-green-400',
    danger: 'border-t-red-500 dark:border-t-red-400',
};

interface HelpdeskTaskBoardProps {
    tasks: HelpdeskTask[];
    loading: boolean;
    onClearFilters: () => void;
}

const BoardCard: React.FC<{ task: HelpdeskTask }> = ({ task }) => {
    const assignee = task.resource_name || '';
    const overdue = isTaskOverdue(task);
    const progress = taskProgress(task);
    const path = projectPath(task);
    return (
        <li className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-2">
                {task.url ? (
                    <a href={task.url} target="_blank" rel="noopener noreferrer" title={task.subject}
                        className="line-clamp-2 text-sm font-medium text-gray-900 hover:text-teal-700 focus:outline-none focus-visible:underline dark:text-white dark:hover:text-violet-300">
                        {task.subject || 'Untitled task'}
                    </a>
                ) : (
                    <span title={task.subject} className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-white">{task.subject || 'Untitled task'}</span>
                )}
                {task.priority && (
                    <StatusBadge status={task.priority} label={task.priority} variant={PRIORITY_VARIANT[task.priority.toLowerCase()] ?? 'neutral'} className="!px-2 !py-0.5 shrink-0 whitespace-nowrap" />
                )}
            </div>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                <span className="tabular-nums">{task.task_id}</span>
                {task.project_name && (
                    <> · {path
                        ? <Link to={path} className="hover:text-teal-700 hover:underline dark:hover:text-violet-300" title={task.project_name}>{task.project_name}</Link>
                        : <span title={task.project_name}>{task.project_name}</span>}</>
                )}
            </p>
            {task.milestone_name && <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={task.milestone_name}>Milestone: {task.milestone_name}</p>}

            <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${task.subject} progress`}>
                    <div className="h-full rounded-full bg-teal-600 dark:bg-violet-400" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">{progress}%</span>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                <div className="flex min-w-0 items-center gap-2" title={assignee || 'Unassigned'}>
                    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${assignee
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20'
                        : 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                        {assignee ? initialsOf(assignee) : '?'}
                    </span>
                    <span className={`truncate text-xs ${assignee ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{assignee || 'Unassigned'}</span>
                </div>
                {task.end_date && (
                    <span className={`shrink-0 text-xs tabular-nums ${overdue ? 'font-medium text-risk-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        Due {toDMY(task.end_date)}{overdue && <span className="sr-only"> (overdue)</span>}
                    </span>
                )}
            </div>
        </li>
    );
};

export const HelpdeskTaskBoard: React.FC<HelpdeskTaskBoardProps> = ({ tasks, loading, onClearFilters }) => {
    if (loading) {
        return (
            <div className="flex gap-4 overflow-x-auto pb-2">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-64 w-72 shrink-0 animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}
            </div>
        );
    }
    if (tasks.length === 0) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                No tasks match these filters.{' '}
                <button type="button" onClick={onClearFilters} className="font-medium text-teal-700 hover:underline dark:text-violet-300">Clear filters</button>
            </div>
        );
    }

    const columns = new Map<string, HelpdeskTask[]>();
    tasks.forEach(t => {
        const key = t.status || 'No status';
        columns.set(key, [...(columns.get(key) ?? []), t]);
    });
    const ordered = [...columns.entries()].sort(([a], [b]) => statusRank(a) - statusRank(b) || a.localeCompare(b));

    return (
        // Columns scroll sideways when they don't fit; each column scrolls on its own.
        <div className="flex gap-4 overflow-x-auto pb-2" role="list" aria-label="Task board">
            {ordered.map(([status, rows]) => (
                <section key={status} role="listitem" aria-label={`${status}: ${rows.length} ${rows.length === 1 ? 'task' : 'tasks'}`}
                    className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-4 border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 ${COLUMN_EDGE[statusVariant(status)]}`}>
                    <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{status}</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">{rows.length}</span>
                    </header>
                    <ul className="max-h-[600px] space-y-2 overflow-y-auto px-2 pb-2">
                        {rows.map(task => <BoardCard key={task.task_id} task={task} />)}
                    </ul>
                </section>
            ))}
        </div>
    );
};
