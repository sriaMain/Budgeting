/**
 * Create Project Modal Component
 * Single-page form for creating a project (from a quote, or internal).
 * Budget figures aren't asked for here: a quote-based project uses the
 * quote's amounts, an internal one starts from its contract value / monthly
 * billing amount, and the spending budget can be adjusted later from the
 * project's Financials tab.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { InputField } from './InputField';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    quoteId?: number | string;
    quoteName?: string;
    clientName?: string;
    authorName?: string;
}

type EngagementType = 'fixed' | 'time_and_material';

const ENGAGEMENT_TYPES: { value: EngagementType; label: string; description: string }[] = [
    { value: 'fixed', label: 'Fixed Budget / Milestone-Based', description: 'A fixed contract value billed in milestones/phases.' },
    { value: 'time_and_material', label: 'Time & Material (T&M)', description: 'Recurring billing based on staffed resources.' },
];

const BILLING_FREQUENCIES: { value: string; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Bi-Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
    isOpen,
    onClose,
    quoteId,
    quoteName = '',
    clientName = '',
    authorName = '',
}) => {
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    // Do NOT auto-fill project name from quoteName by default
    const [projectName, setProjectName] = useState('');
    const [clientOptions, setClientOptions] = useState<SearchableSelectOption[]>([]);
    const [client, setClient] = useState<SearchableSelectOption | null>(null);
    const [clientLocked, setClientLocked] = useState(false);
    const [clientContact, setClientContact] = useState<{ name: string; email: string } | null>(null);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [totalHours, setTotalHours] = useState('');
    const [totalBudget, setTotalBudget] = useState('');
    const [billsExpenses, setBillsExpenses] = useState('0');
    const [priceList, setPriceList] = useState('INR');
    const [isLoadingQuoteBudget, setIsLoadingQuoteBudget] = useState(false);

    // Project Types / Financial Management: engagement model - a DIFFERENT
    // axis from internal/external above (project_type), controls the
    // Milestones-vs-Resources workflow on the project detail page.
    const [engagementType, setEngagementType] = useState<EngagementType>('fixed');
    const [contractValue, setContractValue] = useState('');
    const [billingFrequency, setBillingFrequency] = useState('monthly');
    const [monthlyBillingAmount, setMonthlyBillingAmount] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        axiosInstance.get<{ id: number; company_name: string }[]>('/client/dropdown/?ready_only=1')
            .then((res) => {
                const options = (res.data || []).map((c) => ({ id: c.id, label: c.company_name }));
                setClientOptions(options);
                // If opened with a known client name (e.g. from a quote), try to
                // pre-select the matching master record and lock it - otherwise
                // leave it editable so the admin can pick the right one.
                if (clientName) {
                    const match = options.find((o) => o.label.toLowerCase() === clientName.toLowerCase());
                    if (match) {
                        setClient(match);
                        setClientLocked(true);
                        return;
                    }
                }
                setClient(null);
                setClientLocked(false);
            })
            .catch((err) => console.error('Failed to fetch clients:', err));

        setEngagementType('fixed');
        setContractValue('');
        setBillingFrequency('monthly');
        setMonthlyBillingAmount('');
    }, [isOpen, clientName]);

    // Show the client's own saved contact person for reference - separate
    // from (and not to be confused with) the project's own POC selected
    // below, which is who's assigned to this project, not the client's contact.
    useEffect(() => {
        if (!client) {
            setClientContact(null);
            return;
        }
        axiosInstance.get<{ poc_name: string; poc_email: string }[]>(`/client/${client.id}/pocs/`)
            .then((res) => {
                const first = (res.data || [])[0];
                setClientContact(first ? { name: first.poc_name, email: first.poc_email } : null);
            })
            .catch(() => setClientContact(null));
    }, [client]);

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
            // Contract Value must exclude GST: sub_total is the quote's
            // pre-tax base amount, total_amount includes tax_percentage.
            if (quote.sub_total != null) {
                setContractValue(String(quote.sub_total));
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
            if (quoteId) {
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
        if (engagementType === 'time_and_material' && !monthlyBillingAmount) {
            toast.error('Monthly billing amount is required for Time & Material projects');
            return;
        }

        setIsSaving(true);
        try {
            // Project type is derived, not chosen: a project created from a
            // quote is always external and linked to it; otherwise internal.
            const projectType: 'internal' | 'external' = quoteId ? 'external' : 'internal';

            // Auto-confirm the quote if we are creating an external project from a quote
            if (quoteId) {
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
                budget: {},
                engagement_type: engagementType,
            };

            if (engagementType === 'fixed') {
                // Not asked for in this form any more - the backend still
                // requires it, so send the quote's pre-tax sub_total (or 0)
                // and let it be edited later from the project page.
                payload.contract_value = parseFloat(contractValue) || 0;
            } else {
                payload.monthly_billing_amount = parseFloat(monthlyBillingAmount);
                payload.billing_frequency = billingFrequency;
                // No separate budget here - the backend starts each month's spending
                // budget at the billing amount; it can be changed on the Financials tab.
            }

            if (client) {
                payload.client = client.id;
            }

            // Configure budget based on project type
            if (projectType === 'internal') {
                // Internal projects: use_quoted_amounts must be false
                payload.budget.use_quoted_amounts = false;
                payload.budget.total_hours = parseFloat(totalHours) || 0;
                payload.budget.total_budget = parseFloat(totalBudget) || 0;
            } else {
                // External projects take their budget from the quote
                payload.budget.use_quoted_amounts = true;

                // Include quotation ID for external projects
                if (quoteId) {
                    payload.created_from_quotation = quoteId;
                }

                if (billsExpenses) {
                    payload.budget.bills_and_expenses = parseFloat(billsExpenses) || 0;
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
                    className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 z-10">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Project</h2>
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                aria-label="Close modal"
                            >
                                <X size={24} className="text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                        {/* Static informational text */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            Move questions to Confirmed & Create Project.
                        </p>
                    </div>

                    {/* Form */}
                    <div className="p-6">
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

                                {/* Project Type (engagement/billing model) */}
                                <div>
                                    <label className="block text-base font-medium text-gray-900 dark:text-white mb-3">
                                        Project Type
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {ENGAGEMENT_TYPES.map((type) => (
                                            <button
                                                key={type.value}
                                                type="button"
                                                onClick={() => setEngagementType(type.value)}
                                                className={`text-left p-3 rounded-lg border transition-colors ${engagementType === type.value
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10'
                                                    : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                    }`}
                                            >
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{type.label}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{type.description}</p>
                                            </button>
                                        ))}
                                    </div>

                                    {engagementType === 'time_and_material' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                                <InputField
                                                    label={`Monthly billing amount (${priceList})`}
                                                    type="number"
                                                    value={monthlyBillingAmount}
                                                    onChange={(e) => setMonthlyBillingAmount(e.target.value)}
                                                    placeholder="0"
                                                />
                                                <div>
                                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Billing Frequency</label>
                                                    <select
                                                        value={billingFrequency}
                                                        onChange={(e) => setBillingFrequency(e.target.value)}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                                                    >
                                                        {BILLING_FREQUENCIES.map((f) => (
                                                            <option key={f.value} value={f.value}>{f.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                        </div>
                                    )}
                                </div>

                                {/* Project Setup */}
                                <div>
                                    <label className="block text-base font-medium text-gray-900 dark:text-white mb-3">
                                        Project Setup
                                    </label>
                                    <div className="space-y-4">
                                        {/* Client */}
                                        <div>
                                            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Client</label>
                                            <SearchableSelect
                                                options={clientOptions}
                                                value={client}
                                                onChange={setClient}
                                                placeholder="Select Client"
                                                disabled={clientLocked}
                                                emptyMessage="No clients found"
                                            />
                                            {clientContact && (
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    Client contact: {clientContact.name}
                                                    {clientContact.email ? ` • ${clientContact.email}` : ''}
                                                </p>
                                            )}
                                        </div>

                                        {/* Dates */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
                                                <InputField
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">End Date</label>
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
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-center">
                        <button
                            onClick={handleCreateProject}
                            // Wait for the quote's amounts - they become the project budget
                            disabled={isSaving || isLoadingQuoteBudget}
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
