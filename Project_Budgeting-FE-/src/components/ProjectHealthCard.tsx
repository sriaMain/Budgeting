import React from 'react';
import { StatusBadge } from './StatusBadge';

export type ProjectHealth = 'healthy' | 'watch' | 'at_risk';

const HEALTH_META: Record<ProjectHealth, { label: string; variant: 'success' | 'warning' | 'danger'; bar: string }> = {
  healthy: { label: 'Healthy', variant: 'success', bar: 'bg-teal-600' },
  watch: { label: 'Watch', variant: 'warning', bar: 'bg-amber-600' },
  at_risk: { label: 'At risk', variant: 'danger', bar: 'bg-risk-600' },
};

interface ProjectHealthCardProps {
  name: string;
  health: ProjectHealth;
  healthReason?: string;
  budgetUsedPct: number;
  /** Omitted when the API doesn't provide it yet (see Phase 3 backend gaps). */
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
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:border-teal-200 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">{name}</h3>
        {statusControl ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {statusControl}
          </div>
        ) : (
          <StatusBadge status={health} variant={meta.variant} label={meta.label} className="shrink-0" />
        )}
      </div>

      {(engagementType || owner) && (
        <p className="text-xs text-gray-500 mb-3">
          {[engagementType, owner ? `Owner: ${owner}` : null].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${clampedPct}%` }} />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-gray-600">
          Budget used <b className="text-gray-900">{clampedPct.toFixed(0)}%</b>
        </span>
        <span className="text-gray-500">{nextMilestone ?? statusLabel ?? ''}</span>
      </div>

      {(totalBudget || totalHours || startDate || endDate) && (
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {totalBudget && (
            <div>
              <p className="text-gray-500">Total Budget</p>
              <p className="font-semibold text-gray-900">{totalBudget}</p>
            </div>
          )}
          {totalHours && (
            <div>
              <p className="text-gray-500">Hours Allocated</p>
              <p className="font-semibold text-gray-900">{totalHours}</p>
            </div>
          )}
          {startDate && (
            <div>
              <p className="text-gray-500">Start Date</p>
              <p className="font-semibold text-gray-900">{startDate}</p>
            </div>
          )}
          {endDate && (
            <div>
              <p className="text-gray-500">End Date</p>
              <p className="font-semibold text-gray-900">{endDate}</p>
            </div>
          )}
        </div>
      )}

      {healthReason && <p className="mt-2 text-xs text-gray-500">{healthReason}</p>}
    </div>
  );
};
