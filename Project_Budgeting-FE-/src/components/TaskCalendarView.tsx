import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarTask {
    id: string;
    title: string;
    status: 'Planned' | 'In Progress' | 'Completed' | 'Needs Attention';
    assignee: string;
    dueDateRaw: string | null;
}

interface TaskCalendarViewProps {
    tasks: CalendarTask[];
    onTaskClick?: (task: CalendarTask) => void;
}

const DOT_COLORS: Record<CalendarTask['status'], string> = {
    'Planned': 'bg-purple-500',
    'In Progress': 'bg-green-500',
    'Completed': 'bg-blue-500',
    'Needs Attention': 'bg-red-500',
};

const CHIP_COLORS: Record<CalendarTask['status'], string> = {
    'Planned': 'bg-purple-50 text-purple-700 border-purple-200',
    'In Progress': 'bg-green-50 text-green-700 border-green-200',
    'Completed': 'bg-blue-50 text-blue-700 border-blue-200',
    'Needs Attention': 'bg-red-50 text-red-700 border-red-200',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({ tasks, onTaskClick }) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    const tasksByDay = useMemo(() => {
        const map = new Map<string, CalendarTask[]>();
        tasks.forEach(task => {
            if (!task.dueDateRaw) return;
            const key = task.dueDateRaw.slice(0, 10);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(task);
        });
        return map;
    }, [tasks]);

    const unscheduledTasks = useMemo(() => tasks.filter(t => !t.dueDateRaw), [tasks]);

    const gridDays = useMemo(() => {
        const firstOfMonth = currentMonth;
        const startOffset = firstOfMonth.getDay();
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(gridStart.getDate() - startOffset);

        const days: Date[] = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            days.push(d);
        }
        return days;
    }, [currentMonth]);

    const today = new Date();
    const todayKey = toDateKey(today);

    const goToMonth = (offset: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                    {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
                    >
                        Today
                    </button>
                    <button onClick={() => goToMonth(-1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => goToMonth(1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                    {WEEKDAYS.map(day => (
                        <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {gridDays.map((day, idx) => {
                        const key = toDateKey(day);
                        const dayTasks = tasksByDay.get(key) || [];
                        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                        const isToday = key === todayKey;
                        const visibleTasks = dayTasks.slice(0, 3);
                        const overflowCount = dayTasks.length - visibleTasks.length;

                        return (
                            <div
                                key={idx}
                                className={`min-h-[100px] p-2 border-b border-r border-gray-100 ${isCurrentMonth ? 'bg-white' : 'bg-gray-50/50'}`}
                            >
                                <span
                                    className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1 ${isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                                        }`}
                                >
                                    {day.getDate()}
                                </span>
                                <div className="space-y-1">
                                    {visibleTasks.map(task => (
                                        <button
                                            key={task.id}
                                            onClick={() => onTaskClick?.(task)}
                                            title={task.title}
                                            className={`w-full flex items-center gap-1 text-left text-[11px] px-1.5 py-0.5 rounded border truncate ${CHIP_COLORS[task.status]}`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLORS[task.status]}`} />
                                            <span className="truncate">{task.title}</span>
                                        </button>
                                    ))}
                                    {overflowCount > 0 && (
                                        <p className="text-[11px] text-gray-400 px-1.5">+{overflowCount} more</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {unscheduledTasks.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Unscheduled ({unscheduledTasks.length})</p>
                    <div className="flex flex-wrap gap-2">
                        {unscheduledTasks.map(task => (
                            <button
                                key={task.id}
                                onClick={() => onTaskClick?.(task)}
                                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${CHIP_COLORS[task.status]}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[task.status]}`} />
                                {task.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
