/**
 * Quote Details Page
 * Displays detailed information about a specific quote
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Edit, FileText, Share2, Send, Receipt, Loader2, Plus } from 'lucide-react';
import { Layout } from '../components/Layout';
import { InfoDisplay } from '../components/InfoDisplay';
import { ReusableTable, type Column } from '../components/ReusableTable';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { AddPOCModal } from '../components/AddPOCModal';
import type { POC } from './ClientListPage';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface QuoteDetailsPageProps {
    userRole?: 'admin' | 'user' | 'manager';
    currentPage?: string;
    onNavigate?: (page: string) => void;
}

interface ProductRow {
    id: string;
    product_group: string;
    product_name: string;
    quantity: number | string;
    unit: string;
    price_per_unit: string;
    amount: string;
    cost: string;
    po_number: string | null;
    bill_number: string | null;
}

interface QuoteData {
    quote_no: number;
    quote_name: string;
    date_of_issue: string;
    due_date: string;
    status: string;
    author: string;
    has_project?: boolean;
    client: {
        id?: number;
        company_name: string;
        street_address: string;
        city: string;
        state: string;
        country: string;
    };
    client_id?: number;
    poc_details?: {
        id: number;
        poc_name: string;
        designation: string;
        poc_email: string;
        poc_mobile: string;
    };
    sub_total: string;
    tax_percentage: string;
    total_amount: string;
    items: ProductRow[];
}

export default function QuoteDetailsPage({
    userRole = 'admin',
    currentPage = 'pipeline',
    onNavigate = () => { }
}: QuoteDetailsPageProps) {
    const { quoteNo } = useParams<{ quoteNo: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode'); // 'invoice' or null
    const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
    const [isAddPOCModalOpen, setIsAddPOCModalOpen] = useState(false);
    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);

    useEffect(() => {
        fetchQuoteDetails();
    }, [quoteNo]);

    const fetchQuoteDetails = async () => {
        try {
            setIsLoading(true);
            const response = await axiosInstance.get(`/quotes/${quoteNo}/`);
            setQuoteData(response.data);
        } catch (error) {
            console.error('Error fetching quote details:', error);
            toast.error('Failed to load quote details');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        try {
            setIsActionLoading(true);
            await axiosInstance.post(`/quotes/${quoteNo}/send/`);
            toast.success('Quote sent successfully');
        } catch (error) {
            console.error('Error sending quote:', error);
            toast.error('Failed to send quote');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleShare = async () => {
        try {
            setIsActionLoading(true);
            await axiosInstance.post(`/quotes/${quoteNo}/send/`);

            // Copy current URL to clipboard
            await navigator.clipboard.writeText(window.location.href);

            toast.success('Link copied to clipboard');
        } catch (error) {
            console.error('Error sharing quote:', error);
            toast.error('Failed to share quote');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        try {
            setIsActionLoading(true);
            const response = await axiosInstance.get(`/quotes/${quoteNo}/pdf/`, {
                responseType: 'blob'
            });

            // Create a blob from the response data
            const file = new Blob([response.data], { type: 'application/pdf' });

            // Create a link element, set the href to the blob, and trigger a click
            const fileURL = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = fileURL;
            link.setAttribute('download', `Quote_${quoteNo}.pdf`);
            document.body.appendChild(link);
            link.click();

            // Cleanup
            link.remove();
            URL.revokeObjectURL(fileURL);

            toast.success('PDF generated successfully');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Failed to generate PDF');
        } finally {
            setIsActionLoading(false);
        }
    };

    const productColumns: Column<ProductRow>[] = [
        { header: 'Product Group', accessor: 'product_group', className: 'font-medium' },
        { header: 'Product Name', accessor: 'product_name' },
        { header: 'Quantity', accessor: 'quantity', className: 'text-right' },
        { header: 'Unit', accessor: 'unit' },
        { header: 'Unit Price', accessor: 'price_per_unit', className: 'text-right' },
        { header: 'Amount', accessor: 'amount', className: 'text-right' },
        { header: 'Cost', accessor: 'cost', className: 'text-right' },
       
    ];

    const handleEdit = () => {
        navigate(`/pipeline/edit-quote/${quoteNo}`);
    };

    const handlePOCAdded = (newPOC: POC) => {
        // Refresh quote details to show the new POC
        fetchQuoteDetails();
        toast.success('POC added successfully!');
    };

    if (isLoading) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="flex items-center justify-center min-h-[400px]">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            </Layout>
        );
    }

    if (!quoteData) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="text-center py-12">
                    <p className="text-gray-500">Quote not found</p>
                    <button onClick={() => navigate('/pipeline')} className="mt-4 text-blue-600 hover:underline">
                        Back to Pipeline
                    </button>
                </div>
            </Layout>
        );
    }

    // Check if quote is confirmed
    const isConfirmed = quoteData.status?.toLowerCase() === 'confirmed';

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900">Quote Details</h1>
                    <div className="flex gap-3">
                        <button
                            onClick={handleEdit}
                            className="p-2 rounded-lg transition-colors hover:bg-gray-100"
                            title="Edit quote"
                        >
                            <Edit className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Quote Information Card */}
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <InfoDisplay label="Quote No" value={quoteData.quote_no} />
                        <InfoDisplay label="Author" value={quoteData.author} />
                        <InfoDisplay label="Date of Issue" value={quoteData.date_of_issue} />
                        <InfoDisplay label="Due Date" value={quoteData.due_date} />
                        <InfoDisplay label="Quote Name" value={quoteData.quote_name} />
                        <InfoDisplay
                            label="Status"
                            value={
                                <span className="inline-flex items-center bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm font-medium">
                                    {quoteData.status}
                                </span>
                            }
                        />
                        <div className="md:col-span-2">
                            <InfoDisplay
                                label="Client"
                                value={
                                    <div>
                                        <span className="font-semibold">{quoteData.client.company_name}</span>
                                        <span className="text-sm text-gray-500 ml-2">
                                            {quoteData.client.city}, {quoteData.client.state}, {quoteData.client.country}
                                        </span>
                                    </div>
                                }
                            />
                        </div>
                    </div>

                    {/* Create Project Button - Separate row for better visibility */}
                    {(() => {
                        const status = (quoteData.status || '').toLowerCase().trim();
                        // Handle various status formats including typos (oppurtunity vs opportunity)
                        const allowedStatuses = ['opportunity', 'oppurtunity', 'scoping', 'proposal', 'confirmed'];
                        const isInvoiceMode = mode === 'invoice';
                        const shouldShow = !isInvoiceMode && allowedStatuses.includes(status);

                        console.log('=== Create Project Button Debug ===');
                        console.log('Original Status:', quoteData.status);
                        console.log('Normalized Status:', status);
                        console.log('Mode:', mode);
                        console.log('Is Invoice Mode:', isInvoiceMode);
                        console.log('Allowed Statuses:', allowedStatuses);
                        console.log('Status Match:', allowedStatuses.includes(status));
                        console.log('Has Project:', quoteData.has_project);
                        console.log('Should Show Button:', shouldShow);
                        console.log('===================================');

                        if (!shouldShow) return null;

                        return (
                            <div className="mt-4">
                                <button
                                    onClick={() => {
                                        if (!quoteData.has_project) {
                                            setIsCreateProjectModalOpen(true);
                                        }
                                    }}
                                    disabled={quoteData.has_project}
                                    className={`px-4 py-2 font-medium rounded-lg transition-colors duration-200 ${quoteData.has_project
                                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                                        : 'bg-purple-200 text-black hover:bg-purple-300'
                                        }`}
                                >
                                    {quoteData.has_project ? 'Project Already Created' : 'Create Project'}
                                </button>
                            </div>
                        );
                    })()}
                </div>

                {/* Products Table */}
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>
                    <ReusableTable
                        data={quoteData.items.map((item, idx) => ({ ...item, id: idx.toString() }))}
                        columns={productColumns}
                        keyField="id"
                        emptyMessage="No products found"
                    />

                    {/* Totals Section */}
                    <div className="mt-6 flex justify-end">
                        <div className="w-full max-w-xs space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Sub Total:</span>
                                <span className="font-medium">₹{parseFloat(quoteData.sub_total).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Tax ({quoteData.tax_percentage}%):</span>
                                <span className="font-medium">₹{(parseFloat(quoteData.total_amount) - parseFloat(quoteData.sub_total)).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold border-t pt-2">
                                <span>Total:</span>
                                <span className="text-blue-600">₹{parseFloat(quoteData.total_amount).toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pb-6">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium shadow-sm disabled:opacity-50"
                    >
                        {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText size={18} />}
                        <span>PDF</span>
                    </button>
                    <button
                        onClick={handleShare}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium shadow-sm disabled:opacity-50"
                    >
                        {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 size={18} />}
                        <span>Share via link</span>
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isActionLoading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                        {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
                        <span>Send</span>
                    </button>
                </div>
            </div>

            {/* Create Project Modal */}
            <CreateProjectModal
                isOpen={isCreateProjectModalOpen}
                onClose={() => {
                    setIsCreateProjectModalOpen(false);
                    // Refresh quote data to reflect any status changes
                    fetchQuoteDetails();
                }}
                quoteId={quoteData.quote_no}
                quoteName={quoteData.quote_name}
                clientName={quoteData.client.company_name}
                authorName={quoteData.author}
            />

            {/* Add POC Modal */}
            {isAddPOCModalOpen && quoteData && (quoteData.client_id || quoteData.client.id) && (
                <AddPOCModal
                    companyId={quoteData.client_id || quoteData.client.id!}
                    companyName={quoteData.client.company_name}
                    onSave={handlePOCAdded}
                    onClose={() => setIsAddPOCModalOpen(false)}
                />
            )}
        </Layout>
    );
}
