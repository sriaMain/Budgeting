import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BriefcaseBusiness, CheckSquare, LayoutDashboard, LogOut, Menu, Moon, Network, Search, Settings, ShieldCheck, Sun, Users, X } from 'lucide-react';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { useTheme } from '../hooks/useTheme';
import axiosInstance from '../utils/axiosInstance';
import { listVendors } from '../services/vendorOnboarding';
import { listFreelancers } from '../services/freelancerOnboarding';
import companyLogo from '../assets/company-logo.png';

interface NavbarProps { userRole: 'admin' | 'user' | 'manager' | 'employee'; }
type NavigationItem = { label: string; path: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; roles: string[]; };

const navigationItems: NavigationItem[] = [
  { label: 'Command center', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'user', 'employee'] },
  { label: 'Pipeline & quotes', path: '/pipeline', icon: Network, roles: ['admin', 'manager'] },
  { label: 'Projects', path: '/projects', icon: BriefcaseBusiness, roles: ['admin', 'manager'] },
  { label: 'Tasks & time', path: '/task-management', icon: CheckSquare, roles: ['admin', 'manager', 'user', 'employee'] },
  { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['admin', 'manager'] },
  { label: 'Business Partners', path: '/contacts', icon: Users, roles: ['admin', 'manager'] },
  { label: 'Approvals', path: '/vendors/approvals', icon: ShieldCheck, roles: ['admin', 'manager'] },
  { label: 'Administration', path: '/administration', icon: Settings, roles: ['admin', 'manager'] },
];

/** One brand icon badge, reused for the desktop and mobile headers. `company-logo.png`
 * is the icon-only export of the full Sria Infotech logo (the wordmark is ghosted out in
 * that file) — background-position/size crop it down to just the coloured mark, since the
 * source canvas has a lot of empty space around it. */
const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <span
    className={`${className} rounded-lg shrink-0 bg-white bg-no-repeat`}
    style={{ backgroundImage: `url(${companyLogo})`, backgroundSize: '210%', backgroundPosition: '6% 36%' }}
    aria-hidden="true"
  />
);

interface SearchResult {
  type: 'Project' | 'Client' | 'Vendor' | 'Freelancer';
  id: number | string;
  label: string;
  sublabel?: string;
  path: string;
}

/** Debounced, multi-entity search across the app's existing list endpoints (Projects,
 * Vendors, Freelancers, Clients) — no dedicated global-search API exists, so this fans
 * out to each entity's own already-working search/list call and merges the results. */
function useGlobalSearch() {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (!query) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setOpen(true);
    const timeoutId = setTimeout(async () => {
      const [projectsRes, vendorsRes, freelancersRes, clientsRes] = await Promise.allSettled([
        axiosInstance.get(`projects/?search=${encodeURIComponent(query)}`),
        listVendors({ search: query }),
        listFreelancers({ search: query }),
        axiosInstance.get<{ id: number; company_name: string }[]>('/client/dropdown/'),
      ]);

      const next: SearchResult[] = [];

      if (projectsRes.status === 'fulfilled') {
        const companies = projectsRes.value.data?.Projects || [];
        const projects = companies.flatMap((c: any) => c.project_details || []);
        projects.slice(0, 5).forEach((p: any) => next.push({
          type: 'Project', id: p.project_no, label: p.project_name, sublabel: p.status,
          path: `/projects/${p.project_no}`,
        }));
      }
      if (vendorsRes.status === 'fulfilled') {
        vendorsRes.value.slice(0, 5).forEach((v) => next.push({
          type: 'Vendor', id: v.id, label: v.name, sublabel: v.vendor_type_display,
          path: `/vendors/${v.id}`,
        }));
      }
      if (freelancersRes.status === 'fulfilled') {
        freelancersRes.value.slice(0, 5).forEach((f) => next.push({
          type: 'Freelancer', id: f.id, label: f.full_name, sublabel: f.professional_title || undefined,
          path: `/freelancers/${f.id}`,
        }));
      }
      if (clientsRes.status === 'fulfilled') {
        const lowerQuery = query.toLowerCase();
        (clientsRes.value.data || [])
          .filter((c) => c.company_name.toLowerCase().includes(lowerQuery))
          .slice(0, 5)
          .forEach((c) => next.push({
            type: 'Client', id: c.id, label: c.company_name,
            path: `/contacts?clientId=${c.id}`,
          }));
      }

      setResults(next);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value]);

  return { value, setValue, results, loading, open, setOpen };
}

interface NotificationItem {
  id: number;
  category: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

/** Polls the header bell's real data source (core.Notification, via
 * core/notifications.py's notify() calls at vendor-approval and task
 * -assignment trigger points) every 60s, plus an immediate refresh whenever
 * the dropdown is opened. */
function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get<{ results: NotificationItem[]; unread_count: number }>(
        '/notifications/?limit=10'
      );
      setItems(res.data.results || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const markRead = useCallback(async (id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await axiosInstance.post(`/notifications/${id}/read/`);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await axiosInstance.post('/notifications/mark-all-read/');
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, []);

  return { items, unreadCount, loading, refresh, markRead, markAllRead };
}

const timeSince = (dateStr: string): string => {
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const TYPE_BADGE: Record<SearchResult['type'], string> = {
  Project: 'bg-blue-50 text-blue-700',
  Client: 'bg-purple-50 text-purple-700',
  Vendor: 'bg-amber-50 text-amber-700',
  Freelancer: 'bg-teal-50 text-teal-700',
};

/**
 * Top header navigation — light chrome, underline-active nav, a working
 * multi-entity global search, and a right-side utility cluster (notifications
 * / avatar), styled after a reference enterprise HR-platform header the user
 * pointed to. Shared by both `Layout` and `AppShell`, so every page gets this
 * header.
 *
 * Notifications are real (core.Notification via /notifications/), polled
 * every 60s plus refreshed on open — see core/notifications.py on the
 * backend for where they're created (vendor approvals, task assignment).
 * Light/dark is a real toggle too (see hooks/useTheme.ts + tailwind.config.ts's
 * `darkMode: 'class'`) - still skipping a role-switcher, since this app has
 * no multi-role-per-user concept today.
 */
export const Navbar: React.FC<NavbarProps> = ({ userRole }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const username = useAppSelector((state) => state.auth.username);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const activeNavItemRef = useRef<HTMLButtonElement | null>(null);
  const search = useGlobalSearch();
  const notifications = useNotifications();
  const { theme, toggleTheme } = useTheme();

  const items = useMemo(() => navigationItems.filter((item) => item.roles.includes(userRole.toLowerCase())), [userRole]);
  const go = (path: string) => { navigate(path); setMobileMenuOpen(false); };
  const logout = () => { dispatch({ type: 'auth/logoutSuccess' }); navigate('/'); };
  const isActive = (path: string) => path === '/dashboard' ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const openNotifications = () => {
    setNotificationsOpen((v) => {
      const next = !v;
      if (next) notifications.refresh();
      return next;
    });
  };

  const goToNotification = (n: NotificationItem) => {
    if (!n.is_read) notifications.markRead(n.id);
    setNotificationsOpen(false);
    if (n.link) navigate(n.link);
  };

  // Cmd/Ctrl+K focuses the search box, matching the shortcut hint shown in it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close the results dropdown on an outside click.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        search.setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [search]);

  // The nav strip scrolls horizontally (hidden scrollbar) when there isn't
  // room for every item, e.g. Administration/Approvals get squeezed out on
  // medium-width screens. Without this, the active section's tab can end up
  // scrolled out of view with nothing visibly highlighted, making it look
  // like the header "lost its place" after navigating. Keep the active tab
  // scrolled into view on every navigation so it's always visible.
  useEffect(() => {
    activeNavItemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [location.pathname]);

  const goToResult = (result: SearchResult) => {
    navigate(result.path);
    search.setValue('');
    search.setOpen(false);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.results[0]) {
      goToResult(search.results[0]);
    } else if (search.value.trim()) {
      navigate(`/projects?q=${encodeURIComponent(search.value.trim())}`);
      search.setOpen(false);
    }
  };

  const initials = (username || userRole).slice(0, 2).toUpperCase();

  const navLink = (item: NavigationItem, mobile: boolean) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <button
        key={item.path}
        ref={!mobile && active ? activeNavItemRef : undefined}
        type="button"
        onClick={() => go(item.path)}
        className={
          mobile
            ? `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm ${active ? 'bg-gray-100 text-gray-900 font-semibold dark:bg-gray-800 dark:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`
            : `flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-sm border-b-2 transition-colors ${active
              ? 'border-teal-600 text-gray-900 font-semibold dark:text-white'
              : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`
        }
      >
        <Icon size={mobile ? 17 : 15} strokeWidth={active ? 2.25 : 1.9} />
        <span>{item.label}</span>
      </button>
    );
  };

  return <>
    {/* Desktop top header */}
    <header className="hidden lg:flex fixed top-0 inset-x-0 z-40 h-16 items-center gap-4 border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-900">
      <button type="button" onClick={() => go('/dashboard')} className="flex items-center gap-2.5 shrink-0">
        <BrandMark className="w-9 h-9" />
        <span className="leading-none text-left">
          <span className="block text-base font-bold tracking-tight text-gray-900 dark:text-white">SRIA</span>
          <span className="block mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">Your trusted digital partner</span>
        </span>
      </button>

      <nav
        aria-label="Primary navigation"
        className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => navLink(item, false))}
      </nav>

      <div className="flex-1" />

      <div ref={searchContainerRef} className="relative hidden xl:block w-64 shrink-0">
        <form onSubmit={submitSearch} className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            onFocus={() => { if (search.results.length || search.value.trim()) search.setOpen(true); }}
            placeholder="Search projects, clients, vendors…"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-600/40 focus:border-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
            ⌘K
          </span>
        </form>

        {search.open && (
          <div className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
            {search.loading ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
            ) : search.results.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No matches for "{search.value.trim()}".</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {search.results.map((result) => (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      type="button"
                      onClick={() => goToResult(result)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{result.label}</span>
                        {result.sublabel && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{result.sublabel}</span>}
                      </span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[result.type]}`}>
                        {result.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={openNotifications}
          className="relative grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {notifications.unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
            </span>
          )}
        </button>
        {notificationsOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
            <div className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</p>
                {notifications.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => notifications.markAllRead()}
                    className="text-xs font-medium text-teal-600 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.loading ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
              ) : notifications.items.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No new notifications.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {notifications.items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => goToNotification(n)}
                        className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />}
                        <span className={`min-w-0 ${n.is_read ? 'pl-3.5' : ''}`}>
                          <span className={`block truncate text-sm ${n.is_read ? 'text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-white'}`}>
                            {n.title}
                          </span>
                          {n.message && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{n.message}</span>}
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{timeSince(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pl-2 border-l border-gray-200 shrink-0 dark:border-gray-800">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-600">
          {initials}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{username || userRole}</span>
        <button
          type="button"
          onClick={logout}
          className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>

    {/* Mobile top header + slide-out menu */}
    <header className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <button type="button" onClick={() => go('/dashboard')} className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
        <BrandMark className="w-7 h-7" /> SRIA
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button type="button" onClick={() => setMobileMenuOpen(true)} className="rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Open navigation">
          <Menu size={22} />
        </button>
      </div>
    </header>
    {mobileMenuOpen && (
      <div className="lg:hidden fixed inset-0 z-50 bg-white px-5 py-6 overflow-y-auto dark:bg-gray-900">
        <div className="flex items-center justify-between mb-8">
          <span className="font-bold text-gray-900 dark:text-white">SRIA</span>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close navigation">
            <X size={22} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
        <nav aria-label="Mobile navigation" className="space-y-1">
          {items.map((item) => navLink(item, true))}
        </nav>
        <button type="button" onClick={logout} className="mt-8 w-full rounded-lg border border-gray-300 px-3 py-3 text-left text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
          Log out
        </button>
      </div>
    )}
  </>;
};
