import { formatDate as toDMY } from '../utils/date';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { Search, Filter, Plus, ChevronDown, X, Briefcase, Clock, CheckCircle2, Wallet, PieChart, TrendingUp } from 'lucide-react';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { ProjectHealthCard, type ProjectHealth } from '../components/ProjectHealthCard';
import { MetricCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import axiosInstance from '../utils/axiosInstance';
import { formatMoney } from '../utils/format';
import { toast } from 'react-hot-toast';

interface Project {
	id: number;
	project_no: number;
	project_name: string;
	project_type?: 'internal' | 'external';
	// Engagement model: Fixed Budget / Milestone-Based or Time & Material
	engagement_type?: 'fixed' | 'time_and_material';
	client?: number | null;
	client_name?: string;
	start_date: string;
	end_date: string;
	status: string;
	progress?: number;
	budget: {
		use_quoted_amounts: boolean;
		total_hours: number;
		billable_hours?: number | string;
		total_budget: string;
		// Tax and profit excluded (unlike total_budget, which still mirrors
		// the quote's client-facing total) - see ProjectBudget.cost_budget on
		// the backend. This is what should be shown as "Total Budget"/"User
		// budget" everywhere, matching the Project Details page.
		cost_budget: string;
		bills_and_expenses: string;
		// Real spend so far (labor cost + actual logged expenses) - unlike
		// bills_and_expenses, which is a quote-time estimate that's rarely
		// ever populated in practice and so never actually changes as real
		// expenses get logged. This is what the Project Details page's
		// "User budget" card already shows as "Used", so the list page's
		// Budget-used % should read the same figure.
		used_budget: string;
		// cost_budget - used_budget (same basis); negative when over budget.
		remaining_budget?: string;
		currency: string;
		forecasted_profit: string;
	};
}

// GET projects/ groups projects by client: { Projects: [{ company_name, total_projects, project_details }] }
interface ApiCompany {
	company_name: string;
	total_projects: number;
	project_details?: Project[];
}

interface CompanyGroup {
	id: string;
	company_name: string;
	total_projects: number;
	projects: Project[];
}

const STATUS_STYLES: Record<string, string> = {
	planning: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30',
	development: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
	testing: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
	uat: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
	ready_for_deployment: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
	deployed: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
	on_hold: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
};

const StatusSelect = ({
	project,
	statusChoices,
	onChange,
}: {
	project: Project;
	statusChoices: { value: string; label: string }[];
	onChange: (project: Project, status: string) => void;
}) => {
	const activeStyle = STATUS_STYLES[project.status] || 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800';
	// Make sure the project's current status always has a matching <option>,
	// even if it hasn't loaded into statusChoices yet.
	const options = statusChoices.some(choice => choice.value === project.status)
		? statusChoices
		: [{ value: project.status, label: project.status.replace(/_/g, ' ') }, ...statusChoices];

	return (
		<div className="relative">
			<select
				value={project.status}
				onChange={(e) => onChange(project, e.target.value)}
				aria-label={`Status of ${project.project_name}`}
				title={options.find(choice => choice.value === project.status)?.label}
				className={`h-7 max-w-[8.5rem] appearance-none truncate rounded-full border pl-2.5 pr-6 text-xs font-medium capitalize cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${activeStyle}`}
			>
				{options.map(choice => (
					<option key={choice.value} value={choice.value}>{choice.label}</option>
				))}
			</select>
			<ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-70" />
		</div>
	);
};

// Budget-usage bands for the card colour, as a share of the cost budget already spent:
// below WATCH is on track (green), WATCH-RISK is getting close (amber), RISK and over is red.
const BUDGET_WATCH_PCT = 75;
const BUDGET_RISK_PCT = 90;

// The API has no computed "health" field today (see enterprise-artifacts/UI_BUILD_HANDOFF.md's
// Phase 3 backend gaps), so it's derived from budget usage.
function projectHealth(project: Project): { health: ProjectHealth; pct: number | null } {
	const total = parseFloat(project.budget?.cost_budget) || 0;
	if (total <= 0) return { health: 'healthy', pct: null };
	const used = parseFloat(project.budget?.used_budget) || 0;
	const pct = (used / total) * 100;
	const health: ProjectHealth = pct >= BUDGET_RISK_PCT ? 'at_risk' : pct >= BUDGET_WATCH_PCT ? 'watch' : 'healthy';
	return { health, pct };
}

const projectHours = (project: Project) =>
	// Prefer billable_hours (falls back to task-allocated hours on the backend when
	// total_hours/quote hours were never set) over the raw total_hours field.
	project.budget?.billable_hours != null ? Number(project.budget.billable_hours) : (project.budget?.total_hours || 0);

const formatHours = (hours: number) => `${hours.toLocaleString('en-IN', { maximumFractionDigits: 1 })}h`;

const CONTROL = 'h-10 rounded-md border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

export default function ProjectsScreen(_props: { userRole?: string; currentPage?: string; onNavigate?: (page: string) => void }) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
	const [kpiData, setKpiData] = useState({
		forecastedProfit: 0,
		totalBudget: 0,
		totalHours: 0
	});

	const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? 'All');
	const [statusChoices, setStatusChoices] = useState<{value: string, label: string}[]>([]);

	const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
	const [advancedFilters, setAdvancedFilters] = useState({
		project_name: searchParams.get('project_name') ?? ''
	});
	const [appliedFilters, setAppliedFilters] = useState({
		project_name: searchParams.get('project_name') ?? ''
	});

	useEffect(() => {
		fetchStatusChoices();
	}, []);

	// Full list of project names for the filter dropdown. Kept separate from
	// companyGroups (which shrinks once a filter is applied) so every project
	// stays selectable regardless of the currently active filter.
	const [allProjectNames, setAllProjectNames] = useState<string[]>([]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			fetchProjects();

			// Persist the active filters to the URL so a refresh/back-nav doesn't lose them.
			const next = new URLSearchParams();
			if (searchQuery) next.set('q', searchQuery);
			if (filterStatus && filterStatus !== 'All') next.set('status', filterStatus);
			if (appliedFilters.project_name) next.set('project_name', appliedFilters.project_name);
			setSearchParams(next, { replace: true });
		}, 500);
		return () => clearTimeout(timeoutId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchQuery, filterStatus, appliedFilters]);

	// The filters dialog closes on Escape.
	useEffect(() => {
		if (!isFilterModalOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setAdvancedFilters(appliedFilters);
				setIsFilterModalOpen(false);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [isFilterModalOpen, appliedFilters]);

	const fetchStatusChoices = async () => {
		try {
			const response = await axiosInstance.get('project-status-choices/');
			setStatusChoices(response.data.status_choices || []);
		} catch (error) {
			console.error('Error fetching status choices:', error);
		}
	};

	const fetchProjects = async () => {
		try {
			const params = new URLSearchParams();
			if (searchQuery) {
				params.append('search', searchQuery);
			}
			if (filterStatus && filterStatus !== 'All') {
				params.append('status', filterStatus);
			}
			if (appliedFilters.project_name) params.append('project_name', appliedFilters.project_name);

			const response = await axiosInstance.get(`projects/?${params.toString()}`);

			// Handle the nested structure: response.data.Projects is an array of companies
			if (response.data && response.data.Projects && Array.isArray(response.data.Projects)) {
				let totalProfit = 0;
				let totalBudget = 0;
				let totalHours = 0;

				const groups: CompanyGroup[] = response.data.Projects.map((company: ApiCompany, index: number) => {
					// Map project_details to Project objects
					const projects: Project[] = (company.project_details || []).map((p) => {
						// Parse budget values for KPIs
						const profit = p.budget?.forecasted_profit ? parseFloat(p.budget.forecasted_profit) : 0;
						const budget = p.budget?.cost_budget ? parseFloat(p.budget.cost_budget) : 0;

						totalProfit += profit;
						totalBudget += budget;
						totalHours += projectHours(p);

						return {
							id: p.project_no, // Use project_no as id
							project_no: p.project_no,
							project_name: p.project_name,
							project_type: 'external', // Default
							engagement_type: p.engagement_type,
							client: null,
							client_name: company.company_name,
							start_date: p.start_date,
							end_date: p.end_date,
							status: p.status || 'planning',
							progress: 0, // Default
							budget: p.budget
						};
					});

					return {
						id: `company-${index}`, // Generate ID for group
						company_name: company.company_name,
						total_projects: company.total_projects,
						projects: projects
					};
				});

				setCompanyGroups(groups);
				setKpiData({
					forecastedProfit: totalProfit,
					totalBudget: totalBudget,
					totalHours: totalHours
				});

				// Merge in any newly-seen project names without dropping ones
				// hidden by the current filter, so the filter dropdown always
				// offers the full project list.
				const namesInResponse = groups.flatMap(company => company.projects.map(p => p.project_name));
				setAllProjectNames(prev => Array.from(new Set([...prev, ...namesInResponse])).sort());
			} else {
				setCompanyGroups([]);
			}
		} catch (error) {
			console.error('Error fetching projects:', error);
			setCompanyGroups([]);
		} finally {
			setLoading(false);
		}
	};

	// Filter company groups based on search query and status filters
	const filteredCompanyGroups = companyGroups.map(company => {
		const filteredProjects = company.projects.filter(project => {
			// The backend handles search and status filtering;
			// this is a client-side safety net, restricted to project name only.
			const matchesSearch = project.project_name.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesStatus = filterStatus === 'All' || project.status === filterStatus;
			return matchesSearch && matchesStatus;
		});

		return {
			...company,
			projects: filteredProjects
		};
	}).filter(company => company.projects.length > 0);

	// Project counts for the overview tiles (derived from the currently loaded/filtered projects)
	const allProjects = companyGroups.flatMap(company => company.projects);
	const totalProjectsCount = allProjects.length;
	const completedProjectsCount = allProjects.filter(project => project.status === 'deployed').length;
	const inProcessProjectsCount = totalProjectsCount - completedProjectsCount;
	const currency = allProjects[0]?.budget?.currency || 'INR';

	const hasFilters = !!searchQuery || filterStatus !== 'All' || !!appliedFilters.project_name;
	const clearFilters = () => {
		setSearchQuery('');
		setFilterStatus('All');
		setAdvancedFilters({ project_name: '' });
		setAppliedFilters({ project_name: '' });
	};

	const handleStatusChange = async (project: Project, newStatus: string) => {
		if (newStatus === project.status) return;

		const previousGroups = companyGroups;
		setCompanyGroups(prev => prev.map(company => ({
			...company,
			projects: company.projects.map(p => p.id === project.id ? { ...p, status: newStatus } : p)
		})));

		try {
			await axiosInstance.put(`projects/${project.project_no}/`, { status: newStatus });
			toast.success(`"${project.project_name}" status updated to ${newStatus.replace(/_/g, ' ')}`);
		} catch (error) {
			console.error('Error updating project status:', error);
			toast.error('Failed to update project status');
			setCompanyGroups(previousGroups);
		}
	};

	const newProjectButton = (
		<button
			type="button"
			onClick={() => setIsCreateModalOpen(true)}
			className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-md bg-navy-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
		>
			<Plus size={16} aria-hidden="true" />
			New Project
		</button>
	);

	return (
		<AppShell breadcrumb="Projects" title="Projects" actions={newProjectButton}>
			<div className="flex flex-wrap items-center gap-2 mb-4">
				<div className="relative">
					<select
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
						aria-label="Filter by status"
						className={`${CONTROL} appearance-none pl-3 pr-9 font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
					>
						<option value="All">All Statuses</option>
						{statusChoices.map(choice => (
							<option key={choice.value} value={choice.value}>{choice.label}</option>
						))}
					</select>
					<ChevronDown aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-4 h-4" />
				</div>
				<button
					type="button"
					onClick={() => setIsFilterModalOpen(true)}
					aria-haspopup="dialog"
					className={`${CONTROL} inline-flex items-center gap-2 px-3.5 font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-gray-800`}
				>
					<Filter size={16} aria-hidden="true" />
					Filters
					{appliedFilters.project_name && (
						<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-navy-900 px-1.5 text-xs font-semibold text-white" aria-label="1 filter applied">1</span>
					)}
				</button>
				<div className="relative min-w-[12rem] flex-1">
					<Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
					<input
						type="search"
						placeholder="Search projects…"
						aria-label="Search projects"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className={`${CONTROL} w-full pl-9 pr-3 placeholder:text-gray-400 dark:placeholder:text-gray-500`}
					/>
				</div>
			</div>

			{/* Project Overview - 3 / 2 columns; on phones the money cards take a full row (and below
			    360px everything stacks) so amounts are never cut off. */}
			<section aria-label="Project overview" className="mb-6 grid grid-flow-row-dense grid-cols-1 gap-3 sm:gap-4 min-[360px]:grid-cols-2 min-[1024px]:grid-cols-3">
				<MetricCard compact loading={loading} label="Total Projects" value={totalProjectsCount.toLocaleString('en-IN')} icon={<Briefcase size={16} />} />
				<MetricCard compact loading={loading} label="In Process" value={inProcessProjectsCount.toLocaleString('en-IN')} icon={<Clock size={16} />} />
				<MetricCard compact loading={loading} label="Completed" value={completedProjectsCount.toLocaleString('en-IN')} icon={<CheckCircle2 size={16} />} />
				<MetricCard compact loading={loading} className="min-[360px]:max-[479px]:col-span-2" label="Forecasted Profit (Budget)" value={formatMoney(kpiData.forecastedProfit, currency)} icon={<TrendingUp size={16} />} />
				<MetricCard compact loading={loading} className="min-[360px]:max-[479px]:col-span-2" label="Total Budget" value={formatMoney(kpiData.totalBudget, currency)} icon={<Wallet size={16} />} />
				<MetricCard compact loading={loading} label="Total Hours Allocated" value={formatHours(kpiData.totalHours)} icon={<PieChart size={16} />} />
			</section>

			{/* Projects */}
			{loading ? (
				<div role="status" aria-label="Loading projects" className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3">
					{[0, 1, 2, 3, 4, 5].map(i => (
						<div key={i} className="h-[200px] animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
					))}
				</div>
			) : filteredCompanyGroups.length === 0 ? (
				<EmptyState
					title="No projects found"
					description={hasFilters ? 'Nothing matches the current search or filters.' : 'Create your first project to see it here.'}
					action={hasFilters ? (
						<button type="button" onClick={clearFilters} className={`${CONTROL} px-4 font-medium hover:bg-gray-50 dark:hover:bg-gray-800`}>Clear filters</button>
					) : newProjectButton}
				/>
			) : (
				<div className="space-y-4">
					{filteredCompanyGroups.map((company) => (
						<section key={company.id} aria-labelledby={`${company.id}-heading`}>
							<h2 id={`${company.id}-heading`} className="mb-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
								<span className="truncate" title={company.company_name}>{company.company_name}</span>
								<span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
									{company.projects.length} project{company.projects.length !== 1 ? 's' : ''}
								</span>
							</h2>

							<div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3">
								{company.projects.map((project) => {
									const { health, pct } = projectHealth(project);
									const projectCurrency = project.budget?.currency || 'INR';
									const remaining = project.budget?.remaining_budget != null
										? parseFloat(project.budget.remaining_budget) || 0
										: (parseFloat(project.budget?.cost_budget) || 0) - (parseFloat(project.budget?.used_budget) || 0);
									const href = `/projects/${project.project_no}`;
									return (
										<ProjectHealthCard
											key={project.id}
											name={project.project_name}
											href={href}
											engagementType={project.engagement_type}
											health={health}
											budgetUsedPct={pct}
											usedAmount={pct === null ? undefined : formatMoney(project.budget?.used_budget, projectCurrency)}
											remainingAmount={pct === null ? undefined : remaining < 0
												? `${formatMoney(-remaining, projectCurrency)} over`
												: `${formatMoney(remaining, projectCurrency)} left`}
											overBudget={remaining < 0}
											totalBudget={project.budget ? formatMoney(project.budget.cost_budget, projectCurrency) : undefined}
											totalHours={project.budget ? formatHours(projectHours(project)) : undefined}
											startDate={project.start_date ? toDMY(project.start_date) : undefined}
											endDate={project.end_date ? toDMY(project.end_date) : undefined}
											statusControl={
												<StatusSelect project={project} statusChoices={statusChoices} onChange={handleStatusChange} />
											}
											actions={[
												{ label: 'View project', onSelect: () => navigate(href) },
												{ label: 'Edit details', onSelect: () => navigate(`/projects/edit/${project.project_no}`) },
											]}
										/>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}

			<CreateProjectModal
				isOpen={isCreateModalOpen}
				onClose={() => {
					setIsCreateModalOpen(false);
					fetchProjects(); // Refresh list after creation
				}}
			/>

			{isFilterModalOpen && (
				<div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
					<div role="dialog" aria-modal="true" aria-labelledby="projects-filter-title" className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
						<div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10">
							<h2 id="projects-filter-title" className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Filters</h2>
							<button type="button" onClick={() => setIsFilterModalOpen(false)} aria-label="Close filters" title="Close" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
								<X size={20} />
							</button>
						</div>
						<div className="p-4 overflow-y-auto space-y-4">
							<div>
								<label htmlFor="projects-filter-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
								<select
									id="projects-filter-name"
									value={advancedFilters.project_name}
									onChange={(e) => setAdvancedFilters(prev => ({ ...prev, project_name: e.target.value }))}
									className={`${CONTROL} w-full px-3`}
								>
									<option value="">All Projects</option>
									{allProjectNames.map((name, idx) => (
										<option key={idx} value={name}>{name}</option>
									))}
								</select>
							</div>
						</div>
						<div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800 mt-auto">
							<Button variant="secondary" className="!w-auto px-6" onClick={() => {
								setAdvancedFilters(appliedFilters);
								setIsFilterModalOpen(false);
							}}>
								Cancel
							</Button>
							<Button className="!w-auto px-6" onClick={() => {
								setAppliedFilters(advancedFilters);
								setIsFilterModalOpen(false);
							}}>
								Apply Filters
							</Button>
						</div>
					</div>
				</div>
			)}
		</AppShell>
	);
}
