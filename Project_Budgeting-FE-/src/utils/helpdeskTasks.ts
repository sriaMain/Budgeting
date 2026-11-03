/**
 * Helpdesk tasks - shared by Project Details > Tasks and Task Management. Tasks are
 * created and assigned in the helpdesk application; Project Budgeting only reads them
 * (backend: /helpdesk-tasks/ and /projects/<id>/helpdesk-tasks/).
 */
import { toDate } from './date';

/** One helpdesk task, as the backend returns it. */
export interface HelpdeskTask {
    task_id: string;
    project_id: number | string | null;
    project_name: string | null;
    subject: string;
    status: string;
    priority: string;
    progress: number | string;
    milestone_id: string | null;
    milestone_name: string | null;
    assignment_id: string | null;
    resource_type: string | null;
    resource_code: string | null;
    resource_name: string | null;
    start_date: string | null;
    end_date: string | null;
    completed_on: string | null;
    created_at: string | null;
    updated_at: string | null;
    url: string | null;
}

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const DONE_STATUS = /^(completed?|done|closed|resolved|cancell?ed)$/i;

export const isTaskDone = (t: HelpdeskTask) => !!t.completed_on || DONE_STATUS.test((t.status || '').trim());

export const isTaskOverdue = (t: HelpdeskTask) => {
    const due = toDate(t.end_date);
    return !!due && !isTaskDone(t) && due < new Date(new Date().toDateString());
};

// Helpdesk status / priority -> shared badge tone (always shown as text + colour, never colour alone).
export const statusVariant = (status: string): BadgeVariant => {
    const s = status.trim().toLowerCase();
    if (DONE_STATUS.test(s)) return 'success';
    if (/hold|block|pause|wait/.test(s)) return 'warning';
    if (/progress|working|review|open/.test(s)) return 'info';
    return 'neutral';
};

/** Board column order: not started -> in progress -> waiting -> done; unknown statuses in the middle. */
export const statusRank = (status: string): number => {
    const s = status.trim().toLowerCase();
    if (/^(planned|new|open|to ?do|not started|backlog)$/.test(s)) return 0;
    if (/progress|working/.test(s)) return 1;
    if (/review|testing|qa/.test(s)) return 2;
    if (/hold|block|pause|wait/.test(s)) return 4;
    if (/cancell?ed/.test(s)) return 6;
    if (DONE_STATUS.test(s)) return 5;
    return 3;
};

export const PRIORITY_VARIANT: Record<string, BadgeVariant> = { urgent: 'danger', critical: 'danger', high: 'warning' };

export const RESOURCE_TYPE_LABEL: Record<string, string> = {
    employee: 'Employee', freelancer: 'Freelancer', vendor: 'Vendor', external: 'External',
};

// "nithin.kumar" / "Nithin Kumar" -> "NK"; a single word -> its first two letters.
export const initialsOf = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
};

export const taskProgress = (t: HelpdeskTask) => Math.min(100, Math.max(0, Math.round(Number(t.progress) || 0)));

/** Project Details link for a task's project - only for Project Budgeting's numeric project ids. */
export const projectPath = (t: HelpdeskTask) => (/^\d+$/.test(String(t.project_id ?? '')) ? `/projects/${t.project_id}` : null);
