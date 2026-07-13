import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Search, Filter, Plus, ChevronDown, MoreHorizontal, Wallet, PieChart, TrendingUp, X, Briefcase, Clock, CheckCircle2 } from 'lucide-react';
import { CreateProjectModal } from '../components/CreateProjectModal';
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

const KPICard = ({ label, value, subValue, icon: Icon }: { label: string; value: string; subValue?: string; icon: any }) => (
	<div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
		<div>
			<p className="text-sm text-gray-500 mb-1">{label}</p>
			<div className="flex items-baseline gap-2">
				<h3 className="text-xl font-bold text-gray-900">{value}</h3>
				{subValue && <span className="text-sm text-gray-500">{subValue}</span>}
			</div>
		</div>
		<div className="p-2 bg-gray-50 rounded-lg">
			<Icon className="w-5 h-5 text-gray-400" />
		</div>
	</div>
);

const ProgressBar = ({ value }: { value: number }) => (
	<div className="w-full max-w-[140px]">
		<div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
			<div
				className="h-full bg-blue-600 rounded-full transition-all duration-300"
				style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
			/>
		</div>
		<p className="text-xs text-gray-500 mt-1">{value}%</p>
	</div>
);

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
			className={`px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeStyle}`}
		>
			{options.map(choice => (
				<option key={choice.value} value={choice.value}>{choice.label}</option>
			))}
		</select>
	);
};

export default function ProjectsScreen({ userRole, currentPage, onNavigate }: any) {
	const navigate = useNavigate();
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [kpiData, setKpiData] = useState({
		forecastedProfit: 0,
		totalBudget: 0,
		totalHours: 0
	});

	const [filterStatus, setFilterStatus] = useState('All');
	const [statusChoices, setStatusChoices] = useState<{value: string, label: string}[]>([]);
	const [showMyProjects, setShowMyProjects] = useState(false);
	
	const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
	const [advancedFilters, setAdvancedFilters] = useState({
		project_name: ''
	});
	const [appliedFilters, setAppliedFilters] = useState({
		project_name: ''
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
		}, 500);
		return () => clearTimeout(timeoutId);
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

			const matchesMyProjects = !showMyProjects || true;

			return matchesSearch && matchesStatus && matchesMyProjects;
		});

		return {
			...company,
			projects: filteredProjects
		};
	}).filter(company => company.projects.length > 0);

	// Calculate currency (use first project's currency or default to INR)
	const currency = companyGroups.length > 0 && companyGroups[0].projects.length > 0
		? companyGroups[0].projects[0].budget.currency
		: 'INR';

	// Project counts for the overview tiles (derived from the currently loaded/filtered projects)
	const allProjects = companyGroups.flatMap(company => company.projects);
	const totalProjectsCount = allProjects.length;
	const completedProjectsCount = allProjects.filter(project => project.status === 'deployed').length;
	const inProcessProjectsCount = totalProjectsCount - completedProjectsCount;

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
		<Layout userRole={userRole} currentPage="projects" onNavigate={onNavigate}>
			<div className="p-6 max-w-[1600px] mx-auto">
				{/* Header */}
				<div className="flex flex-col gap-6 mb-8">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-sm text-gray-500">
							<span>Projects</span>
							<span>/</span>
							<span className="font-medium text-gray-900">My Projects</span>
						</div>
					</div>

					<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
						<div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
							<button
								onClick={() => setIsCreateModalOpen(true)}
								className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
							>
								<Plus size={16} />
								New
							</button>
							<div className="h-8 w-[1px] bg-gray-200 mx-2"></div>
							<div className="relative">
								<select
									value={filterStatus}
									onChange={(e) => setFilterStatus(e.target.value)}
									className="px-4 py-2 pr-8 appearance-none bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
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
								className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
					</div>
				</div>

				{/* Project Overview */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
					<KPICard
						label="Total Projects"
						value={totalProjectsCount.toString()}
						icon={Briefcase}
					/>
					<KPICard
						label="In Process"
						value={inProcessProjectsCount.toString()}
						icon={Clock}
					/>
					<KPICard
						label="Completed"
						value={completedProjectsCount.toString()}
						icon={CheckCircle2}
					/>
				</div>

				{/* KPIs */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
					<KPICard
						label="Forecasted profit (budget)"
						value={`${kpiData.forecastedProfit.toLocaleString()} ${currency}`}
						icon={TrendingUp}
					/>
					<KPICard
						label="Total Budget"
						value={`${kpiData.totalBudget.toLocaleString()} ${currency}`}
						icon={Wallet}
					/>
					<KPICard
						label="Total Hours Allocated"
						value={kpiData.totalHours.toString()}
						subValue="hours"
						icon={PieChart}
					/>
				</div>

				{/* Projects Table */}
				<div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
					<div className="overflow-x-auto">
						<div className="min-w-[1000px]">
							{/* Table Header */}
							<div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-200 bg-white text-xs font-semibold text-gray-500 uppercase tracking-wider">
								<div className="col-span-3">Project Name</div>
								<div className="col-span-2">Start - End Date</div>
								<div className="col-span-2">Total Budget</div>
								<div className="col-span-2">Forecasted Profit</div>
								<div className="col-span-1">Hours</div>
								<div className="col-span-2">Status</div>
							</div>

							{/* Table Body */}
							<div className="divide-y divide-gray-100">
								{loading ? (
									<div className="p-8 text-center text-gray-500">Loading projects...</div>
								) : filteredCompanyGroups.length === 0 ? (
									<div className="p-8 text-center text-gray-500">No projects found</div>
								) : (
									filteredCompanyGroups.map((company) => (
										<div key={company.id} className="group">
											{/* Company Header */}
											<div className="px-6 py-3 bg-blue-50 flex items-center justify-between border-b border-blue-100">
												<span className="text-sm font-bold text-blue-900">{company.company_name}</span>
												<span className="text-xs text-blue-700 font-medium">
													Total {company.projects.length} Project{company.projects.length !== 1 ? 's' : ''}
												</span>
											</div>

											{/* Projects */}
											<div className="divide-y divide-gray-50">
												{company.projects.map((project) => (
													<div
														key={project.id}
														onClick={() => navigate(`/projects/${project.project_no}`)}
														className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors bg-white cursor-pointer"
													>
														<div className="col-span-3 flex items-center gap-3">
															<span className="text-sm font-medium text-gray-900">
																{project.project_name}
															</span>
														</div>
														<div className="col-span-2 text-xs text-gray-600">
															<div>{project.start_date}</div>
															<div>{project.end_date}</div>
														</div>
														<div className="col-span-2 text-sm text-gray-900 font-medium">
															{(parseFloat(project.budget.total_budget) || 0).toLocaleString()} {project.budget.currency}
														</div>
														<div className="col-span-2 text-sm text-green-600 font-medium">
															{(parseFloat(project.budget.forecasted_profit) || 0).toLocaleString()} {project.budget.currency}
														</div>
														<div className="col-span-1 text-sm text-gray-900 font-medium">
															{project.budget.billable_hours != null ? Number(project.budget.billable_hours) : project.budget.total_hours}h
														</div>
														<div className="col-span-2">
															<StatusSelect
																project={project}
																statusChoices={statusChoices}
																onChange={handleStatusChange}
															/>
														</div>
													</div>
												))}
											</div>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				</div>
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
									className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									<option value="">All Projects</option>
									{allProjectNames.map((name, idx) => (
										<option key={idx} value={name}>{name}</option>
									))}
								</select>
							</div>
						</div>
						<div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 mt-auto">
							<Button variant="secondary" onClick={() => {
								setAdvancedFilters(appliedFilters);
								setIsFilterModalOpen(false);
							}}>
								Cancel
							</Button>
							<Button onClick={() => {
								setAppliedFilters(advancedFilters);
								setIsFilterModalOpen(false);
							}}>
								Apply Filters
							</Button>
						</div>
					</div>
				</div>
			)}
		</Layout>
	);
}
