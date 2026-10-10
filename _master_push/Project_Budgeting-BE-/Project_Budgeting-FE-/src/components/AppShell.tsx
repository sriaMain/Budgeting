import React from 'react';
import { Navbar } from './Navbar';
import { useAppSelector } from '../hooks/useAppSelector';

interface AppShellProps {
  children: React.ReactNode;
  /** Small uppercase label above the title, e.g. a date or section crumb. */
  breadcrumb?: string;
  title?: string;
}

/**
 * Design-system shell for the approved enterprise UI (enterprise-artifacts/UI_BUILD_HANDOFF.md).
 * Reads role from Redux directly instead of requiring prop-drilled userRole/currentPage/onNavigate,
 * unlike the legacy `Layout` component which ~26 existing pages still use unchanged.
 */
export const AppShell: React.FC<AppShellProps> = ({ children, breadcrumb, title }) => {
  const userRole = (useAppSelector((state) => state.auth.userRole) || 'user') as
    | 'admin'
    | 'user'
    | 'manager'
    | 'employee';

  return (
    <div className="min-h-screen bg-surface w-full font-sans text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Navbar userRole={userRole} />
      <main className="min-w-0 max-w-[1600px] mx-auto px-4 pt-20 pb-8 sm:px-6 lg:px-8">
        {(breadcrumb || title) && (
          <header className="mb-6">
            {breadcrumb && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-500">{breadcrumb}</p>
            )}
            {title && <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
};
