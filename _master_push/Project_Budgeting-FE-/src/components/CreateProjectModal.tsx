/**
 * Create Project Modal Component
 * Modal with tabbed interface for creating projects from quotes
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
    hideBudgetTab?: boolean; // Hide budget tab when creating from admin projects page
}

type TabType = 'project' | 'budget';

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

interface ProjectManagerOption {
    id: number;
    name: string;
    designation?: string;
}

type PocCategory = 'employee' | 'vendor' | 'freelancer';

interface PocOption {
    id: number;
    type: PocCategory;
    name: string;
    subtitle: string;
}

const POC_CATEGORIES: { value: PocCategory; label: string }[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'freelancer', label: 'Freelancer' },
];

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
    const [budgetMethod, setBudgetMethod] = useState<'quoted' | 'manual'>('quoted');
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

    // Project Contract: Project % and Project Amount are kept in sync with
    // each other (and with contract value) by the handlers below - only one
    // of the two needs to be entered, the other is derived. Remaining Amount
    // is never stored as its own input state; it's always computed from
    // contractValue/projectAmount at render time.
    const [projectPercentage, setProjectPercentage] = useState('');
    const [projectAmount, setProjectAmount] = useState('');

    // Project Manager + POC
    const [projectManagerOptions, setProjectManagerOptions] = useState<SearchableSelectOption[]>([]);
    const [projectManager, setProjectManager] = useState<SearchableSelectOption | null>(null);

    // Raw combined list from the API, kept as-is (with type) so the POC
    // dropdown can be filtered per category without a second round-trip.
    const [pocOptionsRaw, setPocOptionsRaw] = useState<PocOption[]>([]);
    const [pocCategory, setPocCategory] = useState<PocCategory>('employee');
    const [poc, setPoc] = useState<SearchableSelectOption | null>(null);

    // Only the selected category's records, never labeled with their type
    // (the segmented control above already conveys that) - instead show a
    // category-relevant detail: an employee's modules, or a vendor's role
    // (e.g. Company/LLP). Freelancer's only distinguishing field is its
    // vendor_type, which would just re-state "Freelancer", so it's omitted.
    const pocOptions: SearchableSelectOption[] = pocOptionsRaw
        .filter((p) => p.type === pocCategory)
        .map((p) => ({
            id: p.id,
            label: p.name,
            sublabel: pocCategory !== 'freelancer' && p.subtitle ? p.subtitle : undefined,
        }));

    const handlePocCategoryChange = (category: PocCategory) => {
        setPocCategory(category);
        setPoc(null);
    };

    useEffect(() => {
        if (!isOpen) return;
        axiosInstance.get<ProjectManagerOption[]>('/projects/project-managers/')
            .then((res) => {
                setProjectManagerOptions(
                    (res.data || []).map((pm) => ({
                        id: pm.id,
                        label: pm.name,
                        sublabel: pm.designation || undefined,
                    }))
                );
            })
            .catch((err) => console.error('Failed to fetch project managers:', err));

        axiosInstance.get<PocOption[]>('/projects/poc-options/')
            .then((res) => setPocOptionsRaw(res.data || []))
            .catch((err) => console.error('Failed to fetch POC options:', err));

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

        setProjectManager(null);
        setPocCategory('employee');
        setPoc(null);
        setEngagementType('fixed');
        setContractValue('');
        setBillingFrequency('monthly');
        setMonthlyBillingAmount('');
        setProjectPercentage('');
        setProjectAmount('');
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

    // Project Contract: Contract Value x Project % = Project Amount, and
    // Remaining Amount = Contract Value - Project Amount. Only one of
    // Project %/Project Amount needs to be entered - the other three
    // handlers below keep everything else in sync so the fields never
    // disagree with each other.
    const handleContractValueChange = (value: string) => {
        setContractValue(value);
        const cv = parseFloat(value) || 0;
        if (projectAmount !== '') {
            const amt = parseFloat(projectAmount) || 0;
            setProjectPercentage(cv > 0 ? ((amt / cv) * 100).toFixed(2) : '');
        } else if (projectPercentage !== '') {
            const pct = parseFloat(projectPercentage) || 0;
            setProjectAmount(cv > 0 ? ((cv * pct) / 100).toFixed(2) : '');
        }
    };

    const handleProjectPercentageChange = (value: string) => {
        setProjectPercentage(value);
        const cv = parseFloat(contractValue) || 0;
        const pct = parseFloat(value);
        setProjectAmount(!isNaN(pct) && cv > 0 ? ((cv * pct) / 100).toFixed(2) : '');
    };

    const handleProjectAmountChange = (value: string) => {
        setProjectAmount(value);
        const cv = parseFloat(contractValue) || 0;
        const amt = parseFloat(value);
        setProjectPercentage(!isNaN(amt) && cv > 0 ? ((amt / cv) * 100).toFixed(2) : '');
    };

    const remainingAmountDisplay = (() => {
        if (!contractValue) return '—';
        const cv = parseFloat(contractValue) || 0;
        const amt = parseFloat(projectAmount) || 0;
        return `${(cv - amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${priceList}`;
    })();

    const handleCreateProject = async () => {
        if (!projectName) {
            toast.error('Project name is required');
            return;
        }
        if (engagementType === 'fixed' && !contractValue) {
            toast.error('Contract value is required for Fixed Budget / Milestone-Based projects');
            return;
        }
        if (engagementType === 'time_and_material' && !monthlyBillingAmount) {
            toast.error('Monthly billing amount is required for Time & Material projects');
            return;
        }
        if (engagementType === 'fixed' && (projectPercentage !== '' || projectAmount !== '')) {
            const cv = parseFloat(contractValue) || 0;
            if (projectPercentage !== '') {
                const pct = parseFloat(projectPercentage);
                if (isNaN(pct) || pct < 0 || pct > 100) {
                    toast.error('Project % must be between 0 and 100');
                    return;
                }
            }
            if (projectAmount !== '') {
                const amt = parseFloat(projectAmount);
                if (isNaN(amt) || amt < 0) {
                    toast.error('Profit Margin cannot be negative');
                    return;
                }
                if (amt > cv) {
                    toast.error('Profit Margin cannot be greater than Contract Value');
                    return;
                }
            }
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
                payload.contract_value = parseFloat(contractValue);
                if (projectAmount !== '') {
                    payload.project_amount = parseFloat(projectAmount);
                }
                if (projectPercentage !== '') {
                    payload.project_percentage = parseFloat(projectPercentage);
                }
            } else {
                payload.monthly_billing_amount = parseFloat(monthlyBillingAmount);
                payload.billing_frequency = billingFrequency;
            }

            if (client) {
                payload.client = client.id;
            }
            if (projectManager) {
                payload.project_manager = projectManager.id;
            }
            if (poc) {
                payload.poc_type = pocCategory;
                payload.poc_id = poc.id;
            }

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

                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-800 px-6">
                        <div className="flex gap-1">
                            <button
                                onClick={() => setActiveTab('project')}
                                className={`px-6 py-3 font-semibold text-sm transition-colors relative ${activeTab === 'project'
                                    ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
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
                                        ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                        {engagementType === 'fixed' ? (
                                            <InputField
                                                label={`Contract value (${priceList})${quoteId ? ' - excl. GST' : ''}`}
                                                type="number"
                                                value={contractValue}
                                                onChange={(e) => handleContractValueChange(e.target.value)}
                                                placeholder="0"
                                            />
                                        ) : (
                                            <>
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
                                            </>
                                        )}
                                    </div>

                                    {/* Project Contract: Project % / Project Amount / Remaining Amount,
                                        calculated against the Contract Value above. */}
                                    {engagementType === 'fixed' && (
                                        <div className="mt-4 border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Project Contract</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Contract Value</label>
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-2">
                                                        {contractValue
                                                            ? `${parseFloat(contractValue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${priceList}`
                                                            : '—'}
                                                    </p>
                                                    {quoteId && <p className="text-[11px] text-gray-400 dark:text-gray-500">Excluding GST</p>}
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Project %</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={projectPercentage}
                                                        onChange={(e) => handleProjectPercentageChange(e.target.value)}
                                                        placeholder="0"
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Profit Margin ({priceList})</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={projectAmount}
                                                        onChange={(e) => handleProjectAmountChange(e.target.value)}
                                                        placeholder="0"
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining Amount</label>
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-2">{remainingAmountDisplay}</p>
                                                </div>
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

                                        {/* Project Manager */}
                                        <div>
                                            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Project Manager</label>
                                            <SearchableSelect
                                                options={projectManagerOptions}
                                                value={projectManager}
                                                onChange={setProjectManager}
                                                placeholder="Select Project Manager"
                                                emptyMessage="No employees with the Project Manager role"
                                            />
                                        </div>

                                        {/* POC */}
                                        <div>
                                            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">POC</label>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">POC Category</label>
                                                    <div className="flex gap-2">
                                                        {POC_CATEGORIES.map((category) => (
                                                            <button
                                                                key={category.value}
                                                                type="button"
                                                                onClick={() => handlePocCategoryChange(category.value)}
                                                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${pocCategory === category.value
                                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                                    : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                                    }`}
                                                            >
                                                                {category.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        Select {POC_CATEGORIES.find((c) => c.value === pocCategory)?.label}
                                                    </label>
                                                    <SearchableSelect
                                                        options={pocOptions}
                                                        value={poc}
                                                        onChange={setPoc}
                                                        placeholder={`Search ${pocCategory}...`}
                                                        emptyMessage={`No ${pocCategory}s found`}
                                                    />
                                                </div>
                                            </div>
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
                        ) : (
                            /* Budget Settings Tab */
                            <div className="space-y-6">
                                {/* Budget Method Toggle */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setBudgetMethod('quoted')}
                                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${budgetMethod === 'quoted'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                            : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        Use quoted amounts
                                    </button>
                                    <button
                                        onClick={() => setBudgetMethod('manual')}
                                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${budgetMethod === 'manual'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                            : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        Set manually
                                    </button>
                                </div>

                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    You can add members to the project later from the project view
                                </p>

                                {quoteId && (
                                    <p className="text-sm text-blue-600 dark:text-blue-400">
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
                                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Price list</label>
                                    <div className="relative">
                                        <select
                                            value={priceList}
                                            onChange={(e) => setPriceList(e.target.value)}
                                            disabled={isLoadingQuoteBudget}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none disabled:opacity-50"
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
                                                className="w-5 h-5 text-gray-400 dark:text-gray-500"
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
                    <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-center">
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
