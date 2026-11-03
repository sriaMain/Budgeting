import { formatDate as toDMY } from '../utils/date';
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, ArrowLeft, Building2, Clock, Hourglass, Wallet, AlertTriangle, Pencil } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { ReusableTable, type Column } from '../components/ReusableTable';
import { StatusBadge } from '../components/StatusBadge';
import { MetricCard } from '../components/StatCard';
import { formatMoney } from '../utils/format';
import { DEFAULT_ENGAGEMENT_STYLE, DEFAULT_PROJECT_STATUS_STYLE, ENGAGEMENT_META, PROJECT_STATUS_STYLES } from '../utils/projectMeta';
import { HelpdeskTasksPanel } from '../components/HelpdeskTasksPanel';
import { useHelpdeskTasks } from '../hooks/useHelpdeskTasks';
import { isTaskDone, isTaskOverdue } from '../utils/helpdeskTasks';
import { ProjectCostEntriesPanel } from '../components/ProjectCostEntriesPanel';
import { BudgetLinesPanel } from '../components/BudgetLinesPanel';
import { MilestonesPanel } from '../components/MilestonesPanel';
import { ResourcesPanel } from '../components/ResourcesPanel';
import { FinancialSummaryPanel } from '../components/FinancialSummaryPanel';
import { GenerateMonthlyInvoiceDrawer } from '../components/GenerateMonthlyInvoiceDrawer';
import { InvoiceDrawer } from '../components/InvoiceDrawer';
import { paymentStatusVariant } from '../utils/paymentStatus';
import { BillDrawer } from '../components/BillDrawer';
import { ExpenseDrawer } from '../components/ExpenseDrawer';
import { toast } from 'react-hot-toast';

interface ProjectDetailsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const ProjectDetailsPage: React.FC<ProjectDetailsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<string>('Tasks');
    const [budgetSubTab, setBudgetSubTab] = useState<string>('Budget health');
    const [budgetViewMode, setBudgetViewMode] = useState<string>('Budget');
    const [paymentSearch, setPaymentSearch] = useState<string>('');
    const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('All');
    const [showPaymentFilter, setShowPaymentFilter] = useState<boolean>(false);
    const [invoiceSearch, setInvoiceSearch] = useState<string>('');
    const [isMonthlyInvoiceOpen, setIsMonthlyInvoiceOpen] = useState(false);
    // Invoice / bill / expense details open in a drawer on this page
    const [openInvoiceId, setOpenInvoiceId] = useState<number | null>(null);
    const [openBillId, setOpenBillId] = useState<number | null>(null);
    const [openExpenseId, setOpenExpenseId] = useState<number | null>(null);
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    // Tasks tab + Overdue Tasks KPI: the helpdesk's tasks on this project (created and assigned there).
    const helpdeskTasks = useHelpdeskTasks(projectId ? `/projects/${projectId}/helpdesk-tasks/` : undefined);
    // Hours already logged on Project Budgeting's own tasks - only for the billable-overrun KPI.
    const [taskConsumedHours, setTaskConsumedHours] = useState(0);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [payments, setPayments] = useState<any[]>([]);
    const [isLoadingPayments, setIsLoadingPayments] = useState(false);
    const [paymentSummary, setPaymentSummary] = useState<any>(null);
    const [outgoingPayments, setOutgoingPayments] = useState<any[]>([]);
    // Labels for the header's status badge (same source as the Projects list).
    const [statusChoices, setStatusChoices] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        axiosInstance.get('project-status-choices/')
            .then(response => setStatusChoices(response.data?.status_choices || []))
            .catch(error => console.error('Error fetching status choices:', error));
    }, []);

    // Handle tab query parameter
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam) {
            // The Finances tab is now "Payment" (Details was removed) - keep old links working.
            if (tabParam === 'Finances' || tabParam === 'Details' || tabParam === 'Payments') {
                setActiveTab('Payment');
                return;
            }
            // Budget and Time tabs were removed - fall back to Tasks for old ?tab=Budget / ?tab=Time links.
            setActiveTab(tabParam === 'Budget' || tabParam === 'Time' ? 'Tasks' : tabParam);
        }
    }, [searchParams]);

    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (!projectId) return;
            try {
                const response = await axiosInstance.get(`/projects/${projectId}/`);
                const projectData = response.data;
                setProject(projectData);

                // Log contacts data for debugging
                console.log('Project data from API:', projectData);
                if (projectData.contacts && Array.isArray(projectData.contacts)) {
                    console.log('Project contacts from API:', projectData.contacts);
                }

                // Log budget data for debugging
                console.log('Budget fields:', {
                    budget: projectData.budget,
                    total_budget: projectData.total_budget,
                    project_budget: projectData.project_budget,
                    allocated_budget: projectData.allocated_budget,
                    budgets: projectData.budgets
                });

                // Extract invoices from project data
                if (projectData.invoices && Array.isArray(projectData.invoices)) {
                    console.log('Project invoices from API:', projectData.invoices);
                    setInvoices(projectData.invoices);
                }
            } catch (error) {
                console.error('Error fetching project details:', error);
            } finally {
                setLoading(false);
            }
        };

        const fetchTaskConsumedHours = async () => {
            if (!projectId) return;
            try {
                const response = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
                const projectTasks = Array.isArray(response.data) ? response.data[0]?.Tasks : null;
                if (Array.isArray(projectTasks)) {
                    setTaskConsumedHours(projectTasks.reduce((sum: number, t: any) => sum + (Number(t.consumed_hours) || 0), 0));
                }
            } catch (error) {
                console.error('Error fetching project task hours:', error);
            }
        };

        fetchProjectDetails();
        fetchTaskConsumedHours();
    }, [projectId]);

    // Invoices are only ever populated from this one project-detail fetch,
    // which the mount effect above runs once. Anything that creates an
    // invoice elsewhere on this page (Milestones tab billing, T&M period
    // billing from this tab's Generate Invoice drawer) has no way to tell that effect to
    // re-run, so the invoice list kept showing stale ("No invoices") data
    // until a full page reload. Refetching whenever the Invoices tab is
    // opened keeps it current without needing every child component to
    // know about the parent's state.
    const refreshInvoices = useCallback(async () => {
        if (!projectId) return;
        setIsLoadingInvoices(true);
        try {
            const response = await axiosInstance.get(`/projects/${projectId}/`);
            const projectData = response.data;
            setProject(projectData);
            if (projectData.invoices && Array.isArray(projectData.invoices)) {
                setInvoices(projectData.invoices);
            }
        } catch (error) {
            console.error('Error refreshing invoices:', error);
        } finally {
            setIsLoadingInvoices(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (activeTab === 'Invoices') {
            refreshInvoices();
        }
    }, [activeTab, refreshInvoices]);

    // Fetch payments for all project invoices
    const fetchProjectPayments = async () => {
        if (!projectId) {
            setPayments([]);
            setOutgoingPayments([]);
            setPaymentSummary(null);
            return;
        }

        try {
            setIsLoadingPayments(true);
            // Fetch payments using the project payments list endpoint
            const response = await axiosInstance.get(`/projects/${projectId}/payments-list/`);

            console.log('Project payments response:', response.data);

            // Extract payments from the new API structure
            if (response.data) {
                const { incoming, outgoing, summary } = response.data;

                // Set incoming payments
                setPayments(incoming?.payments || []);

                // Set outgoing payments
                setOutgoingPayments(outgoing?.payments || []);

                // Set payment summary
                setPaymentSummary({
                    total_invoiced: incoming?.total_received || 0,
                    invoice_count: incoming?.invoice_count || 0,
                    total_payments: incoming?.total_received || 0,
                    payment_count: incoming?.payment_count || 0,
                    outgoing_total_payments: outgoing?.total_paid || 0,
                    outgoing_payment_count: (outgoing?.purchase_order_payment_count || 0) + (outgoing?.expense_payment_count || 0),
                    net_balance: summary?.net_balance || 0
                });
            } else {
                setPayments([]);
                setOutgoingPayments([]);
                setPaymentSummary(null);
            }
        } catch (error) {
            console.error('Error fetching payments:', error);
            setPayments([]);
            setOutgoingPayments([]);
            setPaymentSummary(null);
        } finally {
            setIsLoadingPayments(false);
        }
    };

    // Fetch payments when the Payments tab, or the Budget tab's Revenue/Profit
    // sub-tabs (which reuse the same invoiced/received figures), are active.
    useEffect(() => {
        if (activeTab === 'Payment' || activeTab === 'Budget') {
            fetchProjectPayments();
        }
    }, [activeTab, projectId]);

    // After a payment / edit / delete in an invoice, bill or expense drawer
    const refreshFinancials = () => {
        refreshInvoices();
        if (activeTab === 'Payment' || activeTab === 'Budget') fetchProjectPayments();
    };

    // Converts a backend "HH:MM:SS" string (e.g. remaining_billable_hours) to decimal hours.
    const parseHmsToHours = (hms?: string | null): number => {
        if (!hms) return 0;
        const parts = hms.split(':').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
        const [h, m, s] = parts;
        return h + m / 60 + s / 3600;
    };

    const formatHoursHM = (hours: number): string => {
        const totalMinutes = Math.max(0, Math.round(hours * 60));
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Real budget/hours figures for the KPI cards, sourced from project.budget
    // (backend ProjectBudgetSerializer — includes any timer running right now).
    const budgetTotalHours = Number(project?.budget?.billable_hours) || 0;
    const budgetRemainingHours = parseHmsToHours(project?.budget?.remaining_billable_hours);
    const budgetConsumedHours = Math.max(0, budgetTotalHours - budgetRemainingHours);
    const consumedHoursPercent = budgetTotalHours > 0 ? Math.round((budgetConsumedHours / budgetTotalHours) * 100) : 0;
    const remainingHoursPercent = budgetTotalHours > 0 ? Math.round((budgetRemainingHours / budgetTotalHours) * 100) : 0;

    // cost_budget excludes tax and profit margin (in_house + outsourced cost
    // only), unlike total_budget which mirrors the client-facing quote total
    // (sub_total + tax) - this is the figure "budget used/remaining" should
    // be measured against.
    const totalBudgetAmount = Number(project?.budget?.cost_budget) || 0;
    const usedBudgetAmount = Number(project?.budget?.used_budget) || 0;
    const budgetUsedPercent = totalBudgetAmount > 0 ? Math.round((usedBudgetAmount / totalBudgetAmount) * 100) : 0;
    const remainingBudgetAmount = project?.budget?.remaining_budget != null
        ? Number(project.budget.remaining_budget)
        : Math.max(0, totalBudgetAmount - usedBudgetAmount);
    const budgetCurrency = project?.budget?.currency || 'INR';

    // Project Types and Project Financial Management: only show the tab
    // relevant to this project's engagement model (Fixed -> Milestones,
    // T&M -> Resources); Financial Summary is common to both.
    const engagementType: 'fixed' | 'time_and_material' = project?.engagement_type || 'fixed';
    // Budget tab is hidden for now (its content below is kept, just unreachable).
    // Resources (assignment + resource cost) applies to every project; Milestones only to Fixed Budget ones.
    const mainTabs = [
        'Tasks', 'Expenses', 'Resources', 'Invoices',
        ...(engagementType === 'fixed' ? ['Milestones'] : []),
        'Financials',
        'Payment', // incoming / outgoing payments (formerly "Finances")
    ];

    const budgetHealth = totalBudgetAmount <= 0
        ? { label: 'No budget set', className: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300', bar: 'bg-gray-400' }
        : budgetUsedPercent >= 100
            ? { label: 'Over budget', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300', bar: 'bg-red-500' }
            : budgetUsedPercent >= 80
                ? { label: 'At risk', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
                : { label: 'On track', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300', bar: 'bg-green-500' };

    // Revenue: quoted amount (contracted value, shown for reference only) vs.
    // what's actually been invoiced and received. Invoiced/received come from
    // the same payments summary the Payment tab already fetches.
    const quotedRevenueAmount = project?.budget?.quoted_amount != null ? Number(project.budget.quoted_amount) : null;
    const totalInvoicedAmount = Number(paymentSummary?.total_invoiced) || 0;
    const totalReceivedAmount = Number(paymentSummary?.total_payments) || 0;
    const outstandingRevenueAmount = Math.max(0, totalInvoicedAmount - totalReceivedAmount);
    const revenueReceivedPercent = totalInvoicedAmount > 0 ? Math.round((totalReceivedAmount / totalInvoicedAmount) * 100) : 0;

    // Profit: actual invoiced revenue minus actual cost (labor + expenses) —
    // NOT the quoted/contracted value, so profit only appears once revenue has
    // actually been invoiced. Used consistently by both Budget health and the
    // Profit tab so the two never disagree.
    const profitOrLoss = totalInvoicedAmount > 0 ? totalInvoicedAmount - usedBudgetAmount : null;
    const profitMarginPercent = profitOrLoss !== null && totalInvoicedAmount > 0
        ? Math.round((profitOrLoss / totalInvoicedAmount) * 100)
        : null;

    // Forecasted Profit: budget - bills & expenses, straight from the backend's
    // ProjectBudget.forecasted_profit (same figure used in Reports > Project
    // Reports). Shown only pre-invoice, as a clearly-labeled estimate — it is
    // never used for the Healthy/Loss-making badge above, which stays tied to
    // realized (invoiced) profit only.
    const forecastedProfitAmount = project?.budget?.forecasted_profit != null
        ? Number(project.budget.forecasted_profit)
        : null;

    const overdueTasksCount = helpdeskTasks.tasks.filter(isTaskOverdue).length;

    const statusLabel = statusChoices.find(choice => choice.value === project?.status)?.label
        ?? (project?.status ? String(project.status).replace(/_/g, ' ') : '');
    const statusStyle = PROJECT_STATUS_STYLES[project?.status] || DEFAULT_PROJECT_STATUS_STYLE;
    const engagement = ENGAGEMENT_META[engagementType];
    const canEditProject = userRole === 'admin' || userRole === 'manager';

    // Billable hours beyond the plan: the backend floors remaining at 0, so an overrun only shows
    // in the tasks' own consumed hours.
    const consumedFromTasks = taskConsumedHours;
    const billableOverrun = budgetTotalHours > 0 ? Math.max(0, consumedFromTasks - budgetTotalHours) : 0;
    const consumedShown = billableOverrun > 0 ? consumedFromTasks : budgetConsumedHours;
    const consumedShownPercent = budgetTotalHours > 0 ? Math.round((consumedShown / budgetTotalHours) * 100) : 0;
    const openTasksCount = helpdeskTasks.tasks.filter(t => !isTaskDone(t)).length;

    if (loading) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div role="status" aria-label="Loading project" className="space-y-5">
                    <div className="h-[104px] animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 min-[360px]:grid-cols-2 min-[1280px]:grid-cols-4">
                        {[0, 1, 2, 3].map(i => <MetricCard key={i} compact loading label="" value="" />)}
                    </div>
                    <div className="h-72 animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
                </div>
            </Layout>
        );
    }

    if (!project) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div className="rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Project not found</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">The project you are looking for does not exist or you don't have permission to view it.</p>
                    <button
                        type="button"
                        onClick={() => navigate('/projects')}
                        className="h-10 px-4 rounded-md bg-navy-900 text-sm font-semibold text-white hover:bg-navy-800"
                    >
                        Back to Projects
                    </button>
                </div>
            </Layout>
        );
    }

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="w-full space-y-5">{/* full page width, same as the Projects list */}
                {/* Header - number, status and type on one line, then the name and client */}
                <header className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/projects')}
                            aria-label="Back to Projects"
                            title="Back to Projects"
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                                <span className="font-medium tabular-nums text-gray-500 dark:text-gray-400">#{project.project_no || projectId}</span>
                                {statusLabel && (
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyle}`}>
                                        {statusLabel}
                                    </span>
                                )}
                                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${engagement?.className ?? DEFAULT_ENGAGEMENT_STYLE}`}>
                                    {engagement?.label ?? engagementType}
                                </span>
                            </div>
                            <h1 className="mt-1 line-clamp-2 break-words text-[22px] font-semibold leading-7 text-gray-900 dark:text-white" title={project.project_name}>
                                {project.project_name}
                            </h1>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-gray-500 dark:text-gray-400">
                                {project.company_name && (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                        <Building2 size={13} aria-hidden="true" className="shrink-0" />
                                        <span className="truncate" title={project.company_name}>{project.company_name}</span>
                                    </span>
                                )}
                                {project.company_name && (project.start_date || project.end_date) && <span aria-hidden="true">·</span>}
                                {(project.start_date || project.end_date) && (
                                    <span className="tabular-nums">{toDMY(project.start_date, 'Not set')} – {toDMY(project.end_date, 'Not set')}</span>
                                )}
                            </p>
                        </div>
                        {canEditProject && (
                            <button
                                type="button"
                                onClick={() => navigate(`/projects/edit/${project.project_no || projectId}`)}
                                className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:inline-flex dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                <Pencil size={14} aria-hidden="true" />
                                Edit details
                            </button>
                        )}
                    </div>
                </header>

                {/* KPIs - every value from project.budget and the helpdesk task list */}
                <section aria-label="Project overview" className="grid grid-cols-1 gap-3 sm:gap-4 min-[360px]:grid-cols-2 min-[1280px]:grid-cols-4">
                    <MetricCard
                        compact
                        label="Billable Hours"
                        value={formatHoursHM(budgetTotalHours)}
                        icon={<Clock size={16} />}
                        caption={budgetTotalHours > 0 ? `${formatHoursHM(consumedShown)} consumed · ${consumedShownPercent}%` : 'No billable hours set'}
                    />
                    <MetricCard
                        compact
                        label="Remaining Billable Hours"
                        value={formatHoursHM(budgetRemainingHours)}
                        icon={<Hourglass size={16} />}
                        caption={billableOverrun > 0
                            ? <span className="font-medium text-risk-600 dark:text-red-400">Over by {formatHoursHM(billableOverrun)}</span>
                            : budgetTotalHours > 0 ? `${remainingHoursPercent}% left` : '—'}
                    />
                    <MetricCard
                        compact
                        className="min-[360px]:max-[479px]:col-span-2"
                        label="Total Budget"
                        value={formatMoney(totalBudgetAmount, budgetCurrency)}
                        icon={<Wallet size={16} />}
                        caption={totalBudgetAmount > 0
                            ? <span className={budgetUsedPercent >= 100 ? 'font-medium text-risk-600 dark:text-red-400' : ''}>{formatMoney(usedBudgetAmount, budgetCurrency)} used · {budgetUsedPercent}%</span>
                            : 'No budget set'}
                    />
                    <MetricCard
                        compact
                        className="min-[360px]:max-[479px]:col-span-2"
                        label="Overdue Tasks"
                        value={helpdeskTasks.error ? '—' : overdueTasksCount.toLocaleString('en-IN')}
                        loading={helpdeskTasks.loading}
                        icon={<AlertTriangle size={16} />}
                        caption={helpdeskTasks.error ? 'Helpdesk unavailable' : overdueTasksCount > 0
                            ? <span className="font-medium text-risk-600 dark:text-red-400">of {openTasksCount} open {openTasksCount === 1 ? 'task' : 'tasks'}</span>
                            : openTasksCount > 0 ? 'Nothing overdue' : 'No open tasks'}
                    />
                </section>

                {/* Tabs Section */}
                <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    {/* Main Tabs - scroll sideways on small screens */}
                    <div
                        role="tablist"
                        aria-label="Project sections"
                        className="flex overflow-x-auto border-b border-gray-200 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-800"
                        onKeyDown={(e) => {
                            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                            const next = mainTabs[(mainTabs.indexOf(activeTab) + (e.key === 'ArrowRight' ? 1 : mainTabs.length - 1)) % mainTabs.length];
                            setActiveTab(next);
                            requestAnimationFrame(() => document.getElementById(`project-tab-${next}`)?.focus());
                        }}
                    >
                        {mainTabs.map((tab) => (
                            <button
                                type="button"
                                key={tab}
                                id={`project-tab-${tab}`}
                                role="tab"
                                aria-selected={activeTab === tab}
                                aria-controls="project-tab-panel"
                                tabIndex={activeTab === tab ? 0 : -1}
                                onClick={() => setActiveTab(tab)}
                                className={`-mb-px h-12 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800 ${activeTab === tab
                                    ? 'border-teal-600 text-gray-900 dark:border-violet-400 dark:text-white'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div id="project-tab-panel" role="tabpanel" aria-labelledby={`project-tab-${activeTab}`} className="p-4 sm:p-5">
                        {activeTab === 'Tasks' && (
                            <HelpdeskTasksPanel
                                tasks={helpdeskTasks.tasks}
                                loading={helpdeskTasks.loading}
                                error={helpdeskTasks.error}
                                fetchedAt={helpdeskTasks.fetchedAt}
                                onRefresh={helpdeskTasks.refresh}
                            />
                        )}

                        {activeTab === 'Budget' && (
                            <div className="space-y-6">
                                {/* Budget Sub Tabs: Budget health, Revenue, Profit */}
                                <div className="border-b border-gray-200 dark:border-gray-800">
                                    <div className="flex gap-6">
                                        {['Budget health', 'Revenue', 'Profit', 'GL Accounts'].map((subTab) => (
                                            <button
                                                key={subTab}
                                                type="button"
                                                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${budgetSubTab === subTab
                                                    ? 'text-gray-900 dark:text-white border-blue-600'
                                                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
                                                    }`}
                                                onClick={() => setBudgetSubTab(subTab)}
                                            >
                                                {subTab}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Budget Health Content */}
                                {budgetSubTab === 'Budget health' && (
                                    <div className="space-y-4">
                                        {/* Budget/Time Toggle */}
                                        <div className="flex justify-end mb-4">
                                            <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                                                {['Budget', 'Time'].map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setBudgetViewMode(mode)}
                                                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${budgetViewMode === mode
                                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                                            }`}
                                                    >
                                                        {mode}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                                <div className={`rounded-lg border p-4 ${budgetHealth.className}`}>
                                                    <p className="text-sm font-semibold">{budgetHealth.label}</p>
                                                    <p className="text-xs mt-0.5 opacity-80">
                                                        {totalBudgetAmount > 0
                                                            ? `${budgetUsedPercent}% of budget used so far`
                                                            : 'Set a budget on this project to track spend against it.'}
                                                    </p>
                                                </div>

                                                {budgetViewMode === 'Budget' ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{totalBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Used Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{usedBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{budgetUsedPercent}% of total</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining Budget</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{remainingBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Billable Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetTotalHours)}</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Consumed Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetConsumedHours)}</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{consumedHoursPercent}% of total</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining Hours</p>
                                                            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatHoursHM(budgetRemainingHours)}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        <span>Budget used</span>
                                                        <span>{budgetUsedPercent}%</span>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${budgetHealth.bar} transition-all`}
                                                            style={{ width: `${Math.min(100, budgetUsedPercent)}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {profitOrLoss !== null ? (
                                                    <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">Profit / Loss (invoiced revenue − actual spend)</span>
                                                        <span className={`text-lg font-bold ${profitOrLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {profitOrLoss.toLocaleString()} {budgetCurrency}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">No invoices raised yet — profit will show once this project has been invoiced.</p>
                                                )}
                                    </div>
                                )}

                                {/* Revenue Content */}
                                {budgetSubTab === 'Revenue' && (() => {
                                    const revenueStatus = totalInvoicedAmount <= 0
                                        ? { label: 'Not yet invoiced', className: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300', bar: 'bg-gray-400' }
                                        : revenueReceivedPercent >= 100
                                            ? { label: 'Fully collected', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300', bar: 'bg-green-500' }
                                            : revenueReceivedPercent > 0
                                                ? { label: 'Partially collected', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
                                                : { label: 'Awaiting payment', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300', bar: 'bg-red-500' };

                                    return (
                                        <div className="space-y-4">
                                            <div className={`rounded-lg border p-4 ${revenueStatus.className}`}>
                                                <p className="text-sm font-semibold">{revenueStatus.label}</p>
                                                <p className="text-xs mt-0.5 opacity-80">
                                                    {totalInvoicedAmount > 0
                                                        ? `${revenueReceivedPercent}% of invoiced revenue received`
                                                        : 'Create an invoice for this project to start tracking revenue.'}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quoted Revenue</p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                                                        {quotedRevenueAmount != null ? `${quotedRevenueAmount.toLocaleString()} ${budgetCurrency}` : 'Not linked to a quote'}
                                                    </p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Invoiced</p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{totalInvoicedAmount.toLocaleString()} {budgetCurrency}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary?.invoice_count || 0} invoices</p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Received</p>
                                                    <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalReceivedAmount.toLocaleString()} {budgetCurrency}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{revenueReceivedPercent}% of invoiced</p>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                    <span>Received of invoiced</span>
                                                    <span>{revenueReceivedPercent}%</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className={`h-full ${revenueStatus.bar} transition-all`} style={{ width: `${Math.min(100, revenueReceivedPercent)}%` }} />
                                                </div>
                                            </div>

                                            {outstandingRevenueAmount > 0 && (
                                                <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">Outstanding (invoiced but not yet received)</span>
                                                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{outstandingRevenueAmount.toLocaleString()} {budgetCurrency}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Profit Content */}
                                {budgetSubTab === 'Profit' && (
                                    profitOrLoss === null ? (
                                        <div className="space-y-4">
                                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-800 p-4 text-center">
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    No invoices have been raised for this project yet, so realized profit can't be calculated.
                                                    Shown below is a forecast instead, based on the project's budget - it will be replaced by real invoiced profit once an invoice is created.
                                                </p>
                                            </div>
                                            {forecastedProfitAmount !== null && (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Budget</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{(Number(project?.budget?.cost_budget) || 0).toLocaleString()} {budgetCurrency}</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Bills & Expenses</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{(Number(project?.budget?.actual_expenses) || 0).toLocaleString()} {budgetCurrency}</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Forecasted Profit</p>
                                                        <p className={`text-xl font-bold ${forecastedProfitAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {forecastedProfitAmount.toLocaleString()} {budgetCurrency}
                                                        </p>
                                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Estimate - Budget − Bills & Expenses</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (() => {
                                        const profitStatus = profitOrLoss < 0
                                            ? { label: 'Loss-making', className: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300' }
                                            : (profitMarginPercent ?? 0) < 20
                                                ? { label: 'Low margin', className: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300' }
                                                : { label: 'Healthy margin', className: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300' };
                                        const costPercentOfRevenue = totalInvoicedAmount > 0
                                            ? Math.min(100, Math.round((usedBudgetAmount / totalInvoicedAmount) * 100))
                                            : 0;

                                        return (
                                            <div className="space-y-4">
                                                <div className={`rounded-lg border p-4 ${profitStatus.className}`}>
                                                    <p className="text-sm font-semibold">{profitStatus.label}</p>
                                                    <p className="text-xs mt-0.5 opacity-80">
                                                        {profitMarginPercent != null ? `${profitMarginPercent}% profit margin` : ''}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Invoiced Revenue</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{totalInvoicedAmount.toLocaleString()} {budgetCurrency}</p>
                                                        {quotedRevenueAmount != null && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Quoted: {quotedRevenueAmount.toLocaleString()} {budgetCurrency}</p>
                                                        )}
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Actual Cost</p>
                                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{usedBudgetAmount.toLocaleString()} {budgetCurrency}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Labor + expenses</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Profit / Loss</p>
                                                        <p className={`text-xl font-bold ${profitOrLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {profitOrLoss.toLocaleString()} {budgetCurrency}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        <span>Cost as % of invoiced revenue</span>
                                                        <span>{costPercentOfRevenue}%</span>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div className={`h-full ${profitOrLoss >= 0 ? 'bg-red-400' : 'bg-red-600'} transition-all`} style={{ width: `${costPercentOfRevenue}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}

                                {/* GL Accounts Content — Budget Lines per GL Account */}
                                {budgetSubTab === 'GL Accounts' && projectId && (
                                    <BudgetLinesPanel projectId={projectId} currency={budgetCurrency} />
                                )}
                            </div>
                        )}

                        {/* Expenses — project expenses and bills in one table */}
                        {activeTab === 'Expenses' && projectId && (
                            <ProjectCostEntriesPanel
                                projectId={projectId}
                                currency={budgetCurrency}
                                engagementType={engagementType}
                                projectStart={project?.start_date}
                                projectEnd={project?.end_date}
                            />
                        )}

                        {/* Invoices — dedicated tab. The Payment tab below keeps its own
                            Invoices accordion section too (not removed); this is additive. */}
                        {activeTab === 'Invoices' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Invoices</h3>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search invoices..."
                                                value={invoiceSearch}
                                                onChange={(e) => setInvoiceSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                // T&M: bill one month of the project at its billing amount
                                                if (engagementType === 'time_and_material') {
                                                    setIsMonthlyInvoiceOpen(true);
                                                    return;
                                                }
                                                const quotationId = project?.created_from_quotation;
                                                if (quotationId) {
                                                    navigate(`/generate-invoice/${quotationId}`);
                                                } else {
                                                    toast.error('No quotation associated with this project.');
                                                }
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Generate Invoice
                                        </button>
                                    </div>
                                </div>

                                {isLoadingInvoices ? (
                                    <div className="text-center py-12">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading invoices...</p>
                                        </div>
                                    </div>
                                ) : (() => {
                                    const searchLower = invoiceSearch.toLowerCase();
                                    const filteredInvoices = invoices.filter((invoice: any) => {
                                        if (!searchLower) return true;
                                        return (
                                            invoice.invoice_no?.toLowerCase().includes(searchLower) ||
                                            invoice.status?.toLowerCase().includes(searchLower) ||
                                            invoice.status_display?.toLowerCase().includes(searchLower)
                                        );
                                    });

                                    const invoiceStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' => {
                                        switch (status) {
                                            case 'Paid': return 'success';
                                            case 'Issued': return 'info';
                                            case 'Partially Paid': return 'warning';
                                            case 'Overdue': return 'danger';
                                            case 'Draft':
                                            case 'Cancelled':
                                            default: return 'neutral';
                                        }
                                    };

                                    const invoiceColumns: Column<any>[] = [
                                        {
                                            header: 'Invoice No',
                                            accessor: (invoice) => (
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {invoice.invoice_no || `Invoice #${invoice.id}`}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Issue Date',
                                            accessor: (invoice) => toDMY(invoice.issue_date, '-'),
                                        },
                                        {
                                            header: 'Due Date',
                                            accessor: (invoice) => toDMY(invoice.due_date, '-'),
                                        },
                                        {
                                            header: 'Amount',
                                            accessor: (invoice) => (
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    ₹{parseFloat(invoice.total_amount ?? invoice.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            ),
                                        },
                                        {
                                            header: 'Paid',
                                            accessor: (invoice) => `₹${parseFloat(invoice.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                        },
                                        {
                                            header: 'Outstanding',
                                            accessor: (invoice) => `₹${parseFloat(invoice.balance_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                        },
                                        {
                                            header: 'Status',
                                            accessor: (invoice) => {
                                                const status = invoice.status || 'Issued';
                                                return (
                                                    <StatusBadge
                                                        status={status}
                                                        variant={invoiceStatusVariant(status)}
                                                        label={invoice.status_display || status}
                                                    />
                                                );
                                            },
                                        },
                                    ];

                                    return (
                                        <ReusableTable<any>
                                            data={filteredInvoices}
                                            columns={invoiceColumns}
                                            keyField="id"
                                            onRowClick={(invoice) => setOpenInvoiceId(invoice.id)}
                                            emptyMessage="No invoices found for this project"
                                        />
                                    );
                                })()}

                                {engagementType === 'time_and_material' && projectId && (
                                    <GenerateMonthlyInvoiceDrawer
                                        isOpen={isMonthlyInvoiceOpen}
                                        onClose={() => setIsMonthlyInvoiceOpen(false)}
                                        projectId={projectId}
                                        currency={budgetCurrency}
                                        onCreated={refreshInvoices}
                                    />
                                )}
                            </div>
                        )}

                        {/* Milestones — Fixed Budget / Milestone-Based projects only */}
                        {activeTab === 'Milestones' && projectId && (
                            <MilestonesPanel
                                projectId={projectId}
                                currency={budgetCurrency}
                                userBudget={totalBudgetAmount}
                                quotationAmount={Number(project?.contract_value) || 0}
                                projectStart={project?.start_date || undefined}
                                onChanged={refreshInvoices}
                            />
                        )}

                        {/* Resources — resource assignment and resource cost, both engagement types */}
                        {activeTab === 'Resources' && projectId && (
                            <ResourcesPanel projectId={projectId} currency={budgetCurrency} engagementType={engagementType} />
                        )}

                        {/* Financial Summary — common to both engagement types */}
                        {activeTab === 'Financials' && projectId && (
                            <FinancialSummaryPanel projectId={projectId} engagementType={engagementType} currency={budgetCurrency} />
                        )}

                        {activeTab === 'Payment' && (
                            <div className="space-y-6">
                                {/* Payment Summary Cards */}
                                {!isLoadingPayments && paymentSummary && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total Invoiced</p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">₹{parseFloat(paymentSummary.total_invoiced || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.invoice_count || 0} invoices</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Incoming Payments</p>
                                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">+₹{parseFloat(paymentSummary.total_payments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.payment_count || 0} payments</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Outgoing Payments</p>
                                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">-₹{parseFloat(paymentSummary.outgoing_total_payments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paymentSummary.outgoing_payment_count || 0} payments</p>
                                        </div>
                                        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Net Balance</p>
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                ₹{parseFloat(paymentSummary.net_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Incoming - Outgoing</p>
                                        </div>
                                    </div>
                                )}

                                {/* Filter and Search Bar */}
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Payment History</h3>
                                    <div className="flex items-center gap-3">
                                        {/* Payment Type Filter */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowPaymentFilter(!showPaymentFilter)}
                                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                            >
                                                <Filter className="w-4 h-4" />
                                                {paymentTypeFilter}
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {showPaymentFilter && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10">
                                                    {['All', 'Incoming', 'Outgoing'].map((type) => (
                                                        <button
                                                            key={type}
                                                            onClick={() => {
                                                                setPaymentTypeFilter(type);
                                                                setShowPaymentFilter(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${paymentTypeFilter === type ? 'bg-gray-100 dark:bg-gray-800 font-medium' : ''
                                                                }`}
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Search */}
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Search payments..."
                                                value={paymentSearch}
                                                onChange={(e) => setPaymentSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Unified Payments Table */}
                                {isLoadingPayments ? (
                                    <div className="text-center py-12">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading payments...</p>
                                        </div>
                                    </div>
                                ) : (() => {
                                    // Combine and filter payments
                                    const allPayments = [
                                        ...payments.map(p => ({ ...p, type: 'Incoming' })),
                                        ...outgoingPayments.map(p => ({ ...p, type: 'Outgoing', payment_type: p.type }))
                                    ];

                                    const filteredPayments = allPayments.filter(payment => {
                                        // Type filter
                                        if (paymentTypeFilter !== 'All' && payment.type !== paymentTypeFilter) {
                                            return false;
                                        }

                                        // Search filter
                                        const searchLower = paymentSearch.toLowerCase();
                                        const searchMatch = paymentSearch === '' ||
                                            payment.invoice_no?.toLowerCase().includes(searchLower) ||
                                            payment.bill_no?.toLowerCase().includes(searchLower) ||
                                            payment.po_no?.toLowerCase().includes(searchLower) ||
                                            payment.expense_no?.toLowerCase().includes(searchLower) ||
                                            payment.vendor?.toLowerCase().includes(searchLower) ||
                                            payment.reference_no?.toLowerCase().includes(searchLower) ||
                                            payment.payment_method?.toLowerCase().includes(searchLower) ||
                                            payment.created_by?.toLowerCase().includes(searchLower) ||
                                            payment.created_by_name?.toLowerCase().includes(searchLower) ||
                                            payment.category?.toLowerCase().includes(searchLower);

                                        return searchMatch;
                                    });

                                    return (
                                        <ReusableTable<any>
                                            data={filteredPayments}
                                            columns={[
                                                {
                                                    header: 'TYPE',
                                                    accessor: (payment) => (
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${payment.type === 'Incoming'
                                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                            }`}>
                                                            {payment.type}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'REFERENCE',
                                                    accessor: (payment) => {
                                                        if (payment.type === 'Incoming') {
                                                            return (
                                                                <span
                                                                    onClick={() => setOpenInvoiceId(payment.invoice_id)}
                                                                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                >
                                                                    {payment.invoice_no}
                                                                </span>
                                                            );
                                                        } else {
                                                            // Outgoing payment - check if it's purchase_order or expense
                                                            if (payment.payment_type === 'purchase_order') {
                                                                return (
                                                                    <div className="flex flex-col gap-1">
                                                                        <span
                                                                            onClick={() => setOpenBillId(payment.id)}
                                                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                        >
                                                                            {payment.bill_no}
                                                                        </span>
                                                                        {payment.po_no && (
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                                PO: {payment.po_no}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            } else if (payment.payment_type === 'expense') {
                                                                return (
                                                                    <div className="flex flex-col gap-1">
                                                                        <span
                                                                            onClick={() => setOpenExpenseId(payment.id)}
                                                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                                        >
                                                                            {payment.expense_no}
                                                                        </span>
                                                                        {payment.category && (
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300">
                                                                                {payment.category.charAt(0).toUpperCase() + payment.category.slice(1)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                        }
                                                        return '-';
                                                    },
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PARTY',
                                                    accessor: (payment) => {
                                                        let party = '-';
                                                        if (payment.type === 'Incoming') {
                                                            party = payment.created_by || payment.created_by_name || '-';
                                                        } else {
                                                            // For outgoing, show vendor for PO payments, or category for expenses
                                                            if (payment.payment_type === 'purchase_order') {
                                                                party = payment.vendor || '-';
                                                            } else if (payment.payment_type === 'expense') {
                                                                party = payment.vendor || 'Internal';
                                                            }
                                                        }
                                                        return <span className="text-sm text-gray-900 dark:text-white">{party}</span>;
                                                    },
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PAYMENT DATE',
                                                    accessor: (payment) => toDMY(payment.payment_date),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'AMOUNT',
                                                    accessor: (payment) => (
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {payment.type === 'Incoming' ? '+' : '-'}₹{parseFloat(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    // Incoming payments count as received only once Completed
                                                    header: 'STATUS',
                                                    accessor: (payment) => payment.type === 'Incoming' && payment.status ? (
                                                        <StatusBadge
                                                            status={payment.status}
                                                            variant={paymentStatusVariant(payment.status)}
                                                            label={payment.status_display || payment.status}
                                                        />
                                                    ) : <span className="text-xs text-gray-400">-</span>,
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'PAYMENT METHOD',
                                                    accessor: (payment) => (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                                            {payment.payment_method || '-'}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'REFERENCE NO',
                                                    accessor: (payment) => payment.reference_no || '-',
                                                    className: 'uppercase text-xs'
                                                },
                                                {
                                                    header: 'CREATED',
                                                    accessor: (payment) => (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {toDMY(payment.created_at)}
                                                        </span>
                                                    ),
                                                    className: 'uppercase text-xs'
                                                }
                                            ]}
                                            keyField="id"
                                            emptyMessage="No payments found for this project"
                                        />
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Invoice / bill / expense details - drawers instead of separate pages */}
            <InvoiceDrawer invoiceId={openInvoiceId} onClose={() => setOpenInvoiceId(null)} onChanged={refreshFinancials} />
            <BillDrawer billId={openBillId} onClose={() => setOpenBillId(null)} onChanged={refreshFinancials} />
            <ExpenseDrawer expenseId={openExpenseId} onClose={() => setOpenExpenseId(null)} onChanged={refreshFinancials} />

        </Layout >
    );
};

export default ProjectDetailsPage;