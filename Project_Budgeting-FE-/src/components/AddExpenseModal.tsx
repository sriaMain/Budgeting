/**
 * Add Expense Modal
 * Modal for creating new project expenses
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    onExpenseAdded?: () => void;
}

export interface ExpenseData {
    category: string;
    amount: number;
    description: string;
    project: number;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
    isOpen,
    onClose,
    projectId,
    onExpenseAdded
}) => {
    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(false);

    // Fetch categories when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const fetchCategories = async () => {
        try {
            setIsLoadingCategories(true);
            const response = await axiosInstance.get('expenses/categories/');
            console.log('Fetched categories:', response.data);
            
            // API returns array of objects with 'key' and 'label' properties
            if (Array.isArray(response.data)) {
                setCategories(response.data);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
            toast.error('Failed to load categories');
            // Fallback to default categories if API fails
            setCategories([
                { key: 'rent', label: 'Rent' },
                { key: 'travel', label: 'Travel' },
                { key: 'food', label: 'Food' },
                { key: 'internet', label: 'Internet' },
                { key: 'electricity', label: 'Electricity' },
                { key: 'software', label: 'Software' },
                { key: 'maintenance', label: 'Maintenance' },
                { key: 'other', label: 'Other' }
            ]);
        } finally {
            setIsLoadingCategories(false);
        }
    };

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);

        const expenseData: ExpenseData = {
            category: category,
            amount: parseFloat(amount),
            description: description,
            project: parseInt(projectId)
        };

        console.log('=== Creating Expense ===');
        console.log('Project ID:', projectId);
        console.log('Expense Data:', expenseData);

        try {
            // Make API call to create expense
            console.log('Making API call to: api/expenses/');
            const response = await axiosInstance.post(
                'expenses/',
                expenseData
            );

            console.log('API Response Status:', response.status);
            console.log('API Response Data:', response.data);

            if (response.status === 200 || response.status === 201) {
                toast.success('Expense created successfully!');

                console.log('Expense created successfully, calling callback...');
                // Call the callback if provided
                if (onExpenseAdded) {
                    await onExpenseAdded();
                }

                console.log('Closing modal...');
                // Reset form
                setCategory('');
                setAmount('');
                setDescription('');
                onClose();
            }
        } catch (error: any) {
            console.error('=== Expense Creation Error ===');
            console.error('Error:', error);
            console.error('Error Response:', error.response);
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Failed to create expense';
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
                        Create New Expense
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
                    {/* Category */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Category <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                disabled={isLoadingCategories}
                                className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <option value="">
                                    {isLoadingCategories ? 'Loading categories...' : 'Select category'}
                                </option>
                                {categories.map((cat) => (
                                    <option key={cat.key} value={cat.key}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Amount <span className="text-red-500">*</span>
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

                    {/* Description */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2">
                            Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter expense description"
                            rows={4}
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
                        disabled={!category || !amount || parseFloat(amount) <= 0 || !description}
                        className="w-full sm:w-auto px-8"
                    >
                        Create Expense
                    </Button>
                </div>
            </div>
        </div>
    );
};
