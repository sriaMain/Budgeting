/**
 * Purchase Order Details Page
 * Display purchase order details with actions to download PDF and send email
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Send, ArrowLeft, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';

interface POItem {
    id: number;
    quote_item: number;
    service_name: string;
    description: string;
    quantity: string;
    unit_rate: string;
    amount: string;
    purchase_order: number;
}

interface PurchaseOrderData {
    id: number;
    po_no: string;
    vendor_name: string;
    vendor_email: string;
    vendor: number;
    status: string;
    issue_date: string;
    sub_total: string;
    total_amount: string;
    items: POItem[];
    quote: number;
    project: number;
    created_by: number;
    employee_name: string;
}

export default function PurchaseOrderDetailsPage() {
    const { poId } = useParams<{ poId: string }>();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [poData, setPoData] = useState<PurchaseOrderData | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Fetch Purchase Order Data
    const fetchPOData = async () => {
        if (!poId) return;

        try {
            setIsLoading(true);
            const response = await axiosInstance.get(`/purchase-orders/${poId}/`);
            setPoData(response.data);
            console.log('Fetched PO data:', response.data);
        } catch (error) {
            console.error('Error fetching PO data:', error);
            toast.error('Failed to load purchase order details');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPOData();
    }, [poId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleDownloadPDF = async () => {
        if (!poId) return;

        try {
            setIsActionLoading(true);
            const response = await axiosInstance.get(`/purchase-orders/${poId}/download/`, {
                responseType: 'blob',
            });

            // Create a blob from the response data
            const file = new Blob([response.data], { type: 'application/pdf' });
            const fileURL = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = fileURL;
            link.setAttribute('download', `PO_${poData?.po_no || poId}.pdf`);
            document.body.appendChild(link);
            link.click();
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

    const handleSendEmail = async () => {
        if (!poId) return;

        const confirmSend = window.confirm(`Send purchase order to ${poData?.vendor_name} (${poData?.vendor_email})?`);
        if (!confirmSend) return;

        try {
            setIsActionLoading(true);
            await axiosInstance.post(`/purchase-orders/${poId}/send-email/`);
            toast.success('Purchase order sent successfully');
        } catch (error) {
            console.error('Error sending email:', error);
            toast.error('Failed to send email');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!poId) return;

        if (!window.confirm('Are you sure you want to delete this purchase order? This action cannot be undone.')) return;

        try {
            setIsActionLoading(true);
            await axiosInstance.delete(`/purchase-orders/${poId}/`);
            toast.success('Purchase order deleted successfully');
            navigate(-1);
        } catch (error) {
            console.error('Error deleting PO:', error);
            toast.error('Failed to delete purchase order');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleRecordBill = async () => {
        if (!poData?.id) return;

        try {
            setIsActionLoading(true);
            const response = await axiosInstance.post('/vendor-bills/', {
                purchase_order_id: poData.id
            });
            
            if (response.status === 200 || response.status === 201) {
                toast.success('Bill recorded successfully');
                // Optionally navigate to the bill details page
                const billId = response.data.id || response.data.bill?.id;
                if (billId) {
                    navigate(`/bills/${billId}`);
                }
            }
        } catch (error: any) {
            console.error('Error recording bill:', error);
            const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to record bill';
            toast.error(errorMessage);
        } finally {
            setIsActionLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        const s = status?.toLowerCase();
        if (s === 'confirmed' || s === 'approved') return 'bg-green-100 text-green-700 border-green-200';
        if (s === 'sent') return 'bg-blue-100 text-blue-700 border-blue-200';
        if (s === 'draft') return 'bg-gray-100 text-gray-700 border-gray-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    if (isLoading) {
        return (
            <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </Layout>
        );
    }

    if (!poData) {
        return (
            <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="text-gray-500">Purchase Order not found</div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
            <div className="p-6 max-w-[1200px] mx-auto">
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
                        <h1 className="text-2xl font-bold text-gray-900">Purchase Order Details</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleRecordBill}
                            disabled={isActionLoading}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FileText className="w-4 h-4" />
                            Record Bill
                        </button>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(poData.status)}`}>
                            {poData.status}
                        </span>
                    </div>
                </div>

                {/* PO Information Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                        {/* Left Column */}
                        <div>
                            <div className="mb-6">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">Purchase Order To</label>
                                <p className="text-lg font-bold text-gray-900">{poData.vendor_name}</p>
                                {poData.vendor_email && <p className="text-sm text-gray-600">{poData.vendor_email}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-sm text-gray-500 block mb-1">PO Number</label>
                                    <p className="font-medium text-gray-900">{poData.po_no}</p>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-500 block mb-1">Date</label>
                                    <p className="font-medium text-gray-900">
                                        {poData.issue_date ? new Date(poData.issue_date).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div>
                            <div className="mb-6">
                                <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-1">Details</label>
                                <div className="space-y-3">
                                    <div className="flex justify-between border-b border-gray-100 pb-2">
                                        <span className="text-gray-600">Reference Quote</span>
                                        <span className="font-medium text-gray-900">#{poData.quote}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-2">
                                        <span className="text-gray-600">Created By</span>
                                        <span className="font-medium text-gray-900">{poData.employee_name}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-2">
                                        <span className="text-gray-600">Subtotal</span>
                                        <span className="font-medium text-gray-900">₹{parseFloat(poData.sub_total).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Item Details</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Qty</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit Price</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {poData.items?.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-gray-900">{item.service_name}</p>
                                            {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-gray-900">
                                            {parseFloat(item.quantity).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                                            ₹{parseFloat(item.unit_rate).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                                            ₹{parseFloat(item.amount).toLocaleString('en-IN')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50">
                                <tr>
                                    <td colSpan={3} className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Total Amount</td>
                                    <td className="px-6 py-4 text-right text-sm font-bold text-blue-600">
                                        ₹{parseFloat(poData.total_amount).toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 justify-end">
                    <button
                        onClick={handleDelete}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium mr-auto disabled:opacity-50"
                    >
                        <Trash2 size={18} />
                        <span>Delete</span>
                    </button>
                    
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium shadow-sm disabled:opacity-50"
                    >
                        <FileText size={18} />
                        <span>Download PDF</span>
                    </button>
                    
                    <button
                        onClick={handleSendEmail}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                        <Send size={18} />
                        <span>{isActionLoading ? 'Sending...' : 'Send Email'}</span>
                    </button>
                </div>
            </div>
        </Layout>
    );
}
