/**
 * Add / Edit / View one project resource assignment (Resources tab). People are picked from the
 * existing masters (/projects/poc-options/: AIRA HRMS employees, freelancers, vendors) - nothing is
 * created or changed in a master. The cost rate is pre-filled from the master (/projects/resource-rate/)
 * but saved on the assignment, so a project-specific rate or amount never changes the master.
 */
import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { formatDate as toDMY } from '../utils/date';
import { Drawer } from './Drawer';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import {
    HOURS_PER_DAY, RESOURCE_TYPES, STATUS_BADGE, TYPE_BADGE, errorText, money, num, periodDays, round2, todayIso,
} from '../utils/resources';
import type { PocOption, ResourceRow, ResourceType } from '../utils/resources';

export type ResourceDrawerMode = { kind: 'add' } | { kind: 'edit' | 'view'; row: ResourceRow };

interface MasterRate {
    cost_rate: string | number | null;
    rate_unit: string | null;
    source: string | null;
}

interface Props {
    mode: ResourceDrawerMode | null;
    projectId: string;
    currency: string;
    isFixed: boolean;
    milestones: { id: number; name: string }[];
    pocOptions: PocOption[];
    onClose: () => void;
    onSaved: () => void;
    onEdit: (row: ResourceRow) => void;
    onRemove: (row: ResourceRow) => void;
}

const STATUS_CHOICES = [
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'removed', label: 'Removed' },
];

const inputClass = 'h-10 w-full px-3 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800/60';
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';
const errorBorder = 'border-red-400 dark:border-red-500';
const Req = () => <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;
const FieldError = ({ text }: { text?: string }) => (text ? <p className="text-xs text-red-600 dark:text-red-400 mt-1">{text}</p> : null);

const initialForm = (mode: ResourceDrawerMode | null, isFixed: boolean, milestones: { id: number }[]) => {
    if (mode && mode.kind !== 'add') {
        const a = mode.row;
        const rateXUnits = round2(num(a.cost_rate) * num(a.working_hours));
        return {
            resourceType: a.resource_type,
            resource: a.resource_id ? { id: a.resource_id, label: a.resource_name || `#${a.resource_id}` } as SearchableSelectOption : null,
            externalName: a.external_name || '',
            milestone: a.milestone ? String(a.milestone) : '',
            costRate: String(num(a.cost_rate)),
            units: String(num(a.working_hours)),
            departmentFilter: '',
            designationFilter: '',
            costAmount: String(num(a.total_cost)),
            amountOverridden: a.is_cost_overridden && round2(num(a.cost_amount)) !== rateXUnits,
            allocation: String(a.allocation_percent ?? 100),
            startDate: a.start_date || todayIso(),
            endDate: a.end_date || '',
            status: a.status,
        };
    }
    return {
        resourceType: 'employee' as ResourceType,
        resource: null as SearchableSelectOption | null,
        externalName: '',
        // A Fixed Budget resource always belongs to a milestone - preselected when there's only one.
        milestone: isFixed && milestones.length === 1 ? String(milestones[0].id) : '',
        costRate: '',
        units: '',
        departmentFilter: '',
        designationFilter: '',
        costAmount: '',
        amountOverridden: false,
        allocation: '100',
        startDate: todayIso(),
        endDate: '',
        status: 'active',
    };
};

const uniqueSorted = (values: (string | undefined)[]) =>
    Array.from(new Set(values.map((v) => (v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const rateText = (rate: string | number | null | undefined, unit: string | null | undefined, currency: string) =>
    rate == null || rate === '' ? '' : `${money(rate, currency)}${unit === 'daily' ? '/day' : '/h'}`;

const optionSublabel = (p: PocOption, currency: string) => {
    if (p.type === 'employee') return [p.code, p.designation, p.department].filter(Boolean).join(' · ') || p.subtitle || undefined;
    if (p.type === 'freelancer') {
        return [p.code, p.skills || p.subtitle, rateText(p.default_cost_rate, p.rate_unit, currency) && `default ${rateText(p.default_cost_rate, p.rate_unit, currency)}`]
            .filter(Boolean).join(' · ') || undefined;
    }
    return [p.code, p.subtitle].filter(Boolean).join(' · ') || undefined;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/** Who the resource is - from the master record (never edited here). */
const ProfileCard: React.FC<{
    name: string; type: ResourceType; code?: string | null; designation?: string; department?: string;
    detail?: string; active?: boolean | null; rate?: string;
}> = ({ name, type, code, designation, department, detail, active, rate }) => (
    <div className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${TYPE_BADGE[type]}`}>
            {initials(name)}
        </div>
        <div className="min-w-0 flex-1 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">{name || '—'}</p>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[type]}`}>
                    {RESOURCE_TYPES.find((t) => t.value === type)?.label}
                </span>
                {active === false && (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        {type === 'employee' ? 'Not active in AIRA HRMS' : 'Inactive'}
                    </span>
                )}
                {active === true && type === 'employee' && (
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">Active in AIRA HRMS</span>
                )}
            </div>
            <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                {[code && `${type === 'employee' ? 'Employee ID' : type === 'freelancer' ? 'Freelancer code' : 'Vendor ref.'} ${code}`, designation, department]
                    .filter(Boolean).join(' · ') || (type === 'external' ? 'No master record - named on this assignment' : '')}
            </p>
            {detail && <p className="mt-0.5 text-gray-500 dark:text-gray-400">Skills: {detail}</p>}
            {rate && <p className="mt-0.5 text-gray-500 dark:text-gray-400">Default cost rate: {rate}</p>}
        </div>
    </div>
);

/** A titled block of the add / edit form; blocks after the first get a divider. */
const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="space-y-4 border-t border-gray-100 pt-5 first-of-type:border-t-0 first-of-type:pt-0 dark:border-gray-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
        {children}
    </section>
);

const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-[13px] last:border-b-0 dark:border-gray-800">
        <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="text-right font-medium text-gray-900 dark:text-white">{children}</dd>
    </div>
);

export const ResourceFormDrawer: React.FC<Props> = ({
    mode, projectId, currency, isFixed, milestones, pocOptions, onClose, onSaved, onEdit, onRemove,
}) => {
    const [form, setForm] = useState(() => initialForm(mode, isFixed, milestones));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const [masterRate, setMasterRate] = useState<MasterRate | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const kind = mode?.kind;
    const isEmployee = form.resourceType === 'employee';
    const unitsLabel = isFixed ? 'Planned Hours' : 'Hours / Period';

    const employeeRows = useMemo(() => pocOptions.filter((p) => p.type === 'employee' && p.active !== false), [pocOptions]);
    const departmentOptions = useMemo(() => uniqueSorted(employeeRows.map((p) => p.department)), [employeeRows]);
    const designationOptions = useMemo(
        () => uniqueSorted(employeeRows.filter((p) => !form.departmentFilter || p.department === form.departmentFilter).map((p) => p.designation)),
        [employeeRows, form.departmentFilter],
    );
    const resourceOptions: SearchableSelectOption[] = useMemo(
        () => pocOptions
            .filter((p) => p.type === form.resourceType && p.active !== false)
            .filter((p) => !isEmployee || (
                (!form.departmentFilter || p.department === form.departmentFilter)
                && (!form.designationFilter || p.designation === form.designationFilter)))
            .map((p) => ({ id: p.id, label: p.name, sublabel: optionSublabel(p, currency) })),
        [pocOptions, form.resourceType, form.departmentFilter, form.designationFilter, isEmployee, currency],
    );
    const picked = form.resource ? pocOptions.find((p) => p.type === form.resourceType && p.id === form.resource!.id) : undefined;

    const plannedHours = num(form.units);
    const computedAmount = round2(num(form.costRate) * plannedHours);
    const effectiveAmount = form.amountOverridden ? num(form.costAmount) : computedAmount;

    const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

    const changeType = (resourceType: ResourceType) => {
        setForm({ ...initialForm({ kind: 'add' }, isFixed, milestones), milestone: form.milestone, resourceType });
        setMasterRate(null);
        setErrors({});
    };

    const changeDepartment = (value: string) => setForm((f) => {
        const keepDesignation = !f.designationFilter
            || employeeRows.some((p) => (!value || p.department === value) && p.designation === f.designationFilter);
        const current = employeeRows.find((p) => p.id === f.resource?.id);
        return {
            ...f,
            departmentFilter: value,
            designationFilter: keepDesignation ? f.designationFilter : '',
            resource: current && value && current.department !== value ? null : f.resource,
        };
    });

    const changeDesignation = (value: string) => setForm((f) => {
        const current = employeeRows.find((p) => p.id === f.resource?.id);
        return { ...f, designationFilter: value, resource: current && value && current.designation !== value ? null : f.resource };
    });

    const selectResource = (opt: SearchableSelectOption | null) => {
        set({ resource: opt });
        setMasterRate(null);
        if (!opt) return;
        axiosInstance.get<MasterRate>('/projects/resource-rate/', { params: { resource_type: form.resourceType, resource_id: opt.id } })
            .then((res) => {
                setMasterRate(res.data);
                const daily = res.data.rate_unit === 'daily';
                if (res.data.cost_rate != null) {
                    const rate = String(round2(daily ? num(res.data.cost_rate) / HOURS_PER_DAY : num(res.data.cost_rate)));
                    setForm((f) => ({ ...f, costRate: rate }));
                }
            })
            .catch((error) => console.error('Failed to load master rate:', error));
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (form.resourceType === 'external') {
            if (!form.externalName.trim()) e.externalName = 'Enter the external resource name.';
        } else if (!form.resource) {
            e.resource = 'Select a resource.';
        }
        if (isFixed && !form.milestone) {
            e.milestone = milestones.length ? 'Select the milestone this resource works on.' : 'Add a milestone in the Milestones tab first.';
        }
        if (num(form.costRate) < 0) e.costRate = 'Cost rate cannot be negative.';
        if (form.amountOverridden) {
            if (num(form.costAmount) <= 0) e.costAmount = 'Enter a cost amount.';
        } else {
            if (!(num(form.costRate) > 0)) e.costRate = 'Cost rate is required.';
            if (!(num(form.units) > 0)) e.units = `${unitsLabel} are required.`;
        }
        if (!form.startDate) e.startDate = 'Start date is required.';
        if (!form.endDate) e.endDate = 'End date is required.';
        else if (form.startDate && form.endDate < form.startDate) e.endDate = 'End date cannot be before start date.';
        return e;
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        setFormError('');
        if (Object.keys(e).length > 0) return;
        const payload = {
            resource_type: form.resourceType,
            resource_id: form.resourceType === 'external' ? null : form.resource!.id,
            external_name: form.resourceType === 'external' ? form.externalName.trim() : '',
            milestone: isFixed && form.milestone ? Number(form.milestone) : null,
            cost_rate: num(form.costRate),
            working_hours: round2(plannedHours),
            // null keeps the cost as rate x units; a number is the project-specific amount.
            cost_amount: form.amountOverridden ? num(form.costAmount) : null,
            allocation_percent: Math.min(100, Math.max(0, parseInt(form.allocation, 10) || 0)),
            start_date: form.startDate,
            end_date: form.endDate || null,
            status: form.status,
        };
        setIsSaving(true);
        try {
            if (mode?.kind === 'edit') {
                await axiosInstance.patch(`/projects/${projectId}/resources/${mode.row.id}/`, payload);
                toast.success('Assignment updated');
            } else {
                await axiosInstance.post(`/projects/${projectId}/resources/`, payload);
                toast.success('Resource added');
            }
            onSaved();
        } catch (error) {
            const message = await errorText(error, 'Failed to save the assignment');
            setFormError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const title = kind === 'add' ? 'Add Resource' : kind === 'edit' ? 'Edit Assignment' : 'Resource Assignment';
    const subtitle = mode && mode.kind !== 'add'
        ? `${mode.row.resource_name} · ${mode.row.resource_type_display}`
        : 'Assign an existing employee, freelancer or vendor, or name an external resource';

    /* ---------------- view ---------------- */
    if (mode?.kind === 'view') {
        const a = mode.row;
        const days = periodDays(a.start_date, a.end_date);
        return (
            <Drawer
                isOpen
                onClose={onClose}
                title={title}
                subtitle={subtitle}
                size="md"
                footer={(
                    <div className="flex w-full items-center justify-between gap-2">
                        <button type="button" onClick={() => onRemove(a)} disabled={a.status === 'removed'}
                            className="h-10 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
                            Remove
                        </button>
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
                            <button type="button" onClick={() => onEdit(a)} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Edit Assignment</button>
                        </div>
                    </div>
                )}
            >
                <div className="space-y-5">
                    <section aria-label="Resource profile">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resource profile</h3>
                        <ProfileCard name={a.resource_name} type={a.resource_type} code={a.resource_code} designation={a.designation}
                            department={a.department} detail={a.resource_detail} active={a.resource_active} />
                        <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {a.resource_type === 'employee' ? 'From AIRA HRMS - read only here.' : a.resource_type === 'external' ? '' : 'From the master record - read only here.'}
                        </p>
                    </section>
                    <section aria-label="Assignment details">
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">This project's assignment</h3>
                        <dl>
                            {isFixed && <Detail label="Milestone">{a.milestone_name || <span className="text-amber-600 dark:text-amber-400">Not linked</span>}</Detail>}
                            <Detail label="Assignment period">
                                {toDMY(a.start_date, '—')} – {a.end_date ? toDMY(a.end_date, '—') : 'ongoing'}{days ? ` (${days} days)` : ''}
                            </Detail>
                            <Detail label="Cost rate">{money(a.cost_rate, currency)}/h</Detail>
                            <Detail label={unitsLabel}>{num(a.working_hours).toLocaleString('en-IN')} h</Detail>
                            <Detail label="Cost basis">{a.is_cost_overridden ? 'Project-specific amount' : 'Rate × hours'}</Detail>
                            <Detail label="Total resource cost">
                                {a.counts_in_cost ? money(a.total_cost, currency) : <span className="text-gray-500">{money(a.total_cost, currency)} (removed - not costed)</span>}
                            </Detail>
                            {!isFixed && <Detail label="Allocation">{a.allocation_percent}%</Detail>}
                            <Detail label="Status">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_BADGE[a.status] || STATUS_BADGE.removed}`}>{a.status_display}</span>
                            </Detail>
                            <Detail label="Added">{toDMY(a.created_at, '—')}{a.created_by_name ? ` by ${a.created_by_name}` : ''}</Detail>
                            <Detail label="Last updated">{toDMY(a.updated_at, '—')}{a.updated_by_name ? ` by ${a.updated_by_name}` : ''}</Detail>
                        </dl>
                    </section>
                </div>
            </Drawer>
        );
    }

    /* ---------------- add / edit ---------------- */
    return (
        <Drawer
            isOpen={!!mode}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            size="lg"
            footer={(
                <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Resource cost: <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{money(effectiveAmount, currency)}</span>
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} disabled={isSaving} className="h-10 whitespace-nowrap rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
                        <button type="button" onClick={save} disabled={isSaving} className="h-10 whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                            {isSaving ? 'Saving...' : kind === 'edit' ? 'Save Changes' : 'Add Resource'}
                        </button>
                    </div>
                </div>
            )}
        >
            {/* min-w-0: a fieldset otherwise grows to its widest child and scrolls sideways. */}
            <fieldset disabled={isSaving} className="min-w-0 space-y-5">
                {formError && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{formError}</div>
                )}

                <FormSection title="Resource">
                <div>
                    <span className={labelClass}>Resource Type<Req /></span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Resource type">
                        {RESOURCE_TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                role="radio"
                                aria-checked={form.resourceType === t.value}
                                disabled={kind !== 'add'}
                                onClick={() => changeType(t.value)}
                                className={`h-9 rounded-lg border px-3 text-sm font-medium disabled:cursor-not-allowed ${form.resourceType === t.value
                                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {form.resourceType === 'vendor' && kind === 'add' && (
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Approved vendors from the Vendor module.</p>
                    )}
                </div>

                {isEmployee && kind === 'add' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="res-dept" className={labelClass}>Department</label>
                            <select id="res-dept" value={form.departmentFilter} onChange={(e) => changeDepartment(e.target.value)} className={inputClass} disabled={departmentOptions.length === 0}>
                                <option value="">All departments</option>
                                {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="res-desig" className={labelClass}>Designation</label>
                            <select id="res-desig" value={form.designationFilter} onChange={(e) => changeDesignation(e.target.value)} className={inputClass} disabled={designationOptions.length === 0}>
                                <option value="">All designations</option>
                                {designationOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                <div>
                    <span className={labelClass}>
                        {form.resourceType === 'external' ? 'External Resource Name' : 'Resource'}<Req />
                        {isEmployee && kind === 'add' && <span className="ml-1 font-normal">(active AIRA HRMS employees{form.departmentFilter || form.designationFilter ? `, ${resourceOptions.length} matching` : ''})</span>}
                    </span>
                    {form.resourceType === 'external' ? (
                        <input type="text" value={form.externalName} onChange={(e) => set({ externalName: e.target.value })}
                            placeholder="e.g. Contract designer (name)" aria-label="External resource name"
                            className={`${inputClass} ${errors.externalName ? errorBorder : ''}`} />
                    ) : kind === 'add' ? (
                        <SearchableSelect
                            options={resourceOptions}
                            value={form.resource}
                            onChange={selectResource}
                            placeholder={`Search by name or ID...`}
                            emptyMessage={isEmployee && (form.departmentFilter || form.designationFilter) ? 'No employees match these filters' : 'None found'}
                        />
                    ) : null}
                    <FieldError text={errors.resource || errors.externalName} />
                </div>

                {kind === 'edit' && mode?.kind === 'edit' && (
                    <ProfileCard name={mode.row.resource_name} type={mode.row.resource_type} code={mode.row.resource_code}
                        designation={mode.row.designation} department={mode.row.department} detail={mode.row.resource_detail} active={mode.row.resource_active} />
                )}
                {kind === 'add' && picked && (
                    <ProfileCard name={picked.name} type={picked.type} code={picked.code} designation={picked.designation || picked.subtitle}
                        department={picked.department} detail={picked.type === 'freelancer' ? picked.skills : undefined}
                        active={picked.type === 'employee' ? picked.active ?? null : null}
                        rate={rateText(picked.default_cost_rate, picked.rate_unit, currency) || undefined} />
                )}
                </FormSection>

                <FormSection title="Assignment">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {isFixed ? (
                        <div>
                            <label htmlFor="res-milestone" className={labelClass}>Milestone<Req /></label>
                            <select id="res-milestone" value={form.milestone} onChange={(e) => set({ milestone: e.target.value })}
                                className={`${inputClass} ${errors.milestone ? errorBorder : ''}`}>
                                <option value="" disabled>Select milestone</option>
                                {milestones.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                            </select>
                            <FieldError text={errors.milestone} />
                        </div>
                    ) : (
                        <div>
                            <label htmlFor="res-allocation" className={labelClass}>Allocation %</label>
                            <input id="res-allocation" type="number" min={0} max={100} value={form.allocation} onChange={(e) => set({ allocation: e.target.value })} className={`${inputClass} text-right`} />
                        </div>
                    )}
                    <div>
                        <label htmlFor="res-status" className={labelClass}>Status</label>
                        <select id="res-status" value={form.status} onChange={(e) => set({ status: e.target.value })} className={inputClass}>
                            {STATUS_CHOICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="res-start" className={labelClass}>Assignment Start Date<Req /></label>
                        <input id="res-start" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={`${inputClass} ${errors.startDate ? errorBorder : ''}`} />
                        <FieldError text={errors.startDate} />
                    </div>
                    <div>
                        <label htmlFor="res-end" className={labelClass}>Assignment End Date<Req /></label>
                        <input id="res-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} className={`${inputClass} ${errors.endDate ? errorBorder : ''}`} />
                        <FieldError text={errors.endDate} />
                    </div>
                </div>
                </FormSection>

                <FormSection title="Cost">
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                            <label htmlFor="res-rate" className={labelClass}>Cost Rate / hour<Req /></label>
                            <input id="res-rate" type="number" min={0} step="0.01" value={form.costRate} onChange={(e) => set({ costRate: e.target.value })} placeholder="0.00"
                                className={`${inputClass} text-right tabular-nums ${errors.costRate ? errorBorder : ''}`} />
                            <FieldError text={errors.costRate} />
                        </div>
                        <div>
                            <label htmlFor="res-units" className={labelClass}>{unitsLabel}<Req /></label>
                            <input id="res-units" type="number" min={0} step="0.01" value={form.units} onChange={(e) => set({ units: e.target.value })} placeholder="hours"
                                className={`${inputClass} text-right tabular-nums ${errors.units ? errorBorder : ''}`} />
                            <FieldError text={errors.units} />
                        </div>
                        <div>
                            <label htmlFor="res-amount" className={labelClass}>Cost Amount ({currency})</label>
                            <input
                                id="res-amount"
                                type="number" min={0} step="0.01"
                                value={form.amountOverridden ? form.costAmount : (computedAmount ? String(computedAmount) : '')}
                                onChange={(e) => set({ costAmount: e.target.value, amountOverridden: e.target.value !== '' && round2(num(e.target.value)) !== computedAmount })}
                                placeholder="rate × hours"
                                className={`${inputClass} text-right tabular-nums ${form.amountOverridden ? 'border-amber-400 dark:border-amber-500' : ''} ${errors.costAmount ? errorBorder : ''}`}
                            />
                        </div>
                    </div>
                    {masterRate && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {masterRate.cost_rate != null
                                ? `Default from master: ${num(masterRate.cost_rate).toLocaleString('en-IN')}${masterRate.rate_unit ? ` / ${masterRate.rate_unit}` : ''} (${masterRate.source})${masterRate.rate_unit === 'daily' ? ` = ${round2(num(masterRate.cost_rate) / HOURS_PER_DAY).toLocaleString('en-IN')} / hour` : ''}. Changing it here doesn't change the master rate.`
                                : 'No cost rate on file for this resource — enter one.'}
                        </p>
                    )}
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {form.amountOverridden ? (
                            <>Project-specific cost amount · <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => set({ amountOverridden: false, costAmount: '' })}>use rate × hours ({computedAmount.toLocaleString('en-IN')})</button></>
                        ) : 'Cost amount = rate × hours. Type an amount to override it for this project only.'}
                    </p>
                    <FieldError text={errors.costAmount} />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        The resource cost is the assigned cost only (never timers or timesheets) and counts in the {isFixed ? 'milestone and project' : 'project'} Actual Cost automatically.
                    </p>
                </div>
                </FormSection>
            </fieldset>
        </Drawer>
    );
};
