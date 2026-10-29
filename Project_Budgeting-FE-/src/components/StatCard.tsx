import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  /** Percent change vs. the prior period. Omit/null when there's no baseline to compare against. */
  change?: number | null;
  /** Whether an increase in this metric is a good thing (e.g. false for expenses). */
  higherIsBetter?: boolean;
  loading?: boolean;
  onClick?: () => void;
  /** Optional semantic health tag (approved enterprise UI design tokens). Independent of `change`. */
  status?: 'good' | 'watch' | 'risk';
  /** Caption shown when `status` is set, e.g. "Within control limit" or "₹23.8L overdue". */
  statusLabel?: string;
  /** Dense dashboard variant (~100px tall): 16px padding, smaller icon, flat card. */
  compact?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  change,
  higherIsBetter = true,
  loading = false,
  onClick,
  status,
  statusLabel,
  compact = false,
  className = '',
}) => {
  // compact cards are size containers: a very narrow one drops its decorative icon so the label fits.
  const box = compact
    ? '@container p-4 rounded-lg border border-gray-200 dark:border-gray-800'
    : 'p-5 rounded-xl border border-gray-200 shadow-sm dark:border-gray-800';

  if (loading) {
    return (
      <div className={`bg-white ${box} animate-pulse dark:bg-gray-900 ${className}`}>
        <div className={`h-4 w-24 bg-gray-100 rounded ${compact ? 'mb-4' : 'mb-3'} dark:bg-gray-800`} />
        <div className="h-7 w-32 bg-gray-100 rounded dark:bg-gray-800" />
      </div>
    );
  }

  const hasChange = change !== null && change !== undefined;
  const isUp = hasChange && change > 0;
  const isGood = hasChange && (isUp === higherIsBetter) && change !== 0;
  const isBad = hasChange && change !== 0 && !isGood;

  return (
    <div
      onClick={onClick}
      className={`bg-white ${box} transition-shadow dark:bg-gray-900 ${compact ? 'min-w-0' : 'hover:shadow-md'} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        {icon && (
          <div className={`${compact ? 'w-7 h-7 rounded-md @max-[11rem]:hidden' : 'w-9 h-9 rounded-lg'} shrink-0 bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-500/10 dark:text-blue-400`}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          className={compact ? 'min-w-0 truncate text-2xl font-semibold tabular-nums text-gray-900 dark:text-white' : 'text-2xl font-bold text-gray-900 dark:text-white'}
          title={compact ? value : undefined}
        >
          {value}
        </span>
        {hasChange && change !== 0 && (
          <span
            className={`flex items-center gap-0.5 text-sm font-medium ${
              isGood ? 'text-green-600 dark:text-green-400' : isBad ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {statusLabel && (
        <p
          className={`mt-1.5 text-xs font-medium ${
            status === 'risk' ? 'text-risk-600 dark:text-red-400' : status === 'watch' ? 'text-amber-600 dark:text-amber-400' : 'text-teal-700 dark:text-violet-400'
          }`}
        >
          {statusLabel}
        </p>
      )}
    </div>
  );
};

// Design-system alias: same component, name matches enterprise-artifacts/UI_BUILD_HANDOFF.md's "MetricCard".
export { StatCard as MetricCard };
