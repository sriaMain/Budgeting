/**
 * Add Expense Modal
 * Modal for creating new project expenses
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import { listFreelancers } from '../services/freelancerOnboarding';
import { listVendors } from '../services/vendorOnboarding';

interface PocOption {
    id: number;
    type: 'employee' | 'vendor' | 'freelancer';
    name: string;
    subtitle?: string;
}

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
    gl_account?: number;
    freelancer?: number;
    employee?: number;
    vendor?: number;
    notes?: string;
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
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(false);
    const [glAccountOptions, setGlAccountOptions] = useState<SearchableSelectOption[]>([]);
    const [glAccount, setGlAccount] = useState<SearchableSelectOption | null>(null);
    const [freelancerOptions, setFreelancerOptions] = useState<SearchableSelectOption[]>([]);
    const [freelancer, setFreelancer] = useState<SearchableSelectOption | null>(null);
    const [employeeOptions, setEmployeeOptions] = useState<SearchableSelectOption[]>([]);
    const [employee, setEmployee] = useState<SearchableSelectOption | null>(null);
    const [vendorOptions, setVendorOptions] = useState<SearchableSelectOption[]>([]);
    const [vendor, setVendor] = useState<SearchableSelectOption | null>(null);

    // Fetch categories + GL accounts when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchCategories();
            fetchGlAccounts();
            fetchFreelancers();
            fetchEmployees();
            fetchVendors();
        }
    }, [isOpen]);

    const fetchVendors = async () => {
        try {
            const vendors = await listVendors({});
            setVendorOptions(vendors.map((v) => ({
                id: v.id,
                label: v.name,
                sublabel: v.vendor_reference_no || undefined,
            })));
        } catch (error) {
            console.error('Error fetching vendors:', error);
        }
    };

    const fetchFreelancers = async () => {
        try {
            const freelancers = await listFreelancers({});
            setFreelancerOptions(freelancers.map((f) => ({
                id: f.id,
                label: f.full_name,
                sublabel: f.freelancer_code || undefined,
            })));
        } catch (error) {
            console.error('Error fetching freelancers:', error);
        }
    };

    // Reuses the same combined POC (Point of Contact) options endpoint
    // ResourcesPanel already uses to populate its employee/freelancer picker,
    // filtered down to just employees (accounts.Account ids, matching
    // Expense.employee's FK target).
    const fetchEmployees = async () => {
        try {
            const response = await axiosInstance.get<PocOption[]>('/projects/poc-options/');
            const employees = (response.data || []).filter((p) => p.type === 'employee');
            setEmployeeOptions(employees.map((e) => ({
                id: e.id,
                label: e.name,
                sublabel: e.subtitle || undefined,
            })));
        } catch (error) {
            console.error('Error fetching employees:', error);
        }
    };

    const fetchGlAccounts = async () => {
        try {
            const response = await axiosInstance.get<{ id: number; code: string; name: string; account_type?: string }[]>(
                '/gl-accounts/?active_only=true'
            );
            const options = (response.data || []).map((acc) => ({
                id: acc.id,
                label: `${acc.code} - ${acc.name}`,
                sublabel: acc.account_type,
            }));
            setGlAccountOptions(options);
        } catch (error) {
            console.error('Error fetching GL accounts:', error);
        }
    };

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
                { key: 'equipment', label: 'Equipment' },
                { key: 'vendor', label: 'Vendor' },
                { key: 'employee_cost', label: 'Employee Cost' },
                { key: 'freelancer', label: 'Freelancer Cost' },
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

        if (glAccount) {
            expenseData.gl_account = Number(glAccount.id);
        }
        if (category === 'freelancer' && freelancer) {
            expenseData.freelancer = Number(freelancer.id);
        }
        if (category === 'employee_cost' && employee) {
            expenseData.employee = Number(employee.id);
        }
        if (category === 'vendor' && vendor) {
            expenseData.vendor = Number(vendor.id);
        }
        if (notes) {
            expenseData.notes = notes;
        }

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
                setNotes('');
                setGlAccount(null);
                setFreelancer(null);
                setEmployee(null);
                setVendor(null);
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
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-50 flex items-center justify-center p-4 dark:bg-black/50"
            onClick={handleBackdropClick}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-900"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between rounded-t-2xl dark:bg-gray-900 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Create New Expense
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800"
                        aria-label="Close modal"
                    >
                        <X size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-5">
                    {/* Category */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                            Category <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                disabled={isLoadingCategories}
                                className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500"
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
                                <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* GL Account */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                            GL Account
                        </label>
                        <SearchableSelect
                            options={glAccountOptions}
                            value={glAccount}
                            onChange={setGlAccount}
                            placeholder="Search account..."
                        />
                        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                            Optional — ties this expense to a budget line's GL Account so Actual spend rolls up correctly.
                        </p>
                    </div>

                    {/* Freelancer (only for the Freelancer Cost category) */}
                    {category === 'freelancer' && (
                        <div>
                            <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                                Freelancer
                            </label>
                            <SearchableSelect
                                options={freelancerOptions}
                                value={freelancer}
                                onChange={setFreelancer}
                                placeholder="Search freelancer..."
                            />
                            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                                Tags this as Actual Freelancer Cost for that freelancer, rolling up into their project profitability.
                            </p>
                        </div>
                    )}

                    {/* Employee (only for the Employee Cost category) */}
                    {category === 'employee_cost' && (
                        <div>
                            <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                                Employee
                            </label>
                            <SearchableSelect
                                options={employeeOptions}
                                value={employee}
                                onChange={setEmployee}
                                placeholder="Search employee..."
                            />
                            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                                Tags this as Actual Employee Cost for that employee, rolling up into their project profitability.
                            </p>
                        </div>
                    )}

                    {/* Vendor (only for the Vendor category) */}
                    {category === 'vendor' && (
                        <div>
                            <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                                Vendor
                            </label>
                            <SearchableSelect
                                options={vendorOptions}
                                value={vendor}
                                onChange={setVendor}
                                placeholder="Search vendor..."
                            />
                            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                                Tags this as Actual Vendor Cost for that vendor, rolling up into project cost.
                            </p>
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                            Amount <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                            Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter expense description"
                            rows={4}
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-base font-semibold text-gray-900 mb-2 dark:text-white">
                            Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Additional notes (optional)"
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row justify-end gap-3 rounded-b-2xl dark:bg-gray-800 dark:border-gray-800">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors text-gray-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
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
