/**
 * Invoice Details Screen (Screen 3)
 * Display invoice with status management and payment recording
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, FileText, Share2, Send, ArrowLeft, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { RecordPaymentModal, type PaymentData } from '../components/RecordPaymentModal';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useInvoiceStatusChoices } from '../hooks/useInvoiceStatusChoices';

interface InvoiceDetailsScreenProps {
    userRole?: 'admin' | 'user' | 'manager';
    currentPage?: string;
    onNavigate?: (page: string) => void;
}

interface ProductRow {
    id: string;
    product_group: string;
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: string;
    amount: string;
}

export default function InvoiceDetailsScreen({
    userRole = 'admin',
    currentPage = 'projects',
    onNavigate = () => { }
}: InvoiceDetailsScreenProps) {
    const { invoiceId } = useParams<{ invoiceId: string }>();
    const navigate = useNavigate();
    const { statusChoices, loading: statusLoading } = useInvoiceStatusChoices();
    const [status, setStatus] = useState<string>('Unpaid');
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [invoiceData, setInvoiceData] = useState<any>(null);
    const [productRows, setProductRows] = useState<ProductRow[]>([]);
    const [totals, setTotals] = useState<any>({});
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Fetch invoice data - extracted as reusable function
    const fetchInvoiceData = async () => {
        if (!invoiceId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const response = await axiosInstance.get(`invoices/${invoiceId}/`);
            const data = response.data;

            console.log('Fetched invoice data:', data);

            setInvoiceData(data);
            setStatus(data.status_display || 'Unpaid');

            // Map items to product rows
            if (data.items && Array.isArray(data.items)) {
                const rows: ProductRow[] = data.items.map((item: any) => ({
                    id: item.id.toString(),
                    product_group: 'Service',
                    product_name: item.product_service || 'Product',
                    quantity: parseFloat(item.quantity || '0'),
                    unit: item.unit || 'hr',
                    unit_price: parseFloat(item.price_per_unit || '0').toLocaleString('en-IN'),
                    amount: parseFloat(item.amount || '0').toLocaleString('en-IN')
                }));
                setProductRows(rows);
            }

            // Set totals
            setTotals({
                subtotal: parseFloat(data.sub_total || '0').toLocaleString('en-IN'),
                total: parseFloat(data.total_amount || '0').toLocaleString('en-IN'),
                tax: parseFloat(data.tax_amount || '0').toLocaleString('en-IN'),
                in_house: parseFloat(data.sub_total || '0').toLocaleString('en-IN'),
                out_sourced: '0.00',
                invoiced_sum: parseFloat(data.paid_amount || '0').toLocaleString('en-IN'),
                to_be_voiced: parseFloat(data.balance_amount || '0').toLocaleString('en-IN')
            });
        } catch (error) {
            console.error('Error fetching invoice data:', error);
            toast.error('Failed to load invoice data');
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch invoice data when component mounts
    useEffect(() => {
        fetchInvoiceData();
    }, [invoiceId]);

    // Handle back button - navigate to project finances tab
    const handleBack = () => {
        const projectId = invoiceData?.project?.id;
        if (projectId) {
            navigate(`/projects/${projectId}?tab=finances`);
        } else {
            navigate(-1); // Fallback
        }
    };

    const getStatusColor = (status: string) => {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('paid') && !statusLower.includes('partially')) {
            return 'bg-green-100 text-green-700 border-green-200';
        } else if (statusLower.includes('issued') || statusLower.includes('sent')) {
            return 'bg-blue-100 text-blue-700 border-blue-200';
        } else if (statusLower.includes('draft') || statusLower.includes('unpaid')) {
            return 'bg-red-100 text-red-700 border-red-200';
        } else if (statusLower.includes('overdue')) {
            return 'bg-orange-100 text-orange-700 border-orange-200';
        } else if (statusLower.includes('partially')) {
            return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        } else if (statusLower.includes('cancel')) {
            return 'bg-gray-100 text-gray-700 border-gray-200';
        }
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!invoiceId || !invoiceData) return;

        try {
            setIsActionLoading(true);

            // Prepare the complete invoice data for PUT request
            const updateData = {
                status: newStatus,
                client: invoiceData.client,
                quote: invoiceData.quote,
                issue_date: invoiceData.issue_date,
                due_date: invoiceData.due_date,
                sub_total: invoiceData.sub_total,
                tax_percentage: invoiceData.tax_percentage,
                tax_amount: invoiceData.tax_amount,
                discount_amount: invoiceData.discount_amount,
                total_amount: invoiceData.total_amount,
                notes: invoiceData.notes || '',
                terms_conditions: invoiceData.terms_conditions || '',
                items: invoiceData.items.map((item: any) => ({
                    product_service: item.product_service_id,
                    description: item.description || '',
                    quantity: item.quantity,
                    unit: item.unit,
                    price_per_unit: item.price_per_unit,
                    discount_percentage: item.discount_percentage || '0.00',
                    amount: item.amount
                }))
            };

            // Send PUT request to update status
            const response = await axiosInstance.put(`/invoices/${invoiceId}/`, updateData);

            // Update local state with the response
            setStatus(response.data.status_display || newStatus);
            setShowStatusDropdown(false);

            // Refetch invoice data to ensure everything is in sync
            await fetchInvoiceData();

            toast.success(`Invoice status updated to ${newStatus}`);
        } catch (error) {
            console.error('Error updating invoice status:', error);
            toast.error('Failed to update invoice status');
            // Revert to previous status on error
            setShowStatusDropdown(false);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleSaveChanges = async () => {
        if (!invoiceId || !invoiceData) return;

        try {
            setIsActionLoading(true);

            // Prepare the complete invoice data for PUT request using invoiceData directly
            const updateData = {
                status: invoiceData.status,
                client: invoiceData.client,
                quote: invoiceData.quote,
                issue_date: invoiceData.issue_date,
                due_date: invoiceData.due_date,
                sub_total: invoiceData.sub_total,
                tax_percentage: invoiceData.tax_percentage,
                tax_amount: invoiceData.tax_amount,
                discount_amount: invoiceData.discount_amount,
                total_amount: invoiceData.total_amount,
                notes: invoiceData.notes || '',
                terms_conditions: invoiceData.terms_conditions || '',
                items: invoiceData.items.map((item: any) => ({
                    product_service: item.product_service_id || item.id,
                    description: item.description || '',
                    quantity: item.quantity.toString(),
                    unit: item.unit,
                    price_per_unit: item.price_per_unit,
                    discount_percentage: item.discount_percentage || '0.00',
                    amount: item.amount
                }))
            };

            console.log('Sending PUT request with data:', updateData);

            // Send PUT request to update invoice - ONLY ONCE
            await axiosInstance.put(`/invoices/${invoiceId}/`, updateData);

            // Refetch invoice data to show updated values
            await fetchInvoiceData();

            toast.success('Invoice updated successfully!');
            setIsEditMode(false);
        } catch (error) {
            console.error('Error updating invoice:', error);
            toast.error('Failed to update invoice');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handlePaymentRecorded = async (paymentData: PaymentData) => {
        console.log('=== Payment Callback Triggered ===');
        console.log('Payment Data:', paymentData);
        console.log('Refetching invoice data...');

        // Payment was already recorded by the modal
        // Refetch invoice data to show updated payment information
        await fetchInvoiceData();

        console.log('Invoice data refetched successfully!');
    };

    const handleSendEmail = async () => {
        if (!invoiceId) return;

        try {
            setIsActionLoading(true);
            await axiosInstance.post(`/invoices/${invoiceId}/send-email/`);
            toast.success('Invoice sent successfully via email');
        } catch (error) {
            console.error('Error sending invoice email:', error);
            toast.error('Failed to send invoice email');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!invoiceId) return;

        const confirmDelete = window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.');
        if (!confirmDelete) return;

        try {
            setIsActionLoading(true);
            await axiosInstance.delete(`/invoices/${invoiceId}/`);
            toast.success('Invoice deleted successfully');

            // Navigate to pipeline page
            navigate('/pipeline');
        } catch (error) {
            console.error('Error deleting invoice:', error);
            toast.error('Failed to delete invoice');
        } finally {
            setIsActionLoading(false);
        }
    };



    const handleDownloadPDF = async () => {
        if (!invoiceId) return;

        try {
            setIsActionLoading(true);
            const response = await axiosInstance.get(`/invoices/${invoiceId}/download/`, {
                responseType: 'blob',

            });

            // Create a blob from the response data
            const file = new Blob([response.data], { type: 'application/pdf' });

            // Create a link element, set the href to the blob, and trigger a click
            const fileURL = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = fileURL;
            link.setAttribute('download', `Invoice_${invoiceData.invoice_no}.pdf`);
            document.body.appendChild(link);
            link.click();

            // Cleanup
            link.remove();
            URL.revokeObjectURL(fileURL);

            toast.success('PDF downloaded successfully');
        } catch (error) {
            console.error('Error downloading PDF:', error);
            toast.error('Failed to download PDF');
        } finally {
            setIsActionLoading(false);
        }
    };

    if (isLoading) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </Layout>
        );
    }

    if (!invoiceData) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="text-gray-500">Invoice not found</div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="p-6 max-w-[1400px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBack}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Go back"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">Invoice Details</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${isEditMode ? 'bg-blue-50' : ''}`}
                            title={isEditMode ? "Cancel Edit" : "Edit Invoice"}
                        >
                            <Edit className={`w-5 h-5 ${isEditMode ? 'text-blue-600' : 'text-gray-600'}`} />
                        </button>
                        {isEditMode && (
                            <>
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={isActionLoading}
                                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
                                >
                                    {isActionLoading ? 'Saving...' : 'Save Changes'}
                                </button>

                            </>
                        )}
                        {status !== 'Paid' && (
                            <button
                                onClick={() => setIsRecordPaymentOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
                            >
                                Record Payment
                            </button>
                        )}
                    </div>
                </div>

                {/* Invoice Information Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                    <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                        {/* Left Column */}
                        <div>
                            <div className="mb-4">
                                <label className="text-sm text-gray-500 block mb-1">Invoice No:</label>
                                <p className="text-base font-medium text-gray-900">{invoiceData.invoice_no}</p>
                            </div>
                            <div className="mb-4">
                                <label className="text-sm text-gray-500 block mb-1">Date of Issue:</label>
                                {isEditMode ? (
                                    <input
                                        type="date"
                                        value={invoiceData.issue_date}
                                        onChange={(e) => setInvoiceData({ ...invoiceData, issue_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                ) : (
                                    <p className="text-base font-medium text-gray-900">{invoiceData.issue_date}</p>
                                )}
                            </div>
                            <div className="mb-4">
                                <label className="text-sm text-gray-500 block mb-1">Reference Quote No:</label>
                                <p className="text-base font-medium text-gray-900">{invoiceData.quote_no}</p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-500 block mb-1">Client:</label>
                                <p className="text-base font-medium text-gray-900">{invoiceData.client_name}</p>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div>
                            <div className="mb-4">
                                <label className="text-sm text-gray-500 block mb-1">Author:</label>
                                <p className="text-base font-medium text-gray-900">{invoiceData.created_by_name}</p>
                            </div>
                            <div className="mb-4">
                                <label className="text-sm text-gray-500 block mb-1">Due Date:</label>
                                {isEditMode ? (
                                    <input
                                        type="date"
                                        value={invoiceData.due_date}
                                        onChange={(e) => setInvoiceData({ ...invoiceData, due_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                ) : (
                                    <p className="text-base font-medium text-gray-900">{invoiceData.due_date}</p>
                                )}
                            </div>
                            <div className="relative">
                                <label className="text-sm text-gray-500 block mb-1">Status:</label>
                                <div className="relative inline-block">
                                    <button
                                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(status)} cursor-pointer hover:opacity-80 transition-opacity`}
                                    >
                                        {status}
                                        <Edit className="w-3 h-3" />
                                    </button>

                                    {/* Status Dropdown */}
                                    {showStatusDropdown && (
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                            <div className="py-1">
                                                {statusChoices.map((choice) => (
                                                    <button
                                                        key={choice.value}
                                                        onClick={() => handleStatusChange(choice.label)}
                                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${status === choice.label ? 'bg-gray-100 font-medium' : ''
                                                            }`}
                                                    >
                                                        {choice.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Products Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product Group</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product Name</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit Price</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {productRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.product_group}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{row.product_name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900 text-center">
                                            {isEditMode ? (
                                                <input
                                                    type="number"
                                                    value={row.quantity}
                                                    onChange={(e) => {
                                                        const newItems = invoiceData.items.map((item: any) =>
                                                            item.id.toString() === row.id ? { ...item, quantity: parseInt(e.target.value) || 0 } : item
                                                        );
                                                        setInvoiceData({ ...invoiceData, items: newItems });
                                                        // Also update productRows for display
                                                        const newRows = productRows.map(r =>
                                                            r.id === row.id ? { ...r, quantity: parseInt(e.target.value) || 0 } : r
                                                        );
                                                        setProductRows(newRows);
                                                    }}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            ) : (
                                                row.quantity
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{row.unit}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                            {isEditMode ? (
                                                <input
                                                    type="number"
                                                    value={row.unit_price}
                                                    onChange={(e) => {
                                                        const newItems = invoiceData.items.map((item: any) =>
                                                            item.id.toString() === row.id ? { ...item, price_per_unit: e.target.value } : item
                                                        );
                                                        setInvoiceData({ ...invoiceData, items: newItems });
                                                        // Also update productRows for display
                                                        const newRows = productRows.map(r =>
                                                            r.id === row.id ? { ...r, unit_price: e.target.value } : r
                                                        );
                                                        setProductRows(newRows);
                                                    }}
                                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            ) : (
                                                row.unit_price
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{row.amount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals Section */}
                    <div className="border-t border-gray-200 p-6">
                        <div className="flex justify-end">
                            <div className="w-full max-w-2xl space-y-3">
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Subtotal</span>
                                        <span className="font-medium text-gray-900">{totals.subtotal}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Total</span>
                                        <span className="font-medium text-gray-900">{totals.total}</span>
                                    </div>
                                    <div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Tax (%)</span>
                                        <span className="font-medium text-gray-900">{totals.tax}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">In-house</span>
                                        <span className="font-medium text-gray-900">{totals.in_house}</span>
                                    </div>
                                    <div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Total(INR)</span>
                                        <span className="font-medium text-gray-900">{totals.total}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Out-Sourced</span>
                                        <span className="font-medium text-gray-900">{totals.out_sourced}</span>
                                    </div>
                                    <div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Invoiced Sum(INR)</span>
                                        <span className="font-medium text-gray-900">{totals.invoiced_sum}</span>
                                    </div>
                                    <div></div>
                                    <div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">To be Voiced (INR)</span>
                                        <span className="font-medium text-gray-900">{totals.to_be_voiced}</span>
                                    </div>
                                    <div></div>
                                    <div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileText size={18} />
                        <span>PDF</span>
                    </button>
                    {/* <button
                        onClick={handleShareViaLink}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Share2 size={18} />
                        <span>Share via link</span>
                    </button> */}
                    <button
                        onClick={handleSendEmail}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={18} />
                        <span>{isActionLoading ? 'Sending...' : 'Send'}</span>
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={18} />
                        <span>Delete</span>
                    </button>
                </div>
            </div>

            {/* Record Payment Modal */}
            <RecordPaymentModal
                isOpen={isRecordPaymentOpen}
                onClose={() => setIsRecordPaymentOpen(false)}
                invoiceId={invoiceId || ''}
                invoiceData={{
                    invoice_no: invoiceData.invoice_no,
                    amount: invoiceData.balance_amount || totals.to_be_voiced
                }}
                onPaymentRecorded={handlePaymentRecorded}
            />
        </Layout>
    );
}
