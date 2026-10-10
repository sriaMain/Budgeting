/**
 * BillDrawer
 * A vendor bill's payment details in a side drawer, opened from the project
 * page instead of navigating to /bills/<id>: totals, payment history and a
 * Record Payment form that opens on top as its own drawer. Same endpoints
 * and payload as BillDetailsPage.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';

interface BillPayment {
    id: number;
    amount: number;
    payment_method: string;
    reference_no: string;
    payment_date: string;
}

interface BillDetails {
    bill_id: number;
    bill_no: string;
    vendor: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    count: number;
    payments: BillPayment[];
}

interface BillDrawerProps {
    /** Bill to show; null keeps the drawer closed. */
    billId: number | string | null;
    onClose: () => void;
    /** Called after a payment is recorded. */
    onChanged?: () => void;
}

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
    <div className="min-w-0">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className={`mt-0.5 text-base font-semibold tabular-nums ${tone || 'text-gray-900 dark:text-white'}`}>{value}</dd>
    </div>
);

export const BillDrawer: React.FC<BillDrawerProps> = ({ billId, onClose, onChanged }) => {
    const [bill, setBill] = useState<BillDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Record payment
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(todayIso());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchBill = useCallback(async () => {
        if (billId == null) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<BillDetails>(`/vendor-bills/${billId}/payments/list/`);
            setBill(res.data);
        } catch (error) {
            console.error('Error fetching bill:', error);
            toast.error('Failed to load bill details');
        } finally {
            setIsLoading(false);
        }
    }, [billId]);

    useEffect(() => {
        setBill(null);
        setIsPaymentOpen(false);
        fetchBill();
    }, [fetchBill]);

    const openPayment = () => {
        setPaymentAmount(String(n(bill?.remaining_amount)));
        setPaymentDate(todayIso());
        setIsPaymentOpen(true);
    };

    const recordPayment = async () => {
        if (!bill) return;
        const amount = parseFloat(paymentAmount);
        if (Number.isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }
        if (!paymentDate) {
            toast.error('Please select a payment date');
            return;
        }
        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/vendor-bills/${bill.bill_id}/payments/`, {
                amount,
                payment_date: paymentDate,
                payment_method: 'partially_paid',
            });
            toast.success(`Payment of ${money(amount)} recorded`);
            setIsPaymentOpen(false);
            await fetchBill();
            onChanged?.();
        } catch (error: any) {
            console.error('Error recording bill payment:', error);
            toast.error(error.response?.data?.error || 'Failed to record payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const paidPct = bill && n(bill.total_amount) > 0 ? Math.min((n(bill.paid_amount) / n(bill.total_amount)) * 100, 100) : 0;
    const amt = parseFloat(paymentAmount);

    return (
        <>
            <Drawer
                isOpen={billId != null}
                onClose={onClose}
                title={bill ? `Bill ${bill.bill_no}` : 'Bill'}
                subtitle={bill?.vendor || undefined}
                size="lg"
                footer={bill && n(bill.remaining_amount) > 0 ? (
                    <button type="button" onClick={openPayment} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                        Record Payment
                    </button>
                ) : undefined}
            >
                {isLoading && !bill ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading bill...</p>
                ) : !bill ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Bill not found.</p>
                ) : (
                    <div className="space-y-6">
                        <section>
                            <dl className="grid grid-cols-3 gap-4">
                                <Stat label="Total Amount" value={money(bill.total_amount)} />
                                <Stat label="Paid" value={money(bill.paid_amount)} tone="text-green-600 dark:text-green-400" />
                                <Stat label="Remaining" value={money(bill.remaining_amount)} tone={n(bill.remaining_amount) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
                            </dl>
                            <div className="mt-3">
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    <span>Payment progress</span>
                                    <span>{paidPct.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div className="bg-green-600 h-2 rounded-full" style={{ width: `${paidPct}%` }} />
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                                Payment History <span className="font-normal normal-case tracking-normal text-gray-500">({bill.count})</span>
                            </h4>
                            {bill.payments.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No payments recorded for this bill.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
                                    {bill.payments.map((p) => (
                                        <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <p className="text-gray-900 dark:text-white">{fmtDate(p.payment_date)}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    {[p.payment_method, p.reference_no].filter(Boolean).join(' · ') || '-'}
                                                </p>
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
                isOpen={isPaymentOpen && !!bill}
                onClose={() => setIsPaymentOpen(false)}
                title="Record Payment"
                subtitle={bill ? `Bill ${bill.bill_no}` : undefined}
                size="md"
                footer={(
                    <DrawerFormFooter
                        summary={bill ? <>Remaining: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(bill.remaining_amount)}</span></> : null}
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
                            {bill && amt > n(bill.remaining_amount) && (
                                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Amount is more than the remaining balance.</p>
                            )}
                            <FieldHint>Pre-filled with the remaining balance.</FieldHint>
                        </div>
                    </DrawerSection>
                    <div>
                        <label className={drawerLabelClass}>Payment Date *</label>
                        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={drawerInputClass} />
                        <FieldHint>The paid amount counts in the project's actual cost on this date.</FieldHint>
                    </div>
                </fieldset>
            </Drawer>
        </>
    );
};

export default BillDrawer;
