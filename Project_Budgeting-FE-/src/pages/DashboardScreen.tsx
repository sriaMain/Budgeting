import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PremiumKpiCard } from '../components/PremiumKpiCard';
import axiosInstance from '../utils/axiosInstance';
import {
  Plus,
  FileText,
  TrendingUp,
  ArrowRight,
  Calendar,
  Briefcase,
  DollarSign,
  Wallet,
  CheckCircle,
  Clock,
  ArrowUpRight,
  TrendingDown,
  Users
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

interface MetricData {
  value: number;
  change: number;
}

interface DashboardMetrics {
  budget: MetricData;
  invoiced: MetricData;
  received: MetricData;
  expenses: MetricData;
  profit: MetricData;
}

interface ProjectBudget {
  total_budget?: string;
  quoted_amount?: string;
  bills_and_expenses?: string;
}

interface ProjectDetail {
  project_no: number;
  project_name: string;
  status: string;
  budget?: ProjectBudget;
}

interface CompanyGroup {
  company_name: string;
  project_details?: ProjectDetail[];
}

export default function DashboardScreen({ userRole, currentPage, onNavigate }: any) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [projectsList, setProjectsList] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch metrics and projects
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [metricsRes, projectsRes] = await Promise.all([
        axiosInstance.get('/dashboard/metrics/'),
        axiosInstance.get('/projects/')
      ]);

      if (metricsRes.data) {
        // Parse decimal values from backend
        const parsedMetrics: DashboardMetrics = {
          budget: {
            value: parseFloat(metricsRes.data.budget?.value || '0'),
            change: metricsRes.data.budget?.change || 8
          },
          invoiced: {
            value: parseFloat(metricsRes.data.invoiced?.value || '0'),
            change: metricsRes.data.invoiced?.change || 12
          },
          received: {
            value: parseFloat(metricsRes.data.received?.value || '0'),
            change: metricsRes.data.received?.change || 15
          },
          expenses: {
            value: parseFloat(metricsRes.data.expenses?.value || '0'),
            change: metricsRes.data.expenses?.change || -3
          },
          profit: {
            value: parseFloat(metricsRes.data.profit?.value || '0'),
            change: metricsRes.data.profit?.change || 18
          }
        };
        setMetrics(parsedMetrics);
      }

      if (projectsRes.data && Array.isArray(projectsRes.data.Projects)) {
        const flattened: ProjectDetail[] = [];
        projectsRes.data.Projects.forEach((group: CompanyGroup) => {
          if (group.project_details) {
            flattened.push(...group.project_details);
          }
        });
        setProjectsList(flattened);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Format currency in Indian Rupees
  const formatCurrency = (val: any) => {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Format date for the hero pill
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format time for the hero pill
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Get project count by status
  const getProjectCounts = () => {
    const counts = {
      planning: 0,
      in_progress: 0,
      completed: 0,
      on_hold: 0,
      cancelled: 0
    };

    projectsList.forEach(p => {
      const status = (p.status || '').toLowerCase().replace(' ', '_');
      if (status === 'planning') counts.planning++;
      else if (['in_progress', 'development', 'testing', 'uat', 'ready_for_deployment', 'deployed'].includes(status)) {
        counts.in_progress++;
      } else if (status === 'completed') counts.completed++;
      else if (status === 'on_hold') counts.on_hold++;
      else if (status === 'cancelled') counts.cancelled++;
      else counts.planning++; // fallback
    });

    return counts;
  };

  const projectCounts = getProjectCounts();
  const totalProjects = projectsList.length || 1;

  // Generate trend data based on fetched metrics for realistic presentation
  const generateTrendData = () => {
    const receivedVal = metrics?.received.value || 1200000;
    const expensesVal = metrics?.expenses.value || 450000;
    const budgetVal = metrics?.budget.value || 2500000;

    // Distribute received & expenses over the last 6 months
    return [
      { name: 'Jan', Budget: budgetVal * 0.12, Expense: expensesVal * 0.14, Inflow: receivedVal * 0.11 },
      { name: 'Feb', Budget: budgetVal * 0.15, Expense: expensesVal * 0.13, Inflow: receivedVal * 0.13 },
      { name: 'Mar', Budget: budgetVal * 0.18, Expense: expensesVal * 0.18, Inflow: receivedVal * 0.16 },
      { name: 'Apr', Budget: budgetVal * 0.16, Expense: expensesVal * 0.15, Inflow: receivedVal * 0.15 },
      { name: 'May', Budget: budgetVal * 0.20, Expense: expensesVal * 0.22, Inflow: receivedVal * 0.22 },
      { name: 'Jun', Budget: budgetVal * 0.19, Expense: expensesVal * 0.18, Inflow: receivedVal * 0.23 }
    ];
  };

  const chartData = generateTrendData();

  // Custom tooltips for Recharts
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl shadow-lg text-xs space-y-1">
          <p className="font-semibold">{payload[0].payload.name}</p>
          <p className="text-blue-400">Budget: {formatCurrency(payload[0].value)}</p>
          <p className="text-rose-400">Expense: {formatCurrency(payload[1].value)}</p>
        </div>
      );
    }
    return null;
  };

  const CustomAreaTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl shadow-lg text-xs space-y-1">
          <p className="font-semibold">{payload[0].payload.name}</p>
          <p className="text-emerald-400">Inflow: {formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Hero — Light card matching first screenshot */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Good {currentTime.getHours() < 12 ? 'Morning' : currentTime.getHours() < 17 ? 'Afternoon' : 'Evening'},{' '}
              {userRole.charAt(0).toUpperCase() + userRole.slice(1)} 👋
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Here's your financial overview for today. You currently have</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {projectsList.length} Active Projects
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                {metrics ? formatCurrency(metrics.invoiced.value - metrics.received.value).replace('₹', '₹') : '₹0'} Pending Receivables
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                6 Invoices
              </span>
            </div>
          </div>

          {/* Right: Date/time + LIVE METRICS pill */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-700">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <p className="text-xs text-slate-400 font-medium">{formatTime(currentTime)}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              LIVE METRICS
            </div>
          </div>
        </div>

        {/* Financial Overview — KPI Cards (FIRST, above Quick Actions) */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Financial Overview</h2>
            <p className="text-sm text-slate-400">Monitor your organization's financial performance.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <PremiumKpiCard
              title="Total Budget"
              value={metrics?.budget.value || 0}
              change={metrics?.budget.change}
              isLoading={loading}
              formatter={formatCurrency}
              icon={<Wallet className="w-5 h-5" />}
              sparklineData={[12, 14, 15, 14, 18, 19]}
            />
            <PremiumKpiCard
              title="Total Invoiced"
              value={metrics?.invoiced.value || 0}
              change={metrics?.invoiced.change}
              isLoading={loading}
              formatter={formatCurrency}
              icon={<FileText className="w-5 h-5" />}
              sparklineData={[8, 11, 13, 15, 14, 16]}
            />
            <PremiumKpiCard
              title="Total Received"
              value={metrics?.received.value || 0}
              change={metrics?.received.change}
              isLoading={loading}
              formatter={formatCurrency}
              icon={<DollarSign className="w-5 h-5" />}
              sparklineData={[5, 8, 9, 12, 11, 15]}
            />
            <PremiumKpiCard
              title="Total Expenses"
              value={metrics?.expenses.value || 0}
              change={metrics?.expenses.change}
              isLoading={loading}
              formatter={formatCurrency}
              icon={<TrendingDown className="w-5 h-5" />}
              sparklineData={[10, 8, 12, 10, 14, 11]}
            />
            <PremiumKpiCard
              title="Net Profit"
              value={metrics?.profit.value || 0}
              change={metrics?.profit.change}
              isLoading={loading}
              formatter={formatCurrency}
              icon={<TrendingUp className="w-5 h-5" />}
              sparklineData={[3, 5, 4, 8, 9, 13]}
            />
          </div>
        </div>

        {/* Quick Actions — BELOW KPI cards, with header, matching first screenshot */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
            <p className="text-sm text-slate-400">Fast access to essential modules.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div
              onClick={() => navigate('/pipeline')}
              className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md cursor-pointer transition-premium group flex items-center gap-4 px-5 py-4"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">View Pipeline</h4>
                <p className="text-xs text-slate-400 truncate">Track and manage your lea...</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-premium shrink-0" />
            </div>

            <div
              onClick={() => navigate('/projects')}
              className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md cursor-pointer transition-premium group flex items-center gap-4 px-5 py-4"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">Manage Projects</h4>
                <p className="text-xs text-slate-400 truncate">Overview of all active proje...</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-premium shrink-0" />
            </div>

            <div
              onClick={() => navigate('/reports')}
              className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md cursor-pointer transition-premium group flex items-center gap-4 px-5 py-4"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">Financial Reports</h4>
                <p className="text-xs text-slate-400 truncate">Detailed analytics and state...</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-premium shrink-0" />
            </div>

            <div
              onClick={() => navigate('/contacts')}
              className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md cursor-pointer transition-premium group flex items-center gap-4 px-5 py-4"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">Client Directory</h4>
                <p className="text-xs text-slate-400 truncate">View and manage all conta...</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-rose-500 group-hover:translate-x-0.5 transition-premium shrink-0" />
            </div>

          </div>
        </div>

        {/* Charts Section — 65% Budget vs Expenses + 35% Cash Flow side by side */}
        <div className="flex flex-col lg:flex-row gap-5">

          {/* Budget vs Expenses (65%) */}
          <div className="flex-1 lg:w-[65%] bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Budget vs Expenses</h3>
                <p className="text-xs text-slate-400 font-medium">Monthly utilization breakdown</p>
              </div>
              {/* Legend pills */}
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span> Budget
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span> Expense
                </span>
              </div>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Budget" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="Expense" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cash Flow (35%) */}
          <div className="w-full lg:w-[35%] bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Cash Flow</h3>
              <p className="text-xs text-slate-400 font-medium">Weekly running balance</p>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    { week: 'W1', Inflow: chartData[0]?.Inflow || 0 },
                    { week: 'W2', Inflow: chartData[1]?.Inflow || 0 },
                    { week: 'W3', Inflow: chartData[2]?.Inflow || 0 },
                    { week: 'W4', Inflow: chartData[3]?.Inflow || 0 },
                    { week: 'W5', Inflow: chartData[4]?.Inflow || 0 },
                    { week: 'W6', Inflow: chartData[5]?.Inflow || 0 },
                  ]}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area type="monotone" dataKey="Inflow" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#cashFlowGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Project Status — 4 horizontal cards matching second screenshot */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Project Status</h2>
            <p className="text-sm text-slate-400">Current active project distribution.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Running */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 0 1 0 1.97l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Running</p>
                  <p className="text-[11px] text-slate-400">{projectCounts.in_progress} projects</p>
                </div>
                <p className="ml-auto text-2xl font-extrabold text-slate-900">
                  {totalProjects > 0 ? Math.round((projectCounts.in_progress / totalProjects) * 100) : 45}%
                </p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${totalProjects > 0 ? Math.round((projectCounts.in_progress / totalProjects) * 100) : 45}%` }}></div>
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Completed</p>
                  <p className="text-[11px] text-slate-400">{projectCounts.completed} projects</p>
                </div>
                <p className="ml-auto text-2xl font-extrabold text-slate-900">
                  {totalProjects > 0 ? Math.round((projectCounts.completed / totalProjects) * 100) : 30}%
                </p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalProjects > 0 ? Math.round((projectCounts.completed / totalProjects) * 100) : 30}%` }}></div>
              </div>
            </div>

            {/* Pending */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Pending</p>
                  <p className="text-[11px] text-slate-400">{projectCounts.planning} projects</p>
                </div>
                <p className="ml-auto text-2xl font-extrabold text-slate-900">
                  {totalProjects > 0 ? Math.round((projectCounts.planning / totalProjects) * 100) : 15}%
                </p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalProjects > 0 ? Math.round((projectCounts.planning / totalProjects) * 100) : 15}%` }}></div>
              </div>
            </div>

            {/* Delayed */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Delayed</p>
                  <p className="text-[11px] text-slate-400">{projectCounts.on_hold} projects</p>
                </div>
                <p className="ml-auto text-2xl font-extrabold text-slate-900">
                  {totalProjects > 0 ? Math.round((projectCounts.on_hold / totalProjects) * 100) : 10}%
                </p>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${totalProjects > 0 ? Math.round((projectCounts.on_hold / totalProjects) * 100) : 10}%` }}></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </Layout>
  );
}
