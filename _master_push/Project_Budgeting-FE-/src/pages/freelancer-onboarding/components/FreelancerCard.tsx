import React from 'react';
import { Archive, ArchiveRestore, Mail } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import type { Freelancer } from '../../../types/freelancerOnboarding.types';
import { formatRate, freelancerPercent, freelancerStepStatuses, FREELANCER_ONBOARDING_STEPS, initials } from './freelancerDisplay';

interface Props {
  freelancer: Freelancer;
  selected: boolean;
  statusLabel: (status: string) => string;
  availabilityLabel: (value: string) => string;
  /** Card click - selects the freelancer (drives the onboarding panel). */
  onSelect: () => void;
  /** Edit button - opens the onboarding form. */
  onEdit: () => void;
  onResendInvite: () => void;
  isResending: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
}

const LABEL = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400';

export const FreelancerCard: React.FC<Props> = ({
  freelancer: f, selected, statusLabel, availabilityLabel, onSelect, onEdit, onResendInvite, isResending, onArchive, onUnarchive,
}) => {
  const statuses = freelancerStepStatuses(f);
  const done = FREELANCER_ONBOARDING_STEPS.filter((s) => statuses[s.key] === 'completed').length;
  const percent = freelancerPercent(f);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`bg-white rounded-lg border shadow-sm p-4 sm:p-5 flex flex-col gap-4 cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900 dark:focus-visible:ring-violet-500 ${
        selected ? 'border-blue-600 ring-1 ring-blue-600 dark:border-violet-500 dark:ring-violet-500' : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      {/* Identity */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 dark:bg-violet-600">
          {initials(f.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate dark:text-white" title={f.full_name}>{f.full_name || 'Untitled freelancer'}</p>
          <p className="text-sm text-gray-500 truncate dark:text-gray-400" title={f.professional_title}>{f.professional_title || f.email || '—'}</p>
        </div>
        <StatusBadge status={f.status} label={statusLabel(f.status)} />
      </div>

      {/* Commercials */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={LABEL}>Pay rate</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{formatRate(f)}</p>
        </div>
        <div>
          <p className={LABEL}>Projects</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{f.assigned_projects_count ?? 0}</p>
          {f.availability && <p className="text-xs text-gray-500 dark:text-gray-400">{availabilityLabel(f.availability)}</p>}
        </div>
      </div>

      <div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
          <div className="h-full bg-blue-600 rounded-full dark:bg-violet-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1.5 dark:text-gray-400">
          {f.location || 'Location not set'}
          <span className="float-right">Onboarding · {done}/{FREELANCER_ONBOARDING_STEPS.length}</span>
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100 mt-auto dark:border-gray-800">
        <p className="text-xs font-mono text-gray-500 min-w-0 truncate dark:text-gray-400">{f.freelancer_code || '—'}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {f.status === 'invited' && (
            <button
              type="button"
              onClick={onResendInvite}
              disabled={isResending}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
              title="Resend invitation email"
              aria-label="Resend invitation"
            >
              <Mail className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Open the onboarding form"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={f.is_archived ? onUnarchive : onArchive}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title={f.is_archived ? 'Restore to main list' : 'Archive (hide from the main list)'}
            aria-label={f.is_archived ? 'Restore freelancer' : 'Archive freelancer'}
          >
            {f.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
