/**
 * ExpenseDrawer
 * An expense's details in a side drawer, opened from the project page instead
 * of navigating to /expenses/<id>: amounts, details, payments and a Record
 * Payment form that opens on top as its own drawer. Same endpoints and
 * payload as ExpenseDetailsPage.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';

interface ExpenseDrawerProps {
    /** Expense to show; null keeps the drawer closed. */
    expenseId: number | string | null;
    onClose: () => void;
    /** Called after a payment is recorded. */
    onChanged?: () => void;
}

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' },
];

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const label = (v?: string | null) => (v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');

const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label: l, value, tone }) => (
    <div className="min-w-0">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{l}</dt>
        <dd className={`mt-0.5 text-base font-semibold tabular-nums ${tone || 'text-gray-900 dark:text-white'}`}>{value}</dd>
    </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label: l, children, wide }) => (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
        <dt className="text-xs text-gray-500 dark:text-gray-400">{l}</dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white break-words">{children}</dd>
    </div>
);

export const ExpenseDrawer: React.FC<ExpenseDrawerProps> = ({ expenseId, onClose, onChanged }) => {
    const [expense, setExpense] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Record payment
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchExpense = useCallback(async () => {
        if (expenseId == null) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get(`/expenses/${expenseId}/`);
            setExpense(res.data);
        } catch (error) {
            console.error('Error fetching expense:', error);
            toast.error('Failed to load expense details');
        } finally {
            setIsLoading(false);
        }
    }, [expenseId]);

    useEffect(() => {
        setExpense(null);
        setIsPaymentOpen(false);
        fetchExpense();
    }, [fetchExpense]);

    const openPayment = () => {
        setPaymentAmount(String(n(expense?.balance_amount)));
        setPaymentMethod('');
        setReferenceNumber('');
        setIsPaymentOpen(true);
    };

    const recordPayment = async () => {
        const amount = parseFloat(paymentAmount);
        if (Number.isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }
        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/expenses/${expenseId}/payments/`, {
                amount,
                payment_method: paymentMethod,
                reference_number: referenceNumber || '',
            });
            toast.success(`Payment of ${money(amount)} recorded`);
            setIsPaymentOpen(false);
            await fetchExpense();
            onChanged?.();
        } catch (error: any) {
            console.error('Error recording expense payment:', error);
            toast.error(error.response?.data?.error || 'Failed to record payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const total = n(expense?.amount);
    const paid = n(expense?.total_paid);
    const balance = n(expense?.balance_amount);
    const paidPct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
    const status = expense?.is_fully_paid ? 'Fully Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid';
    const statusCls = expense?.is_fully_paid
        ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
        : paid > 0
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
    const payments: any[] = Array.isArray(expense?.payments) ? expense.payments : [];
    const payee = expense?.vendor_name || expense?.freelancer_name || expense?.employee_name;
    const amt = parseFloat(paymentAmount);

    return (
        <>
            <Drawer
                isOpen={expenseId != null}
                onClose={onClose}
                title={expense ? `Expense ${expense.expense_no}` : 'Expense'}
                subtitle={expense?.description || undefined}
                size="lg"
                footer={expense && !expense.is_fully_paid ? (
                    <button type="button" onClick={openPayment} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                        Record Payment
                    </button>
                ) : undefined}
            >
                {isLoading && !expense ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading expense...</p>
                ) : !expense ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Expense not found.</p>
                ) : (
                    <div className="space-y-6">
                        <section>
                            <span className={`inline-block mb-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>{status}</span>
                            <dl className="grid grid-cols-3 gap-4">
                                <Stat label="Total Amount" value={money(total)} />
                                <Stat label="Paid" value={money(paid)} tone="text-green-600 dark:text-green-400" />
                                <Stat label="Balance" value={money(balance)} tone={balance > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
                            </dl>
                            <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div className="bg-green-600 h-2 rounded-full" style={{ width: `${paidPct}%` }} />
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">Details</h4>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <Field label="Description" wide>{expense.description || '-'}</Field>
                                <Field label="Category">{label(expense.category)}</Field>
                                <Field label="Expense Date">{fmtDate(expense.expense_date)}</Field>
                                {payee && <Field label="Payee">{payee}</Field>}
                                {expense.vendor_bill_no && <Field label="Linked Bill">{expense.vendor_bill_no}</Field>}
                                {expense.milestone_name && <Field label="Milestone">{expense.milestone_name}</Field>}
                                {expense.notes && <Field label="Notes" wide>{expense.notes}</Field>}
                            </dl>
                        </section>

                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                                Payments <span className="font-normal normal-case tracking-normal text-gray-500">({payments.length})</span>
                            </h4>
                            {payments.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No payments recorded yet.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
                                    {payments.map((p) => (
                                        <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <p className="text-gray-900 dark:text-white">{fmtDate(p.payment_date)} · {label(p.payment_method)}</p>
                                                {p.reference_no && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.reference_no}</p>}
                                            </div>
                                            <span className="tabular-nums font-medium text-gray-900 dark:text-white">{money(p.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </Drawer>

            <Drawer
                isOpen={isPaymentOpen && !!expense}
                onClose={() => setIsPaymentOpen(false)}
                title="Record Payment"
                subtitle={expense ? `Expense ${expense.expense_no}` : undefined}
                size="md"
                footer={(
                    <DrawerFormFooter
                        summary={<>Balance: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(balance)}</span></>}
                        onCancel={() => setIsPaymentOpen(false)}
                        onSubmit={recordPayment}
                        submitLabel="Record Payment"
                        busyLabel="Recording..."
                        isBusy={isSubmitting}
                    />
                )}
            >
                <fieldset disabled={isSubmitting} className="space-y-4">
                    <DrawerSection>
                        <div>
                            <label className={drawerLabelClass}>Payment Amount *</label>
                            <input
                                type="number" min={0} step="0.01"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder="0.00"
                                className={`${drawerInputClass} text-right tabular-nums`}
                            />
                            {amt > balance && (
                                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Amount is more than the balance.</p>
                            )}
                            <FieldHint>Pre-filled with the balance.</FieldHint>
                        </div>
                    </DrawerSection>
                    <div>
                        <label className={drawerLabelClass}>Payment Method *</label>
                        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={drawerInputClass}>
                            <option value="">Select payment method</option>
                            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Reference Number</label>
                        <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional" className={drawerInputClass} />
                    </div>
                </fieldset>
            </Drawer>
        </>
    );
};

export default ExpenseDrawer;
