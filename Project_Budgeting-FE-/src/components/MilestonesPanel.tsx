/**
 * MilestonesPanel
 * Phases of a Fixed Budget / Milestone-Based project (Project Types and
 * Project Financial Management module). Each milestone carries its own
 * budget and billing amount; actual cost, billing status and payment status
 * are all derived server-side - never entered manually. Actual Cost =
 * assigned resource cost (Resources tab) + expenses + paid vendor bills;
 * those parts are managed in their own tabs, so this table only shows the
 * milestone's budget, cost summary, billing and payment.
 */

import { formatDate as toDMY } from '../utils/date';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectFilterValues } from '../hooks/useProjectFilters';
import { matchesMilestoneFilters } from '../utils/milestoneFilters';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, drawerErrorBorder, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';

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
    /** Resource cost + expenses + paid bills (server-computed). */
    actual_cost: string | number;
    /** Assigned cost of the resources added to this milestone (Resources tab). */
    resource_cost?: string | number;
    /** Expenses + paid vendor bills tagged to this milestone. */
    expense_cost?: string | number;
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
    /** Expenses tagged to this milestone (resource categories excluded). */
    expenses_amount?: string | number;
    /** Paid vendor bill amounts tagged to this milestone. */
    bills_amount?: string | number;
    /** Who works on it (Resources tab, removed ones left out). */
    assigned_resources?: { name: string; type: string; status: string }[];
}

interface MilestonesPanelProps {
    projectId: string;
    /** Internal project (no quotation): allocated budget, progress and costs - no billing or payment. */
    isInternal?: boolean;
    currency?: string;
    /** Project user budget (cost_budget) - Budget % is taken of this. */
    userBudget?: number;
    /** Project quotation amount before tax - Bill % is taken of this. */
    quotationAmount?: number;
    /** Project start date (YYYY-MM-DD) - the first milestone's default Planned Start. */
    projectStart?: string;
    /** Called after a milestone is added/edited/archived/billed, so the page can refresh its own figures. */
    onChanged?: () => void;
    /** Project Details filter toolbar (due date, status, financial / billing / payment status, search). */
    pageFilters?: ProjectFilterValues;
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

// YYYY-MM-DD of the day after `iso` (UTC arithmetic, so no timezone shift)
const dayAfter = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const fmtShortDate = (iso: string) =>
    toDMY(iso);

const emptyForm = {
    name: '',
    description: '',
    sequence: '1',
    planned_start_date: '',
    planned_end_date: '',
    budget_percent: '',
    bill_percent: '',
    status: 'not_started',
    /** Internal projects: % done (completion_percent). */
    progress: '0',
};

export const MilestonesPanel: React.FC<MilestonesPanelProps> = ({ projectId, isInternal = false, currency = 'INR', userBudget = 0, quotationAmount = 0, projectStart, onChanged, pageFilters }) => {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // Only the first load shows "Loading..."; background refreshes swap data in silently.
    const [hasLoaded, setHasLoaded] = useState(false);

    // The Add / Edit Milestone drawer (one form for both, like Add / Edit Resource).
    const [formMode, setFormMode] = useState<null | { kind: 'add' } | { kind: 'edit'; id: number; name: string }>(null);
    const editId = formMode?.kind === 'edit' ? formMode.id : null;
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Loading the latest milestones before the add form opens with its defaults
    const [isPreparingForm, setIsPreparingForm] = useState(false);
    // Where the add form's Planned Start default came from
    const [startHint, setStartHint] = useState('');

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

    // Resources, expenses and bills change in other tabs - refresh when the user comes back to the window.
    useEffect(() => {
        const onFocus = () => fetchMilestones();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
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

    const shownMilestones = pageFilters ? milestones.filter((m) => matchesMilestoneFilters(m, pageFilters)) : milestones;
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
    // What this form may use: everything the other milestones haven't (when editing, this
    // milestone's own share counts as available).
    const formAvailable = availableFor(editId);

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
        if (values.planned_start_date && values.planned_end_date && values.planned_end_date < values.planned_start_date) {
            errors.planned_end_date = 'Planned end cannot be before planned start.';
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
        if (isInternal) {
            const progress = Number(values.progress);
            if (values.progress === '' || !Number.isInteger(progress) || progress < 0 || progress > 100) {
                errors.progress = 'Progress must be a whole number from 0 to 100.';
            }
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
        // Internal projects have no quotation to bill against.
        bill_percent: isInternal || values.bill_percent === '' ? 0 : parseFloat(values.bill_percent),
        status: values.status,
        ...(isInternal ? { completion_percent: parseInt(values.progress, 10) || 0 } : {}),
    });

    // Open the add form pre-filled so milestones follow on from each other:
    // the next sequence number, a Planned Start the day after the previous
    // milestone ends (the first one starts with the project), and whatever
    // budget / bill % the existing milestones haven't used yet. Defaults come
    // from a fresh fetch, so they're right even if the list was stale.
    const toggleAddForm = async () => {
        if (formMode) {
            setFormMode(null);
            return;
        }

        let list = milestones;
        setIsPreparingForm(true);
        const requestId = ++latestRequest.current;
        try {
            const res = await axiosInstance.get<Milestone[]>(`/projects/${projectId}/milestones/`);
            if (Array.isArray(res.data)) {
                list = res.data;
                if (requestId === latestRequest.current) setMilestones(res.data);
            }
        } catch (error) {
            console.error('Failed to refresh milestones:', error);
        } finally {
            setIsPreparingForm(false);
        }

        const ordered = [...list].sort((a, b) => num(a.sequence) - num(b.sequence) || a.id - b.id);
        const nextSequence = ordered.reduce((max, m) => Math.max(max, num(m.sequence)), 0) + 1;

        const budgetBaseNow = list.length > 0 ? num(list[0].project_budget_base ?? userBudget) : userBudget;
        const quotationBaseNow = list.length > 0 ? num(list[0].quotation_base ?? quotationAmount) : quotationAmount;
        const used = list.reduce(
            (acc, m) => ({ budget: acc.budget + num(m.budget_amount), bill: acc.bill + num(m.billing_amount) }),
            { budget: 0, bill: 0 }
        );
        const budgetLeft = pctOfBase(Math.max(budgetBaseNow - used.budget, 0), budgetBaseNow);
        const billLeft = pctOfBase(Math.max(quotationBaseNow - used.bill, 0), quotationBaseNow);

        // Previous milestone = the last one by sequence; if it has no end date,
        // use the latest end date of any milestone.
        const previous = ordered[ordered.length - 1];
        const previousEnd = previous?.planned_end_date
            || ordered.map((m) => m.planned_end_date).filter((d): d is string => !!d).sort().pop();
        let plannedStart = '';
        if (previousEnd) {
            plannedStart = dayAfter(previousEnd);
            const endedBy = ordered.find((m) => m.planned_end_date === previousEnd);
            setStartHint(`Day after ${endedBy?.name || 'the previous milestone'} ends (${fmtShortDate(previousEnd)})`);
        } else if (ordered.length === 0 && projectStart) {
            plannedStart = projectStart;
            setStartHint('Project start date');
        } else {
            setStartHint('');
        }

        setForm({
            ...emptyForm,
            sequence: String(nextSequence),
            planned_start_date: plannedStart,
            budget_percent: budgetLeft > 0 ? String(budgetLeft) : '',
            bill_percent: billLeft > 0 ? String(billLeft) : '',
        });
        setFormErrors({});
        setFormMode({ kind: 'add' });
    };

    // Edit opens the same drawer, filled in from the milestone.
    const startEdit = (milestone: Milestone) => {
        setForm({
            name: milestone.name,
            description: milestone.description || '',
            sequence: String(milestone.sequence),
            planned_start_date: milestone.planned_start_date || '',
            planned_end_date: milestone.planned_end_date || '',
            budget_percent: String(num(milestone.budget_percent)),
            bill_percent: String(num(milestone.bill_percent)),
            status: milestone.status,
            progress: String(num(milestone.completion_percent)),
        });
        setFormErrors({});
        setStartHint('');
        setFormMode({ kind: 'edit', id: milestone.id, name: milestone.name });
    };

    const handleSubmit = async () => {
        const errors = validateForm(form, editId);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            if (editId != null) {
                await axiosInstance.patch(`/projects/${projectId}/milestones/${editId}/`, buildPayload(form));
                toast.success('Milestone updated');
            } else {
                const res = await axiosInstance.post<Milestone>(`/projects/${projectId}/milestones/`, buildPayload(form));
                toast.success('Milestone added');
                // Show the saved milestone right away, then refresh for the server's derived figures
                if (res.data?.id) {
                    setMilestones((prev) => [...prev.filter((m) => m.id !== res.data.id), res.data]
                        .sort((a, b) => num(a.sequence) - num(b.sequence) || a.id - b.id));
                }
            }
            setForm(emptyForm);
            setFormErrors({});
            setFormMode(null);
            fetchMilestones();
            onChanged?.();
        } catch (error: unknown) {
            // Field errors arrive as {field: [msg]} or, via the custom exception handler, {error, errors: {field: msg}}.
            const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data ?? {};
            const fields = (data.errors && typeof data.errors === 'object' ? data.errors : data) as Record<string, unknown>;
            const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
            const serverErrors: Record<string, string> = {};
            for (const key of ['name', 'sequence', 'status', 'planned_start_date', 'planned_end_date', 'budget_percent', 'bill_percent', 'budget_amount', 'completion_percent']) {
                const msg = first(fields[key]);
                if (msg) serverErrors[key === 'budget_amount' ? 'budget_percent' : key === 'completion_percent' ? 'progress' : key] = msg;
            }
            setFormErrors(serverErrors);
            toast.error(Object.values(serverErrors)[0] || first(data.error) || first(data.detail)
                || (editId != null ? 'Failed to update milestone' : 'Failed to add milestone'));
        } finally {
            setIsSubmitting(false);
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
            toast.success('Invoice created (Issued)');
            setInvoiceModalMilestone(null);
            fetchMilestones();
            onChanged?.();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to create invoice');
        } finally {
            setIsCreatingInvoice(false);
        }
    };

    // Internal projects: allocated budget, progress, who works on it and its costs - no billing.
    const money0 = (v: number) => `${v.toLocaleString()} ${currency}`;
    const internalTotals = shownMilestones.reduce(
        (t, m) => ({
            budget: t.budget + num(m.budget_amount),
            resources: t.resources + num(m.resource_cost),
            expenses: t.expenses + num(m.expenses_amount),
            bills: t.bills + num(m.bills_amount),
            actual: t.actual + num(m.actual_cost),
        }),
        { budget: 0, resources: 0, expenses: 0, bills: 0, actual: 0 },
    );
    const internalTable = (
        <table className="w-full min-w-[1080px] text-sm">
            <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Milestone</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Progress</th>
                    <th className="px-4 py-2 text-right">Allocated Budget</th>
                    <th className="px-4 py-2">Resources</th>
                    <th className="px-4 py-2 text-right">Expenses</th>
                    <th className="px-4 py-2 text-right">Vendor Bills</th>
                    <th className="px-4 py-2 text-right">Actual Cost</th>
                    <th className="px-4 py-2 text-right">Used %</th>
                    <th className="px-4 py-2 text-right">Remaining</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {shownMilestones.map((m, index) => {
                    const budget = num(m.budget_amount);
                    const actual = num(m.actual_cost);
                    const used = num(m.budget_utilization_percent);
                    const remaining = num(m.remaining_budget ?? budget - actual);
                    const progress = num(m.completion_percent);
                    const people = m.assigned_resources ?? [];
                    return (
                        <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                            <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
                            <td className="px-4 py-2">
                                <p className="text-gray-900 dark:text-white font-medium">{m.name}</p>
                                <p className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                                    {toDMY(m.planned_start_date, '—')} – {toDMY(m.planned_end_date, '—')}
                                </p>
                                {m.description && <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                            </td>
                            <td className="px-4 py-2">
                                <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[m.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                    {m.status_display}
                                </span>
                            </td>
                            <td className="px-4 py-2">
                                <span className="tabular-nums text-gray-900 dark:text-white">{progress}%</span>
                                <div role="progressbar" aria-label={`${m.name}: progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
                                    className="mt-1 h-1.5 w-20 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                    <div className="h-full bg-violet-500" style={{ width: `${Math.min(progress, 100)}%` }} />
                                </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                                <span className="whitespace-nowrap">{money0(budget)}</span>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">{num(m.budget_percent).toFixed(2)}% of approved</p>
                            </td>
                            <td className="px-4 py-2">
                                <span className="whitespace-nowrap text-gray-900 dark:text-white">{people.length} {people.length === 1 ? 'resource' : 'resources'}</span>
                                {people.length > 0 && (
                                    <p className="max-w-[12rem] truncate text-[11px] text-gray-500 dark:text-gray-400" title={people.map((p) => p.name).join(', ')}>
                                        {people.map((p) => p.name).join(', ')}
                                    </p>
                                )}
                                <p className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{money0(num(m.resource_cost))}</p>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{money0(num(m.expenses_amount))}</td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{money0(num(m.bills_amount))}</td>
                            <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${budget > 0 && actual > budget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>{money0(actual)}</td>
                            <td className={`px-4 py-2 text-right ${used > 100 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                {used.toFixed(1)}%
                                <div className="mt-1 h-1.5 w-16 ml-auto rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                    <div className={`h-full ${used > 100 ? 'bg-red-500' : used > 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(used, 100)}%` }} />
                                </div>
                            </td>
                            <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${remaining < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>{money0(remaining)}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                                <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.name}`} className="text-xs text-gray-600 dark:text-gray-400 hover:underline mr-2">Edit</button>
                                <button type="button" onClick={() => handleArchive(m.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Archive</button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
            <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                    <td className="px-4 py-2" colSpan={4}>Total</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{money0(internalTotals.budget)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{money0(internalTotals.resources)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{money0(internalTotals.expenses)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{money0(internalTotals.bills)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{money0(internalTotals.actual)}</td>
                    <td className="px-4 py-2 text-right">{internalTotals.budget > 0 ? ((internalTotals.actual / internalTotals.budget) * 100).toFixed(1) : '0.0'}%</td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${internalTotals.budget - internalTotals.actual < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money0(internalTotals.budget - internalTotals.actual)}</td>
                    <td />
                </tr>
            </tfoot>
        </table>
    );

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
                    disabled={isPreparingForm}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                    {isPreparingForm ? 'Loading...' : '+ Add Milestone'}
                </button>
            </div>

            {/* Add and Edit Milestone open in a side drawer, like Add / Edit Resource. */}
            <Drawer
                isOpen={!!formMode}
                onClose={() => setFormMode(null)}
                title={editId != null ? 'Edit Milestone' : 'Add Milestone'}
                subtitle={formMode?.kind === 'edit' ? formMode.name : isInternal
                    ? 'A phase of this internal project, with its share of the approved budget'
                    : 'A phase of this fixed-budget project, with its share of the budget and billing'}
                size="md"
                footer={(
                    <DrawerFormFooter
                        summary={<>{editId != null ? 'Available budget' : 'Remaining budget'}: <span className="font-semibold text-gray-800 dark:text-gray-200">{formAvailable.budget.toLocaleString()} {currency}</span></>}
                        onCancel={() => setFormMode(null)}
                        onSubmit={handleSubmit}
                        submitLabel={editId != null ? 'Save Changes' : 'Add Milestone'}
                        busyLabel={editId != null ? 'Saving...' : 'Adding...'}
                        isBusy={isSubmitting}
                    />
                )}
            >
                <fieldset disabled={isSubmitting}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className={drawerLabelClass}>Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Training"
                            className={`${drawerInputClass} ${formErrors.name ? drawerErrorBorder : ''}`}
                        />
                        {formErrors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.name}</p>}
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Sequence</label>
                        <input
                            type="number"
                            value={form.sequence}
                            onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                            className={`${drawerInputClass} ${formErrors.sequence ? drawerErrorBorder : ''}`}
                        />
                        {formErrors.sequence && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.sequence}</p>}
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Status</label>
                        <select
                            value={form.status}
                            onChange={(e) => setForm({ ...form, status: e.target.value })}
                            className={drawerInputClass}
                        >
                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    {isInternal && (
                        <div className="sm:col-span-2">
                            <label htmlFor="ms-progress" className={drawerLabelClass}>Progress (%)</label>
                            <div className="flex items-center gap-3">
                                <input id="ms-progress" type="range" min={0} max={100} step={5} value={Number(form.progress) || 0}
                                    onChange={(e) => setForm({ ...form, progress: e.target.value })} aria-label="Progress"
                                    className="h-2 min-w-0 flex-1 accent-violet-600" />
                                <input type="number" min={0} max={100} step={1} value={form.progress} aria-label="Progress percent"
                                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                                    className={`${drawerInputClass} w-20 text-right ${formErrors.progress ? drawerErrorBorder : ''}`} />
                            </div>
                            {formErrors.progress && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.progress}</p>}
                        </div>
                    )}
                    <div>
                        <label className={drawerLabelClass}>Planned Start</label>
                        <input
                            type="date"
                            value={form.planned_start_date}
                            onChange={(e) => setForm({ ...form, planned_start_date: e.target.value })}
                            className={drawerInputClass}
                        />
                        {startHint && form.planned_start_date && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{startHint}</p>
                        )}
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Planned End</label>
                        <input
                            type="date"
                            value={form.planned_end_date}
                            min={form.planned_start_date || undefined}
                            onChange={(e) => setForm({ ...form, planned_end_date: e.target.value })}
                            className={`${drawerInputClass} ${formErrors.planned_end_date ? drawerErrorBorder : ''}`}
                        />
                        {formErrors.planned_end_date && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.planned_end_date}</p>}
                    </div>
                    <div className="sm:col-span-2">
                        <label className={drawerLabelClass}>{isInternal ? 'Allocated Budget (%)' : 'Budget Amount (%)'}</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={form.budget_percent}
                            onChange={(e) => setForm({ ...form, budget_percent: e.target.value })}
                            placeholder="e.g. 25"
                            className={`${drawerInputClass} ${formErrors.budget_percent ? drawerErrorBorder : ''}`}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {budgetBase
                                ? <>= {pctOf(budgetBase, form.budget_percent).toLocaleString()} {currency} of {isInternal ? 'the approved budget' : 'user budget'} {budgetBase.toLocaleString()} {currency}</>
                                : isInternal ? 'Set the project’s approved budget first (Edit Project).' : 'This project has no user budget, so leave Budget % at 0.'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {editId != null ? 'Available for this milestone' : 'Remaining'}: <span className="font-medium text-gray-700 dark:text-gray-200">{formAvailable.budget.toLocaleString()} {currency} ({pctOfBase(formAvailable.budget, budgetBase)}%)</span>
                            {form.budget_percent !== '' && ` → ${round2(formAvailable.budget - pctOf(budgetBase, form.budget_percent)).toLocaleString()} ${currency} left after this`}
                        </p>
                        {formErrors.budget_percent && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.budget_percent}</p>}
                    </div>
                    {!isInternal && (
                    <div className="sm:col-span-2">
                        <label className={drawerLabelClass}>Bill Amount (%)</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={form.bill_percent}
                            onChange={(e) => setForm({ ...form, bill_percent: e.target.value })}
                            placeholder="e.g. 25"
                            className={`${drawerInputClass} ${formErrors.bill_percent ? drawerErrorBorder : ''}`}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {quotationBase
                                ? <>= {pctOf(quotationBase, form.bill_percent).toLocaleString()} {currency} of quotation {quotationBase.toLocaleString()} {currency}</>
                                : 'This project has no quotation amount, so leave Bill % at 0.'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {editId != null ? 'Available for this milestone' : 'Remaining'}: <span className="font-medium text-gray-700 dark:text-gray-200">{formAvailable.bill.toLocaleString()} {currency} ({pctOfBase(formAvailable.bill, quotationBase)}%)</span>
                            {form.bill_percent !== '' && ` → ${round2(formAvailable.bill - pctOf(quotationBase, form.bill_percent)).toLocaleString()} ${currency} left after this`}
                        </p>
                        {formErrors.bill_percent && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.bill_percent}</p>}
                    </div>
                    )}
                    <div className="sm:col-span-2">
                        <label className={drawerLabelClass}>Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={2}
                            className={drawerInputClass}
                        />
                    </div>
                </div>
                </fieldset>
            </Drawer>

            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
                {isLoading && !hasLoaded ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading milestones...</p>
                ) : milestones.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No milestones yet. Use “+ Add Milestone”.</p>
                ) : shownMilestones.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No milestones match these filters.</p>
                ) : isInternal ? internalTable : (
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
                                <th className="px-4 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shownMilestones.map((m, index) => {
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
                                            {index + 1 /* row position, so the series is always 1, 2, 3... */}
                                        </td>
                                        <td className="px-4 py-2">
                                            <p className="text-gray-900 dark:text-white font-medium">{m.name}</p>
                                            {m.description && <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[m.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                                {m.status_display}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <span>{num(m.budget_amount).toLocaleString()} {currency}</span>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{num(m.budget_percent).toFixed(2)}% of budget</p>
                                        </td>
                                        <td className={`px-4 py-2 text-right ${overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                                            {num(m.actual_cost).toLocaleString()} {currency}
                                            {overBudget && <span className="ml-1 text-[10px] uppercase">Over</span>}
                                            {num(m.actual_cost) > 0 && (
                                                <p className="text-[11px] font-normal text-gray-500 dark:text-gray-400" title="Resources = assigned cost of the resources added to this milestone (Resources tab); Expenses = expenses + paid vendor bills">
                                                    Resources {num(m.resource_cost).toLocaleString()}
                                                    {num(m.expense_cost) > 0 && ` · Expenses ${num(m.expense_cost).toLocaleString()}`}
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
                                            <span>{quotation.toLocaleString()} {currency}</span>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{num(m.bill_percent).toFixed(2)}% of quotation</p>
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
                                            <button type="button" onClick={() => openInvoiceModal(m)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mr-2">Bill</button>
                                            <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.name}`} className="text-xs text-gray-600 dark:text-gray-400 hover:underline mr-2">Edit</button>
                                            <button type="button" onClick={() => handleArchive(m.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Archive</button>
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

            <Drawer
                isOpen={!!invoiceModalMilestone}
                onClose={() => setInvoiceModalMilestone(null)}
                title="Create Invoice"
                subtitle={invoiceModalMilestone?.name}
                size="md"
                footer={(() => {
                    const taxPct = num(invoiceModalMilestone?.tax_percentage);
                    const base = num(invoiceAmount);
                    const total = base + (base * taxPct) / 100;
                    return (
                        <DrawerFormFooter
                            summary={<>Invoice total: <span className="font-semibold text-gray-800 dark:text-gray-200">{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {currency}</span></>}
                            onCancel={() => setInvoiceModalMilestone(null)}
                            onSubmit={handleCreateInvoice}
                            submitLabel="Create Invoice"
                            busyLabel="Creating..."
                            isBusy={isCreatingInvoice}
                        />
                    );
                })()}
            >
                {invoiceModalMilestone && (
                    <fieldset disabled={isCreatingInvoice} className="space-y-4">
                        <DrawerSection>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={drawerLabelClass}>Invoice Amount (before tax) *</label>
                                    <input
                                        type="number" min={0} step="0.01"
                                        value={invoiceAmount}
                                        onChange={(e) => setInvoiceAmount(e.target.value)}
                                        className={`${drawerInputClass} text-right tabular-nums`}
                                    />
                                </div>
                                <div>
                                    <label className={drawerLabelClass}>Due in (days)</label>
                                    <input
                                        type="number" min={0}
                                        value={invoiceDueDays}
                                        onChange={(e) => setInvoiceDueDays(e.target.value)}
                                        className={`${drawerInputClass} text-right tabular-nums`}
                                    />
                                </div>
                            </div>
                            {(() => {
                                const taxPct = num(invoiceModalMilestone.tax_percentage);
                                const base = num(invoiceAmount);
                                const tax = (base * taxPct) / 100;
                                return (
                                    <FieldHint>
                                        + Tax {taxPct}% (from quotation): {tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        {' '}&middot; Invoice total: <span className="font-semibold text-gray-700 dark:text-gray-200">{(base + tax).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                    </FieldHint>
                                );
                            })()}
                        </DrawerSection>
                        <FieldHint>
                            Bill amount {num(invoiceModalMilestone.billing_amount).toLocaleString('en-IN')} {currency} &middot; already invoiced {num(invoiceModalMilestone.billed_base_amount ?? invoiceModalMilestone.billed_amount).toLocaleString('en-IN')} {currency}. The invoice is issued straight away, awaiting payment.
                        </FieldHint>
                    </fieldset>
                )}
            </Drawer>
        </div>
    );
};

export default MilestonesPanel;
