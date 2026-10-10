/**
 * ResourcesPanel
 * The project's Resources tab - resource assignment and resource cost, for
 * both Fixed Budget and Time & Material projects. Every row is the existing
 * ResourceAssignment record (/projects/<id>/resources/); people are picked
 * from the existing Employee / Freelancer / Vendor masters (poc-options), so
 * no duplicate resource records. An External Resource has no master record
 * and is named on the assignment.
 *
 * Cost rate is pre-filled from the master (/projects/resource-rate/ -
 * employee cost rate, freelancer rate card) but saved on the assignment, so
 * a project/milestone-specific override never changes the master rate.
 * Resource cost = cost amount (rate x units unless overridden) - never
 * timers or timesheets. It feeds the milestone/project Actual Cost
 * server-side.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { Drawer } from './Drawer';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';

type ResourceType = 'employee' | 'freelancer' | 'vendor' | 'external';

interface PocOption {
    id: number;
    type: 'employee' | 'vendor' | 'freelancer';
    name: string;
    subtitle: string;
}

interface ResourceAssignment {
    id: number;
    milestone: number | null;
    milestone_name: string | null;
    resource_type: ResourceType;
    resource_type_display: string;
    resource_id: number | null;
    external_name: string;
    resource_name: string | null;
    role: string;
    start_date: string;
    end_date: string | null;
    cost_rate: string | number;
    billing_rate: string | number;
    allocation_percent: number;
    working_hours: string | number;
    cost_amount: string | number | null;
    assigned_cost: string | number;
    is_cost_overridden: boolean;
    status: string;
    status_display: string;
}

interface MasterRate {
    cost_rate: string | number | null;
    billing_rate: string | number | null;
    rate_unit: string | null;
    source: string | null;
}

interface ResourcesPanelProps {
    projectId: string;
    currency?: string;
    /** Fixed Budget projects can tie a resource to a milestone; T&M units are hours per billing period. */
    engagementType?: 'fixed' | 'time_and_material';
    /** After add / edit / remove, so the page can refresh cost figures. */
    onChanged?: () => void;
}

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'external', label: 'External Resource' },
];

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'removed', label: 'Removed' },
];

const STATUS_BADGE: Record<string, string> = {
    active: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    completed: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    on_hold: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    removed: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
};

const num = (v: string | number | undefined | null): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const emptyForm = () => ({
    resourceType: 'employee' as ResourceType,
    resource: null as SearchableSelectOption | null,
    externalName: '',
    role: '',
    milestone: '',
    costRate: '',
    units: '',
    costAmount: '',
    /** True when the cost amount was typed and differs from rate x units. */
    amountOverridden: false,
    billingRate: '',
    allocation: '100',
    startDate: todayIso(),
    endDate: '',
    status: 'active',
});

type FormState = ReturnType<typeof emptyForm>;
type DrawerMode = { kind: 'add' } | { kind: 'edit' | 'view'; assignment: ResourceAssignment };

const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800/60';
const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

export const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ projectId, currency = 'INR', engagementType = 'fixed', onChanged }) => {
    const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pocOptions, setPocOptions] = useState<PocOption[]>([]);
    const [milestones, setMilestones] = useState<{ id: number; name: string }[]>([]);

    const [drawer, setDrawer] = useState<DrawerMode | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [masterRate, setMasterRate] = useState<MasterRate | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const isFixed = engagementType === 'fixed';
    const unitsLabel = isFixed ? 'Planned Units' : 'Hours / Period';
    const money = (v: number) => `${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const fetchAssignments = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<ResourceAssignment[]>(`/projects/${projectId}/resources/`, { params: { milestone: 'any' } });
            setAssignments(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch resource assignments:', error);
            toast.error('Failed to load resources');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchAssignments();
        axiosInstance.get<PocOption[]>('/projects/poc-options/')
            .then((res) => setPocOptions(Array.isArray(res.data) ? res.data : []))
            .catch((error) => console.error('Failed to fetch resource options:', error));
        if (isFixed) {
            axiosInstance.get<{ id: number; name: string }[]>(`/projects/${projectId}/milestones/`)
                .then((res) => setMilestones(Array.isArray(res.data) ? res.data : []))
                .catch((error) => console.error('Failed to fetch milestones:', error));
        }
    }, [fetchAssignments, isFixed, projectId]);

    const resourceOptions: SearchableSelectOption[] = useMemo(
        () => pocOptions
            .filter((p) => p.type === form.resourceType)
            .map((p) => ({ id: p.id, label: p.name, sublabel: p.subtitle || undefined })),
        [pocOptions, form.resourceType]
    );

    // Cost shown in the list = server-computed assigned cost of non-removed resources.
    const totalCost = assignments
        .filter((a) => a.status !== 'removed')
        .reduce((sum, a) => sum + num(a.assigned_cost), 0);

    const computedAmount = round2(num(form.costRate) * num(form.units));
    const effectiveAmount = form.amountOverridden ? num(form.costAmount) : computedAmount;
    const readOnly = drawer?.kind === 'view';

    /* ---------------- drawer open / close ---------------- */

    const openAdd = () => {
        setForm(emptyForm());
        setErrors({});
        setMasterRate(null);
        setDrawer({ kind: 'add' });
    };

    const openExisting = (kind: 'edit' | 'view', a: ResourceAssignment) => {
        const rateXUnits = round2(num(a.cost_rate) * num(a.working_hours));
        setForm({
            resourceType: a.resource_type,
            resource: a.resource_id ? { id: a.resource_id, label: a.resource_name || `#${a.resource_id}` } : null,
            externalName: a.external_name || '',
            role: a.role || '',
            milestone: a.milestone ? String(a.milestone) : '',
            costRate: String(num(a.cost_rate)),
            units: String(num(a.working_hours)),
            costAmount: String(num(a.assigned_cost)),
            amountOverridden: a.is_cost_overridden && round2(num(a.cost_amount)) !== rateXUnits,
            billingRate: num(a.billing_rate) ? String(num(a.billing_rate)) : '',
            allocation: String(a.allocation_percent ?? 100),
            startDate: a.start_date || todayIso(),
            endDate: a.end_date || '',
            status: a.status,
        });
        setErrors({});
        setMasterRate(null);
        setDrawer({ kind, assignment: a });
    };

    const closeDrawer = () => setDrawer(null);

    /* ---------------- master rate lookup ---------------- */

    const selectResource = async (opt: SearchableSelectOption | null) => {
        setForm((f) => ({ ...f, resource: opt }));
        setMasterRate(null);
        if (!opt) return;
        try {
            const res = await axiosInstance.get<MasterRate>('/projects/resource-rate/', {
                params: { resource_type: form.resourceType, resource_id: opt.id },
            });
            setMasterRate(res.data);
            setForm((f) => ({
                ...f,
                costRate: res.data.cost_rate != null ? String(num(res.data.cost_rate)) : f.costRate,
                billingRate: res.data.billing_rate != null ? String(num(res.data.billing_rate)) : f.billingRate,
            }));
        } catch (error) {
            console.error('Failed to load master rate:', error);
        }
    };

    /* ---------------- save / remove ---------------- */

    const validate = () => {
        const e: Record<string, string> = {};
        if (form.resourceType === 'external') {
            if (!form.externalName.trim()) e.externalName = 'Enter the external resource name.';
        } else if (!form.resource) {
            e.resource = 'Select a resource.';
        }
        if (num(form.costRate) < 0) e.costRate = 'Cost rate cannot be negative.';
        if (effectiveAmount <= 0) e.costAmount = 'Enter a cost rate and units, or a cost amount.';
        if (!form.startDate) e.startDate = 'Start date is required.';
        if (form.endDate && form.startDate && form.endDate < form.startDate) e.endDate = 'End date cannot be before start date.';
        return e;
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        const payload = {
            resource_type: form.resourceType,
            resource_id: form.resourceType === 'external' ? null : form.resource!.id,
            external_name: form.resourceType === 'external' ? form.externalName.trim() : '',
            role: form.role.trim(),
            milestone: isFixed && form.milestone ? Number(form.milestone) : null,
            cost_rate: num(form.costRate),
            billing_rate: num(form.billingRate),
            working_hours: num(form.units),
            // null keeps the cost as rate x units; a number is the project-specific amount.
            cost_amount: form.amountOverridden ? num(form.costAmount) : null,
            allocation_percent: Math.min(100, Math.max(0, parseInt(form.allocation, 10) || 0)),
            start_date: form.startDate,
            end_date: form.endDate || null,
            status: form.status,
        };

        setIsSaving(true);
        try {
            if (drawer?.kind === 'edit') {
                await axiosInstance.patch(`/projects/${projectId}/resources/${drawer.assignment.id}/`, payload);
                toast.success('Resource updated');
            } else {
                await axiosInstance.post(`/projects/${projectId}/resources/`, payload);
                toast.success('Resource added');
            }
            closeDrawer();
            fetchAssignments();
            onChanged?.();
        } catch (error: any) {
            const data = error?.response?.data;
            const first = data && typeof data === 'object'
                ? Object.values(data).flat().find((v) => typeof v === 'string')
                : undefined;
            toast.error((first as string) || 'Failed to save resource');
        } finally {
            setIsSaving(false);
        }
    };

    const remove = async (a: ResourceAssignment) => {
        if (!window.confirm(`Remove ${a.resource_name || 'this resource'} from the project? Its history is kept.`)) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/resources/${a.id}/`);
            toast.success('Resource removed');
            setAssignments((prev) => prev.filter((x) => x.id !== a.id));
            if (drawer && drawer.kind !== 'add' && drawer.assignment.id === a.id) closeDrawer();
            onChanged?.();
        } catch {
            toast.error('Failed to remove resource');
        }
    };

    /* ---------------- render ---------------- */

    const drawerTitle = drawer?.kind === 'add' ? 'Add Resource' : drawer?.kind === 'edit' ? 'Edit Resource' : 'Resource';
    const drawerSubtitle = drawer && drawer.kind !== 'add'
        ? `${drawer.assignment.resource_name || ''} · ${drawer.assignment.resource_type_display}`
        : 'Assign an existing employee, freelancer, vendor or an external resource';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-2">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">Resources</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                        {assignments.length} {assignments.length === 1 ? 'resource' : 'resources'} · Resource cost {money(totalCost)}
                        {!isFixed && ' per period'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openAdd}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                    + Add Resource
                </button>
            </div>

            {isLoading && assignments.length === 0 ? (
                <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Loading resources...</p>
            ) : assignments.length === 0 ? (
                <p className="py-2 text-sm text-gray-500 dark:text-gray-400">No resources assigned yet. Use “+ Add Resource”.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                <th className="py-2 pr-3 text-left">Resource</th>
                                <th className="py-2 px-3 text-left">Role</th>
                                {isFixed && <th className="py-2 px-3 text-left">Milestone</th>}
                                <th className="py-2 px-3 text-right">Cost</th>
                                <th className="py-2 px-3 text-right hidden md:table-cell">Billing Rate</th>
                                <th className="py-2 px-3 text-left hidden lg:table-cell">Period</th>
                                <th className="py-2 px-3 text-left">Status</th>
                                <th className="py-2 pl-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((a) => (
                                <tr key={a.id} className="border-b border-gray-100 dark:border-gray-800/70 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                    <td className="py-2.5 pr-3">
                                        <p className="font-medium text-gray-900 dark:text-white">{a.resource_name || `#${a.resource_id}`}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{a.resource_type_display}</p>
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{a.role || '—'}</td>
                                    {isFixed && <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{a.milestone_name || 'Project'}</td>}
                                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                        <p className="font-medium tabular-nums text-gray-900 dark:text-white">{money(num(a.assigned_cost))}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                                            {a.is_cost_overridden
                                                ? <span className="text-amber-600 dark:text-amber-400">Project-specific amount</span>
                                                : `${num(a.cost_rate).toLocaleString('en-IN')} × ${num(a.working_hours).toLocaleString('en-IN')}`}
                                        </p>
                                    </td>
                                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell text-gray-700 dark:text-gray-300">
                                        {num(a.billing_rate) ? num(a.billing_rate).toLocaleString('en-IN') : '—'}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell text-gray-600 dark:text-gray-400">
                                        {fmtDate(a.start_date)}{a.end_date ? ` – ${fmtDate(a.end_date)}` : ' – ongoing'}
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[a.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                            {a.status_display}
                                        </span>
                                    </td>
                                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                                        <button type="button" onClick={() => openExisting('view', a)} className="px-2 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">View</button>
                                        <button type="button" onClick={() => openExisting('edit', a)} className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10">Edit</button>
                                        <button type="button" onClick={() => remove(a)} className="px-2 py-1 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-300 dark:border-gray-700">
                                <td colSpan={isFixed ? 3 : 2} className="py-2.5 pr-3 font-semibold text-gray-900 dark:text-white">Total Resource Cost</td>
                                <td className="py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{money(totalCost)}</td>
                                <td colSpan={4} className="hidden md:table-cell" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            <Drawer
                isOpen={!!drawer}
                onClose={closeDrawer}
                title={drawerTitle}
                subtitle={drawerSubtitle}
                size="md"
                footer={(
                    <div className="flex items-center justify-between gap-3 w-full">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Resource cost: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(effectiveAmount)}</span>
                        </p>
                        <div className="flex gap-2">
                            <button type="button" onClick={closeDrawer} disabled={isSaving} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                                {readOnly ? 'Close' : 'Cancel'}
                            </button>
                            {readOnly && drawer && drawer.kind === 'view' ? (
                                <button type="button" onClick={() => setDrawer({ kind: 'edit', assignment: drawer.assignment })} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                                    Edit
                                </button>
                            ) : (
                                <button type="button" onClick={save} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {isSaving ? 'Saving...' : drawer?.kind === 'edit' ? 'Save Changes' : 'Add Resource'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            >
                <fieldset disabled={readOnly || isSaving} className="space-y-4">
                    {/* Resource type */}
                    <div>
                        <label className={labelClass}>Resource Type</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {RESOURCE_TYPES.map((t) => {
                                const locked = drawer?.kind !== 'add';
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        disabled={locked}
                                        onClick={() => { setForm({ ...emptyForm(), resourceType: t.value }); setMasterRate(null); setErrors({}); }}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border disabled:cursor-not-allowed ${form.resourceType === t.value
                                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                            : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'}`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Resource */}
                    <div>
                        <label className={labelClass}>Resource Name</label>
                        {form.resourceType === 'external' ? (
                            <input
                                type="text"
                                value={form.externalName}
                                onChange={(e) => setForm({ ...form, externalName: e.target.value })}
                                placeholder="e.g. Contract designer (name)"
                                className={`${inputClass} ${errors.externalName ? 'border-red-400 dark:border-red-500' : ''}`}
                            />
                        ) : drawer?.kind === 'add' ? (
                            <SearchableSelect
                                options={resourceOptions}
                                value={form.resource}
                                onChange={selectResource}
                                placeholder={`Search ${RESOURCE_TYPES.find((t) => t.value === form.resourceType)?.label.toLowerCase()}...`}
                                emptyMessage="None found"
                            />
                        ) : (
                            <p className="px-3 py-2 text-sm text-gray-900 dark:text-white">{form.resource?.label}</p>
                        )}
                        {(errors.resource || errors.externalName) && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.resource || errors.externalName}</p>}
                        {form.resourceType === 'external' && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">For someone without an employee, freelancer or vendor record.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Role</label>
                            <input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Backend Developer" className={inputClass} />
                        </div>
                        {isFixed ? (
                            <div>
                                <label className={labelClass}>Milestone</label>
                                <select value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} className={inputClass}>
                                    <option value="">Whole project</option>
                                    {milestones.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div>
                                <label className={labelClass}>Allocation %</label>
                                <input type="number" min={0} max={100} value={form.allocation} onChange={(e) => setForm({ ...form, allocation: e.target.value })} className={`${inputClass} text-right`} />
                            </div>
                        )}
                    </div>

                    {/* Cost */}
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className={labelClass}>Cost Rate</label>
                                <input type="number" min={0} step="0.01" value={form.costRate} onChange={(e) => setForm({ ...form, costRate: e.target.value })} className={`${inputClass} text-right tabular-nums`} />
                            </div>
                            <div>
                                <label className={labelClass}>{unitsLabel}</label>
                                <input type="number" min={0} step="0.01" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} placeholder={isFixed ? 'hours / days' : 'e.g. 160'} className={`${inputClass} text-right tabular-nums`} />
                            </div>
                            <div>
                                <label className={labelClass}>Cost Amount ({currency})</label>
                                <input
                                    type="number" min={0} step="0.01"
                                    value={form.amountOverridden ? form.costAmount : (computedAmount ? String(computedAmount) : '')}
                                    onChange={(e) => setForm({ ...form, costAmount: e.target.value, amountOverridden: e.target.value !== '' && round2(num(e.target.value)) !== computedAmount })}
                                    placeholder="rate × units"
                                    className={`${inputClass} text-right tabular-nums ${form.amountOverridden ? 'border-amber-400 dark:border-amber-500' : ''} ${errors.costAmount ? 'border-red-400 dark:border-red-500' : ''}`}
                                />
                            </div>
                        </div>
                        {masterRate && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {masterRate.cost_rate != null
                                    ? `Default from master: ${num(masterRate.cost_rate).toLocaleString('en-IN')}${masterRate.rate_unit ? ` / ${masterRate.rate_unit}` : ''} (${masterRate.source}). Changing it here doesn't change the master rate.`
                                    : 'No cost rate on file for this resource — enter one.'}
                            </p>
                        )}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {form.amountOverridden ? (
                                <>Project-specific cost amount{!readOnly && <> · <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setForm({ ...form, amountOverridden: false, costAmount: '' })}>use rate × units ({computedAmount.toLocaleString('en-IN')})</button></>}</>
                            ) : 'Cost amount = rate × units. Type an amount to override it for this project only.'}
                        </p>
                        {errors.costAmount && <p className="text-xs text-red-600 dark:text-red-400">{errors.costAmount}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Billing Rate</label>
                            <input type="number" min={0} step="0.01" value={form.billingRate} onChange={(e) => setForm({ ...form, billingRate: e.target.value })} placeholder="optional" className={`${inputClass} text-right tabular-nums`} />
                        </div>
                        <div>
                            <label className={labelClass}>Status</label>
                            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Start Date</label>
                            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={`${inputClass} ${errors.startDate ? 'border-red-400 dark:border-red-500' : ''}`} />
                            {errors.startDate && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.startDate}</p>}
                        </div>
                        <div>
                            <label className={labelClass}>End Date</label>
                            <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={`${inputClass} ${errors.endDate ? 'border-red-400 dark:border-red-500' : ''}`} />
                            {errors.endDate && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.endDate}</p>}
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Resource cost is based on the assigned cost only (not timers or timesheets) and is included in the {isFixed ? 'milestone and project' : 'project'} Actual Cost automatically.
                    </p>
                </fieldset>
            </Drawer>
        </div>
    );
};

export default ResourcesPanel;
