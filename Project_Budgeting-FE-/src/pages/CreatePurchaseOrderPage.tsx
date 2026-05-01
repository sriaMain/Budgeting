/**
 * Create Purchase Order Page
 * Create purchase orders from quotes with vendor selection
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, GripVertical, ArrowLeft, FileText } from 'lucide-react';
import { Layout } from '../components/Layout';
import { InputField } from '../components/InputField';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import type { Vendor } from './ContactsScreen';

interface ProductRow {
    id: string;
    quote_item_id?: number;
    selected: boolean;
    group: string;
    product: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
}

export default function CreatePurchaseOrderPage() {
    const navigate = useNavigate();
    const { quotationId } = useParams<{ quotationId: string }>();

    const [referenceQuoteNo, setReferenceQuoteNo] = useState(quotationId || '');
    const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [notes, setNotes] = useState('');
    const [termsConditions, setTermsConditions] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingVendors, setIsLoadingVendors] = useState(true);

    const [productRows, setProductRows] = useState<ProductRow[]>([]);

    // Fetch vendors
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                setIsLoadingVendors(true);
                const response = await axiosInstance.get('/accounts/vendors/');
                if (response.status === 200) {
                    setVendors(response.data);
                }
            } catch (error) {
                console.error('Error fetching vendors:', error);
                toast.error('Failed to load vendors');
            } finally {
                setIsLoadingVendors(false);
            }
        };

        fetchVendors();
    }, []);

    // Fetch quote data when component mounts
    useEffect(() => {
        const fetchQuoteData = async () => {
            if (!quotationId) {
                setIsLoading(false);
                // Set default empty row if no quoteId
                setProductRows([{
                    id: '1',
                    selected: false,
                    group: 'Service',
                    product: '',
                    description: '',
                    quantity: 1,
                    unit: 'hr',
                    unitPrice: 0,
                    amount: 0
                }]);
                return;
            }

            try {
                setIsLoading(true);
                const response = await axiosInstance.get(`quotations/${quotationId}/`);
                const data = response.data;

                console.log('Fetched quote data:', data);

                // Extract quote data from nested structure
                const quoteData = data.quote;

                // Populate form fields from quote data
                setReferenceQuoteNo(quoteData.quote_no || quotationId);

                // Populate product rows from quote items
                if (quoteData.items && Array.isArray(quoteData.items)) {
                    console.log('Quote items from API:', quoteData.items);

                    const rows: ProductRow[] = quoteData.items.map((item: any, index: number) => {
                        return {
                            id: `${index + 1}`,
                            quote_item_id: item.id || item.item_id || item.quote_item_id,
                            selected: true, // Select all by default
                            group: item.product_group || 'Services',
                            product: item.product_name || item.product_service || '',
                            description: item.description || '',
                            quantity: parseFloat(item.quantity || '1'),
                            unit: item.unit || 'hr',
                            unitPrice: parseFloat(item.price_per_unit || '0'),
                            amount: parseFloat(item.amount || '0')
                        };
                    });

                    console.log('Processed rows:', rows);
                    setProductRows(rows);
                } else {
                    // Default empty row if no products
                    setProductRows([{
                        id: '1',
                        selected: false,
                        group: 'Service',
                        product: '',
                        description: '',
                        quantity: 1,
                        unit: 'hr',
                        unitPrice: 0,
                        amount: 0
                    }]);
                }
            } catch (error) {
                console.error('Error fetching quote data:', error);
                toast.error('Failed to load quote data');
                // Set default empty row on error
                setProductRows([{
                    id: '1',
                    selected: false,
                    group: 'Service',
                    product: '',
                    description: '',
                    quantity: 1,
                    unit: 'hr',
                    unitPrice: 0,
                    amount: 0
                }]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchQuoteData();
    }, [quotationId]);

    const handleCheckboxChange = (id: string) => {
        setProductRows(rows =>
            rows.map(row =>
                row.id === id
                    ? { ...row, selected: !row.selected, amount: !row.selected ? row.quantity * row.unitPrice : 0 }
                    : row
            )
        );
    };

    const handleQuantityChange = (id: string, value: string) => {
        const quantity = parseFloat(value) || 0;
        setProductRows(rows =>
            rows.map(row =>
                row.id === id
                    ? { ...row, quantity, amount: row.selected ? quantity * row.unitPrice : 0 }
                    : row
            )
        );
    };

    const handleUnitPriceChange = (id: string, value: string) => {
        const unitPrice = parseFloat(value) || 0;
        setProductRows(rows =>
            rows.map(row =>
                row.id === id
                    ? { ...row, unitPrice, amount: row.selected ? row.quantity * unitPrice : 0 }
                    : row
            )
        );
    };

    const calculateTotals = () => {
        const subTotal = productRows.reduce((sum, row) => sum + row.amount, 0);
        const total = subTotal;

        return {
            subTotal: subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
            total: total.toLocaleString('en-IN', { minimumFractionDigits: 2 })
        };
    };

    const totals = calculateTotals();

    const handleCreatePurchaseOrder = async () => {
        try {
            setIsSubmitting(true);

            // Validation
            if (!selectedVendorId) {
                toast.error('Please select a vendor');
                return;
            }

            // Get selected quote items with their quantities and unit rates
            const poItems = productRows
                .filter(row => row.selected && row.quote_item_id)
                .map(row => ({
                    quote_item_id: row.quote_item_id!,
                    quantity: row.quantity,
                    unit_rate: row.unitPrice
                }));

            if (poItems.length === 0) {
                toast.error('Please select at least one item');
                return;
            }

            // Prepare purchase order data
            const poData = {
                quote_no: parseInt(quotationId || referenceQuoteNo),
                vendor_id: selectedVendorId,
                items: poItems
            };

            console.log('Creating purchase order with data:', poData);

            // Make API call
            const response = await axiosInstance.post('/purchase-orders/', poData);

            if (response.status === 200 || response.status === 201) {
                toast.success('Purchase order created successfully!');
                const poId = response.data.id || response.data.purchase_order?.id;
                // Navigate to the newly created PO or back to list
                if (poId) {
                    navigate(`/purchase-orders/${poId}`);
                } else {
                    navigate('/pipeline'); // or wherever POs are listed
                }
            }
        } catch (error: any) {
            console.error('Error creating purchase order:', error);
            const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to create purchase order';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout userRole="admin" currentPage="pipeline" onNavigate={() => { }}>
            <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Create Purchase Order</h1>
                    </div>
                    <button
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <FileText className="w-4 h-4" />
                        Record Bill
                    </button>
                </div>

                {/* Loading State */}
                {isLoading || isLoadingVendors ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Basic Information */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                <InputField
                                    label="Reference Quote No"
                                    value={referenceQuoteNo}
                                    onChange={(e) => setReferenceQuoteNo(e.target.value)}
                                    disabled
                                />
                                
                                {/* Vendor Selection */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        <span className="text-red-500">*</span> Select Vendor
                                    </label>
                                    <select
                                        value={selectedVendorId || ''}
                                        onChange={(e) => setSelectedVendorId(Number(e.target.value))}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select a vendor</option>
                                        {vendors.map(vendor => (
                                            <option key={vendor.id} value={vendor.id}>
                                                {vendor.name} - {vendor.vendor_type}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Product Groups Table */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[800px]">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-2 md:px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-10"></th>
                                            <th className="px-2 md:px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-10"></th>
                                            <th className="px-2 md:px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Group</th>
                                            <th className="px-2 md:px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product | Description</th>
                                            <th className="px-2 md:px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                                            <th className="px-2 md:px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                                            <th className="px-2 md:px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Price</th>
                                            <th className="px-2 md:px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {productRows.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50">
                                                <td className="px-2 md:px-3 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.selected}
                                                        onChange={() => handleCheckboxChange(row.id)}
                                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="px-2 md:px-3 py-3">
                                                    <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                                                </td>
                                                <td className="px-2 md:px-3 py-3 text-sm text-gray-900">{row.group}</td>
                                                <td className="px-2 md:px-3 py-3">
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-medium text-gray-900">{row.product}</p>
                                                        {row.description && (
                                                            <p className="text-xs text-gray-500">{row.description}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 md:px-3 py-3">
                                                    <input
                                                        type="number"
                                                        value={row.quantity}
                                                        onChange={(e) => handleQuantityChange(row.id, e.target.value)}
                                                        className="w-16 md:w-20 px-2 md:px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="px-2 md:px-3 py-3 text-sm text-gray-900">{row.unit}</td>
                                                <td className="px-2 md:px-3 py-3 text-right">
                                                    <input
                                                        type="number"
                                                        value={row.unitPrice}
                                                        onChange={(e) => handleUnitPriceChange(row.id, e.target.value)}
                                                        className="w-24 md:w-28 px-2 md:px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="px-2 md:px-3 py-3 text-right">
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totals Section */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
                            <div className="flex justify-end">
                                <div className="w-full max-w-md space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Subtotal</span>
                                        <span className="font-medium text-gray-900">{totals.subTotal}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold border-t pt-3">
                                        <span className="text-gray-900">Total</span>
                                        <span className="text-gray-900">{totals.total}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Create Purchase Order Button */}
                        <div className="flex justify-center pb-6">
                            <button
                                onClick={handleCreatePurchaseOrder}
                                disabled={isSubmitting || !selectedVendorId}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Creating...
                                    </>
                                ) : (
                                    'Create Purchase Order'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
