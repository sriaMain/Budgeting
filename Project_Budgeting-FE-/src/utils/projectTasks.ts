/**
 * Project Budgeting's own tasks (GET /tasks/<project_id>/tasks/ -> [{ Tasks: [...] }]) for Project
 * Details: the Tasks tab, the Overdue Tasks KPI and the Overview tasks card.
 */

export interface ApiTask {
    id: number;
    title: string;
    description?: string;
    status: string;
    allocated_hours?: number | string | null;
    consumed_hours?: number | string | null;
    remaining_hours?: number | string | null;
    assigned_to?: { id: number; username: string } | null;
    assigned_freelancer?: { id: number; name: string } | null;
    assignee_name?: string | null;
    assignee_code?: string | null;
    milestone?: number | null;
    milestone_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    due_date?: string | null;
    running?: boolean;
}

export const TASK_STATUS_LABEL: Record<string, string> = {
    planned: 'Planned',
    in_progress: 'In Progress',
    completed: 'Completed',
    needs_attention: 'Needs Attention',
};

export const TASK_STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
    planned: 'neutral',
    in_progress: 'info',
    completed: 'success',
    needs_attention: 'danger',
};

export const toHours = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
};

/** Decimal hours as HH:MM. */
export const formatHoursHM = (hours: number) => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};

/** The task list out of the endpoint's [{ Tasks: [...] }] wrapper. */
export const unwrapTasks = (data: unknown): ApiTask[] => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const tasks = (data[0] as { Tasks?: ApiTask[] })?.Tasks;
    return Array.isArray(tasks) ? tasks : [];
};

export const taskDue = (t: ApiTask) => t.end_date || t.due_date || null;
export const isTaskDone = (t: ApiTask) => t.status === 'completed';
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isTaskOverdue = (t: ApiTask) => {
    const due = taskDue(t);
    return !!due && !isTaskDone(t) && due < todayIso();
};

/** Who it's assigned to, for display. */
export const assigneeOf = (t: ApiTask) => t.assignee_name || t.assigned_to?.username || t.assigned_freelancer?.name || null;

/** The page's Resource filter value ('employee:<account id>' / 'freelancer:<id>') for this task. */
export const taskResourceKey = (t: ApiTask) => (t.assigned_to?.id ? `employee:${t.assigned_to.id}`
    : t.assigned_freelancer?.id ? `freelancer:${t.assigned_freelancer.id}` : null);
