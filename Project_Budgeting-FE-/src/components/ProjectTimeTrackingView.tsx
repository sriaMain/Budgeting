import React, { useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { useTaskTimer } from '../hooks/useTaskTimer';
import axiosInstance from '../utils/axiosInstance';

interface TimeTrackingTask {
    id: string;
    title: string;
    assignee: string;
    assigneeAvatar: string;
    status: 'Planned' | 'In Progress' | 'Completed' | 'Needs Attention';
    allocatedHoursNum: number;
    consumedHoursNum: number;
    remainingHoursNum: number;
}

interface ProjectTimeTrackingViewProps {
    tasks: TimeTrackingTask[];
    currentUsername: string | null;
    onTimerChange: (taskId: string) => void;
}

const STATUS_STYLES: Record<TimeTrackingTask['status'], string> = {
    'Planned': 'bg-purple-50 text-purple-700 border-purple-200',
    'In Progress': 'bg-green-50 text-green-700 border-green-200',
    'Completed': 'bg-blue-50 text-blue-700 border-blue-200',
    'Needs Attention': 'bg-red-50 text-red-700 border-red-200',
};

const formatHoursHM = (hours: number): string => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
};

export const ProjectTimeTrackingView: React.FC<ProjectTimeTrackingViewProps> = ({ tasks, currentUsername, onTimerChange }) => {
    const { activeTimerTaskId, isTaskRunning, getElapsedTime, startTimer, pauseTimer, fetchTimerState, formatTime } = useTaskTimer();

    // On mount, find out if the current user already has a timer running
    // (e.g. left running from a previous visit) and sync the hook to it.
    useEffect(() => {
        let cancelled = false;
        const syncActiveTimer = async () => {
            try {
                const response = await axiosInstance.get('tasks/my-active-timer/');
                const runningTaskId = response.data?.task?.id?.toString();
                if (!cancelled && runningTaskId && tasks.some(t => t.id === runningTaskId)) {
                    await fetchTimerState(runningTaskId);
                }
            } catch {
                // No active timer or endpoint unavailable — safe to ignore.
            }
        };
        syncActiveTimer();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const liveConsumedHours = (task: TimeTrackingTask): number => {
        if (isTaskRunning(task.id)) {
            return getElapsedTime(task.id) / 3600;
        }
        return task.consumedHoursNum;
    };

    const totals = useMemo(() => {
        const allocated = tasks.reduce((sum, t) => sum + t.allocatedHoursNum, 0);
        const consumed = tasks.reduce((sum, t) => sum + liveConsumedHours(t), 0);
        return { allocated, consumed, remaining: Math.max(0, allocated - consumed) };
        // Recompute every second while a timer runs via getElapsedTime's own ticking.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, activeTimerTaskId, getElapsedTime]);

    const handleStart = async (taskId: string) => {
        await startTimer(taskId);
        onTimerChange(taskId);
    };

    const handlePause = async (taskId: string) => {
        await pauseTimer(taskId);
        onTimerChange(taskId);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Allocated</p>
                    <p className="text-xl font-bold text-gray-900">{formatHoursHM(totals.allocated)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Consumed (live)</p>
                    <p className="text-xl font-bold text-gray-900">{formatHoursHM(totals.consumed)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">Remaining</p>
                    <p className="text-xl font-bold text-gray-900">{formatHoursHM(totals.remaining)}</p>
                </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <div className="col-span-4">Task</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Allocated</div>
                    <div className="col-span-2">Consumed</div>
                    <div className="col-span-2 text-right">Timer</div>
                </div>
                <div className="divide-y divide-gray-100">
                    {tasks.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-500">No tasks in this project yet.</div>
                    ) : (
                        tasks.map(task => {
                            const isMine = !!currentUsername && task.assignee === currentUsername;
                            const running = isTaskRunning(task.id);
                            const blockedByOtherTimer = isMine && !running && activeTimerTaskId !== null && activeTimerTaskId !== task.id;
                            const consumed = liveConsumedHours(task);

                            return (
                                <div key={task.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                                        <div
                                            className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-medium shrink-0"
                                            title={task.assignee}
                                        >
                                            {task.assigneeAvatar}
                                        </div>
                                        <span className="text-sm font-medium text-gray-900 truncate">{task.title}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[task.status]}`}>
                                            {task.status}
                                        </span>
                                    </div>
                                    <div className="col-span-2 text-sm text-gray-700">{formatHoursHM(task.allocatedHoursNum)}</div>
                                    <div className={`col-span-2 text-sm font-medium ${running ? 'text-green-600' : 'text-gray-700'}`}>
                                        {running ? formatTime(getElapsedTime(task.id)) : formatHoursHM(consumed)}
                                    </div>
                                    <div className="col-span-2 flex justify-end">
                                        {!isMine ? (
                                            <span className="text-xs text-gray-400">Not your task</span>
                                        ) : running ? (
                                            <button
                                                onClick={() => handlePause(task.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                                            >
                                                <Pause className="w-3 h-3" /> Pause
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleStart(task.id)}
                                                disabled={blockedByOtherTimer}
                                                title={blockedByOtherTimer ? 'Another timer is already running' : undefined}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${blockedByOtherTimer
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : 'bg-green-600 text-white hover:bg-green-700'
                                                    }`}
                                            >
                                                <Play className="w-3 h-3" /> Start
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
