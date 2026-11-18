/**
 * Project Details > Tasks: the project's own tasks (Project Budgeting, not the helpdesk).
 * Add Task / Edit (AddTaskModal: title, description, milestone, a resource of that milestone,
 * hours, dates), Assign (AssignTaskModal: the milestone's resources) and, for admins / managers, a
 * consumed-time correction and Delete (DELETE /tasks/<id>/, refused while its timer runs). Hours (allocated / consumed / remaining) are Time & Material only -
 * milestone-based (Fixed Budget / internal) projects don't track time on tasks. The page's filter toolbar (search, due date range, status, resource, milestone)
 * filters the list; the data comes from the page (GET /tasks/<project_id>/tasks/).
 */
import React, { useMemo, useState } from 'react';
import { Check, Edit2, ListChecks, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../../utils/axiosInstance';
import { AddTaskModal } from '../AddTaskModal';
import { AssignTaskModal } from '../AssignTaskModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorState } from '../ErrorState';
import { StatusBadge } from '../StatusBadge';
import { formatDate as toDMY } from '../../utils/date';
import type { ProjectFilterValues } from '../../hooks/useProjectFilters';
import {
    type ApiTask, TASK_STATUS_LABEL, TASK_STATUS_VARIANT, assigneeOf, formatHoursHM, isTaskDone, isTaskOverdue,
    taskDue, taskResourceKey, toHours,
} from '../../utils/projectTasks';

interface Props {
    projectId: string;
    projectName: string;
    tasks: ApiTask[];
    loading: boolean;
    error?: string;
    onReload: () => void;
    /** Admin / manager: may correct consumed time and delete tasks. */
    canManage: boolean;
    /** 'fixed' (milestone-based): no hours columns. */
    engagementType: string;
    filters: ProjectFilterValues;
    onClearFilters: () => void;
    /** Hours changed - refresh the page's figures (billable hours KPIs). */
    onChanged: () => void;
}

const initialsOf = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
};

const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';

export const ProjectTasksPanel: React.FC<Props> = ({ projectId, projectName, tasks, loading, error, onReload, canManage, engagementType, filters, onClearFilters, onChanged }) => {
    const timeTracked = engagementType !== 'fixed';
    const columnCount = timeTracked ? 9 : 6;
    const [addOpen, setAddOpen] = useState(false);
    const [editing, setEditing] = useState<ApiTask | null>(null);
    const [assigning, setAssigning] = useState<ApiTask | null>(null);
    const [deleting, setDeleting] = useState<ApiTask | null>(null);
    const [editingConsumedId, setEditingConsumedId] = useState<number | null>(null);
    const [consumedInput, setConsumedInput] = useState('');

    const shown = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        return tasks.filter((t) => {
            if (filters.status && t.status !== filters.status) return false;
            if (filters.milestone === 'none' ? !!t.milestone : filters.milestone && String(t.milestone ?? '') !== filters.milestone) return false;
            if (filters.resource && taskResourceKey(t) !== filters.resource) return false;
            if (filters.dateFrom || filters.dateTo) {
                const d = taskDue(t) || t.start_date || '';
                if (!d || (filters.dateFrom && d < filters.dateFrom) || (filters.dateTo && d > filters.dateTo)) return false;
            }
            if (!q) return true;
            return [t.title, t.description, assigneeOf(t), t.assignee_code, t.milestone_name, String(t.id)]
                .some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [tasks, filters]);
    const filtered = Object.values(filters).some(Boolean);

    const openEdit = async (task: ApiTask) => {
        try {
            const resp = await axiosInstance.get(`tasks/${task.id}/`);
            setEditing(resp.data);
            setAddOpen(true);
        } catch {
            toast.error('Failed to load the task for editing');
        }
    };

    const startEditingConsumed = (task: ApiTask) => {
        const minutes = Math.round(toHours(task.consumed_hours) * 60);
        setConsumedInput(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
        setEditingConsumedId(task.id);
    };

    const saveConsumed = async (taskId: number) => {
        const match = consumedInput.trim().match(/^(\d{1,4}):([0-5]\d)$/);
        if (!match) {
            toast.error('Enter consumed time as HH:MM');
            return;
        }
        try {
            await axiosInstance.post(`tasks/${taskId}/consumed-hours/`, { consumed_hours: parseInt(match[1], 10) + parseInt(match[2], 10) / 60 });
            toast.success('Consumed hours updated');
            setEditingConsumedId(null);
            onReload();
            onChanged();
        } catch (err: unknown) {
            toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update consumed hours');
        }
    };

    const deleteTask = async () => {
        if (!deleting) return;
        try {
            await axiosInstance.delete(`tasks/${deleting.id}/`);
            toast.success(`"${deleting.title}" deleted`);
            setDeleting(null);
            onReload();
            onChanged();
        } catch (err: unknown) {
            toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete the task');
        }
    };

    const deleteMessage = (task: ApiTask) => {
        const logged = toHours(task.consumed_hours);
        return timeTracked && logged > 0
            ? `"${task.title}" and its ${formatHoursHM(logged)} of logged time will be permanently deleted. This can't be undone.`
            : `"${task.title}" will be permanently deleted. This can't be undone.`;
    };

    const closeAdd = () => { setAddOpen(false); setEditing(null); };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                    Tasks
                    {!loading && !error && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {filtered ? `${shown.length} of ${tasks.length}` : tasks.length}
                        </span>
                    )}
                </h2>
                <button
                    type="button"
                    onClick={() => { setEditing(null); setAddOpen(true); }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                >
                    <Plus size={15} aria-hidden="true" />
                    Add Task
                </button>
            </div>

            {error && tasks.length === 0 ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800">
                    <ErrorState message={error} onRetry={onReload} />
                </div>
            ) : !loading && tasks.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                    <ListChecks size={28} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
                    <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No tasks yet</p>
                    <p className="mt-1 max-w-sm text-[13px] text-gray-500 dark:text-gray-400">
                        {timeTracked
                            ? "Add the first task - give it a description and assign it to one of the project's resources - to start tracking allocated and consumed hours."
                            : "Add the first task - pick a milestone and assign it to one of that milestone's resources."}
                    </p>
                </div>
            ) : (
                // relative: keeps sr-only header text inside this scroll box.
                <div className="relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                    <table className={`w-full ${timeTracked ? (canManage ? 'min-w-[1176px]' : 'min-w-[1136px]') : (canManage ? 'min-w-[920px]' : 'min-w-[880px]')} table-fixed text-sm`}>
                        <colgroup>
                            <col className="w-[200px]" />
                            <col />
                            <col className="w-[140px]" />
                            <col className={timeTracked ? 'w-[140px]' : 'w-[180px]'} />
                            {timeTracked && <col className="w-[96px]" />}
                            {timeTracked && <col className="w-[112px]" />}
                            <col className="w-[104px]" />
                            {timeTracked && <col className="w-[112px]" />}
                            <col className={canManage ? 'w-[124px]' : 'w-[96px]'} />
                        </colgroup>
                        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                            <tr className="h-11">
                                <th scope="col" className="px-4 text-left">Assignee</th>
                                <th scope="col" className="px-4 text-left">Task</th>
                                <th scope="col" className="px-4 text-left">Status</th>
                                <th scope="col" className="px-4 text-left">Milestone</th>
                                {timeTracked && <th scope="col" className="px-4 text-right">Allocated</th>}
                                {timeTracked && <th scope="col" className="px-4 text-right">Consumed</th>}
                                <th scope="col" className="px-4 text-left">Due Date</th>
                                {timeTracked && <th scope="col" className="px-4 text-right">Remaining</th>}
                                <th scope="col" className="px-4 text-right"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading && tasks.length === 0 ? (
                                [0, 1, 2].map((i) => (
                                    <tr key={i} className="h-14"><td colSpan={columnCount} className="px-4"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" /></td></tr>
                                ))
                            ) : shown.length === 0 ? (
                                <tr>
                                    <td colSpan={columnCount} className="px-4 py-8 text-center text-[13px] text-gray-500 dark:text-gray-400">
                                        No tasks match these filters. <button type="button" onClick={onClearFilters} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Clear filters</button>
                                    </td>
                                </tr>
                            ) : shown.map((task) => {
                                const who = assigneeOf(task);
                                const allocated = toHours(task.allocated_hours);
                                const consumed = toHours(task.consumed_hours);
                                const remaining = task.remaining_hours != null ? toHours(task.remaining_hours) : Math.max(0, allocated - consumed);
                                const overBy = Math.max(0, consumed - allocated);
                                const overdue = isTaskOverdue(task);
                                const due = taskDue(task);
                                return (
                                    <tr key={task.id} className="group align-top transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                        <td className="px-4 py-3">
                                            <div className="flex min-w-0 items-center gap-2.5" title={who ?? 'Unassigned'}>
                                                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${who
                                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20'
                                                    : 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                                                    {who ? initialsOf(who) : '?'}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className={`block truncate ${who ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{who ?? 'Unassigned'}</span>
                                                    {task.assignee_code && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{task.assignee_code}</span>}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => openEdit(task)} title={task.title}
                                                className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-teal-700 focus:outline-none focus-visible:underline dark:text-white dark:hover:text-violet-300">
                                                {task.title}
                                            </button>
                                            {task.description && (
                                                <p className="mt-0.5 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400" title={task.description}>{task.description}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={task.status} label={TASK_STATUS_LABEL[task.status] ?? task.status}
                                                variant={TASK_STATUS_VARIANT[task.status] ?? 'neutral'} className="!px-2 !py-0.5 whitespace-nowrap" />
                                        </td>
                                        <td className="truncate px-4 py-3 text-gray-600 dark:text-gray-400" title={task.milestone_name ?? ''}>{task.milestone_name || '—'}</td>
                                        {timeTracked && <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">{formatHoursHM(allocated)}</td>}
                                        {timeTracked && <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">
                                            {editingConsumedId === task.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <input type="text" value={consumedInput} onChange={(e) => setConsumedInput(e.target.value)} autoFocus
                                                        onKeyDown={(e) => { if (e.key === 'Enter') saveConsumed(task.id); if (e.key === 'Escape') setEditingConsumedId(null); }}
                                                        placeholder="HH:MM" aria-label={`Consumed time for ${task.title} (HH:MM)`}
                                                        className="h-8 w-16 rounded border border-gray-300 px-1.5 text-right font-mono text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                                                    <button type="button" onClick={() => saveConsumed(task.id)} aria-label="Save consumed time" title="Save"
                                                        className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 text-white hover:bg-navy-800"><Check className="h-3.5 w-3.5" /></button>
                                                    <button type="button" onClick={() => setEditingConsumedId(null)} aria-label="Cancel" title="Cancel"
                                                        className="flex h-8 w-6 items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500"><X className="h-3.5 w-3.5" /></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1">
                                                    {canManage && (
                                                        <button type="button" onClick={() => startEditingConsumed(task)} aria-label={`Edit consumed time for ${task.title}`} title="Edit consumed time"
                                                            className="p-1 text-gray-400 opacity-0 transition-opacity hover:text-teal-700 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500">
                                                            <Edit2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    <span>{formatHoursHM(consumed)}</span>
                                                </div>
                                            )}
                                        </td>}
                                        <td className={`px-4 py-3 tabular-nums ${overdue ? 'font-medium text-risk-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                            {toDMY(due, 'TBD')}
                                            {overdue && <span className="sr-only"> (overdue)</span>}
                                        </td>
                                        {timeTracked && <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">
                                            {formatHoursHM(remaining)}
                                            {overBy > 0 && <div className="text-[11px] font-medium text-risk-600 dark:text-red-400">+{formatHoursHM(overBy)} over</div>}
                                        </td>}
                                        <td className="px-3 py-3">
                                            <div className="flex justify-end gap-1">
                                                <button type="button" onClick={() => openEdit(task)} aria-label={`Edit task ${task.title}`} title="Edit task" className={iconBtn}>
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button type="button" onClick={() => setAssigning(task)}
                                                    aria-label={`${who ? 'Reassign' : 'Assign'} task ${task.title}`} title={who ? 'Reassign task' : 'Assign task'} className={iconBtn}>
                                                    <UserPlus className="h-4 w-4" />
                                                </button>
                                                {canManage && (
                                                    <button type="button" onClick={() => setDeleting(task)} aria-label={`Delete task ${task.title}`} title="Delete task"
                                                        className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10 dark:hover:!text-red-400`}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading && tasks.length > 0 && (
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                    {tasks.filter(isTaskDone).length} completed · {tasks.filter(isTaskOverdue).length} overdue · {tasks.filter((t) => !isTaskDone(t)).length} open
                </p>
            )}

            {addOpen && (
                <AddTaskModal
                    isOpen={addOpen}
                    onClose={closeAdd}
                    onTaskAdded={() => { onReload(); onChanged(); }}
                    prefilledProjectId={Number(projectId)}
                    prefilledProjectName={projectName}
                    engagementType={engagementType}
                    editingTask={editing}
                    onTaskUpdated={() => { onReload(); onChanged(); }}
                />
            )}
            {assigning && (
                <AssignTaskModal
                    isOpen={!!assigning}
                    onClose={() => setAssigning(null)}
                    onAssignmentSuccess={() => { onReload(); }}
                    task={{ id: String(assigning.id), title: assigning.title, assignee: assigneeOf(assigning) ?? undefined, project: Number(projectId), milestone: assigning.milestone ?? null, milestoneName: assigning.milestone_name ?? null }}
                />
            )}
            <ConfirmDialog
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={deleteTask}
                title="Delete task?"
                message={deleting ? deleteMessage(deleting) : ''}
                confirmLabel="Delete task"
            />
        </div>
    );
};
