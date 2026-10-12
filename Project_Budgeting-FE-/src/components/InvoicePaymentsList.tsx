/**
 * InvoicePaymentsList
 * An invoice's recorded payments with their confirmation status. Payments are
 * recorded manually, so each one starts "Pending Confirmation" and only counts
 * towards the invoice's Paid amount once it is confirmed (Completed). Users
 * allowed to (canConfirm) can confirm, mark processing/failed or cancel an
 * open payment here (POST invoices/payments/<id>/status/).
 */

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { StatusBadge } from './StatusBadge';
import type { InvoicePayment, InvoicePaymentStatus } from '../types/financials.types';
import { paymentStatusVariant } from '../utils/paymentStatus';

const OPEN_STATUSES: InvoicePaymentStatus[] = ['Pending', 'Processing'];

const n = (v: number | string | undefined | null) => Number(v) || 0;
const money = (v: number | string | undefined | null) =>
    `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const actionBtn = 'px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-50';

interface InvoicePaymentsListProps {
    payments: InvoicePayment[];
    /** Whether the current user may confirm / fail / cancel payments. */
    canConfirm?: boolean;
    /** Called after a payment's status changes (refetch the invoice). */
    onChanged?: () => void | Promise<void>;
}

export const InvoicePaymentsList: React.FC<InvoicePaymentsListProps> = ({ payments, canConfirm = false, onChanged }) => {
    const [busyId, setBusyId] = useState<number | null>(null);

    const changeStatus = async (payment: InvoicePayment, status: InvoicePaymentStatus) => {
        let note = '';
        if (status === 'Failed') {
            const reason = window.prompt('Why did this payment fail? (e.g. cheque bounced)');
            if (reason === null) return;
            if (!reason.trim()) {
                toast.error('Give a reason when marking a payment as failed');
                return;
            }
            note = reason.trim();
        } else if (status === 'Cancelled') {
            if (!window.confirm(`Cancel the ${money(payment.amount)} payment? It will not count towards the invoice.`)) return;
        } else if (status === 'Completed') {
            if (!window.confirm(`Confirm ${money(payment.amount)} has been received? It will be added to the invoice's paid amount.`)) return;
        }

        setBusyId(payment.id);
        try {
            const res = await axiosInstance.post(`invoices/payments/${payment.id}/status/`, { status, note });
            toast.success(res.data?.message || 'Payment updated');
            await onChanged?.();
        } catch (error) {
            console.error('Error updating payment status:', error);
            const response = (error as { response?: { status?: number; data?: { error?: string } } }).response;
            toast.error(
                response?.status === 403
                    ? "You don't have permission to confirm payments."
                    : response?.data?.error || 'Failed to update payment'
            );
        } finally {
            setBusyId(null);
        }
    };

    if (payments.length === 0) {
        return <p className="text-sm text-gray-500 dark:text-gray-400">No payments recorded yet.</p>;
    }

    return (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
            {payments.map((p) => {
                const status = (p.status || 'Completed') as InvoicePaymentStatus;
                const isOpen = OPEN_STATUSES.includes(status);
                const isVoid = status === 'Failed' || status === 'Cancelled';
                const busy = busyId === p.id;
                return (
                    <li key={p.id} className="px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-gray-900 dark:text-white">
                                    {fmtDate(p.payment_date)} · {p.payment_method_display || p.payment_method || '-'}
                                </p>
                                {(p.reference_no || p.notes) && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{[p.reference_no, p.notes].filter(Boolean).join(' · ')}</p>
                                )}
                                {p.status_note && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Note: {p.status_note}</p>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`tabular-nums font-medium ${status === 'Completed'
                                    ? 'text-green-600 dark:text-green-400'
                                    : isVoid ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
                                >
                                    {money(p.amount)}
                                </span>
                                <StatusBadge status={status} variant={paymentStatusVariant(status)} label={p.status_display || status} />
                            </div>
                        </div>
                        {isOpen && canConfirm && (
                            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                                <button type="button" disabled={busy} onClick={() => changeStatus(p, 'Completed')}
                                    className={`${actionBtn} border-teal-600 bg-teal-600 text-white hover:bg-teal-700`}>
                                    {busy ? 'Saving...' : 'Confirm received'}
                                </button>
                                {status === 'Pending' && (
                                    <button type="button" disabled={busy} onClick={() => changeStatus(p, 'Processing')}
                                        className={`${actionBtn} border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800`}>
                                        Mark processing
                                    </button>
                                )}
                                <button type="button" disabled={busy} onClick={() => changeStatus(p, 'Failed')}
                                    className={`${actionBtn} border-gray-300 text-red-600 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-500/10`}>
                                    Failed
                                </button>
                                <button type="button" disabled={busy} onClick={() => changeStatus(p, 'Cancelled')}
                                    className={`${actionBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800`}>
                                    Cancel
                                </button>
                            </div>
                        )}
                        {isOpen && !canConfirm && (
                            <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">Awaiting confirmation by finance</p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default InvoicePaymentsList;
