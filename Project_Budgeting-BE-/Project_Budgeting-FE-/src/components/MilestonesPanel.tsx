/**
 * MilestonesPanel
 * Phases of a Fixed Budget / Milestone-Based project (Project Types and
 * Project Financial Management module). Each milestone carries its own
 * budget and billing amount; actual cost, margin, billing status and
 * payment status are all derived server-side from the same
 * Invoice/InvoicePayment/Expense records used elsewhere in the app - never
 * entered manually - so they can't drift from what was actually billed,
 * paid or spent.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface Milestone {
    id: number;
    name: string;
    description: string;
    sequence: number;
    planned_start_date: string | null;
    planned_end_date: string | null;
    completion_percent: number;
    budget_amount: string | number;
    billing_amount: string | number;
    status: string;
    status_display: string;
    actual_cost: string | number;
    margin: string | number;
    billed_amount: string | number;
    received_amount: string | number;
    outstanding_amount: string | number;
    billing_status: string;
    payment_status: string;
}

interface MilestonesPanelProps {
    projectId: string;
    currency?: string;
}

const STATUS_OPTIONS = [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'cancelled', label: 'Cancelled' },
];

const num = (v: string | number | undefined | null): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const STATUS_BADGE: Record<string, string> = {
    not_started: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    in_progress: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    on_hold: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    cancelled: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
};

const BILLING_BADGE: Record<string, { label: string; className: string }> = {
    not_billed: { label: 'Not Billed', className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
    partially_invoiced: { label: 'Partially Invoiced', className: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    invoiced: { label: 'Invoiced', className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
};

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
    not_invoiced: { label: 'Not Invoiced', className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
    draft: { label: 'Draft', className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
    sent: { label: 'Sent', className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
    partially_paid: { label: 'Partially Paid', className: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    paid: { label: 'Paid', className: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300' },
    overdue: { label: 'Overdue', className: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' },
};

const emptyForm = {
    name: '',
    description: '',
    sequence: '1',
    planned_start_date: '',
    planned_end_date: '',
    budget_amount: '',
    billing_amount: '',
    status: 'not_started',
};

export const MilestonesPanel: React.FC<MilestonesPanelProps> = ({ projectId, currency = 'INR' }) => {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState(emptyForm);

    const [invoiceModalMilestone, setInvoiceModalMilestone] = useState<Milestone | null>(null);
    const [invoiceAmount, setInvoiceAmount] = useState('');
    const [invoiceDueDays, setInvoiceDueDays] = useState('30');
    const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

    const fetchMilestones = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<Milestone[]>(`/projects/${projectId}/milestones/`);
            setMilestones(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch milestones:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchMilestones();
    }, [fetchMilestones]);

    const totals = useMemo(() => milestones.reduce(
        (acc, m) => {
            acc.budget += num(m.budget_amount);
            acc.billing += num(m.billing_amount);
            acc.actual += num(m.actual_cost);
            acc.billed += num(m.billed_amount);
            acc.received += num(m.received_amount);
            return acc;
        },
        { budget: 0, billing: 0, actual: 0, billed: 0, received: 0 }
    ), [milestones]);

    const validateForm = (values: typeof emptyForm) => {
        const errors: Record<string, string> = {};
        if (!values.name.trim()) errors.name = 'Milestone name is required.';
        if (values.budget_amount !== '' && Number(values.budget_amount) < 0) errors.budget_amount = 'Budget cannot be negative.';
        if (values.billing_amount !== '' && Number(values.billing_amount) < 0) errors.billing_amount = 'Billing amount cannot be negative.';
        return errors;
    };

    const buildPayload = (values: typeof emptyForm) => ({
        name: values.name.trim(),
        description: values.description.trim(),
        sequence: parseInt(values.sequence, 10) || 1,
        planned_start_date: values.planned_start_date || null,
        planned_end_date: values.planned_end_date || null,
        budget_amount: values.budget_amount === '' ? 0 : parseFloat(values.budget_amount),
        billing_amount: values.billing_amount === '' ? 0 : parseFloat(values.billing_amount),
        status: values.status,
    });

    const handleAdd = async () => {
        const errors = validateForm(form);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/milestones/`, buildPayload(form));
            toast.success('Milestone added');
            setForm(emptyForm);
            setFormErrors({});
            setShowAddForm(false);
            fetchMilestones();
        } catch (error: any) {
            const data = error?.response?.data;
            const msg = data?.budget_amount?.[0] || data?.name?.[0] || data?.detail || 'Failed to add milestone';
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEdit = (milestone: Milestone) => {
        setEditingId(milestone.id);
        setEditForm({
            name: milestone.name,
            description: milestone.description || '',
            sequence: String(milestone.sequence),
            planned_start_date: milestone.planned_start_date || '',
            planned_end_date: milestone.planned_end_date || '',
            budget_amount: String(num(milestone.budget_amount)),
            billing_amount: String(num(milestone.billing_amount)),
            status: milestone.status,
        });
    };

    const handleSaveEdit = async (id: number) => {
        const errors = validateForm(editForm);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            await axiosInstance.patch(`/projects/${projectId}/milestones/${id}/`, buildPayload(editForm));
            toast.success('Milestone updated');
            setEditingId(null);
            fetchMilestones();
        } catch (error: any) {
            const data = error?.response?.data;
            const msg = data?.budget_amount?.[0] || data?.name?.[0] || data?.detail || 'Failed to update milestone';
            toast.error(msg);
        }
    };

    const handleArchive = async (id: number) => {
        if (!window.confirm('Archive this milestone? It will be hidden from the list but its billing/expense history is kept.')) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/milestones/${id}/`);
            toast.success('Milestone archived');
            setMilestones((prev) => prev.filter((m) => m.id !== id));
        } catch (error) {
            toast.error('Failed to archive milestone');
        }
    };

    const openInvoiceModal = (milestone: Milestone) => {
        const remaining = num(milestone.billing_amount) - num(milestone.billed_amount);
        setInvoiceAmount(remaining > 0 ? String(remaining) : String(num(milestone.billing_amount)));
        setInvoiceDueDays('30');
        setInvoiceModalMilestone(milestone);
    };

    const handleCreateInvoice = async () => {
        if (!invoiceModalMilestone) return;
        const amount = parseFloat(invoiceAmount);
        if (!invoiceAmount || Number.isNaN(amount) || amount <= 0) {
            toast.error('Invoice amount must be greater than 0');
            return;
        }

        setIsCreatingInvoice(true);
        try {
            await axiosInstance.post(
                `/projects/${projectId}/milestones/${invoiceModalMilestone.id}/create-invoice/`,
                { amount, due_days: parseInt(invoiceDueDays, 10) || 30 }
            );
            toast.success('Invoice created (Draft)');
            setInvoiceModalMilestone(null);
            fetchMilestones();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to create invoice');
        } finally {
            setIsCreatingInvoice(false);
        }
    };

    const renderStatusBadge = (map: Record<string, { label: string; className: string }>, key: string) => {
        const entry = map[key] || { label: key, className: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' };
        return (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${entry.className}`}>
                {entry.label}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Milestones</p>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                    {showAddForm ? 'Cancel' : '+ Add Milestone'}
                </button>
            </div>

            {showAddForm && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Training"
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.name ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.name}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sequence</label>
                            <input
                                type="number"
                                value={form.sequence}
                                onChange={(e) => setForm({ ...form, sequence: e.target.value })}
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
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Planned Start</label>
                            <input
                                type="date"
                                value={form.planned_start_date}
                                onChange={(e) => setForm({ ...form, planned_start_date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Planned End</label>
                            <input
                                type="date"
                                value={form.planned_end_date}
                                onChange={(e) => setForm({ ...form, planned_end_date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Budget Amount</label>
                            <input
                                type="number"
                                value={form.budget_amount}
                                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.budget_amount ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.budget_amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.budget_amount}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Billing Amount</label>
                            <input
                                type="number"
                                value={form.billing_amount}
                                onChange={(e) => setForm({ ...form, billing_amount: e.target.value })}
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.billing_amount ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.billing_amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.billing_amount}</p>}
                        </div>
                        <div className="md:col-span-4">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={2}
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
                            {isSubmitting ? 'Adding...' : 'Add Milestone'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
                {isLoading ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading milestones...</p>
                ) : milestones.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No milestones yet. Add one above.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th className="px-4 py-2">#</th>
                                <th className="px-4 py-2">Milestone</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2 text-right">Budget</th>
                                <th className="px-4 py-2 text-right">Actual Cost</th>
                                <th className="px-4 py-2 text-right">Billing Amount</th>
                                <th className="px-4 py-2 text-right">Margin</th>
                                <th className="px-4 py-2">Billing</th>
                                <th className="px-4 py-2">Payment</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {milestones.map((m) => {
                                const isEditing = editingId === m.id;
                                const margin = num(m.margin);
                                const overBudget = num(m.actual_cost) > num(m.budget_amount) && num(m.budget_amount) > 0;
                                return (
                                    <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{m.sequence}</td>
                                        <td className="px-4 py-2">
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editForm.name}
                                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
                                                />
                                            ) : (
                                                <>
                                                    <p className="text-gray-900 dark:text-white font-medium">{m.name}</p>
                                                    {m.description && <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {isEditing ? (
                                                <select
                                                    value={editForm.status}
                                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                                    className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
                                                >
                                                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                                </select>
                                            ) : (
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[m.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                                    {m.status_display}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editForm.budget_amount}
                                                    onChange={(e) => setEditForm({ ...editForm, budget_amount: e.target.value })}
                                                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm text-right"
                                                />
                                            ) : (
                                                <span>{num(m.budget_amount).toLocaleString()} {currency}</span>
                                            )}
                                        </td>
                                        <td className={`px-4 py-2 text-right ${overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                            {num(m.actual_cost).toLocaleString()} {currency}
                                            {overBudget && <span className="ml-1 text-[10px] uppercase">Over</span>}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editForm.billing_amount}
                                                    onChange={(e) => setEditForm({ ...editForm, billing_amount: e.target.value })}
                                                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm text-right"
                                                />
                                            ) : (
                                                <span>{num(m.billing_amount).toLocaleString()} {currency}</span>
                                            )}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-medium ${margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                            {margin.toLocaleString()} {currency}
                                        </td>
                                        <td className="px-4 py-2">{renderStatusBadge(BILLING_BADGE, m.billing_status)}</td>
                                        <td className="px-4 py-2">{renderStatusBadge(PAYMENT_BADGE, m.payment_status)}</td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">
                                            {isEditing ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(m.id)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mr-2">Save</button>
                                                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => openInvoiceModal(m)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mr-2">Bill</button>
                                                    <button onClick={() => startEdit(m)} className="text-xs text-gray-600 dark:text-gray-400 hover:underline mr-2">Edit</button>
                                                    <button onClick={() => handleArchive(m.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Archive</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                <td className="px-4 py-2" colSpan={3}>Total</td>
                                <td className="px-4 py-2 text-right">{totals.budget.toLocaleString()} {currency}</td>
                                <td className="px-4 py-2 text-right">{totals.actual.toLocaleString()} {currency}</td>
                                <td className="px-4 py-2 text-right">{totals.billing.toLocaleString()} {currency}</td>
                                <td className={`px-4 py-2 text-right ${(totals.billing - totals.actual) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                    {(totals.billing - totals.actual).toLocaleString()} {currency}
                                </td>
                                <td colSpan={3} />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {invoiceModalMilestone && (
                <div
                    className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setInvoiceModalMilestone(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Create Invoice</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{invoiceModalMilestone.name}</p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Invoice Amount</label>
                                <input
                                    type="number"
                                    value={invoiceAmount}
                                    onChange={(e) => setInvoiceAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due in (days)</label>
                                <input
                                    type="number"
                                    value={invoiceDueDays}
                                    onChange={(e) => setInvoiceDueDays(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setInvoiceModalMilestone(null)}
                                disabled={isCreatingInvoice}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateInvoice}
                                disabled={isCreatingInvoice}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isCreatingInvoice ? 'Creating...' : 'Create Invoice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MilestonesPanel;
