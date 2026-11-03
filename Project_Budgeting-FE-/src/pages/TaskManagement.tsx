/**
 * Task Management - the helpdesk's tasks on every project (admins / managers) or the tasks
 * assigned to you (everyone else), as a list grouped by project or a board by status.
 * Tasks are created, assigned and updated in the helpdesk; this page only reads them
 * (backend: GET /helpdesk-tasks/).
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, ListChecks, RefreshCw, Search, UserX } from 'lucide-react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/StatCard';
import { SearchableSelect } from '../components/SearchableSelect';
import { ErrorState } from '../components/ErrorState';
import { HelpdeskTaskTable } from '../components/HelpdeskTaskTable';
import { HelpdeskTaskBoard } from '../components/HelpdeskTaskBoard';
import { useHelpdeskTasks } from '../hooks/useHelpdeskTasks';
import { formatDateTime } from '../utils/date';
import { isTaskDone, isTaskOverdue, statusRank, type HelpdeskTask } from '../utils/helpdeskTasks';

interface TaskManagementProps {
  userRole: "admin" | "user" | "manager";
  currentPage: string;
  onNavigate: (page: string) => void;
}

const LIST_PAGE_SIZE = 50;
const UNASSIGNED = '__unassigned__';
const CONTROL = 'h-10 rounded-md border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';

// Assignee filter key - the AIRA employee ID / freelancer code when the helpdesk sends one, else the name.
const assigneeKey = (t: HelpdeskTask) => (t.resource_name ? (t.resource_code || t.resource_name) : UNASSIGNED);

type Tab = 'list' | 'board';
const TABS: { id: Tab; label: string }[] = [
  { id: 'list', label: 'Task List' },
  { id: 'board', label: 'Task Board' },
];

export const TaskManagement: React.FC<TaskManagementProps> = ({ userRole, currentPage, onNavigate }) => {
  const isStaff = userRole === 'admin' || userRole === 'manager';
  const { tasks, loading, error, fetchedAt, scope, refresh } = useHelpdeskTasks('/helpdesk-tasks/');
  // The backend decides what you see; until it answers, go by your role.
  const mine = scope ? scope === 'mine' : !isStaff;

  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState('');
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Filter options come from the tasks themselves.
  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; sublabel?: string }>();
    tasks.forEach(t => {
      const key = assigneeKey(t);
      if (key !== UNASSIGNED && !seen.has(key)) seen.set(key, { id: key, label: t.resource_name as string, sublabel: t.resource_code || undefined });
    });
    const people = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    return [{ id: '', label: 'All assignees' }, ...people, ...(tasks.some(t => !t.resource_name) ? [{ id: UNASSIGNED, label: 'Unassigned' }] : [])];
  }, [tasks]);
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach(t => { const key = String(t.project_id ?? ''); if (!seen.has(key)) seen.set(key, t.project_name || `Project #${key}`); });
    return [{ id: '', label: 'All projects' }, ...[...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))];
  }, [tasks]);
  const statuses = useMemo(() => [...new Set(tasks.map(t => t.status).filter(Boolean))].sort((a, b) => statusRank(a) - statusRank(b) || a.localeCompare(b)), [tasks]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (assignee && assigneeKey(t) !== assignee) return false;
      if (status && t.status !== status) return false;
      if (project && String(t.project_id ?? '') !== project) return false;
      if (!q) return true;
      return [t.subject, t.task_id, t.resource_name, t.resource_code, t.milestone_name, t.project_name]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [tasks, assignee, status, project, search]);

  const hasFilters = !!(assignee || status || project || search.trim());
  const clearFilters = () => { setAssignee(''); setStatus(''); setProject(''); setSearch(''); setPage(1); };
  const onFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const pageCount = Math.max(1, Math.ceil(shown.length / LIST_PAGE_SIZE));
  const currentPageNo = Math.min(page, pageCount);
  const pageTasks = shown.slice((currentPageNo - 1) * LIST_PAGE_SIZE, currentPageNo * LIST_PAGE_SIZE);

  // KPIs - from every task you can see (filters don't change them).
  const open = tasks.filter(t => !isTaskDone(t));
  const activeProjects = new Set(open.map(t => String(t.project_id ?? ''))).size;
  const overdue = open.filter(isTaskOverdue).length;
  const unassigned = open.filter(t => !t.resource_name).length;
  const kpi = (n: number) => (error ? '—' : n.toLocaleString('en-IN'));

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Task Management</h1>
            <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
              {mine ? 'Tasks assigned to you in the helpdesk.' : 'Tasks from the helpdesk, on every project.'} They're created and assigned there.
              {fetchedAt && !loading && !error && <span className="tabular-nums"> · Updated {formatDateTime(fetchedAt)}</span>}
            </p>
          </div>
        </header>

        <section aria-label="Task overview" className="grid grid-cols-1 gap-3 sm:gap-4 min-[360px]:grid-cols-2 min-[768px]:grid-cols-3">
          <MetricCard compact loading={loading} label="Projects With Open Tasks" value={kpi(activeProjects)} icon={<FolderKanban size={16} />} iconTone="blue" />
          <MetricCard compact loading={loading} label="Overdue Tasks" value={kpi(overdue)} icon={<AlertTriangle size={16} />} iconTone="risk" />
          {mine
            // Your own tasks are never unassigned - show how many are still open instead.
            ? <MetricCard compact loading={loading} className="min-[360px]:max-[767px]:col-span-2" label="Open Tasks" value={kpi(open.length)} icon={<ListChecks size={16} />} iconTone="amber" />
            : <MetricCard compact loading={loading} className="min-[360px]:max-[767px]:col-span-2" label="Unassigned Tasks" value={kpi(unassigned)} icon={<UserX size={16} />} iconTone="amber" />}
        </section>

        <div
          role="tablist"
          aria-label="Task views"
          className="flex overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-800"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = activeTab === 'list' ? 'board' : 'list';
            setActiveTab(next);
            requestAnimationFrame(() => document.getElementById(`task-tab-${next}`)?.focus());
          }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`task-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="task-tab-panel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px h-12 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-800 ${activeTab === tab.id
                ? 'border-teal-600 text-gray-900 dark:border-violet-400 dark:text-white'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar - the same filters drive the list and the board */}
        <div className="flex flex-wrap items-center gap-2">
          {!mine && (
            <div className="w-full min-[480px]:w-48">
              <SearchableSelect
                size="md"
                options={assigneeOptions}
                value={assignee ? assigneeOptions.find(o => o.id === assignee) ?? null : null}
                onChange={(option) => onFilter(setAssignee)(option ? String(option.id) : '')}
                placeholder="All assignees"
                ariaLabel="Filter by assignee"
                emptyMessage="No assignees match"
              />
            </div>
          )}
          <div className="relative">
            <select
              value={status}
              onChange={(e) => onFilter(setStatus)(e.target.value)}
              aria-label="Filter by status"
              className={`${CONTROL} appearance-none pl-3 pr-9 cursor-pointer`}
            >
              <option value="">All statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="w-full min-[480px]:w-52">
            <SearchableSelect
              size="md"
              options={projectOptions}
              value={project ? projectOptions.find(o => o.id === project) ?? null : null}
              onChange={(option) => onFilter(setProject)(option ? String(option.id) : '')}
              placeholder="All projects"
              ariaLabel="Filter by project"
              emptyMessage="No projects match"
            />
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="h-10 px-2 text-sm font-medium text-teal-700 hover:underline focus:outline-none focus-visible:underline dark:text-violet-300">
              Clear
            </button>
          )}
          <div className="ml-auto flex w-full items-center gap-2 min-[768px]:w-auto">
            <div className="relative min-w-0 flex-1 min-[768px]:w-64 min-[768px]:flex-none">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => onFilter(setSearch)(e.target.value)}
                placeholder="Search task, ID, assignee…"
                aria-label="Search tasks"
                className={`${CONTROL} w-full pl-9 pr-3 placeholder:text-gray-400`}
              />
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh tasks"
              title="Refresh"
              className={`${CONTROL} flex w-10 shrink-0 items-center justify-center hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-gray-800`}
            >
              <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div id="task-tab-panel" role="tabpanel" aria-labelledby={`task-tab-${activeTab}`}>
          {error ? (
            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <ErrorState message={error} onRetry={refresh} />
            </div>
          ) : !loading && tasks.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-gray-900">
              <ListChecks size={28} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
              <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">{mine ? 'No tasks assigned to you yet' : 'No helpdesk tasks yet'}</p>
              <p className="mt-1 max-w-sm text-[13px] text-gray-500 dark:text-gray-400">
                {mine ? 'Tasks assigned to you in the helpdesk will appear here.' : 'Tasks created in the helpdesk for Project Budgeting projects will appear here.'}
              </p>
            </div>
          ) : activeTab === 'list' ? (
            <div className="space-y-3">
              <HelpdeskTaskTable tasks={pageTasks} loading={loading} groupByProject onClearFilters={clearFilters} />
              {!loading && shown.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-600 dark:text-gray-400">
                  <span className="tabular-nums">
                    {hasFilters ? `${shown.length} of ${tasks.length} tasks` : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
                    {pageCount > 1 && ` · page ${currentPageNo} of ${pageCount}`}
                  </span>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPageNo === 1} className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 disabled:opacity-50`}>
                        <ChevronLeft size={16} aria-hidden="true" /> Previous
                      </button>
                      <button type="button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPageNo === pageCount} className={`${CONTROL} inline-flex h-9 items-center gap-1 px-3 disabled:opacity-50`}>
                        Next <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <HelpdeskTaskBoard tasks={shown} loading={loading} onClearFilters={clearFilters} />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TaskManagement;
