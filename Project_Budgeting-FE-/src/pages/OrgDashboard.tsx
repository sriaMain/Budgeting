import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, FileText, PiggyBank, TrendingDown, TrendingUp,
  FilePlus, Briefcase, CheckSquare, BarChart3, Settings,
} from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { formatCurrency, formatCurrencyCompact } from '../utils/format';
import { CHART_CATEGORICAL, CHART_CHROME } from '../utils/chartTheme';

interface Metric {
  value: string;
  change: number | null;
}

interface DashboardMetrics {
  budget: Metric;
  invoiced: Metric;
  received: Metric;
  expenses: Metric;
  profit: Metric;
}

interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  received: number;
  expenses: number;
}

interface TopProject {
  project_no: number;
  project_name: string;
  total_budget: number;
  bills_and_expenses: number;
  forecasted_profit: number;
}

interface OrgOverview {
  revenue_trend: RevenueTrendPoint[];
  project_status: { status: string; count: number }[];
  top_projects: TopProject[];
}

interface TaskStatusGrouped {
  [status: string]: { count: number; tasks: unknown[] };
}

interface WeeklySummary {
  week: { label: string };
  data: {
    employee: { id: number; name: string; username: string };
    total_hours: number;
    total_formatted: string;
  }[];
}

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

const QUICK_ACTIONS = [
  { label: 'New Quote', path: '/pipeline/add-quote', icon: FilePlus },
  { label: 'Projects', path: '/projects', icon: Briefcase },
  { label: 'Tasks', path: '/task-management', icon: CheckSquare },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Administration', path: '/administration', icon: Settings },
];

export const OrgDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusGrouped | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [metricsRes, overviewRes, taskStatusRes, weeklyRes] = await Promise.allSettled([
        axiosInstance.get('dashboard/metrics/'),
        axiosInstance.get('dashboard/org-overview/'),
        axiosInstance.get('tasks/grouped-by-status/'),
        axiosInstance.get('timesheet/weekly-summary/'),
      ]);

      if (!mounted) return;

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data);
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data);
      if (taskStatusRes.status === 'fulfilled') setTaskStatus(taskStatusRes.value.data);
      if (weeklyRes.status === 'fulfilled') setWeekly(weeklyRes.value.data);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Organization overview</p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map(({ label, path, icon: Icon }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            <Icon size={16} className="text-blue-600" />
            {label}
          </button>
        ))}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Budget"
          value={metrics ? formatCurrencyCompact(metrics.budget.value) : ''}
          change={metrics?.budget.change}
          icon={<Wallet size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Invoiced"
          value={metrics ? formatCurrencyCompact(metrics.invoiced.value) : ''}
          change={metrics?.invoiced.change}
          icon={<FileText size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Received"
          value={metrics ? formatCurrencyCompact(metrics.received.value) : ''}
          change={metrics?.received.change}
          icon={<PiggyBank size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Expenses"
          value={metrics ? formatCurrencyCompact(metrics.expenses.value) : ''}
          change={metrics?.expenses.change}
          higherIsBetter={false}
          icon={<TrendingDown size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Profit"
          value={metrics ? formatCurrencyCompact(metrics.profit.value) : ''}
          change={metrics?.profit.change}
          icon={<TrendingUp size={18} />}
          loading={loading}
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Revenue trend + Project status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Revenue Trend"
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
              <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke={CHART_CATEGORICAL[0]} fill={CHART_CATEGORICAL[0]} fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="received" name="Received" stroke={CHART_CATEGORICAL[1]} fill={CHART_CATEGORICAL[1]} fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={CHART_CATEGORICAL[2]} fill={CHART_CATEGORICAL[2]} fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

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
      </div>

      {/* Task status + Top projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
          className="lg:col-span-2"
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
                <span className="text-sm font-semibold text-green-600">{formatCurrencyCompact(p.forecasted_profit)}</span>
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
    </div>
  );
};

export default OrgDashboard;
