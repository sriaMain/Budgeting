/**
 * Create Project Modal Component
 * Modal with tabbed interface for creating projects from quotes
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, User } from 'lucide-react';
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
    const [membersOnly, setMembersOnly] = useState(false);
    const [client, setClient] = useState(clientName);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [totalHours, setTotalHours] = useState('');
    const [totalBudget, setTotalBudget] = useState('');
    const [billsExpenses, setBillsExpenses] = useState('0');

    // Update state when props change (e.g. when modal opens with new quote data)
    React.useEffect(() => {
        if (isOpen) {
            // Do not auto-set projectName from quoteName to avoid accidental overwrites
            setClient(clientName);
            // Default to external if coming from a quote
            if (quoteId) {
                setProjectType('external');
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

                                {/* Project Manager */}
                                <div>
                                    <label className="block text-base font-medium text-gray-900 mb-2">
                                        Project Manager
                                    </label>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                                <User size={16} className="text-gray-600" />
                                            </div>
                                            <span className="text-gray-900 font-medium">{authorName || 'SRIDEVI GEDALA'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={membersOnly}
                                                    onChange={(e) => setMembersOnly(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                            <span className="text-sm text-gray-700">Members only</span>
                                            <button className="p-1 hover:bg-gray-100 rounded" title="Info">
                                                <svg
                                                    className="w-4 h-4 text-gray-400"
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">
                                        You can add members to the project later from the project view
                                    </p>
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

                                {/* Budget Fields - Show different fields based on budget method */}
                                {/* Budget Fields */}
                                <div className={`grid gap-4 ${budgetMethod === "manual" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>

                                    <InputField
                                        label="Total hours"
                                        value={totalHours}
                                        onChange={(e) => setTotalHours(e.target.value)}
                                        placeholder="0"
                                    />

                                    <InputField
                                        label="Total budget INR"
                                        value={totalBudget}
                                        onChange={(e) => setTotalBudget(e.target.value)}
                                        placeholder="0"
                                    />

                                    {/* Hide Bills & Expenses only in manual mode */}
                                    {budgetMethod === "quoted" && (
                                        <InputField
                                            label="Bills & Expenses"
                                            value={billsExpenses}
                                            onChange={(e) => setBillsExpenses(e.target.value)}
                                            placeholder="0"
                                        />
                                    )}
                                </div>



                                {/* Price List */}
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">Price list</label>
                                    <div className="relative">
                                        <select
                                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none"
                                        >
                                            <option value="INR">INR</option>
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
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
