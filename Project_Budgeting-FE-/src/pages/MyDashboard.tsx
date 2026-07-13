import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, PlayCircle, CheckCircle2, AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';

interface TaskStatusGrouped {
  [status: string]: { count: number; tasks: unknown[] };
}

interface TimesheetTask {
  id: number;
  title: string;
  allocated_hours: number;
  consumed_hours: number;
  remaining_hours: number;
}

interface TimesheetEntry {
  hours: number;
}

interface TimesheetResponse {
  timesheet: { status: string; entries: TimesheetEntry[] };
  tasks: TimesheetTask[];
}

interface ActiveTimerResponse {
  has_active_timer: boolean;
  task: { id: number; title: string; project_name: string | null; formatted_time: string } | null;
}

interface UpcomingDeadline {
  id: number;
  title: string;
  due_date: string;
  project_name: string | null;
  status: string;
}

interface MyExtrasResponse {
  upcoming_deadlines: UpcomingDeadline[];
  extra_hours_pending: number;
}

const WEEKLY_TARGET_HOURS = 40;

export const MyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [taskStatus, setTaskStatus] = useState<TaskStatusGrouped | null>(null);
  const [timesheet, setTimesheet] = useState<TimesheetResponse | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimerResponse | null>(null);
  const [extras, setExtras] = useState<MyExtrasResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [taskStatusRes, timesheetRes, timerRes, extrasRes] = await Promise.allSettled([
        axiosInstance.get('tasks/grouped-by-status/'),
        axiosInstance.get('timesheet/'),
        axiosInstance.get('tasks/my-active-timer/'),
        axiosInstance.get('tasks/my-extras/'),
      ]);

      if (!mounted) return;

      if (taskStatusRes.status === 'fulfilled') setTaskStatus(taskStatusRes.value.data);
      if (timesheetRes.status === 'fulfilled') setTimesheet(timesheetRes.value.data);
      if (timerRes.status === 'fulfilled') setActiveTimer(timerRes.value.data);
      if (extrasRes.status === 'fulfilled') setExtras(extrasRes.value.data);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const weeklyHours = (timesheet?.timesheet.entries ?? []).reduce((sum, e) => sum + e.hours, 0);
  const weeklyPercent = Math.min((weeklyHours / WEEKLY_TARGET_HOURS) * 100, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Your tasks and hours at a glance</p>
      </div>

      {/* Task status stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Planned" value={String(taskStatus?.planned?.count ?? 0)} icon={<ListTodo size={18} />} loading={loading} />
        <StatCard label="In Progress" value={String(taskStatus?.in_progress?.count ?? 0)} icon={<PlayCircle size={18} />} loading={loading} />
        <StatCard label="Completed" value={String(taskStatus?.completed?.count ?? 0)} icon={<CheckCircle2 size={18} />} loading={loading} />
        <StatCard label="Needs Attention" value={String(taskStatus?.needs_attention?.count ?? 0)} icon={<AlertTriangle size={18} />} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* This week's hours */}
        <ChartCard title="This Week's Hours" subtitle={`Target ${WEEKLY_TARGET_HOURS}h`} loading={loading} className="lg:col-span-2">
          <div className="mb-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-2xl font-bold text-gray-900">{weeklyHours.toFixed(1)}h</span>
              <span className="text-sm text-gray-500">of {WEEKLY_TARGET_HOURS}h</span>
            </div>
            <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${weeklyPercent}%` }} />
            </div>
          </div>

          {(timesheet?.tasks?.length ?? 0) > 0 ? (
            <div className="divide-y divide-gray-100">
              {timesheet?.tasks.map((task) => {
                const pct = task.allocated_hours > 0
                  ? Math.min((task.consumed_hours / task.allocated_hours) * 100, 100)
                  : 0;
                return (
                  <div key={task.id} className="py-2.5">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-900 font-medium truncate">{task.title}</span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        {task.consumed_hours.toFixed(1)}h / {task.allocated_hours.toFixed(1)}h
                      </span>
                    </div>
                    <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-blue-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No assigned tasks yet</p>
          )}
        </ChartCard>

        {/* Active timer */}
        <ChartCard title="Active Timer" loading={loading}>
          {activeTimer?.has_active_timer && activeTimer.task ? (
            <div className="text-center py-4">
              <Clock className="mx-auto text-blue-600 mb-2" size={28} />
              <p className="text-sm font-medium text-gray-900 truncate">{activeTimer.task.title}</p>
              {activeTimer.task.project_name && (
                <p className="text-xs text-gray-500 mb-2">{activeTimer.task.project_name}</p>
              )}
              <p className="text-xl font-bold text-gray-900 tabular-nums">{activeTimer.task.formatted_time}</p>
              <button
                onClick={() => navigate('/task-management')}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Manage timer
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <Clock className="mx-auto text-gray-300 mb-2" size={28} />
              <p className="text-sm text-gray-400">No timer running</p>
              <button
                onClick={() => navigate('/task-management')}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Go to my tasks
              </button>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Upcoming deadlines + extra hours */}
      <ChartCard
        title="Upcoming Deadlines"
        subtitle={extras && extras.extra_hours_pending > 0
          ? `${extras.extra_hours_pending} extra-hours request${extras.extra_hours_pending > 1 ? 's' : ''} pending approval`
          : undefined}
        loading={loading}
        isEmpty={!loading && !(extras?.upcoming_deadlines.length)}
        emptyMessage="No upcoming deadlines"
      >
        <div className="divide-y divide-gray-100">
          {extras?.upcoming_deadlines.map((task) => (
            <div key={task.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <CalendarClock size={16} className="text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  {task.project_name && <p className="text-xs text-gray-500">{task.project_name}</p>}
                </div>
              </div>
              <span className="text-sm text-gray-500">{new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
};

export default MyDashboard;
