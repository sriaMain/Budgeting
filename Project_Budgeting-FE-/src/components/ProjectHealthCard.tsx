import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';

export type ProjectHealth = 'healthy' | 'watch' | 'at_risk';

// Budget-usage colours: green on track, amber getting close, red at risk / over budget.
const HEALTH_META: Record<ProjectHealth, { bar: string; text: string }> = {
  healthy: { bar: 'bg-green-600', text: 'text-green-700 dark:text-green-400' },
  watch: { bar: 'bg-amber-600', text: 'text-amber-700 dark:text-amber-400' },
  at_risk: { bar: 'bg-risk-600', text: 'text-risk-600 dark:text-red-400' },
};

// Engagement model chosen when the project was created (Create Project modal)
const ENGAGEMENT_META: Record<string, { label: string; className: string }> = {
  fixed: {
    label: 'Fixed Budget / Milestone',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  },
  time_and_material: {
    label: 'Time & Material (T&M)',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  },
};

export interface ProjectCardAction {
  label: string;
  onSelect: () => void;
}

interface ProjectHealthCardProps {
  name: string;
  /** Where the project opens: the name links there, and a click on the card's empty space goes there too. */
  href: string;
  health: ProjectHealth;
  /** Share of the cost budget already spent; null when the project has no budget yet. */
  budgetUsedPct: number | null;
  /** Pre-formatted, e.g. "₹1,20,000"; `remaining` is negative when over budget. */
  usedAmount?: string;
  remainingAmount?: string;
  overBudget?: boolean;
  /** 'fixed' | 'time_and_material' (shown as a labelled pill); any other text is shown as-is. */
  engagementType?: string;
  /** Pre-formatted values; missing ones read "Not set" so every card lines up. */
  totalBudget?: string;
  totalHours?: string;
  startDate?: string;
  endDate?: string;
  /** The project's real, editable status control. */
  statusControl?: React.ReactNode;
  actions?: ProjectCardAction[];
}

const CardMenu: React.FC<{ label: string; actions: ProjectCardAction[] }> = ({ label, actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); action.onSelect(); }}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const ProjectHealthCard: React.FC<ProjectHealthCardProps> = ({
  name,
  href,
  health,
  budgetUsedPct,
  usedAmount,
  remainingAmount,
  overBudget = false,
  engagementType,
  totalBudget,
  totalHours,
  startDate,
  endDate,
  statusControl,
  actions,
}) => {
  const navigate = useNavigate();
  const meta = HEALTH_META[health];
  const engagement = engagementType ? ENGAGEMENT_META[engagementType] : undefined;
  const details: [string, string | undefined][] = [
    ['Total Budget', totalBudget],
    ['Hours Allocated', totalHours],
    ['Start Date', startDate],
    ['End Date', endDate],
  ];

  return (
    <article
      // Mouse convenience only - the name link (and the controls) are the keyboard targets.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a, button, select, [role=menu]')) navigate(href);
      }}
      className="flex min-w-0 cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-[border-color,box-shadow] hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-gray-900 dark:text-white">
            <Link
              to={href}
              title={name}
              className="line-clamp-2 break-words rounded-sm hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:hover:text-violet-300"
            >
              {name}
            </Link>
          </h3>
          {engagementType && (
            <span
              title={engagement?.label ?? engagementType}
              className={`mt-1 inline-block max-w-full truncate rounded-md border px-1.5 py-px align-top text-[11px] font-semibold ${engagement?.className ??
                'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}
            >
              {engagement?.label ?? engagementType}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {statusControl}
          {actions && actions.length > 0 && <CardMenu label={`More actions for ${name}`} actions={actions} />}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Budget used</span>
          {budgetUsedPct === null ? (
            <span className="text-gray-500 dark:text-gray-400">No budget set</span>
          ) : (
            <span className={`font-semibold tabular-nums ${meta.text}`}>
              {budgetUsedPct.toFixed(0)}%{overBudget ? ' · Over budget' : ''}
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`Budget used for ${name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={budgetUsedPct === null ? undefined : Math.round(budgetUsedPct)}
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${meta.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, budgetUsedPct ?? 0))}%` }}
          />
        </div>
        {usedAmount && remainingAmount && (
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            <span className="truncate" title={`${usedAmount} used`}>{usedAmount} used</span>
            <span className={`truncate ${overBudget ? meta.text : ''}`} title={remainingAmount}>{remainingAmount}</span>
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-gray-100 pt-2.5 dark:border-gray-800">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-4 text-gray-500 dark:text-gray-400">{label}</dt>
            <dd
              className={`truncate text-[13px] font-medium leading-[18px] tabular-nums ${value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}
              title={value}
            >
              {value || 'Not set'}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
};
