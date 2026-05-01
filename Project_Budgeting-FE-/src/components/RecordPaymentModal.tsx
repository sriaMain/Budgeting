/**
 * Record Payment Modal
 * Industry-standard modal for recording invoice payments
 */

import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { Button } from './Button';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface RecordPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    invoiceData: {
        invoice_no: string;
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

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    invoiceData,
    onPaymentRecorded
}) => {
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState(invoiceData.amount.replace(/,/g, ''));
    const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);

        const paymentData: PaymentData = {
            payment_date: paymentDate,
            amount: parseFloat(amount),
            payment_method: paymentMethod,
            reference_no: referenceNo,
            notes: notes
        };

        console.log('=== Recording Payment ===');
        console.log('Invoice ID:', invoiceId);
        console.log('Payment Data:', paymentData);

        try {
            // Make API call to record payment
            console.log('Making API call to:', `invoices/${invoiceId}/payment/`);
            const response = await axiosInstance.post(
                `invoices/${invoiceId}/payment/`,
                paymentData
            );

            console.log('API Response Status:', response.status);
            console.log('API Response Data:', response.data);

            if (response.status === 200 || response.status === 201) {
                toast.success(response.data.message || 'Payment recorded successfully!');

                console.log('Payment recorded successfully, calling callback...');
                // Call the callback if provided
                if (onPaymentRecorded) {
                    await onPaymentRecorded(paymentData);
                }

                console.log('Closing modal...');
                onClose();
            }
        } catch (error: any) {
            console.error('=== Payment Recording Error ===');
            console.error('Error:', error);
            console.error('Error Response:', error.response);
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Failed to record payment';
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-50 flex items-center justify-center p-4"

            onClick={handleBackdropClick}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between rounded-t-2xl">
                    <h2 className="text-xl font-bold text-gray-900">
                        Record Payment for Invoice
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={20} className="text-gray-600" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-5">
                    {/* Payment Date */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Payment Date
                        </label>
                        <div className="relative">
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="w-full px-4 py-3 pr-12 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            />
                            <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Amount
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Payment Method */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Payment Method
                        </label>
                        <div className="relative">
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                            >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Credit Card">Credit Card</option>
                                <option value="Debit Card">Debit Card</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Other">Other</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Reference Number */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Reference Number (Optional)
                        </label>
                        <input
                            type="text"
                            value={referenceNo}
                            onChange={(e) => setReferenceNo(e.target.value)}
                            placeholder="TXN123456"
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Payment received"
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row justify-end gap-3 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors text-gray-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <Button
                        onClick={handleConfirm}
                        isLoading={isSubmitting}
                        disabled={!amount || parseFloat(amount) <= 0}
                        className="w-full sm:w-auto px-8"
                    >
                        Confirm
                    </Button>
                </div>
            </div>
        </div>
    );
};

