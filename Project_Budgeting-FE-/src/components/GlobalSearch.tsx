/**
 * Header global search (desktop header and the mobile menu).
 *
 * One backend call (GET /search/?q=, Project/global_search.py) finds the text across the Project
 * Details tabs - projects, tasks, milestones, resources, expenses, invoices and payments. Each result
 * opens its project on the right tab with that tab's search box filled in, so the row is right
 * there. Matched projects also list their tabs (Financials included) as shortcuts.
 * Admins / managers also get clients, vendors and freelancers (from their own list endpoints).
 * Employees: the backend returns only their own tasks, which open in Tasks & time.
 *
 * Keyboard: Ctrl/⌘+K focuses it (desktop), ↑ / ↓ move through the results, Enter opens one,
 * Escape closes the list.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Building2, CheckSquare, FileText, Flag, Receipt, Search, Store, UserRound, Users, Wallet } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { listVendors } from '../services/vendorOnboarding';
import { listFreelancers } from '../services/freelancerOnboarding';
import { type ProjectTab, projectTabPath } from '../hooks/useProjectFilters';

interface ApiResult {
  section: string;
  key: string;
  title: string;
  subtitle: string;
  project_id: number | null;
  tab: ProjectTab | null;
  tab_search: string;
  /** Projects only: the tabs that project has. */
  tabs?: ProjectTab[];
  /** An employee's own task (no project tab). */
  task_id?: number;
}
interface ApiSection { key: string; label: string; results: ApiResult[]; has_more: boolean; }

interface Hit { id: string; section: string; title: string; subtitle?: string; path: string; shortcuts?: { tab: ProjectTab; path: string }[]; }
interface Group { key: string; label: string; hits: Hit[]; more: boolean; }
interface Found { query: string; groups: Group[]; failed: boolean; }

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  projects: BriefcaseBusiness, tasks: CheckSquare, milestones: Flag, resources: Users, expenses: Receipt,
  invoices: FileText, payments: Wallet, clients: Building2, vendors: Store, freelancers: UserRound,
};
const PER_GROUP = 5;

/** 2+ characters, or a one-digit project number. */
const canSearch = (q: string) => q.length >= 2 || /^\d$/.test(q);

function toHit(r: ApiResult): Hit {
  if (r.project_id == null || !r.tab) {
    return { id: r.key, section: r.section, title: r.title, subtitle: r.subtitle, path: r.task_id ? `/task-management?taskId=${r.task_id}` : '/task-management' };
  }
  const projectId = r.project_id;
  return {
    id: r.key, section: r.section, title: r.title, subtitle: r.subtitle,
    path: projectTabPath(projectId, r.tab, r.tab_search),
    shortcuts: r.tabs?.filter((t) => t !== 'Overview').map((t) => ({ tab: t, path: projectTabPath(projectId, t) })),
  };
}

function useSearchResults(query: string, staff: boolean) {
  const [found, setFound] = useState<Found>({ query: '', groups: [], failed: false });

  useEffect(() => {
    if (!canSearch(query)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const words = query.length >= 2;  // business partners need 2+ characters
      const [main, vendors, freelancers, clients] = await Promise.allSettled([
        axiosInstance.get<{ sections: ApiSection[] }>('search/', { params: { q: query } }),
        staff && words ? listVendors({ search: query }) : Promise.resolve([]),
        staff && words ? listFreelancers({ search: query }) : Promise.resolve([]),
        staff && words ? axiosInstance.get<{ id: number; company_name: string }[]>('/client/dropdown/') : Promise.resolve(null),
      ]);
      if (cancelled) return;

      const groups: Group[] = main.status === 'fulfilled'
        ? (main.value.data.sections || []).map((s) => ({ key: s.key, label: s.label, hits: s.results.map(toHit), more: s.has_more }))
        : [];
      const lower = query.toLowerCase();
      if (clients.status === 'fulfilled' && clients.value) {
        const rows = (clients.value.data || []).filter((c) => (c.company_name || '').toLowerCase().includes(lower));
        if (rows.length) groups.push({
          key: 'clients', label: 'Clients', more: rows.length > PER_GROUP,
          hits: rows.slice(0, PER_GROUP).map((c) => ({ id: `client-${c.id}`, section: 'clients', title: c.company_name, path: `/contacts?clientId=${c.id}` })),
        });
      }
      if (vendors.status === 'fulfilled' && vendors.value.length) groups.push({
        key: 'vendors', label: 'Vendors', more: vendors.value.length > PER_GROUP,
        hits: vendors.value.slice(0, PER_GROUP).map((v) => ({ id: `vendor-${v.id}`, section: 'vendors', title: v.name, subtitle: v.vendor_type_display, path: `/vendors/${v.id}` })),
      });
      if (freelancers.status === 'fulfilled' && freelancers.value.length) groups.push({
        key: 'freelancers', label: 'Freelancers', more: freelancers.value.length > PER_GROUP,
        hits: freelancers.value.slice(0, PER_GROUP).map((f) => ({ id: `freelancer-${f.id}`, section: 'freelancers', title: f.full_name, subtitle: f.professional_title || undefined, path: `/freelancers/${f.id}` })),
      });
      setFound({ query, groups, failed: main.status === 'rejected' });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, staff]);

  const searchable = canSearch(query);
  return {
    groups: searchable ? found.groups : [],
    loading: searchable && found.query !== query,
    failed: searchable && found.query === query && found.failed,
  };
}

interface GlobalSearchProps {
  userRole: string;
  /** Desktop header: Ctrl/⌘+K focuses the box. */
  shortcut?: boolean;
  /** After a result is opened (e.g. close the mobile menu). */
  onNavigate?: () => void;
  className?: string;
  /** Where the results list sits (width / alignment). */
  panelClassName?: string;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ userRole, shortcut = false, onNavigate, className = '', panelClassName = 'right-0 w-[26rem]' }) => {
  const navigate = useNavigate();
  const staff = userRole === 'admin' || userRole === 'manager';
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const query = value.trim().replace(/\s+/g, ' ');
  const { groups, loading, failed } = useSearchResults(query, staff);
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const activeIndex = hits.length ? Math.min(active, hits.length - 1) : -1;
  const showPanel = open && query.length > 0;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  // The results list is a dropdown: an outside click closes it.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const go = (path: string) => {
    navigate(path);
    setValue('');
    setOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (hits.length) setActive((activeIndex + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) go(hit.path);
      else if (staff && query && !loading) go(`/projects?q=${encodeURIComponent(query)}`);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const optionId = (hit: Hit) => `${panelId}-${hit.id}`;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Search everything"
        aria-expanded={showPanel}
        aria-controls={panelId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeIndex >= 0 ? optionId(hits[activeIndex]) : undefined}
        value={value}
        onChange={(e) => { setValue(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={staff ? 'Search everything…' : 'Search your tasks…'}
        title={staff ? 'Projects, tasks, milestones, resources, expenses, invoices, payments, clients, vendors, freelancers' : undefined}
        autoComplete="off"
        className={`w-full rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-9 ${shortcut ? 'pr-14' : 'pr-3'} text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/40 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500`}
      />
      {shortcut && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      )}

      {showPanel && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Search results"
          aria-busy={loading}
          className={`absolute top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg transition-opacity dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/40 ${loading && groups.length > 0 ? 'opacity-60' : ''} ${panelClassName}`}
        >
          {!canSearch(query) ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Type at least 2 characters.</p>
          ) : loading && groups.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
          ) : failed && groups.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Search failed. Check your connection and try again.</p>
          ) : groups.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No matches for "{query}".</p>
          ) : (
            groups.map((g) => {
              const Icon = ICONS[g.key] ?? Search;
              return (
                <div key={g.key} role="group" aria-label={g.label} className="border-b border-gray-100 py-1.5 last:border-b-0 dark:border-gray-800">
                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.label}</p>
                  {g.hits.map((hit) => {
                    const index = hits.indexOf(hit);
                    const isActive = index === activeIndex;
                    return (
                      <div key={hit.id} className={isActive ? 'bg-gray-100 dark:bg-gray-800' : ''}>
                        <button
                          id={optionId(hit)}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          tabIndex={-1}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(hit.path)}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left focus:outline-none"
                        >
                          <Icon size={15} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{hit.title}</span>
                            {hit.subtitle && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{hit.subtitle}</span>}
                          </span>
                        </button>
                        {hit.shortcuts && hit.shortcuts.length > 0 && (
                          <div className="flex flex-wrap gap-1 pb-2 pl-[2.125rem] pr-3">
                            {hit.shortcuts.map((s) => (
                              <button
                                key={s.tab}
                                type="button"
                                onClick={() => go(s.path)}
                                className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-teal-600 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-teal-500 dark:hover:text-teal-300"
                              >
                                {s.tab}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {g.more && <p className="px-3 pb-1 pt-0.5 text-[11px] text-gray-400 dark:text-gray-500">More {g.label.toLowerCase()} match - keep typing to narrow it down.</p>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
