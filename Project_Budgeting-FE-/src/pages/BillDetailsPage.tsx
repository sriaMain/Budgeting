import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, FileText, User, CreditCard } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface Payment {
    id: number;
    bill_no: string;
    vendor: string;
    amount: number;
    payment_method: string;
    reference_no: string;
    payment_date: string;
    created_at: string;
}

interface BillDetails {
    bill_id: number;
    bill_no: string;
    vendor: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    count: number;
    payments: Payment[];
}

interface BillDetailsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const BillDetailsPage: React.FC<BillDetailsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const { billId } = useParams<{ billId: string }>();
    const navigate = useNavigate();
    const [billDetails, setBillDetails] = useState<BillDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    useEffect(() => {
        const fetchBillDetails = async () => {
            if (!billId) return;

            try {
                setLoading(true);
                // The billId from URL params could be either bill_no or bill_id
                // Try to fetch using the billId directly first
                // If it's a bill_no (like "BILL-PO-39-9"), we need to extract or use it differently
                // For now, we'll assume the API can handle bill_no or we pass the numeric ID
                
                // If billId contains non-numeric characters, it's likely a bill_no
                // We'll need to fetch all bills and find the matching one, or use a different endpoint
                
                // For simplicity, let's try the direct approach first
                const response = await axiosInstance.get(`/vendor-bills/${billId}/payments/list/`);
                console.log('Bill details response:', response.data);
                setBillDetails(response.data);
            } catch (error: any) {
                console.error('Error fetching bill details:', error);
                
                // If the direct approach fails and billId looks like a bill_no, 
                // we might need to search for the bill first
                if (error.response?.status === 404 && billId.includes('-')) {
                    toast.error('Bill not found. Please try again.');
                } else {
                    toast.error('Failed to load bill details');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchBillDetails();
    }, [billId]);

    const formatCurrency = (amount: number) => {
        return `₹${parseFloat(amount.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getPaymentMethodBadgeColor = (method: string) => {
        if (method.toLowerCase().includes('paid')) {
            return 'bg-green-100 text-green-800';
        } else if (method.toLowerCase().includes('partial')) {
            return 'bg-yellow-100 text-yellow-800';
        }
        return 'bg-gray-100 text-gray-800';
    };

    const handleRecordPayment = async () => {
        if (!billDetails) return;

        // Validation
        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }

        if (!paymentDate) {
            toast.error('Please select a payment date');
            return;
        }

        try {
            setIsSubmittingPayment(true);

            const paymentData = {
                amount: parseFloat(paymentAmount),
                payment_date: paymentDate,
                payment_method: 'partially_paid'
            };

            const response = await axiosInstance.post(
                `/vendor-bills/${billDetails.bill_id}/payments/`,
                paymentData
            );

            console.log('Payment recorded:', response.data);
            
            toast.success(`Payment of ₹${paymentAmount} recorded successfully!`);

            // Close modal and reset form
            setIsRecordPaymentModalOpen(false);
            setPaymentAmount('');
            setPaymentDate(new Date().toISOString().split('T')[0]);

            // Refetch bill details to update the payment list
            const billResponse = await axiosInstance.get(`/vendor-bills/${billId}/payments/list/`);
            setBillDetails(billResponse.data);

        } catch (error: any) {
            console.error('Error recording payment:', error);
            toast.error(error.response?.data?.error || 'Failed to record payment');
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    if (loading) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </Layout>
        );
    }

    if (!billDetails) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Bill Not Found</h2>
                        <p className="text-gray-600 mb-4">The bill you are looking for does not exist.</p>
                        <button
                            onClick={() => navigate(-1)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </Layout>
        );
    }

    const paymentPercentage = (billDetails.paid_amount / billDetails.total_amount) * 100;

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{billDetails.bill_no}</h1>
                                <p className="text-sm text-gray-600 mt-1">Bill Payment Details</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsRecordPaymentModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                        >
                            <DollarSign className="w-4 h-4" />
                            Record Payment
                        </button>
                    </div>

                    {/* Vendor Information */}
                    <div className="flex items-center gap-3 mt-4 p-4 bg-gray-50 rounded-lg">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 font-medium">Vendor</p>
                            <p className="text-base text-gray-900 font-semibold">{billDetails.vendor}</p>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Total Amount Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <FileText className="w-5 h-5 text-blue-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">Total Amount</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(billDetails.total_amount)}</p>
                    </div>

                    {/* Paid Amount Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-green-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">Paid Amount</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(billDetails.paid_amount)}</p>
                        <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                <span>Payment Progress</span>
                                <span>{paymentPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(paymentPercentage, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* Remaining Amount Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-orange-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">Remaining Amount</p>
                        </div>
                        <p className="text-2xl font-bold text-orange-600">{formatCurrency(billDetails.remaining_amount)}</p>
                    </div>
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                {billDetails.count} {billDetails.count === 1 ? 'Payment' : 'Payments'}
                            </span>
                        </div>
                    </div>

                    <div className="p-6">
                        {billDetails.payments.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-500">No payments recorded for this bill</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {billDetails.payments.map((payment, index) => (
                                    <div
                                        key={payment.id}
                                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
                                                        #{index + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-gray-600">Payment ID</p>
                                                        <p className="text-base font-semibold text-gray-900">{payment.id}</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                    {/* Amount */}
                                                    <div className="flex items-start gap-2">
                                                        <DollarSign className="w-4 h-4 text-gray-400 mt-1" />
                                                        <div>
                                                            <p className="text-xs text-gray-600">Amount</p>
                                                            <p className="text-sm font-semibold text-gray-900">
                                                                {formatCurrency(payment.amount)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Payment Method */}
                                                    <div className="flex items-start gap-2">
                                                        <CreditCard className="w-4 h-4 text-gray-400 mt-1" />
                                                        <div>
                                                            <p className="text-xs text-gray-600">Payment Method</p>
                                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodBadgeColor(payment.payment_method)}`}>
                                                                {payment.payment_method}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Payment Date */}
                                                    <div className="flex items-start gap-2">
                                                        <Calendar className="w-4 h-4 text-gray-400 mt-1" />
                                                        <div>
                                                            <p className="text-xs text-gray-600">Payment Date</p>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {formatDate(payment.payment_date)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Reference Number */}
                                                    <div className="flex items-start gap-2">
                                                        <FileText className="w-4 h-4 text-gray-400 mt-1" />
                                                        <div>
                                                            <p className="text-xs text-gray-600">Reference No.</p>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {payment.reference_no || 'N/A'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Created At */}
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                    <p className="text-xs text-gray-500">
                                                        Created on {formatDateTime(payment.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Record Payment Modal */}
                {isRecordPaymentModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Bill: {billDetails.bill_no} | Remaining: {formatCurrency(billDetails.remaining_amount)}
                                </p>
                            </div>

                            {/* Modal Body */}
                            <div className="px-6 py-4 space-y-4">
                                {/* Amount Input */}
                                <div>
                                    <label htmlFor="payment-amount" className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Amount <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                                        <input
                                            id="payment-amount"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={paymentAmount}
                                            onChange={(e) => setPaymentAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            disabled={isSubmittingPayment}
                                        />
                                    </div>
                                    {paymentAmount && parseFloat(paymentAmount) > billDetails.remaining_amount && (
                                        <p className="text-xs text-orange-600 mt-1">
                                            Warning: Amount exceeds remaining balance
                                        </p>
                                    )}
                                </div>

                                {/* Payment Date Input */}
                                <div>
                                    <label htmlFor="payment-date" className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="payment-date"
                                        type="date"
                                        value={paymentDate}
                                        onChange={(e) => setPaymentDate(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={isSubmittingPayment}
                                    />
                                </div>

                                {/* Payment Method Info */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-xs text-blue-800">
                                        <strong>Payment Method:</strong> Partially Paid
                                    </p>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setIsRecordPaymentModalOpen(false);
                                        setPaymentAmount('');
                                        setPaymentDate(new Date().toISOString().split('T')[0]);
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                    disabled={isSubmittingPayment}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRecordPayment}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    disabled={isSubmittingPayment}
                                >
                                    {isSubmittingPayment ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Recording...
                                        </>
                                    ) : (
                                        <>
                                            <DollarSign className="w-4 h-4" />
                                            Record Payment
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default BillDetailsPage;
