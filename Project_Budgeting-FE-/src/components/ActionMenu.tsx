import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive action (shown in red). */
  danger?: boolean;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
  disabled?: boolean;
  /** Small icon before the label. */
  icon?: React.ReactNode;
}

interface ActionMenuProps {
  /** Accessible name of the "⋯" button, e.g. "Actions for Website Revamp". */
  label: string;
  items: ActionMenuItem[];
  /** Show a labelled button (e.g. "More actions") instead of the bare "⋯" icon. */
  triggerText?: string;
}

/**
 * Compact "⋯" action menu for a table row or card. The list floats in a portal (fixed to the
 * trigger, flipping up near the bottom of the screen) so scrolling table containers never clip it.
 * Keyboard: Enter/Space opens, Up/Down moves, Escape closes and returns focus.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ label, items, triggerText }) => {
  const [open, setOpen] = useState(false);
  // Off-screen (not hidden) until placed, so the first item can take focus straight away.
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: -9999, left: -9999 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menuRef.current?.offsetHeight ?? 0;
      const openUp = window.innerHeight - rect.bottom < height + 8 && rect.top > height + 8;
      setStyle({
        position: 'fixed',
        right: Math.max(8, window.innerWidth - rect.right),
        ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    // Escape anywhere closes it (focus may have left the menu, e.g. after a mouse click elsewhere).
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEscape);
    menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      entries[(at + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={triggerText ? undefined : label}
        title={triggerText ? undefined : 'More actions'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerText
          ? 'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
          : 'flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}
      >
        {triggerText ? <>{triggerText}<ChevronDown size={14} aria-hidden="true" /></> : <MoreHorizontal size={16} aria-hidden="true" />}
      </button>
      {open && createPortal(
        // Portal events still bubble to React parents (e.g. a clickable row) - stop them here.
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={style}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
          className="z-50 min-w-[11rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40"
        >
          {items.map((item) => (
            <React.Fragment key={item.label}>
              {item.separatorBefore && <div role="separator" className="my-1 border-t border-gray-100 dark:border-gray-700" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { close(); item.onSelect(); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-gray-400 ${item.danger
                  ? 'text-risk-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10'
                  : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700'}`}
              >
                {item.icon}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
