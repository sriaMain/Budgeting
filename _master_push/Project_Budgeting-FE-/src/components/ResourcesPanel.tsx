/**
 * ResourcesPanel
 * Resources (employees/freelancers) staffed on a Time & Material project
 * (Project Types and Project Financial Management module). Monthly Cost /
 * Monthly Billing are derived server-side (cost_rate/billing_rate x
 * working_hours) - never entered manually - so they can't drift from the
 * underlying rates.
 *
 * Reuses the same employee/freelancer picker pattern (poc-options + a
 * Resource Type segmented control) already used for a project's POC in
 * CreateProjectModal, instead of introducing a new lookup.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';

type ResourceType = 'employee' | 'freelancer';

interface PocOption {
    id: number;
    type: 'employee' | 'vendor' | 'freelancer';
    name: string;
    subtitle: string;
}

interface ResourceAssignment {
    id: number;
    resource_type: ResourceType;
    resource_type_display: string;
    resource_id: number;
    resource_name: string | null;
    role: string;
    start_date: string;
    end_date: string | null;
    cost_rate: string | number;
    billing_rate: string | number;
    allocation_percent: number;
    working_hours: string | number;
    status: string;
    status_display: string;
    monthly_cost: string | number;
    monthly_billing: string | number;
}

interface ResourcesPanelProps {
    projectId: string;
    currency?: string;
}

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'freelancer', label: 'Freelancer' },
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

const emptyForm = {
    resourceType: 'employee' as ResourceType,
    resource: null as SearchableSelectOption | null,
    role: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    cost_rate: '',
    billing_rate: '',
    allocation_percent: '100',
    working_hours: '',
    status: 'active',
};

export const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ projectId, currency = 'INR' }) => {
    const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pocOptionsRaw, setPocOptionsRaw] = useState<PocOption[]>([]);

    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAssignments = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<ResourceAssignment[]>(`/projects/${projectId}/resources/`);
            setAssignments(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch resource assignments:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    const fetchPocOptions = useCallback(async () => {
        try {
            const res = await axiosInstance.get<PocOption[]>('/projects/poc-options/');
            setPocOptionsRaw(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch employee/freelancer options:', error);
        }
    }, []);

    useEffect(() => {
        fetchAssignments();
        fetchPocOptions();
    }, [fetchAssignments, fetchPocOptions]);

    const resourceOptions: SearchableSelectOption[] = useMemo(
        () => pocOptionsRaw
            .filter((p) => p.type === form.resourceType)
            .map((p) => ({ id: p.id, label: p.name, sublabel: p.subtitle || undefined })),
        [pocOptionsRaw, form.resourceType]
    );

    const totals = useMemo(() => assignments.reduce(
        (acc, a) => {
            acc.cost += num(a.monthly_cost);
            acc.billing += num(a.monthly_billing);
            return acc;
        },
        { cost: 0, billing: 0 }
    ), [assignments]);

    const validate = (values: typeof emptyForm) => {
        const errors: Record<string, string> = {};
        if (!values.resource) errors.resource = 'Select an employee or freelancer.';
        if (!values.start_date) errors.start_date = 'Start date is required.';
        if (values.cost_rate === '' || Number(values.cost_rate) < 0) errors.cost_rate = 'Enter a valid cost rate.';
        if (values.billing_rate === '' || Number(values.billing_rate) < 0) errors.billing_rate = 'Enter a valid billing rate.';
        if (values.end_date && values.start_date && values.end_date < values.start_date) {
            errors.end_date = 'End date cannot be before start date.';
        }
        return errors;
    };

    const handleAdd = async () => {
        const errors = validate(form);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/resources/`, {
                resource_type: form.resourceType,
                resource_id: form.resource!.id,
                role: form.role.trim(),
                start_date: form.start_date,
                end_date: form.end_date || null,
                cost_rate: parseFloat(form.cost_rate),
                billing_rate: parseFloat(form.billing_rate),
                allocation_percent: parseInt(form.allocation_percent, 10) || 0,
                working_hours: form.working_hours === '' ? 0 : parseFloat(form.working_hours),
                status: form.status,
            });
            toast.success('Resource assigned');
            setForm(emptyForm);
            setFormErrors({});
            setShowAddForm(false);
            fetchAssignments();
        } catch (error: any) {
            const data = error?.response?.data;
            const msg = data?.resource_id?.[0] || data?.cost_rate?.[0] || data?.billing_rate?.[0] || data?.detail || 'Failed to assign resource';
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStatusChange = async (assignment: ResourceAssignment, status: string) => {
        try {
            await axiosInstance.patch(`/projects/${projectId}/resources/${assignment.id}/`, { status });
            toast.success('Status updated');
            fetchAssignments();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleArchive = async (id: number) => {
        if (!window.confirm('Remove this resource assignment? Its cost/billing history is kept.')) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/resources/${id}/`);
            toast.success('Resource assignment removed');
            setAssignments((prev) => prev.filter((a) => a.id !== id));
        } catch (error) {
            toast.error('Failed to remove resource assignment');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Resources</p>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                    {showAddForm ? 'Cancel' : '+ Assign Resource'}
                </button>
            </div>

            {showAddForm && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                    <div className="flex gap-2">
                        {RESOURCE_TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setForm({ ...form, resourceType: t.value, resource: null })}
                                className={`px-4 py-1.5 text-sm font-medium rounded-lg border ${form.resourceType === t.value
                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                    : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                {form.resourceType === 'employee' ? 'Employee' : 'Freelancer'}
                            </label>
                            <SearchableSelect
                                options={resourceOptions}
                                value={form.resource}
                                onChange={(opt) => setForm({ ...form, resource: opt })}
                                placeholder={`Search ${form.resourceType}...`}
                                emptyMessage={`No ${form.resourceType}s found`}
                            />
                            {formErrors.resource && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.resource}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Role</label>
                            <input
                                type="text"
                                value={form.role}
                                onChange={(e) => setForm({ ...form, role: e.target.value })}
                                placeholder="e.g. Backend Developer"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            >
                                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={form.start_date}
                                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                            {formErrors.start_date && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.start_date}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End Date</label>
                            <input
                                type="date"
                                value={form.end_date}
                                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                            {formErrors.end_date && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.end_date}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Allocation %</label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={form.allocation_percent}
                                onChange={(e) => setForm({ ...form, allocation_percent: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cost Rate (hourly)</label>
                            <input
                                type="number"
                                value={form.cost_rate}
                                onChange={(e) => setForm({ ...form, cost_rate: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.cost_rate ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.cost_rate && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.cost_rate}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Billing Rate (hourly)</label>
                            <input
                                type="number"
                                value={form.billing_rate}
                                onChange={(e) => setForm({ ...form, billing_rate: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.billing_rate ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.billing_rate && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.billing_rate}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Working Hours (period)</label>
                            <input
                                type="number"
                                value={form.working_hours}
                                onChange={(e) => setForm({ ...form, working_hours: e.target.value })}
                                placeholder="e.g. 160"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Assigning...' : 'Assign Resource'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
                {isLoading ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading resources...</p>
                ) : assignments.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No resources assigned yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th className="px-4 py-2">Resource</th>
                                <th className="px-4 py-2">Role</th>
                                <th className="px-4 py-2">Period</th>
                                <th className="px-4 py-2 text-right">Cost Rate</th>
                                <th className="px-4 py-2 text-right">Billing Rate</th>
                                <th className="px-4 py-2 text-right">Hours</th>
                                <th className="px-4 py-2 text-right">Monthly Cost</th>
                                <th className="px-4 py-2 text-right">Monthly Billing</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((a) => (
                                <tr key={a.id} className="border-b border-gray-100 dark:border-gray-800">
                                    <td className="px-4 py-2">
                                        <p className="text-gray-900 dark:text-white font-medium">{a.resource_name || `#${a.resource_id}`}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{a.resource_type_display}</p>
                                    </td>
                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{a.role || '—'}</td>
                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                        {a.start_date} {a.end_date ? `- ${a.end_date}` : '- ongoing'}
                                    </td>
                                    <td className="px-4 py-2 text-right">{num(a.cost_rate).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-2 text-right">{num(a.billing_rate).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-2 text-right">{num(a.working_hours)}</td>
                                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">{num(a.monthly_cost).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-2 text-right text-gray-900 dark:text-white">{num(a.monthly_billing).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-2">
                                        <select
                                            value={a.status}
                                            onChange={(e) => handleStatusChange(a, e.target.value)}
                                            className={`px-2 py-1 rounded text-xs font-medium border-0 ${STATUS_BADGE[a.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                                        >
                                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <button onClick={() => handleArchive(a.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                <td className="px-4 py-2" colSpan={6}>Total (active + all listed)</td>
                                <td className="px-4 py-2 text-right">{totals.cost.toLocaleString()} {currency}</td>
                                <td className="px-4 py-2 text-right">{totals.billing.toLocaleString()} {currency}</td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ResourcesPanel;
