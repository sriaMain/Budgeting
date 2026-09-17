import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, FileText, PiggyBank, TrendingDown, TrendingUp,
  FilePlus, Briefcase, CheckSquare, BarChart3, Settings, ChevronRight,
} from 'lucide-react';
import { MetricCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { StatusBadge } from '../components/StatusBadge';
import { ReusableTable } from '../components/ReusableTable';
import { ApprovalDrawer } from '../components/ApprovalDrawer';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';
import { CHART_CATEGORICAL, CHART_CHROME } from '../utils/chartTheme';
import { useAppSelector } from '../hooks/useAppSelector';
import {
  getMetrics, getOrgOverview, getTaskStatusGrouped, getWeeklySummary, getAdminOverview,
} from '../services/dashboard';
import { listApprovalQueue, approveVendor, getApprovalHistory } from '../services/vendorOnboarding';
import type {
  DashboardMetrics, OrgOverview, TaskStatusGrouped, WeeklySummary,
  AdminOverview, ProjectHealthLevel, ReceivableInvoiceRow,
} from '../types/dashboard.types';
import type { VendorOnboardingDetail, VendorApprovalHistoryEvent } from '../types/vendorOnboarding.types';

const TASK_STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  needs_attention: 'Needs Attention',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  development: 'Development',
  testing: 'Testing',
  uat: 'UAT',
  ready_for_deployment: 'Ready for Deployment',
  deployed: 'Deployed',
  on_hold: 'On Hold',
};

const HEALTH_META: Record<ProjectHealthLevel, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  healthy: { label: 'Healthy', variant: 'success' },
  at_risk: { label: 'At Risk', variant: 'warning' },
  critical: { label: 'Critical', variant: 'danger' },
};

const QUICK_ACTIONS = [
  { label: 'New Quote', path: '/pipeline/add-quote', icon: FilePlus },
  { label: 'Projects', path: '/projects', icon: Briefcase },
  { label: 'Tasks', path: '/task-management', icon: CheckSquare },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Administration', path: '/administration', icon: Settings },
];

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const timeSince = (value: string) => {
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const PORTFOLIO_TILES: { key: keyof AdminOverview['portfolio']; label: string; statusFilter?: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'fixed', label: 'Fixed Budget' },
  { key: 'time_and_material', label: 'Time & Material' },
  { key: 'internal', label: 'Internal' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'completed', label: 'Completed', statusFilter: 'deployed' },
];

export const OrgDashboard: React.FC = () => {
  const navigate = useNavigate();
  const username = useAppSelector((state) => state.auth.username);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusGrouped | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [queue, setQueue] = useState<VendorOnboardingDetail[]>([]);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeItem, setActiveItem] = useState<VendorOnboardingDetail | null>(null);
  const [activeHistory, setActiveHistory] = useState<VendorApprovalHistoryEvent[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<ReceivableInvoiceRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadAdminOverview = useCallback(async () => {
    try {
      setAdmin(await getAdminOverview());
    } catch (error) {
      console.error('Failed to load admin dashboard overview:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [metricsRes, overviewRes, taskStatusRes, weeklyRes, queueRes, adminRes] = await Promise.allSettled([
        getMetrics(),
        getOrgOverview(),
        getTaskStatusGrouped(),
        getWeeklySummary(),
        listApprovalQueue(),
        getAdminOverview(),
      ]);

      if (!mounted) return;

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (taskStatusRes.status === 'fulfilled') setTaskStatus(taskStatusRes.value);
      if (weeklyRes.status === 'fulfilled') setWeekly(weeklyRes.value);
      if (queueRes.status === 'fulfilled') setQueue(queueRes.value);
      if (adminRes.status === 'fulfilled') setAdmin(adminRes.value);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const taskStatusData = taskStatus
    ? Object.entries(taskStatus).map(([status, bucket]) => ({
        status: TASK_STATUS_LABELS[status] || status,
        count: bucket.count,
      }))
    : [];

  const projectStatusData = (overview?.project_status ?? []).map((p) => ({
    name: PROJECT_STATUS_LABELS[p.status] || p.status,
    value: p.count,
  }));

  const openApproval = async (item: VendorOnboardingDetail) => {
    setActiveItem(item);
    setActiveHistory([]);
    try {
      setActiveHistory(await getApprovalHistory(item.id));
    } catch {
      // History is a nice-to-have inside the drawer; the approve action still works without it.
    }
  };

  const handleApprove = async (comments: string) => {
    if (!activeItem) return;
    await approveVendor(activeItem.id, comments);
    toast.success('Vendor approved');
    setQueue((q) => q.filter((v) => v.id !== activeItem.id));
  };

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const dateRangeLabel = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return `${formatDate(start.toISOString())} – ${formatDate(now.toISOString())}`;
  })();

  const budgetVariance = admin ? admin.kpis.budget - admin.kpis.actual_spend : 0;

  return (
    <div className="space-y-6">
      {/* Compact dashboard header (Section 5) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dateRangeLabel}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">{greeting}, {username || 'there'}</h1>
          <p className="text-sm text-gray-500">Project Budgeting Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            + Create
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="px-4 py-2 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map(({ label, path, icon: Icon }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            <Icon size={16} className="text-teal-700" />
            {label}
          </button>
        ))}
      </div>

      {/* Primary KPIs (Section 6) — max 6, matching Section 6's exact set */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          label="Total Revenue"
          value={admin ? formatCurrencyCompact(admin.kpis.total_revenue) : ''}
          change={metrics?.invoiced.change}
          icon={<FileText size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <MetricCard
          label="Total Cost"
          value={admin ? formatCurrencyCompact(admin.kpis.total_cost) : ''}
          change={metrics?.expenses.change}
          higherIsBetter={false}
          icon={<TrendingDown size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <MetricCard
          label="Gross Profit"
          value={admin ? formatCurrencyCompact(admin.kpis.gross_profit) : ''}
          icon={<TrendingUp size={18} />}
          loading={loading}
          status={admin && admin.kpis.gross_profit < 0 ? 'risk' : undefined}
          onClick={() => navigate('/reports')}
        />
        <MetricCard
          label="Outstanding"
          value={admin ? formatCurrencyCompact(admin.kpis.outstanding) : ''}
          higherIsBetter={false}
          icon={<PiggyBank size={18} />}
          loading={loading}
          status={admin && admin.kpis.outstanding > 0 ? 'watch' : undefined}
          onClick={() => navigate('/reports')}
        />
        <MetricCard
          label="Active Projects"
          value={admin ? String(admin.kpis.active_projects) : ''}
          icon={<Briefcase size={18} />}
          loading={loading}
          onClick={() => navigate('/projects')}
        />
        <MetricCard
          label="Budget Utilization"
          value={admin && admin.kpis.budget_utilization != null ? `${admin.kpis.budget_utilization}%` : '—'}
          icon={<Wallet size={18} />}
          loading={loading}
          status={
            admin && admin.kpis.budget_utilization != null
              ? admin.kpis.budget_utilization > 100 ? 'risk' : admin.kpis.budget_utilization > 85 ? 'watch' : 'good'
              : undefined
          }
          onClick={() => navigate('/projects')}
        />
      </div>

      {/* Executive Financial Section (Section 7): Revenue vs Cost + Profitability Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Revenue vs Cost"
          subtitle="Last 6 months"
          loading={loading}
          isEmpty={!loading && !(overview?.revenue_trend.length)}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={overview?.revenue_trend ?? []} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} axisLine={{ stroke: CHART_CHROME.grid }} tickLine={false} />
              <YAxis
                tick={{ fill: CHART_CHROME.axis, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
              />
              <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ borderRadius: 8, borderColor: CHART_CHROME.grid }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="invoiced" name="Revenue" stroke={CHART_CATEGORICAL[0]} fill={CHART_CATEGORICAL[0]} fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="received" name="Received" stroke={CHART_CATEGORICAL[1]} fill={CHART_CATEGORICAL[1]} fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Cost" stroke={CHART_CATEGORICAL[2]} fill={CHART_CATEGORICAL[2]} fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Profitability Summary" loading={loading}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Revenue</span>
              <span className="font-semibold text-gray-900">{admin ? formatCurrency(admin.kpis.total_revenue) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Cost</span>
              <span className="font-semibold text-gray-900">{admin ? formatCurrency(admin.kpis.total_cost) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-2.5">
              <span className="text-gray-500">Gross Profit</span>
              <span className={`font-semibold ${admin && admin.kpis.gross_profit < 0 ? 'text-risk-600' : 'text-teal-700'}`}>
                {admin ? formatCurrency(admin.kpis.gross_profit) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Margin %</span>
              <span className="font-semibold text-gray-900">
                {admin?.kpis.margin_percent != null ? `${admin.kpis.margin_percent}%` : '—'}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-gray-500">Budget</p>
              <p className="font-semibold text-gray-900">{admin ? formatCurrencyCompact(admin.kpis.budget) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Actual</p>
              <p className="font-semibold text-gray-900">{admin ? formatCurrencyCompact(admin.kpis.actual_spend) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Variance</p>
              <p className={`font-semibold ${budgetVariance < 0 ? 'text-risk-600' : 'text-teal-700'}`}>
                {admin ? formatCurrencyCompact(budgetVariance) : '—'}
              </p>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Project Health table (Section 8) */}
      <ChartCard
        title="Project Health"
        subtitle="Active projects — health is derived from budget usage and deadline proximity"
        loading={loading}
        isEmpty={!loading && !(admin?.project_health.length)}
        emptyMessage="No active projects to show."
      >
        <ReusableTable
          data={admin?.project_health ?? []}
          keyField="project_no"
          onRowClick={(p) => navigate(`/projects/${p.project_no}`)}
          emptyMessage="No active projects."
          columns={[
            { header: 'Project', accessor: 'project_name' },
            { header: 'Client', accessor: (p) => p.client_name || '—' },
            { header: 'Type', accessor: (p) => (p.engagement_type === 'fixed' ? 'Fixed Budget' : 'T&M') },
            { header: 'Manager', accessor: (p) => p.manager_name || '—' },
            { header: 'Budget', accessor: (p) => formatCurrencyCompact(p.budget), className: 'text-right' },
            { header: 'Actual Cost', accessor: (p) => formatCurrencyCompact(p.actual_cost), className: 'text-right' },
            { header: 'Revenue', accessor: (p) => formatCurrencyCompact(p.revenue), className: 'text-right' },
            {
              header: 'Margin',
              accessor: (p) => (
                <span className={p.margin < 0 ? 'text-risk-600 font-medium' : ''}>{formatCurrencyCompact(p.margin)}</span>
              ),
              className: 'text-right',
            },
            { header: 'Progress', accessor: (p) => (p.progress != null ? `${p.progress}%` : '—') },
            {
              header: 'Health',
              accessor: (p) => (
                <StatusBadge status={p.health} variant={HEALTH_META[p.health].variant} label={HEALTH_META[p.health].label} />
              ),
            },
            { header: 'Status', accessor: (p) => PROJECT_STATUS_LABELS[p.status] || p.status },
          ]}
        />
      </ChartCard>

      {/* Project Portfolio Summary (Section 9) */}
      <ChartCard title="Project Portfolio" loading={loading}>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {PORTFOLIO_TILES.map((tile) => (
            <button
              key={tile.key}
              type="button"
              onClick={() => navigate(tile.statusFilter ? `/projects?status=${tile.statusFilter}` : '/projects')}
              className="rounded-lg border border-gray-200 p-3 text-center hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <p className="text-xl font-bold text-gray-900">{admin ? admin.portfolio[tile.key] : '—'}</p>
              <p className="text-xs text-gray-500 mt-1">{tile.label}</p>
            </button>
          ))}
        </div>
      </ChartCard>

      {/* Accounts Receivable (Section 10) */}
      <ChartCard
        title="Accounts Receivable"
        loading={loading}
        isEmpty={!loading && !(admin?.receivables.invoices.length)}
        emptyMessage="No outstanding invoices."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500">Total Outstanding</p>
            <p className="text-lg font-bold text-gray-900">{admin ? formatCurrencyCompact(admin.receivables.summary.total_outstanding) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Due This Week</p>
            <p className="text-lg font-bold text-amber-600">{admin ? formatCurrencyCompact(admin.receivables.summary.due_this_week) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Overdue</p>
            <p className="text-lg font-bold text-risk-600">{admin ? formatCurrencyCompact(admin.receivables.summary.overdue) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Paid This Month</p>
            <p className="text-lg font-bold text-teal-700">{admin ? formatCurrencyCompact(admin.receivables.summary.paid_this_month) : '—'}</p>
          </div>
        </div>

        <ReusableTable
          data={admin?.receivables.invoices ?? []}
          keyField="id"
          emptyMessage="No outstanding invoices."
          columns={[
            { header: 'Client', accessor: (i) => i.client_name || '—' },
            { header: 'Invoice', accessor: 'invoice_no' },
            { header: 'Invoice Date', accessor: (i) => formatDate(i.issue_date) },
            { header: 'Due Date', accessor: (i) => formatDate(i.due_date) },
            { header: 'Amount', accessor: (i) => formatCurrencyCompact(i.amount), className: 'text-right' },
            {
              header: 'Outstanding',
              accessor: (i) => <span className="font-medium text-risk-600">{formatCurrencyCompact(i.outstanding)}</span>,
              className: 'text-right',
            },
            {
              header: 'Status',
              accessor: (i) => <StatusBadge status={i.status} variant={i.status === 'Overdue' ? 'danger' : 'warning'} label={i.status} />,
            },
            {
              header: '',
              accessor: (i) => (
                <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => navigate(`/invoices/${i.id}`)} className="text-xs font-medium text-teal-700 hover:underline">
                    View
                  </button>
                  <button type="button" onClick={() => setPaymentTarget(i)} className="text-xs font-medium text-blue-600 hover:underline">
                    Record Payment
                  </button>
                </div>
              ),
              className: 'text-right',
            },
          ]}
        />
      </ChartCard>

      {/* Budget Control Center (Section 11) */}
      <ChartCard
        title="Budget Control Center"
        subtitle="Planned vs actual, by GL Account"
        loading={loading}
        isEmpty={!loading && !(admin?.budget_control.length)}
        emptyMessage="No GL-Account budget lines recorded yet."
      >
        <ReusableTable
          data={admin?.budget_control ?? []}
          keyField="gl_account"
          emptyMessage="No GL-Account budget lines recorded yet."
          onRowClick={() => navigate('/projects')}
          columns={[
            { header: 'GL Account', accessor: (r) => `${r.gl_account_code} - ${r.gl_account_name}` },
            { header: 'Budget', accessor: (r) => formatCurrencyCompact(r.planned_amount), className: 'text-right' },
            { header: 'Actual', accessor: (r) => formatCurrencyCompact(r.actual_amount), className: 'text-right' },
            {
              header: 'Variance',
              accessor: (r) => (
                <span className={`font-semibold ${r.variance < 0 ? 'text-risk-600' : 'text-teal-700'}`}>
                  {formatCurrencyCompact(r.variance)}
                </span>
              ),
              className: 'text-right',
            },
          ]}
        />
      </ChartCard>

      {/* Resource Utilization + Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Resource Utilization"
          subtitle="Employees, by allocated hours"
          loading={loading}
          isEmpty={!loading && !(admin?.resource_utilization.length)}
          emptyMessage="No allocated hours to show yet."
        >
          <div className="space-y-3">
            {admin?.resource_utilization.map((r) => (
              <button key={r.name} type="button" onClick={() => navigate('/task-management')} className="w-full text-left group">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 group-hover:text-gray-900">{r.name}</span>
                  <span className="font-medium text-gray-900">{r.allocation_percent}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.allocation_percent > 100 ? 'bg-risk-600' : r.allocation_percent > 85 ? 'bg-amber-500' : 'bg-teal-600'}`}
                    style={{ width: `${Math.min(100, r.allocation_percent)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Needs Attention"
          subtitle="Action Center"
          loading={loading}
          isEmpty={!loading && !(admin?.action_center.length)}
          emptyMessage="Nothing needs attention right now."
        >
          <div className="divide-y divide-gray-100">
            {admin?.action_center.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => navigate(item.link)}
                className="w-full flex items-center justify-between py-3 px-2 -mx-2 rounded-lg text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-900">{item.label}</span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Recent Activity + Approval Center (vendor onboarding is the only formally
          gated approval flow this app has today — see Section-27 caveat in the
          write-up) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Recent Activity"
          loading={loading}
          isEmpty={!loading && !(admin?.recent_activity.length)}
          emptyMessage="No recent activity yet."
        >
          <div className="space-y-3">
            {admin?.recent_activity.map((event, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-gray-900">
                    <span className="font-medium">{event.user}</span> {event.action}{' '}
                    <span className="font-medium">{event.object}</span>
                  </p>
                  <p className="text-xs text-gray-500">{timeSince(event.time)}</p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Approval Center"
          subtitle="Vendor onboarding requests awaiting your decision"
          loading={loading}
          isEmpty={!loading && queue.length === 0}
          emptyMessage="Nothing needs your decision right now."
        >
          <div className="divide-y divide-gray-100">
            {queue.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openApproval(item)}
                className="w-full flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-lg text-left hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {item.vendor_type_display}
                    {item.vendor_reference_no ? ` · ${item.vendor_reference_no}` : ''}
                  </p>
                </div>
                <StatusBadge status={item.status} variant="warning" label="Review" />
              </button>
            ))}
          </div>
          {queue.length > 5 && (
            <button
              type="button"
              onClick={() => navigate('/vendors/approvals')}
              className="mt-3 text-sm font-medium text-teal-700 hover:underline"
            >
              View all {queue.length} requests
            </button>
          )}
        </ChartCard>
      </div>

      {/* Project status / task status / top projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Projects by Status" loading={loading} isEmpty={!loading && !projectStatusData.length}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={projectStatusData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={projectStatusData.length > 1 ? 2 : 0}
                onClick={() => navigate('/projects')}
                cursor="pointer"
              >
                {projectStatusData.map((_, i) => (
                  <Cell key={i} fill={CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]} stroke="#fff" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tasks by Status" loading={loading} isEmpty={!loading && !taskStatusData.some((d) => d.count > 0)}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={taskStatusData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} />
              <XAxis dataKey="status" tick={{ fill: CHART_CHROME.axis, fontSize: 11 }} axisLine={{ stroke: CHART_CHROME.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: CHART_CHROME.grid }} />
              <Bar
                dataKey="count"
                fill={CHART_CATEGORICAL[0]}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                onClick={() => navigate('/task-management')}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top Projects"
          subtitle="By forecasted profit"
          loading={loading}
          isEmpty={!loading && !(overview?.top_projects.length)}
        >
          <div className="divide-y divide-gray-100">
            {overview?.top_projects.map((p) => (
              <div
                key={p.project_no}
                onClick={() => navigate(`/projects/${p.project_no}`)}
                className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.project_name}</p>
                  <p className="text-xs text-gray-500">Budget {formatCurrencyCompact(p.total_budget)}</p>
                </div>
                <span className="text-sm font-semibold text-teal-700">{formatCurrencyCompact(p.forecasted_profit)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Team workload */}
      <ChartCard
        title="Team Workload"
        subtitle={weekly?.week.label}
        loading={loading}
        isEmpty={!loading && !(weekly?.data.length)}
        emptyMessage="No timesheet data for this week, or you don't have permission to view it"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">Employee</th>
                <th className="py-2 font-medium text-right">Hours logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {weekly?.data
                .slice()
                .sort((a, b) => b.total_hours - a.total_hours)
                .map((row) => (
                  <tr key={row.employee.id}>
                    <td className="py-2 text-gray-900">{row.employee.name || row.employee.username}</td>
                    <td className="py-2 text-right text-gray-700 tabular-nums">{row.total_formatted}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {activeItem && (
        <ApprovalDrawer
          isOpen={Boolean(activeItem)}
          onClose={() => setActiveItem(null)}
          title={activeItem.name}
          summary={`${activeItem.vendor_type_display}${activeItem.vendor_reference_no ? ` · ${activeItem.vendor_reference_no}` : ''}`}
          impact="Vendor onboarding request awaiting your decision. Full KYC, bank and procurement details are on the vendor record."
          historyEvents={activeHistory}
          onApprove={handleApprove}
        />
      )}

      {paymentTarget && (
        <RecordPaymentModal
          isOpen={Boolean(paymentTarget)}
          onClose={() => setPaymentTarget(null)}
          invoiceId={String(paymentTarget.id)}
          invoiceData={{ invoice_no: paymentTarget.invoice_no, amount: String(paymentTarget.outstanding) }}
          onPaymentRecorded={() => {
            setPaymentTarget(null);
            toast.success('Payment recorded');
            loadAdminOverview();
          }}
        />
      )}

      <CreateProjectModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
};

export default OrgDashboard;
