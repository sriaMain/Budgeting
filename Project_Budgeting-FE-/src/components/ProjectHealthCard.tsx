import React from 'react';
import { StatusBadge } from './StatusBadge';

export type ProjectHealth = 'healthy' | 'watch' | 'at_risk';

const HEALTH_META: Record<ProjectHealth, { label: string; variant: 'success' | 'warning' | 'danger'; bar: string }> = {
  healthy: { label: 'Healthy', variant: 'success', bar: 'bg-teal-600' },
  watch: { label: 'Watch', variant: 'warning', bar: 'bg-amber-600' },
  at_risk: { label: 'At risk', variant: 'danger', bar: 'bg-risk-600' },
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

interface ProjectHealthCardProps {
  name: string;
  health: ProjectHealth;
  healthReason?: string;
  budgetUsedPct: number;
  /** 'fixed' | 'time_and_material' (shown as a labelled pill); any other text is shown as-is. */
  engagementType?: string;
  /** Omitted when the API doesn't provide it yet (see Phase 3 backend gaps). */
  owner?: string;
  /** Omitted when the API doesn't provide it yet (see Phase 3 backend gaps). */
  nextMilestone?: string;
  statusLabel?: string;
  /** Pre-formatted (e.g. "71,952 INR") so this component doesn't own currency formatting. */
  totalBudget?: string;
  /** Pre-formatted (e.g. "252h"). */
  totalHours?: string;
  startDate?: string;
  endDate?: string;
  /**
   * Renders in place of the computed health badge — e.g. the project's real,
   * editable status control — so the card shows one status indicator instead
   * of a health badge here and a separate status control alongside it.
   * Falls back to the health badge when omitted.
   */
  statusControl?: React.ReactNode;
  onClick?: () => void;
}

export const ProjectHealthCard: React.FC<ProjectHealthCardProps> = ({
  name,
  health,
  healthReason,
  budgetUsedPct,
  engagementType,
  owner,
  nextMilestone,
  statusLabel,
  totalBudget,
  totalHours,
  startDate,
  endDate,
  statusControl,
  onClick,
}) => {
  const meta = HEALTH_META[health];
  const clampedPct = Math.max(0, Math.min(100, budgetUsedPct));

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:border-teal-200 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{name}</h3>
        {statusControl ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {statusControl}
          </div>
        ) : (
          <StatusBadge status={health} variant={meta.variant} label={meta.label} className="shrink-0" />
        )}
      </div>

      {(engagementType || owner) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {engagementType && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                ENGAGEMENT_META[engagementType]?.className ??
                'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
              }`}
            >
              {ENGAGEMENT_META[engagementType]?.label ?? engagementType}
            </span>
          )}
          {owner && <span className="text-xs text-gray-500 dark:text-gray-400">Owner: {owner}</span>}
        </div>
      )}

      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${meta.bar}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-gray-600 dark:text-gray-400">
          Budget used <b className="text-gray-900 dark:text-white">{clampedPct.toFixed(0)}%</b>
        </span>
        <span className="text-gray-500 dark:text-gray-400">{nextMilestone ?? statusLabel ?? ''}</span>
      </div>

      {(totalBudget || totalHours || startDate || endDate) && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {totalBudget && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">Total Budget</p>
              <p className="font-semibold text-gray-900 dark:text-white">{totalBudget}</p>
            </div>
          )}
          {totalHours && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">Hours Allocated</p>
              <p className="font-semibold text-gray-900 dark:text-white">{totalHours}</p>
            </div>
          )}
          {startDate && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">Start Date</p>
              <p className="font-semibold text-gray-900 dark:text-white">{startDate}</p>
            </div>
          )}
          {endDate && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">End Date</p>
              <p className="font-semibold text-gray-900 dark:text-white">{endDate}</p>
            </div>
          )}
        </div>
      )}

      {healthReason && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{healthReason}</p>}
    </div>
  );
};
