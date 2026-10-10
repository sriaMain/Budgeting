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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    /** Expenses linked to the milestone (employee_cost excluded - see labour_cost). */
    expense_cost?: string | number;
    /** Task timer hours x assignee hourly cost rate. */
    labour_cost?: string | number;
    margin: string | number;
    /** This milestone's share of the quotation (= billing_amount). */
    quotation_amount?: string | number;
    budget_utilization_percent?: string | number;
    billing_percent?: string | number;
    remaining_budget?: string | number;
    remaining_billable_amount?: string | number;
    /** budget_amount as a % of the project's user budget. */
    budget_percent?: string | number;
    /** billing_amount (bill amount) as a % of the project's quotation. */
    bill_percent?: string | number;
    project_budget_base?: string | number;
    quotation_base?: string | number;
    billed_amount: string | number;
    /** Pre-tax billed amount (billing_amount is pre-tax too). */
    billed_base_amount?: string | number;
    /** Tax % the invoice gets, from the project's quotation. */
    tax_percentage?: string | number;
    received_amount: string | number;
    outstanding_amount: string | number;
    billing_status: string;
    payment_status: string;
}

interface MilestonesPanelProps {
    projectId: string;
    currency?: string;
    /** Project user budget (cost_budget) - Budget % is taken of this. */
    userBudget?: number;
    /** Project quotation amount before tax - Bill % is taken of this. */
    quotationAmount?: number;
    /** Called after a milestone is added/edited/archived/billed, so the page can refresh its own figures. */
    onChanged?: () => void;
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
    budget_percent: '',
    bill_percent: '',
    status: 'not_started',
};

export const MilestonesPanel: React.FC<MilestonesPanelProps> = ({ projectId, currency = 'INR', userBudget = 0, quotationAmount = 0, onChanged }) => {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // Only the first load shows "Loading..."; background refreshes swap data in silently.
    const [hasLoaded, setHasLoaded] = useState(false);

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

    // Background refreshes (interval/focus) can overlap a refresh triggered by
    // a save; only the most recent request may update the list, so an older
    // in-flight response can't overwrite the just-saved milestone.
    const latestRequest = useRef(0);

    const fetchMilestones = useCallback(async () => {
        if (!projectId) return;
        const requestId = ++latestRequest.current;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<Milestone[]>(`/projects/${projectId}/milestones/`);
            if (requestId !== latestRequest.current) return;
            setMilestones(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch milestones:', error);
        } finally {
            setIsLoading(false);
            setHasLoaded(true);
        }
    }, [projectId]);

    useEffect(() => {
        fetchMilestones();
    }, [fetchMilestones]);

    // Actual cost includes live task timers, so keep the figures fresh while
    // the panel is open and whenever the user comes back to the tab.
    useEffect(() => {
        const interval = window.setInterval(fetchMilestones, 30000);
        const onFocus = () => fetchMilestones();
        window.addEventListener('focus', onFocus);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [fetchMilestones]);

    const totals = useMemo(() => milestones.reduce(
        (acc, m) => {
            acc.budget += num(m.budget_amount);
            acc.billing += num(m.billing_amount);
            acc.actual += num(m.actual_cost);
            acc.billed += num(m.billed_amount);
            acc.billedBase += num(m.billed_base_amount ?? m.billed_amount);
            acc.received += num(m.received_amount);
            return acc;
        },
        { budget: 0, billing: 0, actual: 0, billed: 0, billedBase: 0, received: 0 }
    ), [milestones]);

    const budgetBase = milestones.length > 0 ? num(milestones[0].project_budget_base ?? userBudget) : userBudget;
    const quotationBase = milestones.length > 0 ? num(milestones[0].quotation_base ?? quotationAmount) : quotationAmount;
    const pctOf = (base: number, pct: string) => Math.round(base * (Number(pct) || 0)) / 100;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const pctOfBase = (amount: number, base: number) => (base ? round2((amount / base) * 100) : 0);

    // What the other milestones haven't used yet - the most a new (or the
    // edited) milestone can take. Mirrors the backend's 100% cap.
    const availableFor = (excludeId: number | null) => {
        const used = milestones.reduce(
            (acc, m) => (m.id === excludeId ? acc : {
                budget: acc.budget + num(m.budget_amount),
                bill: acc.bill + num(m.billing_amount),
            }),
            { budget: 0, bill: 0 }
        );
        return {
            budget: round2(Math.max(budgetBase - used.budget, 0)),
            bill: round2(Math.max(quotationBase - used.bill, 0)),
        };
    };
    const addAvailable = availableFor(null);

    const validateForm = (values: typeof emptyForm, excludeId: number | null = null) => {
        const errors: Record<string, string> = {};
        if (!values.name.trim()) errors.name = 'Milestone name is required.';
        const sequence = parseInt(values.sequence, 10);
        const original = milestones.find((m) => m.id === excludeId);
        if (!sequence || sequence < 1) {
            errors.sequence = 'Sequence must be 1 or more.';
        } else if (!original || num(original.sequence) !== sequence) {
            // Same rule as the backend: only checked when the number changes
            const clash = milestones.find((m) => m.id !== excludeId && num(m.sequence) === sequence);
            if (clash) errors.sequence = `Sequence ${sequence} is already used by "${clash.name}".`;
        }
        const budgetPct = Number(values.budget_percent);
        const billPct = Number(values.bill_percent);
        const available = availableFor(excludeId);
        if (values.budget_percent !== '' && (budgetPct < 0 || budgetPct > 100)) {
            errors.budget_percent = 'Budget % must be between 0 and 100.';
        } else if (budgetBase && pctOf(budgetBase, values.budget_percent) > available.budget + 0.005) {
            errors.budget_percent = `Only ${pctOfBase(available.budget, budgetBase)}% (${available.budget.toLocaleString()} ${currency}) of the user budget is left.`;
        }
        if (values.bill_percent !== '' && (billPct < 0 || billPct > 100)) {
            errors.bill_percent = 'Bill % must be between 0 and 100.';
        } else if (quotationBase && pctOf(quotationBase, values.bill_percent) > available.bill + 0.005) {
            errors.bill_percent = `Only ${pctOfBase(available.bill, quotationBase)}% (${available.bill.toLocaleString()} ${currency}) of the quotation is left.`;
        }
        return errors;
    };

    const buildPayload = (values: typeof emptyForm) => ({
        name: values.name.trim(),
        description: values.description.trim(),
        sequence: parseInt(values.sequence, 10) || 1,
        planned_start_date: values.planned_start_date || null,
        planned_end_date: values.planned_end_date || null,
        budget_percent: values.budget_percent === '' ? 0 : parseFloat(values.budget_percent),
        bill_percent: values.bill_percent === '' ? 0 : parseFloat(values.bill_percent),
        status: values.status,
    });

    // Open the add form pre-filled with the next sequence number and whatever
    // budget / bill % the existing milestones haven't used yet.
    const toggleAddForm = () => {
        if (showAddForm) {
            setShowAddForm(false);
            return;
        }
        const nextSequence = milestones.reduce((max, m) => Math.max(max, num(m.sequence)), 0) + 1;
        const budgetLeft = pctOfBase(addAvailable.budget, budgetBase);
        const billLeft = pctOfBase(addAvailable.bill, quotationBase);
        setForm({
            ...emptyForm,
            sequence: String(nextSequence),
            budget_percent: budgetLeft > 0 ? String(budgetLeft) : '',
            bill_percent: billLeft > 0 ? String(billLeft) : '',
        });
        setFormErrors({});
        setShowAddForm(true);
    };

    const handleAdd = async () => {
        const errors = validateForm(form);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            const res = await axiosInstance.post<Milestone>(`/projects/${projectId}/milestones/`, buildPayload(form));
            toast.success('Milestone added');
            // Show the saved milestone right away, then refresh for the server's derived figures
            if (res.data?.id) {
                setMilestones((prev) => [...prev.filter((m) => m.id !== res.data.id), res.data]
                    .sort((a, b) => num(a.sequence) - num(b.sequence) || a.id - b.id));
            }
            setForm(emptyForm);
            setFormErrors({});
            setShowAddForm(false);
            fetchMilestones();
            onChanged?.();
        } catch (error: any) {
            const data = error?.response?.data;
            const msg = data?.sequence?.[0] || data?.budget_percent?.[0] || data?.bill_percent?.[0] || data?.budget_amount?.[0] || data?.name?.[0] || data?.detail || 'Failed to add milestone';
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
            budget_percent: String(num(milestone.budget_percent)),
            bill_percent: String(num(milestone.bill_percent)),
            status: milestone.status,
        });
    };

    const handleSaveEdit = async (id: number) => {
        const errors = validateForm(editForm, id);
        setFormErrors(errors);
        // The inline edit row has no error slots, so surface the first problem as a toast
        const firstError = Object.values(errors)[0];
        if (firstError) {
            toast.error(firstError);
            return;
        }

        try {
            await axiosInstance.patch(`/projects/${projectId}/milestones/${id}/`, buildPayload(editForm));
            toast.success('Milestone updated');
            setEditingId(null);
            fetchMilestones();
            onChanged?.();
        } catch (error: any) {
            const data = error?.response?.data;
            const msg = data?.sequence?.[0] || data?.budget_percent?.[0] || data?.bill_percent?.[0] || data?.budget_amount?.[0] || data?.name?.[0] || data?.detail || 'Failed to update milestone';
            toast.error(msg);
        }
    };

    const handleArchive = async (id: number) => {
        if (!window.confirm('Archive this milestone? It will be hidden from the list but its billing/expense history is kept.')) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/milestones/${id}/`);
            toast.success('Milestone archived');
            setMilestones((prev) => prev.filter((m) => m.id !== id));
            onChanged?.();
        } catch (error) {
            toast.error('Failed to archive milestone');
        }
    };

    const openInvoiceModal = (milestone: Milestone) => {
        const remaining = num(milestone.billing_amount) - num(milestone.billed_base_amount ?? milestone.billed_amount);
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
            onChanged?.();
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
                    onClick={toggleAddForm}
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
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.sequence ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {formErrors.sequence && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.sequence}</p>}
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
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Budget Amount (%)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={form.budget_percent}
                                onChange={(e) => setForm({ ...form, budget_percent: e.target.value })}
                                placeholder="e.g. 25"
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.budget_percent ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                = {pctOf(budgetBase, form.budget_percent).toLocaleString()} {currency} of user budget {budgetBase.toLocaleString()} {currency}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Remaining: <span className="font-medium text-gray-700 dark:text-gray-200">{addAvailable.budget.toLocaleString()} {currency} ({pctOfBase(addAvailable.budget, budgetBase)}%)</span>
                                {form.budget_percent !== '' && ` → ${round2(addAvailable.budget - pctOf(budgetBase, form.budget_percent)).toLocaleString()} ${currency} after this`}
                            </p>
                            {formErrors.budget_percent && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.budget_percent}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bill Amount (%)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={form.bill_percent}
                                onChange={(e) => setForm({ ...form, bill_percent: e.target.value })}
                                placeholder="e.g. 25"
                                className={`w-full px-3 py-2 border rounded-lg text-sm ${formErrors.bill_percent ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                = {pctOf(quotationBase, form.bill_percent).toLocaleString()} {currency} of quotation {quotationBase.toLocaleString()} {currency}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Remaining: <span className="font-medium text-gray-700 dark:text-gray-200">{addAvailable.bill.toLocaleString()} {currency} ({pctOfBase(addAvailable.bill, quotationBase)}%)</span>
                                {form.bill_percent !== '' && ` → ${round2(addAvailable.bill - pctOf(quotationBase, form.bill_percent)).toLocaleString()} ${currency} after this`}
                            </p>
                            {formErrors.bill_percent && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.bill_percent}</p>}
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
                {isLoading && !hasLoaded ? (
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
                                <th className="px-4 py-2 text-right">Budget Used %</th>
                                <th className="px-4 py-2 text-right">Remaining Budget</th>
                                <th className="px-4 py-2 text-right">Bill Amount</th>
                                <th className="px-4 py-2 text-right">Invoiced</th>
                                <th className="px-4 py-2 text-right">Invoiced %</th>
                                <th className="px-4 py-2 text-right">Remaining Billable</th>
                                <th className="px-4 py-2">Billing</th>
                                <th className="px-4 py-2">Payment</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {milestones.map((m, index) => {
                                const isEditing = editingId === m.id;
                                const overBudget = num(m.actual_cost) > num(m.budget_amount) && num(m.budget_amount) > 0;
                                const billedBase = num(m.billed_base_amount ?? m.billed_amount);
                                const quotation = num(m.quotation_amount ?? m.billing_amount);
                                const utilization = num(m.budget_utilization_percent);
                                const billingPct = m.billing_percent !== undefined
                                    ? num(m.billing_percent)
                                    : (quotation > 0 ? (billedBase / quotation) * 100 : 0);
                                const remainingBudget = num(m.remaining_budget ?? (num(m.budget_amount) - num(m.actual_cost)));
                                const remainingBillable = num(m.remaining_billable_amount ?? (quotation - billedBase));
                                return (
                                    <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={editForm.sequence}
                                                    onChange={(e) => setEditForm({ ...editForm, sequence: e.target.value })}
                                                    className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
                                                />
                                            ) : index + 1 /* row position, so the series is always 1, 2, 3... */}
                                        </td>
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
                                                <div className="flex flex-wrap items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={editForm.budget_percent}
                                                        onChange={(e) => setEditForm({ ...editForm, budget_percent: e.target.value })}
                                                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm text-right"
                                                    />
                                                    <span className="text-xs text-gray-500">%</span>
                                                    <p className="basis-full text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">max {pctOfBase(availableFor(m.id).budget, budgetBase)}%</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <span>{num(m.budget_amount).toLocaleString()} {currency}</span>
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{num(m.budget_percent).toFixed(2)}% of budget</p>
                                                </>
                                            )}
                                        </td>
                                        <td className={`px-4 py-2 text-right ${overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                            {num(m.actual_cost).toLocaleString()} {currency}
                                            {overBudget && <span className="ml-1 text-[10px] uppercase">Over</span>}
                                            {(m.labour_cost !== undefined || m.expense_cost !== undefined) && (
                                                <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                    Time {num(m.labour_cost).toLocaleString()} + Exp {num(m.expense_cost).toLocaleString()}
                                                </p>
                                            )}
                                        </td>
                                        <td className={`px-4 py-2 text-right ${utilization > 100 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                            {utilization.toFixed(1)}%
                                            <div className="mt-1 h-1.5 w-16 ml-auto rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                <div
                                                    className={`h-full ${utilization > 100 ? 'bg-red-500' : utilization > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                                                    style={{ width: `${Math.min(utilization, 100)}%` }}
                                                />
                                            </div>
                                        </td>
                                        <td className={`px-4 py-2 text-right ${remainingBudget < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                            {remainingBudget.toLocaleString()} {currency}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {isEditing ? (
                                                <div className="flex flex-wrap items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={editForm.bill_percent}
                                                        onChange={(e) => setEditForm({ ...editForm, bill_percent: e.target.value })}
                                                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm text-right"
                                                    />
                                                    <span className="text-xs text-gray-500">%</span>
                                                    <p className="basis-full text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">max {pctOfBase(availableFor(m.id).bill, quotationBase)}%</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <span>{quotation.toLocaleString()} {currency}</span>
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{num(m.bill_percent).toFixed(2)}% of quotation</p>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                            {billedBase.toLocaleString()} {currency}
                                        </td>
                                        <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                            {billingPct.toFixed(1)}%
                                            <div className="mt-1 h-1.5 w-16 ml-auto rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(billingPct, 100)}%` }} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-green-600 dark:text-green-400">
                                            {remainingBillable.toLocaleString()} {currency}
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
                                <td className="px-4 py-2 text-right">
                                    {totals.budget > 0 ? ((totals.actual / totals.budget) * 100).toFixed(1) : '0.0'}%
                                </td>
                                <td className={`px-4 py-2 text-right ${(totals.budget - totals.actual) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                    {(totals.budget - totals.actual).toLocaleString()} {currency}
                                </td>
                                <td className="px-4 py-2 text-right">{totals.billing.toLocaleString()} {currency}</td>
                                <td className="px-4 py-2 text-right">{totals.billedBase.toLocaleString()} {currency}</td>
                                <td className="px-4 py-2 text-right">
                                    {totals.billing > 0 ? ((totals.billedBase / totals.billing) * 100).toFixed(1) : '0.0'}%
                                </td>
                                <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">
                                    {(totals.billing - totals.billedBase).toLocaleString()} {currency}
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
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Invoice Amount (before tax)</label>
                                <input
                                    type="number"
                                    value={invoiceAmount}
                                    onChange={(e) => setInvoiceAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
                                />
                                {(() => {
                                    const taxPct = num(invoiceModalMilestone.tax_percentage);
                                    const base = num(invoiceAmount);
                                    const tax = (base * taxPct) / 100;
                                    return (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            + Tax {taxPct}% (from quotation): {tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                            {' '}&middot; Invoice total: <span className="font-semibold text-gray-700 dark:text-gray-200">{(base + tax).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                        </p>
                                    );
                                })()}
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
