import React, { useMemo } from 'react';

interface GanttTask {
    id: string;
    title: string;
    status: 'Planned' | 'In Progress' | 'Completed' | 'Needs Attention';
    assignee: string;
    assigneeAvatar: string;
    dueDateRaw: string | null;
}

interface TaskGanttViewProps {
    tasks: GanttTask[];
    projectStartDate?: string | null;
    projectEndDate?: string | null;
    onTaskClick?: (task: GanttTask) => void;
}

const MARKER_COLORS: Record<GanttTask['status'], string> = {
    'Planned': 'bg-purple-500 border-purple-600',
    'In Progress': 'bg-green-500 border-green-600',
    'Completed': 'bg-blue-500 border-blue-600',
    'Needs Attention': 'bg-red-500 border-red-600',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const TaskGanttView: React.FC<TaskGanttViewProps> = ({ tasks, projectStartDate, projectEndDate, onTaskClick }) => {
    const scheduledTasks = useMemo(() => tasks.filter(t => !!t.dueDateRaw), [tasks]);
    const unscheduledTasks = useMemo(() => tasks.filter(t => !t.dueDateRaw), [tasks]);

    const { rangeStart, rangeEnd } = useMemo(() => {
        const dueDates = scheduledTasks.map(t => startOfDay(new Date(t.dueDateRaw as string)));
        const candidates: Date[] = [];
        if (projectStartDate) candidates.push(startOfDay(new Date(projectStartDate)));
        if (projectEndDate) candidates.push(startOfDay(new Date(projectEndDate)));
        candidates.push(...dueDates);
        candidates.push(startOfDay(new Date()));

        const times = candidates.map(d => d.getTime()).filter(t => !Number.isNaN(t));
        let min = new Date(Math.min(...times));
        let max = new Date(Math.max(...times));

        // pad a couple of days on each side so edge markers aren't clipped
        min = new Date(min.getTime() - 2 * DAY_MS);
        max = new Date(max.getTime() + 2 * DAY_MS);
        if (max.getTime() <= min.getTime()) max = new Date(min.getTime() + 7 * DAY_MS);

        return { rangeStart: min, rangeEnd: max };
    }, [scheduledTasks, projectStartDate, projectEndDate]);

    const totalSpanMs = rangeEnd.getTime() - rangeStart.getTime();
    const offsetPercent = (date: Date) => Math.min(100, Math.max(0, ((date.getTime() - rangeStart.getTime()) / totalSpanMs) * 100));

    const today = startOfDay(new Date());
    const todayPercent = offsetPercent(today);

    const monthTicks = useMemo(() => {
        const ticks: { date: Date; percent: number }[] = [];
        const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        while (cursor.getTime() <= rangeEnd.getTime()) {
            if (cursor.getTime() >= rangeStart.getTime()) {
                const percent = Math.min(100, Math.max(0, ((cursor.getTime() - rangeStart.getTime()) / totalSpanMs) * 100));
                ticks.push({ date: new Date(cursor), percent });
            }
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return ticks;
    }, [rangeStart, rangeEnd, totalSpanMs]);

    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">
                Tasks plotted by due date across the project timeline. This project has no per-task start date, so each task is shown as a single due-date marker rather than a start-to-end bar.
            </p>

            {scheduledTasks.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-500 text-sm">No tasks with a due date yet.</p>
                </div>
            ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Month axis */}
                    <div className="relative h-8 bg-gray-50 border-b border-gray-200">
                        {monthTicks.map(tick => (
                            <div
                                key={tick.date.toISOString()}
                                className="absolute top-0 h-full border-l border-gray-200 pl-1.5 flex items-center"
                                style={{ left: `${tick.percent}%` }}
                            >
                                <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                                    {tick.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="relative">
                        {todayPercent >= 0 && todayPercent <= 100 && (
                            <div
                                className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-400 z-10"
                                style={{ left: `${todayPercent}%` }}
                                title="Today"
                            />
                        )}
                        {scheduledTasks.map(task => {
                            const dueDate = startOfDay(new Date(task.dueDateRaw as string));
                            const percent = offsetPercent(dueDate);
                            const isOverdue = dueDate.getTime() < today.getTime() && task.status !== 'Completed';

                            return (
                                <div key={task.id} className="flex items-center border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                    <div className="w-48 shrink-0 px-3 py-2.5 flex items-center gap-2 border-r border-gray-100">
                                        <div
                                            className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-medium shrink-0"
                                            title={task.assignee}
                                        >
                                            {task.assigneeAvatar}
                                        </div>
                                        <span className="text-xs font-medium text-gray-900 truncate" title={task.title}>{task.title}</span>
                                    </div>
                                    <div className="relative flex-1 h-10">
                                        <button
                                            onClick={() => onTaskClick?.(task)}
                                            title={`${task.title} — due ${dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 ${MARKER_COLORS[task.status]} ${isOverdue ? 'ring-2 ring-red-300' : ''}`}
                                            style={{ left: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {unscheduledTasks.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">No due date ({unscheduledTasks.length})</p>
                    <div className="flex flex-wrap gap-2">
                        {unscheduledTasks.map(task => (
                            <button
                                key={task.id}
                                onClick={() => onTaskClick?.(task)}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-gray-50 text-gray-600 border-gray-200"
                            >
                                {task.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
