/**
 * Create / edit an Internal Project - no quotation, client, contract value, invoices or payments.
 * POST /projects/ {project_category: 'internal', ...} | PUT /projects/<id>/. The backend checks the
 * same rules (Project/serializers.py ProjectCreateSerializer._validate_internal) and that the user
 * is an Admin, Manager or Project Manager. Client projects are still created from a quotation.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import axiosInstance from '../../utils/axiosInstance';
import { Drawer } from '../Drawer';
import { DrawerFormFooter, DrawerSection, FieldHint, drawerErrorBorder, drawerInputClass, drawerLabelClass } from '../drawerForm';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import type { PocOption } from '../../utils/resources';

export interface InternalProjectValues {
    project_no?: number;
    project_name: string;
    department: string;
    project_manager: number | null;
    project_manager_name?: string | null;
    description: string;
    start_date: string;
    end_date: string;
    approved_budget: string | number | null;
    currency: string;
    status: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Edit this project; omit to create a new one. */
    project?: InternalProjectValues | null;
    /** After a save (create: called before opening the new project). */
    onSaved?: (projectNo: number) => void;
}

const CURRENCIES = ['INR', 'USD', 'EUR'];
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Form = {
    name: string; department: string; manager: SearchableSelectOption | null; description: string;
    start: string; end: string; budget: string; currency: string; status: string;
};

const initial = (p?: InternalProjectValues | null): Form => ({
    name: p?.project_name ?? '',
    department: p?.department ?? '',
    manager: p?.project_manager ? { id: p.project_manager, label: p.project_manager_name || `#${p.project_manager}` } : null,
    description: p?.description ?? '',
    start: p?.start_date ?? todayIso(),
    end: p?.end_date ?? '',
    budget: p?.approved_budget != null && p.approved_budget !== '' ? String(Number(p.approved_budget)) : '',
    currency: p?.currency || 'INR',
    status: p?.status || 'planning',
});

const Req = () => <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>;
const Err: React.FC<{ text?: string }> = ({ text }) => (text ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{text}</p> : null);

export const InternalProjectDrawer: React.FC<Props> = ({ isOpen, onClose, project, onSaved }) => {
    // Remount the form whenever it opens for a different project (or for a new one).
    if (!isOpen) return null;
    return <InternalProjectForm key={project?.project_no ?? 'new'} onClose={onClose} project={project} onSaved={onSaved} />;
};

const InternalProjectForm: React.FC<Omit<Props, 'isOpen'>> = ({ onClose, project, onSaved }) => {
    const navigate = useNavigate();
    const editing = !!project?.project_no;
    const [form, setForm] = useState<Form>(() => initial(project));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [departments, setDepartments] = useState<string[] | null>(null); // null = still loading
    const [people, setPeople] = useState<PocOption[]>([]);
    const [statuses, setStatuses] = useState<{ value: string; label: string }[]>([]);
    // Editing a field clears its error (the rest stay until the next save).
    const ERROR_KEY: Record<keyof Form, string> = {
        name: 'project_name', department: 'department', manager: 'project_manager', description: 'description',
        start: 'start_date', end: 'end_date', budget: 'approved_budget', currency: 'currency', status: 'status',
    };
    const set = (patch: Partial<Form>) => {
        setForm((f) => ({ ...f, ...patch }));
        const keys = (Object.keys(patch) as (keyof Form)[]).map((k) => ERROR_KEY[k]);
        setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
    };

    useEffect(() => {
        let cancelled = false;
        axiosInstance.get<{ departments: string[] }>('/projects/department-options/')
            .then((r) => { if (!cancelled) setDepartments(r.data?.departments ?? []); })
            .catch(() => { if (!cancelled) setDepartments([]); });
        axiosInstance.get<PocOption[]>('/projects/poc-options/')
            .then((r) => { if (!cancelled) setPeople((r.data ?? []).filter((p) => p.type === 'employee' && p.active !== false)); })
            .catch(() => { if (!cancelled) setPeople([]); });
        axiosInstance.get<{ status_choices: { value: string; label: string }[] }>('project-status-choices/')
            .then((r) => { if (!cancelled) setStatuses(r.data?.status_choices ?? []); })
            .catch(() => { if (!cancelled) setStatuses([]); });
        return () => { cancelled = true; };
    }, []);

    // Keep a department that's no longer on the AIRA list selectable when editing.
    const departmentList = useMemo(() => {
        const list = departments ?? [];
        return form.department && !list.includes(form.department) ? [form.department, ...list] : list;
    }, [departments, form.department]);
    const managerOptions: SearchableSelectOption[] = useMemo(
        () => people.map((p) => ({ id: p.id, label: p.name, sublabel: [p.code, p.designation, p.department].filter(Boolean).join(' · ') || undefined })),
        [people],
    );

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.name.trim()) e.project_name = 'Enter the project name.';
        if (!form.department.trim()) e.department = 'Enter the department.';
        if (!form.manager) e.project_manager = 'Select the project manager.';
        if (!form.start) e.start_date = 'Start date is required.';
        if (!form.end) e.end_date = 'End date is required.';
        else if (form.start && form.end < form.start) e.end_date = 'End date cannot be before the start date.';
        if (!(Number(form.budget) > 0)) e.approved_budget = 'Enter the approved internal budget (more than 0).';
        return e;
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length) return;
        const payload = {
            project_name: form.name.trim(),
            department: form.department.trim(),
            project_manager: form.manager?.id ?? null,
            description: form.description.trim(),
            start_date: form.start,
            end_date: form.end,
            approved_budget: Number(form.budget),
            currency: form.currency,
            status: form.status,
        };
        setSaving(true);
        try {
            if (editing) {
                await axiosInstance.put(`/projects/${project!.project_no}/`, payload);
                toast.success('Project updated');
                onSaved?.(project!.project_no!);
                onClose();
            } else {
                const res = await axiosInstance.post<{ project: { project_no: number } }>('/projects/', {
                    ...payload, project_category: 'internal', project_type: 'internal', engagement_type: 'fixed',
                });
                const no = res.data?.project?.project_no;
                toast.success('Internal project created');
                onClose();
                if (no) {
                    onSaved?.(no);
                    navigate(`/projects/${no}`);
                }
            }
        } catch (err: unknown) {
            const data = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
            const body = (data?.data ?? {}) as Record<string, unknown>;
            const fields = (body.errors && typeof body.errors === 'object' ? body.errors : body) as Record<string, unknown>;
            const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
            const mapped: Record<string, string> = {};
            for (const key of ['project_name', 'department', 'project_manager', 'start_date', 'end_date', 'approved_budget', 'currency', 'status', 'description']) {
                const msg = first(fields[key]);
                if (msg) mapped[key] = msg;
            }
            setErrors(mapped);
            toast.error(Object.values(mapped)[0] || first(body.error) || first(body.detail) || first(fields.non_field_errors)
                || (data?.status === 403 ? 'You don’t have permission to manage internal projects.' : editing ? 'Failed to update the project' : 'Failed to create the project'));
        } finally {
            setSaving(false);
        }
    };

    const input = (key: string) => `${drawerInputClass} ${errors[key] ? drawerErrorBorder : ''}`;
    const budgetNumber = Number(form.budget);

    return (
        <Drawer
            isOpen
            onClose={onClose}
            title={editing ? 'Edit Internal Project' : 'New Internal Project'}
            subtitle={editing ? project?.project_name : 'For work inside the company - no quotation, client or invoices needed'}
            size="lg"
            footer={(
                <DrawerFormFooter
                    summary={budgetNumber > 0 ? <>Approved budget: <span className="font-semibold text-gray-800 dark:text-gray-200">{budgetNumber.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {form.currency}</span></> : undefined}
                    onCancel={onClose}
                    onSubmit={save}
                    submitLabel={editing ? 'Save Changes' : 'Create Project'}
                    busyLabel={editing ? 'Saving...' : 'Creating...'}
                    isBusy={saving}
                />
            )}
        >
            <fieldset disabled={saving} className="min-w-0 space-y-4">
                <DrawerSection>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label htmlFor="ip-name" className={drawerLabelClass}>Project Name<Req /></label>
                            <input id="ip-name" type="text" value={form.name} onChange={(e) => set({ name: e.target.value })}
                                placeholder="e.g. ERP rollout" className={input('project_name')} />
                            <Err text={errors.project_name} />
                        </div>
                        <div>
                            <span className={drawerLabelClass}>Project ID</span>
                            <p className="flex h-10 items-center rounded-lg border border-dashed border-gray-300 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                {editing ? `#${project!.project_no}` : 'Auto-generated'}
                            </p>
                        </div>
                        <div>
                            <span className={drawerLabelClass}>Project Category</span>
                            <p className="flex h-10 items-center">
                                <span className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                    Internal Project
                                </span>
                            </p>
                        </div>
                        <div>
                            <label htmlFor="ip-dept" className={drawerLabelClass}>Department<Req /></label>
                            {/* Type or pick: AIRA's employee feed often carries no department, so a list alone
                                could leave nothing to choose (and Department is required). */}
                            <input id="ip-dept" type="text" list="ip-dept-options" value={form.department} autoComplete="off"
                                onChange={(e) => set({ department: e.target.value })}
                                placeholder={departmentList.length ? 'Type or pick a department' : 'Type the department'}
                                aria-invalid={!!errors.department || undefined} className={input('department')} />
                            <datalist id="ip-dept-options">
                                {departmentList.map((d) => <option key={d} value={d} />)}
                            </datalist>
                            <Err text={errors.department} />
                            {!errors.department && (
                                <FieldHint>{departments === null ? 'Loading suggestions…' : departments.length ? 'Suggestions from AIRA HRMS and earlier projects' : 'AIRA HRMS sends no departments - type it in'}</FieldHint>
                            )}
                        </div>
                        <div>
                            <span className={drawerLabelClass}>Project Manager<Req /></span>
                            <SearchableSelect
                                options={managerOptions}
                                value={form.manager}
                                onChange={(o) => set({ manager: o })}
                                placeholder="Search by name or ID..."
                                emptyMessage="No active employees found"
                            />
                            <Err text={errors.project_manager} />
                            {!errors.project_manager && <FieldHint>Employees currently in AIRA HRMS</FieldHint>}
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="ip-desc" className={drawerLabelClass}>Project Description</label>
                            <textarea id="ip-desc" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })}
                                placeholder="What the project is for" className={`${drawerInputClass} h-auto py-2`} />
                        </div>
                    </div>
                </DrawerSection>

                <DrawerSection>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="ip-start" className={drawerLabelClass}>Start Date<Req /></label>
                            <input id="ip-start" type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} className={input('start_date')} />
                            <Err text={errors.start_date} />
                        </div>
                        <div>
                            <label htmlFor="ip-end" className={drawerLabelClass}>End Date<Req /></label>
                            <input id="ip-end" type="date" value={form.end} min={form.start || undefined} onChange={(e) => set({ end: e.target.value })} className={input('end_date')} />
                            <Err text={errors.end_date} />
                        </div>
                        <div>
                            <label htmlFor="ip-budget" className={drawerLabelClass}>Approved Internal Budget<Req /></label>
                            <input id="ip-budget" type="number" min={0} step="0.01" inputMode="decimal" value={form.budget}
                                onChange={(e) => set({ budget: e.target.value })} placeholder="0.00" className={`${input('approved_budget')} text-right`} />
                            <Err text={errors.approved_budget} />
                            {!errors.approved_budget && <FieldHint>Milestone budgets are shares of this; costs are tracked against it.</FieldHint>}
                        </div>
                        <div>
                            <label htmlFor="ip-currency" className={drawerLabelClass}>Currency</label>
                            <select id="ip-currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })} className={drawerInputClass}>
                                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="ip-status" className={drawerLabelClass}>Project Status</label>
                            <select id="ip-status" value={form.status} onChange={(e) => set({ status: e.target.value })} className={drawerInputClass}>
                                {(statuses.length ? statuses : [{ value: form.status, label: form.status }]).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>
                </DrawerSection>
            </fieldset>
        </Drawer>
    );
};
