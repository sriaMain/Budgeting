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
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  change,
  higherIsBetter = true,
  loading = false,
  onClick,
}) => {
  if (loading) {
    return (
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm animate-pulse">
        <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
        <div className="h-7 w-32 bg-gray-100 rounded" />
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
      className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {hasChange && change !== 0 && (
          <span
            className={`flex items-center gap-0.5 text-sm font-medium ${
              isGood ? 'text-green-600' : isBad ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
};
