/**
 * Record Payment drawer
 * Records a payment received against an invoice (POST invoices/<id>/payment/).
 * Same props and payload as the old centred modal - only the presentation
 * moved to the shared side drawer, so it slides in like every other form.
 */

import React, { useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerSection, DrawerFormFooter } from './drawerForm';

interface RecordPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    invoiceData: {
        invoice_no: string;
        /** Balance still to be received - pre-fills the amount. */
        amount: string;
    };
    onPaymentRecorded?: (paymentData: PaymentData) => void;
}

export interface PaymentData {
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_no: string;
    notes: string;
}

const PAYMENT_METHODS = ['Bank Transfer', 'Cheque', 'Credit Card', 'Debit Card', 'Cash', 'UPI', 'Other'];

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cleanAmount = (v: string | number | undefined | null) => String(v ?? '').replace(/,/g, '');

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    invoiceData,
    onPaymentRecorded
}) => {
    const [paymentDate, setPaymentDate] = useState(todayIso());
    const [amount, setAmount] = useState(cleanAmount(invoiceData.amount));
    const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fresh form each time it opens, pre-filled with the current balance
    useEffect(() => {
        if (!isOpen) return;
        setPaymentDate(todayIso());
        setAmount(cleanAmount(invoiceData.amount));
        setPaymentMethod('Bank Transfer');
        setReferenceNo('');
        setNotes('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const balance = parseFloat(cleanAmount(invoiceData.amount));
    const amt = parseFloat(amount);

    const handleConfirm = async () => {
        if (Number.isNaN(amt) || amt <= 0) {
            toast.error('Amount must be greater than zero');
            return;
        }
        if (!paymentDate) {
            toast.error('Select a payment date');
            return;
        }
        const paymentData: PaymentData = {
            payment_date: paymentDate,
            amount: amt,
            payment_method: paymentMethod,
            reference_no: referenceNo,
            notes: notes
        };
        setIsSubmitting(true);
        try {
            const response = await axiosInstance.post(`invoices/${invoiceId}/payment/`, paymentData);
            toast.success(response.data?.message || 'Payment recorded successfully!');
            if (onPaymentRecorded) await onPaymentRecorded(paymentData);
            onClose();
        } catch (error: any) {
            console.error('Payment recording error:', error);
            toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to record payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Record Payment"
            subtitle={`Invoice ${invoiceData.invoice_no}`}
            size="md"
            footer={(
                <DrawerFormFooter
                    summary={Number.isFinite(balance) ? <>Balance due: <span className="font-semibold text-gray-800 dark:text-gray-200">{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></> : null}
                    onCancel={onClose}
                    onSubmit={handleConfirm}
                    submitLabel="Record Payment"
                    busyLabel="Recording..."
                    isBusy={isSubmitting}
                    submitDisabled={!amount || !(amt > 0)}
                />
            )}
        >
            <fieldset disabled={isSubmitting} className="space-y-4">
                <DrawerSection>
                    <div>
                        <label className={drawerLabelClass}>Amount *</label>
                        <input
                            type="number" min={0} step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className={`${drawerInputClass} text-right tabular-nums`}
                        />
                        {Number.isFinite(balance) && amt > balance && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Amount is more than the balance due.</p>
                        )}
                        <FieldHint>Pre-filled with the balance due.</FieldHint>
                    </div>
                </DrawerSection>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={drawerLabelClass}>Payment Date *</label>
                        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={drawerInputClass} />
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Payment Method</label>
                        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={drawerInputClass}>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className={drawerLabelClass}>Reference Number</label>
                    <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="TXN123456 (optional)" className={drawerInputClass} />
                </div>
                <div>
                    <label className={drawerLabelClass}>Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment received (optional)" rows={3} className={`${drawerInputClass} resize-none`} />
                </div>
            </fieldset>
        </Drawer>
    );
};
