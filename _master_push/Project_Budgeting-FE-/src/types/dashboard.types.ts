export interface DashboardMetric {
  value: string;
  change: number | null;
}

export interface DashboardMetrics {
  budget: DashboardMetric;
  invoiced: DashboardMetric;
  received: DashboardMetric;
  expenses: DashboardMetric;
  profit: DashboardMetric;
}

export interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  received: number;
  expenses: number;
}

export interface TopProject {
  project_no: number;
  project_name: string;
  total_budget: number;
  bills_and_expenses: number;
  forecasted_profit: number;
}

export interface OrgOverview {
  revenue_trend: RevenueTrendPoint[];
  project_status: { status: string; count: number }[];
  top_projects: TopProject[];
}

export interface TaskStatusGrouped {
  [status: string]: { count: number; tasks: unknown[] };
}

export interface WeeklySummary {
  week: { label: string };
  data: {
    employee: { id: number; name: string; username: string };
    total_hours: number;
    total_formatted: string;
  }[];
}

// --- Admin Dashboard (enterprise redesign) -------------------------------

export interface AdminKpis {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number | null;
  outstanding: number;
  active_projects: number;
  budget_utilization: number | null;
  budget: number;
  actual_spend: number;
}

export interface PortfolioSummary {
  active: number;
  fixed: number;
  time_and_material: number;
  internal: number;
  delayed: number;
  completed: number;
}

export type ProjectHealthLevel = 'healthy' | 'at_risk' | 'critical';

export interface ProjectHealthRow {
  project_no: number;
  project_name: string;
  client_name: string | null;
  engagement_type: 'fixed' | 'time_and_material';
  manager_name: string | null;
  budget: number;
  actual_cost: number;
  revenue: number;
  margin: number;
  progress: number | null;
  health: ProjectHealthLevel;
  health_reason: string;
  status: string;
}

export interface BudgetControlRow {
  gl_account: number;
  gl_account_code: string;
  gl_account_name: string;
  planned_amount: number;
  actual_amount: number;
  variance: number;
}

export interface ReceivableInvoiceRow {
  id: number;
  invoice_no: string;
  client_name: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  outstanding: number;
  status: string;
}

export interface Receivables {
  summary: {
    total_outstanding: number;
    due_this_week: number;
    overdue: number;
    paid_this_month: number;
  };
  invoices: ReceivableInvoiceRow[];
}

export interface ResourceUtilizationRow {
  name: string;
  allocation_percent: number;
}

export interface ActionCenterItem {
  type: string;
  label: string;
  count: number;
  link: string;
}

export interface RecentActivityItem {
  user: string;
  action: string;
  object: string;
  time: string;
  link: string | null;
}

export interface FreelancerStats {
  total: number;
  active: number;
  available: number;
  assigned: number;
  pending_onboarding: number;
  /** Sum of this month's Expense rows tagged to a freelancer - never PAN/bank data. */
  cost_this_month: number;
}

export interface AdminOverview {
  kpis: AdminKpis;
  portfolio: PortfolioSummary;
  project_health: ProjectHealthRow[];
  budget_control: BudgetControlRow[];
  receivables: Receivables;
  resource_utilization: ResourceUtilizationRow[];
  action_center: ActionCenterItem[];
  recent_activity: RecentActivityItem[];
  freelancers: FreelancerStats;
}
