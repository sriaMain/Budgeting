/**
 * Create Bill drawer
 * Creates a standalone vendor bill (no purchase order) for a project.
 * Only amounts later paid against the bill count towards the project's
 * Actual Cost (and its GL budget line / milestone when tagged).
 *
 * Vendors come from /projects/poc-options/ - approved vendors only, and
 * available to any signed-in user (the vendor-onboarding admin list needs
 * the vendor.view permission, which left this dropdown empty for most users).
 *
 * Time & Material projects (`months` given) record the bill against a
 * project month instead of a GL Account / Milestone.
 */

import React, { useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { Drawer } from './Drawer';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import {
    drawerInputClass, drawerLabelClass, drawerErrorBorder, FieldError, FieldHint, DrawerSection, DrawerFormFooter,
} from './drawerForm';
import { monthForDate, type ProjectMonth } from '../utils/projectMonths';

interface CreateBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    currency?: string;
    /** T&M project months (start date to end date): record the bill against a month. */
    months?: ProjectMonth[];
    onBillCreated?: () => void;
}

const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toIso(new Date());
const plusDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toIso(d);
};

export const CreateBillModal: React.FC<CreateBillModalProps> = ({
    isOpen,
    onClose,
    projectId,
    currency = 'INR',
    months,
    onBillCreated
}) => {
    const isMonthly = !!months?.length;
    const [vendorOptions, setVendorOptions] = useState<SearchableSelectOption[]>([]);
    const [isLoadingVendors, setIsLoadingVendors] = useState(false);
    const [vendor, setVendor] = useState<SearchableSelectOption | null>(null);
    const [billNo, setBillNo] = useState('');
    const [amount, setAmount] = useState('');
    const [billDate, setBillDate] = useState(today());
    const [dueDate, setDueDate] = useState(plusDays(today(), 30));
    const [description, setDescription] = useState('');
    const [glOptions, setGlOptions] = useState<SearchableSelectOption[]>([]);
    const [glAccount, setGlAccount] = useState<SearchableSelectOption | null>(null);
    const [milestones, setMilestones] = useState<{ id: number; name: string }[]>([]);
    const [milestone, setMilestone] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setVendor(null);
        setBillNo('');
        setAmount('');
        setBillDate(today());
        setDueDate(plusDays(today(), 30));
        setDescription('');
        setGlAccount(null);
        setMilestone('');
        setErrors({});

        setIsLoadingVendors(true);
        axiosInstance.get<{ id: number; type: string; name: string; subtitle?: string }[]>('/projects/poc-options/')
            .then((res) => setVendorOptions((res.data || [])
                .filter((o) => o.type === 'vendor')
                .map((o) => ({ id: o.id, label: o.name, sublabel: o.subtitle || undefined }))))
            .catch((error) => {
                console.error('Error fetching vendors:', error);
                toast.error('Failed to load vendors');
            })
            .finally(() => setIsLoadingVendors(false));
        axiosInstance.get<{ id: number; code: string; name: string; account_type?: string }[]>('/gl-accounts/?active_only=true')
            .then((res) => setGlOptions((res.data || []).map((a) => ({ id: a.id, label: `${a.code} - ${a.name}`, sublabel: a.account_type }))))
            .catch((error) => console.error('Error fetching GL accounts:', error));
        axiosInstance.get<{ id: number; name: string }[]>(`/projects/${projectId}/milestones/`)
            .then((res) => setMilestones(res.data || []))
            .catch((error) => console.error('Error fetching milestones:', error));
    }, [isOpen, projectId]);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!vendor) e.vendor = 'Select a vendor.';
        const amt = parseFloat(amount);
        if (Number.isNaN(amt) || amt <= 0) e.amount = 'Amount must be greater than zero.';
        if (!billDate) e.billDate = 'Bill date is required.';
        if (dueDate && billDate && dueDate < billDate) e.dueDate = 'Due date cannot be before bill date.';
        if (isMonthly && billDate && (billDate < months![0].start || billDate > months![months!.length - 1].end)) {
            e.billDate = 'Pick a date within the project (start date to end date).';
        }
        return e;
    };

    const handleSubmit = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        setIsSubmitting(true);
        try {
            const response = await axiosInstance.post('/vendor-bills/', {
                project_id: projectId,
                vendor_id: vendor!.id,
                total_amount: parseFloat(amount),
                bill_no: billNo.trim() || undefined,
                bill_date: billDate,
                due_date: dueDate,
                description,
                gl_account_id: glAccount && !isMonthly ? glAccount.id : undefined,
                milestone_id: (!isMonthly && milestone) || undefined,
            });
            toast.success(`Bill ${response.data.bill_no} created`);
            onBillCreated?.();
            onClose();
        } catch (error: any) {
            console.error('Error creating bill:', error);
            toast.error(error.response?.data?.error || 'Failed to create bill');
        } finally {
            setIsSubmitting(false);
        }
    };

    const amt = parseFloat(amount);
    // The month the bill is recorded against (T&M only)
    const selectedMonth = isMonthly ? monthForDate(months!, billDate) : null;

    const selectMonth = (value: string) => {
        const m = months!.find((mo) => mo.value === value);
        if (!m) return;
        const t = today();
        const date = t >= m.start && t <= m.end ? t : m.start;
        setBillDate(date);
        setDueDate(plusDays(date, 30));
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Add Bill"
            subtitle="Record a vendor bill against this project"
            size="md"
            footer={(
                <DrawerFormFooter
                    summary={<>Bill amount: <span className="font-semibold text-gray-800 dark:text-gray-200">{(Number.isFinite(amt) ? amt : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span></>}
                    onCancel={onClose}
                    onSubmit={handleSubmit}
                    submitLabel="Add Bill"
                    isBusy={isSubmitting}
                />
            )}
        >
            <fieldset disabled={isSubmitting} className="space-y-4">
                <div>
                    <label className={drawerLabelClass}>Vendor *</label>
                    <SearchableSelect
                        options={vendorOptions}
                        value={vendor}
                        onChange={setVendor}
                        placeholder={isLoadingVendors ? 'Loading vendors...' : 'Search vendor...'}
                        emptyMessage={isLoadingVendors ? 'Loading...' : 'No approved vendors found'}
                    />
                    <FieldError message={errors.vendor} />
                    <FieldHint>Approved vendors only.</FieldHint>
                </div>

                {isMonthly && (
                    <div>
                        <label className={drawerLabelClass}>Month *</label>
                        <select value={selectedMonth?.value ?? ''} onChange={(e) => selectMonth(e.target.value)} className={drawerInputClass}>
                            {!selectedMonth && <option value="">Select month</option>}
                            {months!.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <FieldHint>Months run from the project's start date to its end date. The paid amount counts in the actual cost of the month it is paid.</FieldHint>
                    </div>
                )}

                <DrawerSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={drawerLabelClass}>Amount ({currency}) *</label>
                            <input
                                type="number" min={0} step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className={`${drawerInputClass} text-right tabular-nums ${errors.amount ? drawerErrorBorder : ''}`}
                            />
                            <FieldError message={errors.amount} />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Bill No</label>
                            <input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Auto-generated" className={drawerInputClass} />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Bill Date *</label>
                            <input type="date" value={billDate} min={selectedMonth?.start} max={selectedMonth?.end} onChange={(e) => setBillDate(e.target.value)} className={`${drawerInputClass} ${errors.billDate ? drawerErrorBorder : ''}`} />
                            <FieldError message={errors.billDate} />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Due Date</label>
                            <input type="date" value={dueDate} min={billDate || undefined} onChange={(e) => setDueDate(e.target.value)} className={`${drawerInputClass} ${errors.dueDate ? drawerErrorBorder : ''}`} />
                            <FieldError message={errors.dueDate} />
                        </div>
                    </div>
                </DrawerSection>

                {!isMonthly && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={drawerLabelClass}>GL Account</label>
                            <SearchableSelect options={glOptions} value={glAccount} onChange={setGlAccount} placeholder="Search account..." />
                        </div>
                        <div>
                            <label className={drawerLabelClass}>Milestone</label>
                            <select value={milestone} onChange={(e) => setMilestone(e.target.value)} className={drawerInputClass}>
                                <option value="">No milestone</option>
                                {milestones.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                <div>
                    <label className={drawerLabelClass}>Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is this bill for? (optional)"
                        rows={3}
                        className={`${drawerInputClass} resize-none`}
                    />
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {isMonthly
                        ? "Only the amount paid against this bill counts toward the project's Actual Cost, in the month it is paid."
                        : "Only the amount paid against this bill counts toward the project's Actual Cost — and toward the selected GL budget line and milestone."}
                </p>
            </fieldset>
        </Drawer>
    );
};
