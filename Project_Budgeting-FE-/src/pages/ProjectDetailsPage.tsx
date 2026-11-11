/**
 * Project Details: compact header, six KPI cards, one filter toolbar and the tabs
 * (Overview, Tasks, Expenses, Resources, Invoices, Milestones*, Financials, Payments).
 * *Fixed Budget / Milestone projects only.
 *
 * The tab and every filter live in the URL (hooks/useProjectFilters), so they survive tab switches,
 * reloads and shared links; each tab sends the same filter names to its API
 * (Project/project_filters.py). KPI money comes from the backend financial summary - the same
 * figures as Overview and Financials.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/StatCard';
import { HelpdeskTasksPanel } from '../components/HelpdeskTasksPanel';
import { ProjectCostEntriesPanel } from '../components/ProjectCostEntriesPanel';
import { MilestonesPanel } from '../components/MilestonesPanel';
import { ResourcesPanel } from '../components/ResourcesPanel';
import { FinancialSummaryPanel } from '../components/FinancialSummaryPanel';
import { GenerateMonthlyInvoiceDrawer } from '../components/GenerateMonthlyInvoiceDrawer';
import { InvoiceDrawer } from '../components/InvoiceDrawer';
import { BillDrawer } from '../components/BillDrawer';
import { ExpenseDrawer } from '../components/ExpenseDrawer';
import { ProjectHeader } from '../components/project/ProjectHeader';
import { ProjectKpis } from '../components/project/ProjectKpis';
import { ProjectFilterBar, type FilterOption, type ProjectFilterOptions } from '../components/project/ProjectFilterBar';
import { ProjectOverviewPanel } from '../components/project/ProjectOverviewPanel';
import { ProjectInvoicesPanel } from '../components/project/ProjectInvoicesPanel';
import { ProjectPaymentsPanel } from '../components/project/ProjectPaymentsPanel';
import { useHelpdeskTasks } from '../hooks/useHelpdeskTasks';
import { useApiData } from '../hooks/useApiData';
import { PROJECT_TABS, type ProjectTab, useProjectFilters } from '../hooks/useProjectFilters';
import type { ProjectFinancialSummary } from '../types/financials.types';
import { isTaskDone, isTaskOverdue } from '../utils/helpdeskTasks';
import { DEFAULT_ENGAGEMENT_STYLE, DEFAULT_PROJECT_STATUS_STYLE, ENGAGEMENT_META, PROJECT_STATUS_STYLES } from '../utils/projectMeta';
import { projectMoney } from '../utils/projectFinance';

interface ProjectDetailsPageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

interface FilterOptionsResponse {
    milestones: FilterOption[];
    resources: (FilterOption & { code?: string | null; type: string })[];
    statuses: Record<'invoices' | 'expenses' | 'bills' | 'payments' | 'resources' | 'milestones', FilterOption[]>;
    payment_statuses: FilterOption[];
    billing_statuses: FilterOption[];
    financial_statuses: FilterOption[];
}

/** Backend "HH:MM:SS" (e.g. remaining_billable_hours) as decimal hours. */
const hmsToHours = (hms?: string | null) => {
    if (!hms) return 0;
    const [h, m, s] = hms.split(':').map(Number);
    return [h, m, s].some(Number.isNaN) ? 0 : h + m / 60 + s / 3600;
};

const ProjectDetailsPage: React.FC<ProjectDetailsPageProps> = ({ userRole, currentPage, onNavigate }) => {
    const { projectId = '' } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [reloadToken, setReloadToken] = useState(0);
    const refreshAll = useCallback(() => setReloadToken((t) => t + 1), []);

    /* ---------------- data ---------------- */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the project detail payload is large and untyped
    const projectReq = useApiData<any>(projectId ? `/projects/${projectId}/` : null, { _r: reloadToken }, 'Failed to load the project');
    const project = projectReq.data ?? projectReq.staleData;
    const statusChoices = useApiData<{ status_choices: FilterOption[] }>('project-status-choices/');
    const summaryReq = useApiData<ProjectFinancialSummary>(projectId ? `/projects/${projectId}/financial-summary/` : null, { _r: reloadToken }, 'Failed to load the financial summary');
    const optionsReq = useApiData<FilterOptionsResponse>(projectId ? `/projects/${projectId}/filter-options/` : null, { _r: reloadToken });
    const taskHoursReq = useApiData<{ Tasks?: { consumed_hours?: number | string }[] }[]>(projectId ? `/tasks/${projectId}/tasks/` : null);
    const helpdeskTasks = useHelpdeskTasks(projectId ? `/projects/${projectId}/helpdesk-tasks/` : undefined);

    const engagementType: 'fixed' | 'time_and_material' = project?.engagement_type || 'fixed';
    const isFixed = engagementType === 'fixed';
    const filters = useProjectFilters(project ? isFixed : true);
    const { tab } = filters;
    const tabs = PROJECT_TABS.filter((t) => t !== 'Milestones' || isFixed);
    const currency = project?.budget?.currency || 'INR';

    /* ---------------- drawers ---------------- */
    const [openInvoiceId, setOpenInvoiceId] = useState<number | null>(null);
    const [openBillId, setOpenBillId] = useState<number | null>(null);
    const [openExpenseId, setOpenExpenseId] = useState<number | null>(null);
    const [monthlyInvoiceOpen, setMonthlyInvoiceOpen] = useState(false);

    const generateInvoice = () => {
        if (engagementType === 'time_and_material') {
            setMonthlyInvoiceOpen(true);
            return;
        }
        const quotationId = project?.created_from_quotation;
        if (quotationId) navigate(`/generate-invoice/${quotationId}`);
        else toast.error('No quotation is linked to this project. Invoice a milestone from the Milestones tab instead.');
    };

    /* ---------------- KPI inputs ---------------- */
    const money = summaryReq.data ? projectMoney(summaryReq.data) : summaryReq.staleData ? projectMoney(summaryReq.staleData) : null;
    const totalHours = Number(project?.budget?.billable_hours) || 0;
    const remainingHours = hmsToHours(project?.budget?.remaining_billable_hours);
    const taskConsumed = (Array.isArray(taskHoursReq.data) ? taskHoursReq.data[0]?.Tasks ?? [] : [])
        .reduce((sum, t) => sum + (Number(t.consumed_hours) || 0), 0);
    const overrun = totalHours > 0 ? Math.max(0, taskConsumed - totalHours) : 0;
    const consumedHours = overrun > 0 ? taskConsumed : Math.max(0, totalHours - remainingHours);
    const tasks = helpdeskTasks.tasks;
    const taskCounts = {
        total: tasks.length,
        open: tasks.filter((t) => !isTaskDone(t)).length,
        overdue: tasks.filter(isTaskOverdue).length,
        done: tasks.filter(isTaskDone).length,
    };

    /* ---------------- filter options for the active tab ---------------- */
    const opts = optionsReq.data;
    const taskStatuses = useMemo(() => [...new Set(tasks.map((t) => t.status).filter(Boolean))].map((s) => ({ value: s, label: s })), [tasks]);
    const statusByTab: Partial<Record<ProjectTab, FilterOption[]>> = {
        Tasks: taskStatuses,
        Expenses: opts?.statuses.expenses ?? [],
        Resources: opts?.statuses.resources ?? [],
        Invoices: opts?.statuses.invoices ?? [],
        Milestones: opts?.statuses.milestones ?? [],
        Payments: opts?.statuses.payments ?? [],
    };
    const filterOptions: ProjectFilterOptions = {
        milestones: isFixed ? opts?.milestones ?? [] : [],
        resources: opts?.resources ?? [],
        statuses: statusByTab[tab] ?? [],
        paymentStatuses: opts?.payment_statuses ?? [],
        billingStatuses: opts?.billing_statuses ?? [],
        financialStatuses: opts?.financial_statuses ?? [],
    };
    const f = filters.effective;
    const filterKey = JSON.stringify(f);
    const resourceMatch = f.resource ? opts?.resources.find((r) => r.value === f.resource) ?? null : null;

    /* ---------------- render ---------------- */
    if (projectReq.loading && !project) {
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div role="status" aria-label="Loading project" className="space-y-4">
                    <div className="h-[76px] animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
                    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                        {[0, 1, 2, 3, 4, 5].map((i) => <MetricCard key={i} compact loading label="" value="" />)}
                    </div>
                    <div className="h-72 animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
                </div>
            </Layout>
        );
    }

    if (!project) {
        // 404/403 = really not there (or not allowed); anything else (500, timeout, offline) is an
        // outage, so offer a retry instead of claiming the project doesn't exist.
        const notFound = projectReq.errorStatus === 404 || projectReq.errorStatus === 403;
        return (
            <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
                <div role={notFound ? undefined : 'alert'} className="rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">{notFound ? 'Project not found' : 'Couldn’t load this project'}</h2>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                        {notFound
                            ? 'The project you are looking for does not exist or you don’t have permission to view it.'
                            : 'The server or database didn’t respond in time. This is usually temporary — try again in a moment.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {!notFound && (
                            <button type="button" onClick={refreshAll} className="h-10 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
                                Try again
                            </button>
                        )}
                        <button type="button" onClick={() => navigate('/projects')}
                            className={notFound
                                ? 'h-10 rounded-md bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800'
                                : 'h-10 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'}>
                            Back to Projects
                        </button>
                    </div>
                </div>
            </Layout>
        );
    }

    const statusLabel = statusChoices.data?.status_choices?.find((c) => c.value === project.status)?.label
        ?? (project.status ? String(project.status).replace(/_/g, ' ') : '');
    const engagement = ENGAGEMENT_META[engagementType];

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="w-full space-y-4">
                <ProjectHeader
                    projectNo={project.project_no || projectId}
                    name={project.project_name}
                    clientName={project.company_name}
                    statusLabel={statusLabel}
                    statusClass={PROJECT_STATUS_STYLES[project.status] || DEFAULT_PROJECT_STATUS_STYLE}
                    typeLabel={engagement?.label ?? engagementType}
                    typeClass={engagement?.className ?? DEFAULT_ENGAGEMENT_STYLE}
                    startDate={project.start_date}
                    endDate={project.end_date}
                    canEdit={userRole === 'admin' || userRole === 'manager'}
                    onBack={() => navigate('/projects')}
                    onEdit={() => navigate(`/projects/edit/${project.project_no || projectId}`)}
                    actions={[
                        { label: 'Refresh data', icon: <RefreshCw />, onSelect: () => { refreshAll(); helpdeskTasks.refresh(); toast.success('Refreshed'); } },
                        {
                            label: 'Copy link to this view', icon: <Link2 />,
                            onSelect: () => {
                                navigator.clipboard?.writeText(window.location.href)
                                    .then(() => toast.success('Link copied'))
                                    .catch(() => toast.error('Couldn’t copy the link'));
                            },
                        },
                    ]}
                />

                <ProjectKpis
                    money={money}
                    moneyLoading={summaryReq.loading && !money}
                    moneyError={!!summaryReq.error && !money}
                    currency={currency}
                    hours={{ total: totalHours, consumed: consumedHours, remaining: remainingHours, overrun }}
                    tasks={{ loading: helpdeskTasks.loading, error: !!helpdeskTasks.error, overdue: taskCounts.overdue, open: taskCounts.open }}
                />

                <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    <div
                        role="tablist"
                        aria-label="Project sections"
                        className="flex overflow-x-auto border-b border-gray-200 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-800"
                        onKeyDown={(e) => {
                            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                            const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                            filters.setTab(next);
                            requestAnimationFrame(() => document.getElementById(`project-tab-${next}`)?.focus());
                        }}
                    >
                        {tabs.map((t) => (
                            <button
                                type="button"
                                key={t}
                                id={`project-tab-${t}`}
                                role="tab"
                                aria-selected={tab === t}
                                aria-controls="project-tab-panel"
                                tabIndex={tab === t ? 0 : -1}
                                onClick={() => filters.setTab(t)}
                                className={`-mb-px h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800 ${tab === t
                                    ? 'border-blue-600 text-gray-900 dark:border-blue-400 dark:text-white'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div id="project-tab-panel" role="tabpanel" aria-labelledby={`project-tab-${tab}`} className="space-y-4 p-4">
                        <ProjectFilterBar
                            key={`${tab}|${JSON.stringify(filters.applied)}`}
                            tab={tab}
                            applied={filters.applied}
                            options={filterOptions}
                            activeCount={filters.activeCount}
                            elsewhereCount={filters.elsewhereCount}
                            onApply={filters.apply}
                            onClearAll={filters.clearAll}
                        />

                        {tab === 'Overview' && (
                            <ProjectOverviewPanel
                                projectId={projectId}
                                isFixed={isFixed}
                                currency={currency}
                                money={money}
                                summary={summaryReq.data ?? summaryReq.staleData ?? null}
                                moneyLoading={summaryReq.loading && !money}
                                moneyError={!!summaryReq.error && !money}
                                onRetryMoney={summaryReq.reload}
                                dateFrom={f.dateFrom}
                                dateTo={f.dateTo}
                                tasks={{ ...taskCounts, loading: helpdeskTasks.loading, error: !!helpdeskTasks.error }}
                                onRetryTasks={helpdeskTasks.refresh}
                                onGoTo={filters.setTab}
                            />
                        )}

                        {tab === 'Tasks' && (
                            <HelpdeskTasksPanel
                                tasks={tasks}
                                loading={helpdeskTasks.loading}
                                error={helpdeskTasks.error}
                                fetchedAt={helpdeskTasks.fetchedAt}
                                onRefresh={helpdeskTasks.refresh}
                                filters={f}
                                resourceMatch={resourceMatch ? { type: resourceMatch.type, code: resourceMatch.code, label: resourceMatch.label } : null}
                                onClearFilters={filters.clearAll}
                            />
                        )}

                        {tab === 'Expenses' && (
                            <ProjectCostEntriesPanel
                                key={`${filterKey}|${reloadToken}`}
                                projectId={projectId}
                                currency={currency}
                                engagementType={engagementType}
                                projectStart={project.start_date}
                                projectEnd={project.end_date}
                                filters={f}
                                onClearFilters={filters.clearAll}
                            />
                        )}

                        {tab === 'Resources' && (
                            <ResourcesPanel
                                key={`${filterKey}|${reloadToken}`}
                                projectId={projectId}
                                currency={currency}
                                engagementType={engagementType}
                                pageFilters={f}
                                onChanged={refreshAll}
                            />
                        )}

                        {tab === 'Invoices' && (
                            <ProjectInvoicesPanel
                                key={filterKey}
                                projectId={projectId}
                                filters={f}
                                reloadToken={reloadToken}
                                onOpenInvoice={setOpenInvoiceId}
                                onGenerateInvoice={generateInvoice}
                                canGenerate
                            />
                        )}

                        {tab === 'Milestones' && isFixed && (
                            <MilestonesPanel
                                key={reloadToken}
                                projectId={projectId}
                                currency={currency}
                                userBudget={Number(project.budget?.cost_budget) || 0}
                                quotationAmount={Number(project.contract_value) || 0}
                                projectStart={project.start_date || undefined}
                                onChanged={refreshAll}
                                pageFilters={f}
                            />
                        )}

                        {tab === 'Financials' && (
                            <FinancialSummaryPanel
                                key={reloadToken}
                                projectId={projectId}
                                engagementType={engagementType}
                                currency={currency}
                                dateFrom={f.dateFrom}
                                dateTo={f.dateTo}
                            />
                        )}

                        {tab === 'Payments' && (
                            <ProjectPaymentsPanel
                                key={filterKey}
                                projectId={projectId}
                                filters={f}
                                currency={currency}
                                reloadToken={reloadToken}
                                onOpenInvoice={setOpenInvoiceId}
                                onOpenBill={setOpenBillId}
                                onOpenExpense={setOpenExpenseId}
                            />
                        )}
                    </div>
                </div>
            </div>

            {engagementType === 'time_and_material' && (
                <GenerateMonthlyInvoiceDrawer
                    isOpen={monthlyInvoiceOpen}
                    onClose={() => setMonthlyInvoiceOpen(false)}
                    projectId={projectId}
                    currency={currency}
                    onCreated={refreshAll}
                />
            )}
            {/* Invoice / bill / expense details open in drawers */}
            <InvoiceDrawer invoiceId={openInvoiceId} onClose={() => setOpenInvoiceId(null)} onChanged={refreshAll} />
            <BillDrawer billId={openBillId} onClose={() => setOpenBillId(null)} onChanged={refreshAll} />
            <ExpenseDrawer expenseId={openExpenseId} onClose={() => setOpenExpenseId(null)} onChanged={refreshAll} />
        </Layout>
    );
};

export default ProjectDetailsPage;
