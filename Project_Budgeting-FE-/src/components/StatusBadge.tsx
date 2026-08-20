import React from 'react';

const STATUS_STYLES: Record<string, string> = {
  invited: 'bg-purple-100 text-purple-700',
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  action_required: 'bg-red-100 text-red-700',
  resubmitted: 'bg-indigo-100 text-indigo-700',
  requested: 'bg-blue-100 text-blue-700',
  approval_in_progress: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
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
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${style} ${className}`}>
      {label}
    </span>
  );
};
