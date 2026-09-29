import React from 'react';
import { StatusBadge } from '../../../components/StatusBadge';
import type { VendorOnboardingDetail } from '../../../types/vendorOnboarding.types';
import { StarRating } from './StarRating';
import { vendorStatusLabel } from './vendorDisplay';
import { VENDOR_ONBOARDING_STEPS } from './VendorOnboardingPanel';

/** While onboarding is still being filled in, the stage is the first unfinished of the 5 steps;
 * once submitted, it's the backend's approval stage (e.g. "Approval Level 1: Finance"). */
const stageLabel = (vendor: VendorOnboardingDetail) => {
  if (!['invited', 'draft', 'action_required'].includes(vendor.status)) return vendor.current_stage;
  const index = VENDOR_ONBOARDING_STEPS.findIndex((s) => s.key === vendor.onboarding?.current_step);
  return index < 0 ? vendor.current_stage : `Step ${index + 1} of ${VENDOR_ONBOARDING_STEPS.length} · ${VENDOR_ONBOARDING_STEPS[index].title}`;
};

const LABEL = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400';

/** Top-of-view summary for an existing vendor: current workflow status and rating. */
export const VendorStatusHeader: React.FC<{ vendor: VendorOnboardingDetail }> = ({ vendor }) => {
  const rating = vendor.onboarding_profile?.rating ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
      <div>
        <p className={LABEL}>Status</p>
        <StatusBadge status={vendor.status} label={vendorStatusLabel(vendor)} className="mt-1 text-sm" />
      </div>
      <div>
        <p className={LABEL}>Rating</p>
        <div className="flex items-center gap-2 mt-1">
          <StarRating value={rating} />
          <span className="text-sm text-gray-600 dark:text-gray-300">{rating ? `${rating}/5` : 'Not rated'}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className={LABEL}>Stage</p>
        <p className="text-sm font-medium text-gray-900 mt-1 truncate dark:text-white">{stageLabel(vendor)}</p>
      </div>
      {vendor.vendor_reference_no && (
        <div>
          <p className={LABEL}>Reference</p>
          <p className="text-sm font-medium text-gray-900 mt-1 dark:text-white">{vendor.vendor_reference_no}</p>
        </div>
      )}
    </div>
  );
};
