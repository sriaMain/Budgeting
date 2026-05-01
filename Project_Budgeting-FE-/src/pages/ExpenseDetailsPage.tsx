import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, FileText, User, Tag, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface ExpenseDetails {
    id: number;
    expense_no: string;
    category: string;
    amount: string;
    description: string;
    expense_date: string;
    total_paid: number;
    balance_amount: number;
    is_fully_paid: boolean;
    project: number;
    vendor: string | null;
    created_by: number;
    created_at: string;
}

interface ExpenseDetailsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const ExpenseDetailsPage: React.FC<ExpenseDetailsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const { expenseId } = useParams<{ expenseId: string }>();
    const navigate = useNavigate();
    const [expenseDetails, setExpenseDetails] = useState<ExpenseDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    useEffect(() => {
        const fetchExpenseDetails = async () => {
            if (!expenseId) return;

            try {
                setLoading(true);
                const response = await axiosInstance.get(`/expenses/${expenseId}/`);
                console.log('Expense details response:', response.data);
                setExpenseDetails(response.data);
            } catch (error: any) {
                console.error('Error fetching expense details:', error);
                toast.error('Failed to load expense details');
            } finally {
                setLoading(false);
            }
        };

        fetchExpenseDetails();
    }, [expenseId]);

    const formatCurrency = (amount: number | string) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        return `₹${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

    const getCategoryLabel = (category: string) => {
        return category.charAt(0).toUpperCase() + category.slice(1);
    };

    const getPaymentStatusInfo = (expense: ExpenseDetails) => {
        if (expense.is_fully_paid) {
            return {
                label: 'Fully Paid',
                color: 'bg-green-100 text-green-800',
                icon: CheckCircle,
                iconColor: 'text-green-600'
            };
        } else if (expense.total_paid > 0) {
            return {
                label: 'Partially Paid',
                color: 'bg-yellow-100 text-yellow-800',
                icon: AlertCircle,
                iconColor: 'text-yellow-600'
            };
        } else {
            return {
                label: 'Unpaid',
                color: 'bg-red-100 text-red-800',
                icon: XCircle,
                iconColor: 'text-red-600'
            };
        }
    };

    const handleRecordPayment = async () => {
        if (!expenseDetails || !expenseId) return;

        // Validation
        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }

        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }

        try {
            setIsSubmittingPayment(true);

            const paymentData = {
                amount: parseFloat(paymentAmount),
                payment_method: paymentMethod,
                reference_number: referenceNumber || ''
            };

            console.log('Recording payment for expense:', expenseId);
            console.log('Payment data:', paymentData);

            const response = await axiosInstance.post(
                `/expenses/${expenseId}/payments/`,
                paymentData
            );

            console.log('Payment recorded:', response.data);
            
            toast.success(`Payment of ₹${paymentAmount} recorded successfully!`);

            // Close modal and reset form
            setIsRecordPaymentModalOpen(false);
            setPaymentAmount('');
            setPaymentMethod('');
            setReferenceNumber('');

            // Refetch expense details to update the display
            const expenseResponse = await axiosInstance.get(`/expenses/${expenseId}/`);
            setExpenseDetails(expenseResponse.data);

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

    if (!expenseDetails) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Expense Not Found</h2>
                        <p className="text-gray-600 mb-4">The expense you are looking for does not exist.</p>
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

    const paymentStatus = getPaymentStatusInfo(expenseDetails);
    const paymentPercentage = (expenseDetails.total_paid / parseFloat(expenseDetails.amount)) * 100;
    const StatusIcon = paymentStatus.icon;

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
                                <h1 className="text-2xl font-bold text-gray-900">{expenseDetails.expense_no}</h1>
                                <p className="text-sm text-gray-600 mt-1">Expense Details</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${paymentStatus.color}`}>
                            <StatusIcon className={`w-5 h-5 ${paymentStatus.iconColor}`} />
                            <span className="font-semibold">{paymentStatus.label}</span>
                        </div>
                    </div>

                    {/* Category Badge */}
                    <div className="flex items-center gap-3 mt-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg">
                            <Tag className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">{getCategoryLabel(expenseDetails.category)}</span>
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
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(expenseDetails.amount)}</p>
                    </div>

                    {/* Paid Amount Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-green-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">Paid Amount</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(expenseDetails.total_paid)}</p>
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

                    {/* Balance Amount Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-orange-600" />
                            </div>
                            <p className="text-sm text-gray-600 font-medium">Balance Amount</p>
                        </div>
                        <p className="text-2xl font-bold text-orange-600">{formatCurrency(expenseDetails.balance_amount)}</p>
                    </div>
                </div>

                {/* Expense Information */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">Expense Information</h2>
                    </div>

                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Description */}
                            <div className="md:col-span-2">
                                <div className="flex items-start gap-2">
                                    <FileText className="w-5 h-5 text-gray-400 mt-1" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-600 mb-1">Description</p>
                                        <p className="text-base text-gray-900">{expenseDetails.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Expense Date */}
                            <div>
                                <div className="flex items-start gap-2">
                                    <Calendar className="w-5 h-5 text-gray-400 mt-1" />
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Expense Date</p>
                                        <p className="text-base font-medium text-gray-900">
                                            {formatDate(expenseDetails.expense_date)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Created Date */}
                            <div>
                                <div className="flex items-start gap-2">
                                    <Calendar className="w-5 h-5 text-gray-400 mt-1" />
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Created On</p>
                                        <p className="text-base font-medium text-gray-900">
                                            {formatDateTime(expenseDetails.created_at)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Vendor */}
                            {expenseDetails.vendor && (
                                <div>
                                    <div className="flex items-start gap-2">
                                        <User className="w-5 h-5 text-gray-400 mt-1" />
                                        <div>
                                            <p className="text-sm text-gray-600 mb-1">Vendor</p>
                                            <p className="text-base font-medium text-gray-900">{expenseDetails.vendor}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Project ID */}
                            <div>
                                <div className="flex items-start gap-2">
                                    <FileText className="w-5 h-5 text-gray-400 mt-1" />
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Project ID</p>
                                        <p className="text-base font-medium text-gray-900">#{expenseDetails.project}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment Actions - Show only if not fully paid */}
                {!expenseDetails.is_fully_paid && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-blue-900 mb-2">Payment Required</h3>
                                <p className="text-sm text-blue-700">
                                    Outstanding balance: <span className="font-bold">{formatCurrency(expenseDetails.balance_amount)}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setIsRecordPaymentModalOpen(true)}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                            >
                                <DollarSign className="w-4 h-4" />
                                Record Payment
                            </button>
                        </div>
                    </div>
                )}

                {/* Record Payment Modal */}
                {isRecordPaymentModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Expense: {expenseDetails.expense_no} | Balance: {formatCurrency(expenseDetails.balance_amount)}
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
                                    {paymentAmount && parseFloat(paymentAmount) > expenseDetails.balance_amount && (
                                        <p className="text-xs text-orange-600 mt-1">
                                            Warning: Amount exceeds remaining balance
                                        </p>
                                    )}
                                </div>

                                {/* Payment Method Input */}
                                <div>
                                    <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Method <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        id="payment-method"
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={isSubmittingPayment}
                                    >
                                        <option value="">Select payment method</option>
                                        <option value="cash">Cash</option>
                                        <option value="bank_transfer">Bank Transfer</option>
                                        <option value="cheque">Cheque</option>
                                        <option value="upi">UPI</option>
                                        <option value="card">Card</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                {/* Reference Number Input */}
                                <div>
                                    <label htmlFor="reference-number" className="block text-sm font-medium text-gray-700 mb-2">
                                        Reference Number
                                    </label>
                                    <input
                                        id="reference-number"
                                        type="text"
                                        value={referenceNumber}
                                        onChange={(e) => setReferenceNumber(e.target.value)}
                                        placeholder="Enter reference number (optional)"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={isSubmittingPayment}
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setIsRecordPaymentModalOpen(false);
                                        setPaymentAmount('');
                                        setPaymentMethod('');
                                        setReferenceNumber('');
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

export default ExpenseDetailsPage;
