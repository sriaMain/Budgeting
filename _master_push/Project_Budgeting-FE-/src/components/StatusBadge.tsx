import React from 'react';

const STATUS_STYLES: Record<string, string> = {
  invited: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  action_required: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  resubmitted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  requested: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  approval_in_progress: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  onboarding: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  completed: 'bg-teal-100 text-teal-700 dark:bg-violet-500/15 dark:text-violet-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
};

const STATUS_LABELS: Record<string, string> = {
  invited: 'Invited',
  draft: 'Draft',
  submitted: 'Submitted',
  action_required: 'Action Required',
  resubmitted: 'Resubmitted',
  requested: 'Requested',
  approval_in_progress: 'Approval In Progress',
  approved: 'Approved',
  onboarding: 'Onboarding',
  completed: 'Completed',
  active: 'Active',
};

// Semantic variants for the approved enterprise UI design (teal/amber/risk tokens).
// Status is always conveyed as text + color together, never color alone.
const VARIANT_STYLES: Record<'success' | 'warning' | 'danger' | 'neutral' | 'info', string> = {
  success: 'bg-teal-100 text-teal-700 dark:bg-green-500/15 dark:text-green-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-risk-50 text-risk-700 dark:bg-red-500/15 dark:text-red-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
};

interface StatusBadgeProps {
  status: string;
  /** Semantic tone. When omitted, falls back to the legacy onboarding-status lookup. */
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  /** Explicit display text. When omitted, falls back to the legacy status-label lookup (or `status` itself). */
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant, label, className = '' }) => {
  const style = variant ? VARIANT_STYLES[variant] : (STATUS_STYLES[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300');
  const displayLabel = label ?? (variant ? status : (STATUS_LABELS[status] || status));

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${style} ${className}`}>
      {displayLabel}
    </span>
  );
};
