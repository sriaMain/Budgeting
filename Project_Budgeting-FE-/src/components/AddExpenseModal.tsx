/**
 * Add Expense drawer
 * Creates a project expense (POST expenses/). Same fields and payload as
 * before - only the presentation moved to the shared form drawer.
 *
 * Employee / Freelancer / Vendor pickers come from /projects/poc-options/
 * (one call, available to any signed-in user). The vendor/freelancer
 * onboarding admin lists need extra permissions, which left those
 * dropdowns empty for most users.
 *
 * Time & Material projects (`months` given) charge the expense to a project
 * month instead of a GL Account / Milestone; its date picks the month.
 */

import React, { useState, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { Drawer } from './Drawer';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import type { CostEntry } from '../types/financials.types';
import { monthForDate, type ProjectMonth } from '../utils/projectMonths';
import {
    drawerInputClass, drawerLabelClass, drawerErrorBorder, FieldError, FieldHint, DrawerSection, DrawerFormFooter,
} from './drawerForm';

interface PocOption {
    id: number;
    type: 'employee' | 'vendor' | 'freelancer';
    name: string;
    subtitle?: string;
}

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    /** T&M project months (start date to end date): charge the expense to a month. */
    months?: ProjectMonth[];
    onExpenseAdded?: () => void;
}

export interface ExpenseData {
    category: string;
    amount: number;
    description: string;
    project: number;
    gl_account?: number;
    freelancer?: number;
    employee?: number;
    vendor?: number;
    notes?: string;
    expense_date: string;
    milestone?: number;
    vendor_bill?: number;
}

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const FALLBACK_CATEGORIES = [
    { key: 'rent', label: 'Rent' },
    { key: 'travel', label: 'Travel' },
    { key: 'food', label: 'Food' },
    { key: 'internet', label: 'Internet' },
    { key: 'electricity', label: 'Electricity' },
    { key: 'software', label: 'Software' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'employee_cost', label: 'Employee Cost' },
    { key: 'freelancer', label: 'Freelancer Cost' },
    { key: 'other', label: 'Other' },
];

// Category -> which payee picker it shows (and which expense field it fills).
const PAYEE_FOR_CATEGORY: Record<string, PocOption['type'] | undefined> = {
    employee_cost: 'employee',
    freelancer: 'freelancer',
    vendor: 'vendor',
};
const PAYEE_LABEL: Record<PocOption['type'], string> = { employee: 'Employee', freelancer: 'Freelancer', vendor: 'Vendor' };

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
    isOpen,
    onClose,
    projectId,
    months,
    onExpenseAdded
}) => {
    const isMonthly = !!months?.length;
    // Today, or the project's last day once it has ended
    const defaultDate = () => {
        const today = todayIso();
        const last = months?.[months.length - 1];
        return last && today > last.end ? last.end : today;
    };
    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
    const [glAccountOptions, setGlAccountOptions] = useState<SearchableSelectOption[]>([]);
    const [glAccount, setGlAccount] = useState<SearchableSelectOption | null>(null);
    const [pocOptions, setPocOptions] = useState<PocOption[]>([]);
    const [payee, setPayee] = useState<SearchableSelectOption | null>(null);
    const [expenseDate, setExpenseDate] = useState(todayIso());
    const [milestoneOptions, setMilestoneOptions] = useState<{ id: number; name: string }[]>([]);
    const [milestone, setMilestone] = useState('');
    // Bills on this project not yet linked to an expense. Linking marks the
    // expense as the same spend as the bill, so it's counted only once.
    const [billOptions, setBillOptions] = useState<SearchableSelectOption[]>([]);
    const [linkedBill, setLinkedBill] = useState<SearchableSelectOption | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const resetForm = () => {
        setCategory('');
        setAmount('');
        setDescription('');
        setNotes('');
        setGlAccount(null);
        setPayee(null);
        setMilestone('');
        setLinkedBill(null);
        setExpenseDate(defaultDate());
        setErrors({});
    };

    useEffect(() => {
        if (!isOpen) return;
        resetForm();
        axiosInstance.get('expenses/categories/')
            .then((res) => setCategories(Array.isArray(res.data) && res.data.length ? res.data : FALLBACK_CATEGORIES))
            .catch((error) => {
                console.error('Error fetching categories:', error);
                setCategories(FALLBACK_CATEGORIES);
            });
        axiosInstance.get<{ id: number; code: string; name: string; account_type?: string }[]>('/gl-accounts/?active_only=true')
            .then((res) => setGlAccountOptions((res.data || []).map((acc) => ({ id: acc.id, label: `${acc.code} - ${acc.name}`, sublabel: acc.account_type }))))
            .catch((error) => console.error('Error fetching GL accounts:', error));
        axiosInstance.get<PocOption[]>('/projects/poc-options/')
            .then((res) => setPocOptions(Array.isArray(res.data) ? res.data : []))
            .catch((error) => console.error('Error fetching employees / freelancers / vendors:', error));
        axiosInstance.get<{ id: number; name: string }[]>(`/projects/${projectId}/milestones/`)
            .then((res) => setMilestoneOptions(res.data || []))
            .catch((error) => console.error('Error fetching milestones:', error));
        axiosInstance.get<{ entries: CostEntry[] }>(`/projects/${projectId}/cost-entries/`)
            .then((res) => setBillOptions((res.data.entries || [])
                .filter((e) => e.type === 'bill' && !e.linked_expense_no)
                .map((b) => ({ id: b.id, label: b.ref_no, sublabel: [b.payee, b.amount.toLocaleString('en-IN')].filter(Boolean).join(' · ') }))))
            .catch((error) => console.error('Error fetching bills:', error));
    }, [isOpen, projectId]);

    const payeeType = PAYEE_FOR_CATEGORY[category];
    const payeeOptions: SearchableSelectOption[] = payeeType
        ? pocOptions.filter((p) => p.type === payeeType).map((p) => ({ id: p.id, label: p.name, sublabel: p.subtitle || undefined }))
        : [];

    const validate = () => {
        const e: Record<string, string> = {};
        if (!expenseDate) e.expenseDate = 'Expense date is required.';
        else if (expenseDate > todayIso()) e.expenseDate = 'Expense date cannot be in the future.';
        else if (isMonthly && (expenseDate < months![0].start || expenseDate > months![months!.length - 1].end)) {
            e.expenseDate = 'Pick a date within the project (start date to end date).';
        }
        if (!category) e.category = 'Select a category.';
        const amt = parseFloat(amount);
        if (Number.isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than zero.';
        if (!description.trim()) e.description = 'Description is required.';
        return e;
    };

    const handleConfirm = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        const expenseData: ExpenseData = {
            category,
            amount: parseFloat(amount),
            description: description.trim(),
            project: parseInt(projectId),
            expense_date: expenseDate,
        };
        if (glAccount && !isMonthly) expenseData.gl_account = Number(glAccount.id);
        if (payee && payeeType === 'freelancer') expenseData.freelancer = Number(payee.id);
        if (payee && payeeType === 'employee') expenseData.employee = Number(payee.id);
        if (payee && payeeType === 'vendor') expenseData.vendor = Number(payee.id);
        if (notes.trim()) expenseData.notes = notes.trim();
        if (milestone && !isMonthly) expenseData.milestone = Number(milestone);
        if (linkedBill) expenseData.vendor_bill = Number(linkedBill.id);

        setIsSubmitting(true);
        try {
            await axiosInstance.post('expenses/', expenseData);
            toast.success('Expense added');
            if (onExpenseAdded) await onExpenseAdded();
            resetForm();
            onClose();
        } catch (error: any) {
            console.error('Expense creation error:', error);
            const data = error.response?.data;
            const fieldError = data && typeof data === 'object'
                ? ['expense_date', 'vendor_bill', 'milestone', 'amount', 'category', '__all__', 'non_field_errors']
                    .map((k) => (Array.isArray(data[k]) ? data[k][0] : data[k]))
                    .find((v) => typeof v === 'string')
                : undefined;
            toast.error(data?.message || data?.error || fieldError || 'Failed to create expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    const amt = parseFloat(amount);
    // The month the expense date counts in (T&M only)
    const selectedMonth = isMonthly ? monthForDate(months!, expenseDate) : null;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Add Expense"
            subtitle="Record a project expense"
            size="md"
            footer={(
                <DrawerFormFooter
                    summary={<>Expense amount: <span className="font-semibold text-gray-800 dark:text-gray-200">{(Number.isFinite(amt) ? amt : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>}
                    onCancel={onClose}
                    onSubmit={handleConfirm}
                    submitLabel="Add Expense"
                    isBusy={isSubmitting}
                />
            )}
        >
            <fieldset disabled={isSubmitting} className="space-y-4">
                {isMonthly && (
                    <div>
                        <label className={drawerLabelClass}>Month *</label>
                        <select
                            value={selectedMonth?.value ?? ''}
                            onChange={(e) => {
                                const m = months!.find((mo) => mo.value === e.target.value);
                                if (!m) return;
                                const today = todayIso();
                                setExpenseDate(today >= m.start && today <= m.end ? today : m.end);
                            }}
                            className={drawerInputClass}
                        >
                            {!selectedMonth && <option value="">Select month</option>}
                            {months!.map((m) => (
                                <option key={m.value} value={m.value} disabled={m.start > todayIso()}>
                                    {m.label}{m.start > todayIso() ? ' (not started)' : ''}
                                </option>
                            ))}
                        </select>
                        <FieldHint>Counts in this month's actual cost. Months run from the project's start date to its end date.</FieldHint>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={drawerLabelClass}>Expense Date *</label>
                        <input
                            type="date"
                            value={expenseDate}
                            min={selectedMonth?.start}
                            max={selectedMonth && selectedMonth.end < todayIso() ? selectedMonth.end : todayIso()}
                            onChange={(e) => setExpenseDate(e.target.value)}
                            className={`${drawerInputClass} ${errors.expenseDate ? drawerErrorBorder : ''}`}
                        />
                        <FieldError message={errors.expenseDate} />
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Category *</label>
                        <select
                            value={category}
                            onChange={(e) => { setCategory(e.target.value); setPayee(null); }}
                            className={`${drawerInputClass} ${errors.category ? drawerErrorBorder : ''}`}
                        >
                            <option value="">{categories.length ? 'Select category' : 'Loading...'}</option>
                            {categories.map((cat) => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                        </select>
                        <FieldError message={errors.category} />
                    </div>
                </div>

                {payeeType && (
                    <div>
                        <label className={drawerLabelClass}>{PAYEE_LABEL[payeeType]}</label>
                        <SearchableSelect
                            options={payeeOptions}
                            value={payee}
                            onChange={setPayee}
                            placeholder={`Search ${PAYEE_LABEL[payeeType].toLowerCase()}...`}
                            emptyMessage={`No ${PAYEE_LABEL[payeeType].toLowerCase()}s found`}
                        />
                        <FieldHint>Tags this as actual {PAYEE_LABEL[payeeType].toLowerCase()} cost for the project.</FieldHint>
                    </div>
                )}

                <DrawerSection>
                    <div>
                        <label className={drawerLabelClass}>Amount *</label>
                        <input
                            type="number" min={0} step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className={`${drawerInputClass} text-right tabular-nums ${errors.amount ? drawerErrorBorder : ''}`}
                        />
                        <FieldError message={errors.amount} />
                    </div>
                </DrawerSection>

                {!isMonthly && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={drawerLabelClass}>GL Account</label>
                        <SearchableSelect options={glAccountOptions} value={glAccount} onChange={setGlAccount} placeholder="Search account..." />
                        <FieldHint>Rolls up into the matching budget line.</FieldHint>
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Milestone</label>
                        <select value={milestone} onChange={(e) => setMilestone(e.target.value)} className={drawerInputClass}>
                            <option value="">No milestone</option>
                            {milestoneOptions.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                        </select>
                        <FieldHint>Counts in the milestone's Actual Cost.</FieldHint>
                    </div>
                </div>
                )}

                {billOptions.length > 0 && (
                    <div>
                        <label className={drawerLabelClass}>Linked Bill</label>
                        <SearchableSelect
                            options={billOptions}
                            value={linkedBill}
                            onChange={setLinkedBill}
                            placeholder="Select if this expense is for an existing bill..."
                        />
                        <FieldHint>Link it so the cost is counted only once (via the bill).</FieldHint>
                    </div>
                )}

                <div>
                    <label className={drawerLabelClass}>Description *</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What was this expense for?"
                        rows={3}
                        className={`${drawerInputClass} resize-none ${errors.description ? drawerErrorBorder : ''}`}
                    />
                    <FieldError message={errors.description} />
                </div>

                <div>
                    <label className={drawerLabelClass}>Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Additional notes (optional)"
                        rows={2}
                        className={`${drawerInputClass} resize-none`}
                    />
                </div>
            </fieldset>
        </Drawer>
    );
};
