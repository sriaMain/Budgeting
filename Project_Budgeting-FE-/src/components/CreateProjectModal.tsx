/**
 * Create Project Modal Component
 * Modal with tabbed interface for creating projects from quotes
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { InputField } from './InputField';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    quoteId?: number | string;
    quoteName?: string;
    clientName?: string;
    authorName?: string;
    hideBudgetTab?: boolean; // Hide budget tab when creating from admin projects page
}

type TabType = 'project' | 'budget';

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
    isOpen,
    onClose,
    quoteId,
    quoteName = '',
    clientName = '',
    authorName = '',
    hideBudgetTab = false
}) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('project');
    // Default to 'internal' when hideBudgetTab is true (admin project creation), otherwise 'external'
    const [projectType, setProjectType] = useState<'internal' | 'external'>(hideBudgetTab ? 'internal' : 'external');
    const [budgetMethod, setBudgetMethod] = useState<'quoted' | 'manual'>('quoted');
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    // Do NOT auto-fill project name from quoteName by default
    const [projectName, setProjectName] = useState('');
    const [client, setClient] = useState(clientName);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [totalHours, setTotalHours] = useState('');
    const [totalBudget, setTotalBudget] = useState('');
    const [billsExpenses, setBillsExpenses] = useState('0');
    const [priceList, setPriceList] = useState('INR');
    const [isLoadingQuoteBudget, setIsLoadingQuoteBudget] = useState(false);

    // Fetch quote details so budget fields can be pre-filled with quoted values
    const fetchQuoteBudgetData = async (id: number | string) => {
        setIsLoadingQuoteBudget(true);
        try {
            const response = await axiosInstance.get(`/quotes/${id}/`);
            const quote = response.data;

            // Sum hours across quote line items (question-wise hours)
            const hoursFromItems = Array.isArray(quote.items)
                ? quote.items
                    .filter((item: any) => item.unit === 'hours')
                    .reduce((sum: number, item: any) => sum + (parseFloat(item.quantity) || 0), 0)
                : 0;

            setTotalHours(hoursFromItems ? String(hoursFromItems) : '');
            setTotalBudget(quote.total_amount != null ? String(quote.total_amount) : '');
            setBillsExpenses(quote.outsourced_cost != null ? String(quote.outsourced_cost) : '0');
            if (quote.currency) {
                setPriceList(quote.currency);
            }
        } catch (error) {
            console.error('Failed to fetch quote budget data:', error);
        } finally {
            setIsLoadingQuoteBudget(false);
        }
    };

    // Update state when props change (e.g. when modal opens with new quote data)
    React.useEffect(() => {
        if (isOpen) {
            // Do not auto-set projectName from quoteName to avoid accidental overwrites
            setClient(clientName);
            // Default to external if coming from a quote
            if (quoteId) {
                setProjectType('external');
                fetchQuoteBudgetData(quoteId);
            } else {
                // No quote to source budget data from; keep fields blank/default
                setTotalHours('');
                setTotalBudget('');
                setBillsExpenses('0');
                setPriceList('INR');
            }
        }
    }, [isOpen, clientName, quoteId]);



    if (!isOpen) return null;

    const handleCreateProject = async () => {
        if (!projectName) {
            toast.error('Project name is required');
            return;
        }

        setIsSaving(true);
        try {
            // Auto-confirm the quote if we are creating an external project from a quote
            if (quoteId && projectType === 'external') {
                try {
                    console.log(`Auto-confirming quote ${quoteId} before project creation...`);
                    await axiosInstance.put(`/quotes/${quoteId}/`, {
                        status: 'Confirmed'
                    });
                    console.log(`Quote ${quoteId} confirmed successfully.`);
                } catch (err) {
                    console.error('Failed to auto-confirm quote:', err);
                    // Proceed anyway; let the create project call fail if it must
                }
            }

            const payload: any = {
                project_name: projectName,
                project_type: projectType,
                start_date: startDate,
                end_date: dueDate || null,
                budget: {}
            };

            // Configure budget based on project type
            if (projectType === 'internal') {
                // Internal projects: use_quoted_amounts must be false
                payload.budget.use_quoted_amounts = false;
                payload.budget.total_hours = parseFloat(totalHours) || 0;
                payload.budget.total_budget = parseFloat(totalBudget) || 0;
            } else {
                // External projects
                payload.budget.use_quoted_amounts = budgetMethod === 'quoted';

                // Include quotation ID for external projects
                if (quoteId) {
                    payload.created_from_quotation = quoteId;
                }

                // Add budget fields based on method
                if (budgetMethod === 'manual') {
                    payload.budget.total_hours = parseFloat(totalHours) || 0;
                    if (totalBudget) {
                        payload.budget.total_budget = parseFloat(totalBudget);
                    }
                    payload.budget.bills_and_expenses = parseFloat(billsExpenses) || 0;
                } else {
                    // For quoted amounts, include bills_and_expenses if provided
                    if (billsExpenses) {
                        payload.budget.bills_and_expenses = parseFloat(billsExpenses) || 0;
                    }
                }
            }

            payload.budget.currency = priceList;

            console.log('Creating project with payload:', payload);
            const response = await axiosInstance.post('/projects/', payload);

            if (response.status === 201 || response.status === 200) {
                console.log('Project created successfully:', response.data);
                toast.success('Project created successfully');

                // Extract project ID from the actual response structure
                let newProjectId;

                // The backend returns: { Projects: [{ company_name: "...", project_details: [...] }] }
                if (response.data.Projects && response.data.Projects.length > 0) {
                    const projectDetails = response.data.Projects[0].project_details;
                    if (projectDetails && projectDetails.length > 0) {
                        // Get the last project (the newly created one)
                        newProjectId = projectDetails[projectDetails.length - 1].project_no;
                    }
                }

                console.log('Extracted project ID:', newProjectId);

                if (newProjectId) {
                    console.log('Navigating to project:', newProjectId);
                    navigate(`/projects/${newProjectId}`);
                } else {
                    console.warn('No project ID found in response data:', response.data);
                }

                onClose();
            }
        } catch (error: any) {
            console.error('Error creating project:', error);
            // Display specific error message from backend if available
            const errorMsg = error.response?.data?.created_from_quotation?.[0] ||
                error.response?.data?.detail ||
                'Failed to create project';
            toast.error(errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 br-10 bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={handleBackdropClick}
            >
                {/* Modal */}
                <div
                    className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl font-bold text-gray-900">Create Project</h2>
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                                aria-label="Close modal"
                            >
                                <X size={24} className="text-gray-600" />
                            </button>
                        </div>
                        {/* Static informational text */}
                        <p className="text-sm text-gray-600 mt-2">
                            Move questions to Confirmed & Create Project.
                        </p>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 px-6">
                        <div className="flex gap-1">
                            <button
                                onClick={() => setActiveTab('project')}
                                className={`px-6 py-3 font-semibold text-sm transition-colors relative ${activeTab === 'project'
                                    ? 'text-gray-900 bg-gray-100'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                Project Settings
                                {activeTab === 'project' && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                                )}
                            </button>
                            {!hideBudgetTab && (
                                <button
                                    onClick={() => setActiveTab('budget')}
                                    className={`px-6 py-3 font-semibold text-sm transition-colors relative ${activeTab === 'budget'
                                        ? 'text-gray-900 bg-gray-100'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                >
                                    Budget Settings
                                    {activeTab === 'budget' && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="p-6">
                        {activeTab === 'project' ? (
                            /* Project Settings Tab */
                            <div className="space-y-6">
                                {/* Project Name */}
                                <div className="grid grid-cols-2 gap-6">
                                    <InputField
                                        label="Project name"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="Enter project name"
                                    />
                                    <InputField
                                        label="Project no"
                                        value=""
                                        disabled
                                        placeholder="Auto-generated"
                                    />
                                </div>

                                {/* Project Type */}
                                <div>
                                    <label className="block text-base font-medium text-gray-900 mb-3">
                                        Project type
                                    </label>
                                    {hideBudgetTab ? (
                                        // Show both buttons but disable External when creating from admin page
                                        <div className="flex gap-3">
                                            <div className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-gray-200 text-gray-900">
                                                Internal
                                            </div>
                                            <div className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
                                                External
                                            </div>
                                        </div>
                                    ) : (
                                        // Allow selection when creating from quote
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setProjectType('internal')}
                                                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${projectType === 'internal'
                                                    ? 'bg-gray-200 text-gray-900'
                                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                            >
                                                Internal
                                            </button>
                                            <button
                                                onClick={() => setProjectType('external')}
                                                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${projectType === 'external'
                                                    ? 'bg-gray-200 text-gray-900'
                                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                            >
                                                External
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Project Setup */}
                                <div>
                                    <label className="block text-base font-medium text-gray-900 mb-3">
                                        Project Setup
                                    </label>
                                    <div className="space-y-4">
                                        {/* Client Dropdown - Hide when creating from admin page */}
                                        {!hideBudgetTab && (
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Client</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={client}
                                                        onChange={(e) => setClient(e.target.value)}
                                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                                        placeholder="Client Name"
                                                        readOnly={projectType === 'external' && !!clientName}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Dates */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                                                <InputField
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-gray-600 mb-1">Due Date</label>
                                                <InputField
                                                    type="date"
                                                    value={dueDate}
                                                    onChange={(e) => setDueDate(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Budget Settings Tab */
                            <div className="space-y-6">
                                {/* Budget Method Toggle */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setBudgetMethod('quoted')}
                                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${budgetMethod === 'quoted'
                                            ? 'bg-gray-200 text-gray-900'
                                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        Use quoted amounts
                                    </button>
                                    <button
                                        onClick={() => setBudgetMethod('manual')}
                                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${budgetMethod === 'manual'
                                            ? 'bg-gray-200 text-gray-900'
                                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        Set manually
                                    </button>
                                </div>

                                <p className="text-sm text-gray-500">
                                    You can add members to the project later from the project view
                                </p>

                                {quoteId && (
                                    <p className="text-sm text-blue-600">
                                        {isLoadingQuoteBudget
                                            ? 'Fetching hours, budget, bills & expenses and price list from the quote...'
                                            : 'Values below were fetched from the quote. You can edit them if needed.'}
                                    </p>
                                )}

                                {/* Budget Fields - Show different fields based on budget method */}
                                {/* Budget Fields */}
                                <div className={`grid gap-4 ${budgetMethod === "manual" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>

                                    <InputField
                                        label="Total hours"
                                        value={totalHours}
                                        onChange={(e) => setTotalHours(e.target.value)}
                                        placeholder="0"
                                        disabled={isLoadingQuoteBudget}
                                    />

                                    <InputField
                                        label={`Total budget ${priceList}`}
                                        value={totalBudget}
                                        onChange={(e) => setTotalBudget(e.target.value)}
                                        placeholder="0"
                                        disabled={isLoadingQuoteBudget}
                                    />

                                    {/* Hide Bills & Expenses only in manual mode */}
                                    {budgetMethod === "quoted" && (
                                        <InputField
                                            label="Bills & Expenses"
                                            value={billsExpenses}
                                            onChange={(e) => setBillsExpenses(e.target.value)}
                                            placeholder="0"
                                            disabled={isLoadingQuoteBudget}
                                        />
                                    )}
                                </div>



                                {/* Price List */}
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">Price list</label>
                                    <div className="relative">
                                        <select
                                            value={priceList}
                                            onChange={(e) => setPriceList(e.target.value)}
                                            disabled={isLoadingQuoteBudget}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none disabled:opacity-50"
                                        >
                                            <option value="INR">INR - Indian Rupee (₹)</option>
                                            <option value="USD">USD - US Dollar ($)</option>
                                            <option value="EUR">EUR - Euro (€)</option>
                                            <option value="GBP">GBP - British Pound (£)</option>
                                            <option value="AUD">AUD - Australian Dollar (A$)</option>
                                            <option value="CAD">CAD - Canadian Dollar (C$)</option>
                                            <option value="SGD">SGD - Singapore Dollar (S$)</option>
                                            <option value="JPY">JPY - Japanese Yen (¥)</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg
                                                className="w-5 h-5 text-gray-400"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 9l-7 7-7-7"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-center">
                        <button
                            onClick={handleCreateProject}
                            disabled={isSaving}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
                        >
                            {isSaving ? 'Creating...' : 'Create Project'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
