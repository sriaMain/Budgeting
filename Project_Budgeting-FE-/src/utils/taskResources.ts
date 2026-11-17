import axiosInstance from './axiosInstance';

/**
 * Who a task can be assigned to: the people staffed in the project's Resources tab - the selected
 * milestone's resources, or (no milestone) everyone on the project. Employees and freelancers only:
 * vendor / external rows have no login or freelancer record to own a task.
 */
export type TaskResourceKind = 'employee' | 'freelancer';

export interface TaskResource {
    key: string; // `${kind}:${id}`
    kind: TaskResourceKind;
    /** accounts.Account id (employee) or freelancer_onboarding.Freelancer id (freelancer). */
    id: number;
    name: string;
    role: string;
    /** Resources-tab status: active / on_hold / completed. */
    status: string;
}

interface ResourceRow {
    resource_type?: string;
    resource_id?: number | null;
    resource_name?: string | null;
    role?: string | null;
    status?: string;
}

const STATUS_ORDER: Record<string, number> = { active: 0, on_hold: 1, completed: 2 };
const rank = (status: string) => STATUS_ORDER[status] ?? 9;

export const resourceKey = (kind: TaskResourceKind, id: number) => `${kind}:${id}`;

export async function fetchTaskResources(projectId: number, milestoneId?: number | null): Promise<TaskResource[]> {
    const res = await axiosInstance.get(`/projects/${projectId}/resources/`, { params: { milestone: milestoneId || 'any' } });
    const rows: ResourceRow[] = Array.isArray(res.data) ? res.data : [];
    const byKey = new Map<string, TaskResource>();
    for (const r of rows) {
        const kind = r.resource_type;
        if ((kind !== 'employee' && kind !== 'freelancer') || !r.resource_id || r.status === 'removed') continue;
        const item: TaskResource = {
            key: resourceKey(kind, r.resource_id),
            kind,
            id: r.resource_id,
            name: r.resource_name || `${kind === 'employee' ? 'Employee' : 'Freelancer'} #${r.resource_id}`,
            role: r.role || '',
            status: r.status || 'active',
        };
        // Someone staffed more than once (several periods): keep their most current row.
        const prev = byKey.get(item.key);
        if (!prev || rank(item.status) < rank(prev.status)) byKey.set(item.key, item);
    }
    return [...byKey.values()].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

export const resourceLabel = (r: TaskResource) =>
    `${r.name}${r.role ? ` — ${r.role}` : ''}${r.kind === 'freelancer' ? ' (Freelancer)' : ''}`
    + (r.status === 'completed' ? ' · assignment ended' : r.status === 'on_hold' ? ' · on hold' : '');

/** Task API fields that assign the task to this resource; null unassigns it. */
export const assignmentPayload = (r: TaskResource | null) =>
    !r
        ? { assigned_to: null, hrms_employee: null, freelancer: null }
        : r.kind === 'employee'
            ? { assigned_to: r.id, freelancer: null }
            : { freelancer: r.id, assigned_to: null };

/** The resource key of a task's current assignee (API task: assigned_to is an account id). */
export const taskAssigneeKey = (task: { assigned_to?: unknown; assigned_freelancer?: { id?: number } | null } | null | undefined) => {
    if (!task) return '';
    const account = typeof task.assigned_to === 'number' ? task.assigned_to : (task.assigned_to as { id?: number } | null)?.id;
    if (account) return resourceKey('employee', account);
    if (task.assigned_freelancer?.id) return resourceKey('freelancer', task.assigned_freelancer.id);
    return '';
};
