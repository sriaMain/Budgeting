import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { Search, Filter, Plus, ChevronDown, X, Briefcase, Clock, CheckCircle2, Wallet, PieChart, TrendingUp } from 'lucide-react';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { ProjectHealthCard, type ProjectHealth } from '../components/ProjectHealthCard';
import { MetricCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface Project {
	id: number;
	project_no: number;
	project_name: string;
	project_type?: 'internal' | 'external';
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
		bills_and_expenses: string;
		currency: string;
		forecasted_profit: string;
	};
}

interface CompanyGroup {
	id: string;
	company_name: string;
	total_projects: number;
	projects: Project[];
}

const STATUS_STYLES: Record<string, string> = {
	planning: 'bg-purple-50 text-purple-700 border-purple-200',
	development: 'bg-blue-50 text-blue-700 border-blue-200',
	testing: 'bg-amber-50 text-amber-700 border-amber-200',
	uat: 'bg-indigo-50 text-indigo-700 border-indigo-200',
	ready_for_deployment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
	deployed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
	on_hold: 'bg-orange-50 text-orange-700 border-orange-200',
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
	const activeStyle = STATUS_STYLES[project.status] || 'bg-gray-50 text-gray-700 border-gray-200';
	// Make sure the project's current status always has a matching <option>,
	// even if it hasn't loaded into statusChoices yet.
	const options = statusChoices.some(choice => choice.value === project.status)
		? statusChoices
		: [{ value: project.status, label: project.status.replace(/_/g, ' ') }, ...statusChoices];

	return (
		<select
			value={project.status}
			onClick={(e) => e.stopPropagation()}
			onChange={(e) => onChange(project, e.target.value)}
			className={`w-full px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer capitalize focus:outline-none focus:ring-2 focus:ring-teal-600 ${activeStyle}`}
		>
			{options.map(choice => (
				<option key={choice.value} value={choice.value}>{choice.label}</option>
			))}
		</select>
	);
};

// Budget-usage heuristic for the health badge — the API has no computed "health" field
// today (see enterprise-artifacts/UI_BUILD_HANDOFF.md's Phase 3 backend gaps).
function projectHealth(project: Project): { health: ProjectHealth; pct: number } {
	const total = parseFloat(project.budget?.total_budget) || 0;
	const used = parseFloat(project.budget?.bills_and_expenses) || 0;
	const pct = total > 0 ? (used / total) * 100 : 0;
	const health: ProjectHealth = pct >= 90 ? 'at_risk' : pct >= 75 ? 'watch' : 'healthy';
	return { health, pct };
}

export default function ProjectsScreen(_props: any) {
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

				const groups: CompanyGroup[] = response.data.Projects.map((company: any, index: number) => {
					// Map project_details to Project objects
					const projects: Project[] = (company.project_details || []).map((p: any) => {
						// Parse budget values for KPIs
						const profit = p.budget?.forecasted_profit ? parseFloat(p.budget.forecasted_profit) : 0;
						const budget = p.budget?.total_budget ? parseFloat(p.budget.total_budget) : 0;
						// Prefer billable_hours (falls back to task-allocated hours on the
						// backend when total_hours/quote hours were never set) over the raw
						// total_hours field, which can be 0 even when tasks have real hours.
						const hours = p.budget?.billable_hours != null ? Number(p.budget.billable_hours) : (p.budget?.total_hours || 0);

						totalProfit += profit;
						totalBudget += budget;
						totalHours += hours;

						return {
							id: p.project_no, // Use project_no as id
							project_no: p.project_no,
							project_name: p.project_name,
							project_type: 'external', // Default
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

	return (
		<AppShell breadcrumb="Projects" title="Projects">
			<div className="max-w-[1600px] mx-auto">
				<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
					<div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
						<button
							onClick={() => setIsCreateModalOpen(true)}
							className="bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
						>
							<Plus size={16} />
							New
						</button>
						<div className="h-8 w-[1px] bg-gray-200 mx-2"></div>
						<div className="relative">
							<select
								value={filterStatus}
								onChange={(e) => setFilterStatus(e.target.value)}
								className="px-4 py-2 pr-8 appearance-none bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer transition-colors"
							>
								<option value="All">All Statuses</option>
								{statusChoices.map(choice => (
									<option key={choice.value} value={choice.value}>{choice.label}</option>
								))}
							</select>
							<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none w-4 h-4" />
						</div>
						<button
							onClick={() => setIsFilterModalOpen(true)}
							className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium flex items-center gap-2 border border-gray-200 whitespace-nowrap"
						>
							<Filter size={16} />
							Filters
						</button>
					</div>

					<div className="relative w-full md:w-80">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
						<input
							type="text"
							placeholder="Search..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
						/>
					</div>
				</div>

				{/* Project Overview */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
					<MetricCard label="Total Projects" value={totalProjectsCount.toString()} icon={<Briefcase size={18} />} />
					<MetricCard label="In Process" value={inProcessProjectsCount.toString()} icon={<Clock size={18} />} />
					<MetricCard label="Completed" value={completedProjectsCount.toString()} icon={<CheckCircle2 size={18} />} />
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
					<MetricCard label="Forecasted profit (budget)" value={`${kpiData.forecastedProfit.toLocaleString()} ${currency}`} icon={<TrendingUp size={18} />} />
					<MetricCard label="Total Budget" value={`${kpiData.totalBudget.toLocaleString()} ${currency}`} icon={<Wallet size={18} />} />
					<MetricCard label="Total Hours Allocated" value={`${kpiData.totalHours} hours`} icon={<PieChart size={18} />} />
				</div>

				{/* Projects */}
				{loading ? (
					<div className="p-8 text-center text-gray-500">Loading projects...</div>
				) : filteredCompanyGroups.length === 0 ? (
					<EmptyState title="No projects found" description="Try clearing filters or search, or create a new project." />
				) : (
					<div className="space-y-8">
						{filteredCompanyGroups.map((company) => (
							<div key={company.id}>
								<div className="flex items-center justify-between mb-3">
									<span className="text-sm font-bold text-gray-900">{company.company_name}</span>
									<span className="text-xs text-gray-500 font-medium">
										{company.projects.length} project{company.projects.length !== 1 ? 's' : ''}
									</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{company.projects.map((project) => {
										const { health, pct } = projectHealth(project);
										return (
											<ProjectHealthCard
												key={project.id}
												name={project.project_name}
												health={health}
												budgetUsedPct={pct}
												totalBudget={`${(parseFloat(project.budget?.total_budget) || 0).toLocaleString()} ${project.budget?.currency || 'INR'}`}
												totalHours={`${project.budget?.billable_hours != null ? Number(project.budget.billable_hours) : (project.budget?.total_hours || 0)}h`}
												startDate={project.start_date ? new Date(project.start_date).toLocaleDateString() : undefined}
												endDate={project.end_date ? new Date(project.end_date).toLocaleDateString() : undefined}
												statusControl={
													<StatusSelect project={project} statusChoices={statusChoices} onChange={handleStatusChange} />
												}
												onClick={() => navigate(`/projects/${project.project_no}`)}
											/>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<CreateProjectModal
				isOpen={isCreateModalOpen}
				onClose={() => {
					setIsCreateModalOpen(false);
					fetchProjects(); // Refresh list after creation
				}}
				hideBudgetTab={true}
			/>

			{isFilterModalOpen && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
						<div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
							<h2 className="text-lg font-semibold text-gray-900">Advanced Filters</h2>
							<button onClick={() => setIsFilterModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
								<X size={20} />
							</button>
						</div>
						<div className="p-4 overflow-y-auto space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
								<select
									value={advancedFilters.project_name}
									onChange={(e) => setAdvancedFilters(prev => ({ ...prev, project_name: e.target.value }))}
									className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
								>
									<option value="">All Projects</option>
									{allProjectNames.map((name, idx) => (
										<option key={idx} value={name}>{name}</option>
									))}
								</select>
							</div>
						</div>
						<div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 mt-auto">
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
