import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Optional subtitle rendered under the title (e.g. a record summary line). */
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Drawer width on desktop. Defaults to a wide panel, suitable for dense forms. */
  size?: 'md' | 'lg' | 'xl';
}

const sizeClasses: Record<NonNullable<DrawerProps['size']>, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Generic right-side slide-in panel (enterprise-artifacts/UI_BUILD_HANDOFF.md's "Drawer").
 * A11y pattern (role="dialog", aria-modal, focus handling, Escape-to-close) is cribbed from
 * ApprovalDrawer.tsx, but this component carries no business logic of its own - unlike
 * ApprovalDrawer, which is hard-coded to the approve/reject/request-changes workflow.
 * Full-screen on mobile (`w-full`), a fixed max-width panel from `sm:` up.
 */
export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, subtitle, children, footer, size = 'lg' }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="absolute inset-0 bg-navy-900/40 dark:bg-black/50" onClick={onClose} />
      <div className={`relative w-full ${sizeClasses[size]} bg-white h-full shadow-2xl flex flex-col dark:bg-gray-900 dark:shadow-black/40`}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-lg font-semibold text-gray-900 truncate dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500 truncate dark:text-gray-400">{subtitle}</p>}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex-shrink-0 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3 flex-shrink-0 dark:border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
