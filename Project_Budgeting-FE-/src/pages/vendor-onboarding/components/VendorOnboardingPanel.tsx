import React, { useMemo } from 'react';
import { OnboardingStepCards, markCurrentStep, type StepCardItem } from '../../../components/OnboardingStepCards';
import { StatusBadge } from '../../../components/StatusBadge';
import { StarRating } from './StarRating';
import { vendorOnboarding, vendorStatusLabel } from './vendorDisplay';
import { EDITABLE_VENDOR_STATUSES, VENDOR_ONBOARDING_STEPS } from './vendorSteps';
import type { VendorOnboardingDetail, VendorOnboardingStepKey } from '../../../types/vendorOnboarding.types';

const isVendorEditable = (vendor: VendorOnboardingDetail) => EDITABLE_VENDOR_STATUSES.includes(vendor.status);

const resolveVendorSteps = (vendor: VendorOnboardingDetail): StepCardItem[] =>
  markCurrentStep(
    VENDOR_ONBOARDING_STEPS.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      status: vendorOnboarding(vendor).step_statuses[s.key] ?? 'pending',
    })),
    vendorOnboarding(vendor).current_step
  );

interface VendorOnboardingPanelProps {
  vendor: VendorOnboardingDetail | null;
  onStepClick?: (vendor: VendorOnboardingDetail, step: VendorOnboardingStepKey) => void;
}

/** "Vendor onboarding process" panel - like the client list's: a one-line prompt until a vendor is
 * selected, then that vendor's 7 steps as status cards (a step click opens the drawer there). */
export const VendorOnboardingPanel: React.FC<VendorOnboardingPanelProps> = ({ vendor, onStepClick }) => {
  const steps = useMemo(() => (vendor ? resolveVendorSteps(vendor) : []), [vendor]);
  const current = steps.find((s) => s.isCurrent);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-4 sm:px-5 pt-4 pb-3 ${vendor ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Vendor onboarding process</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {vendor ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-200">{vendor.name || 'Untitled vendor'}</span>
                {' '}&middot; {current ? `Pending at ${current.title}` : 'All steps complete'} &middot; {vendorOnboarding(vendor).percent}% complete
              </>
            ) : (
              'Click a vendor card to see its onboarding progress here.'
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500 sm:whitespace-nowrap dark:text-gray-400">
          {VENDOR_ONBOARDING_STEPS.length} steps &middot; basic information to approved
        </p>
      </div>

      {vendor && (
        <div className="px-4 sm:px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={vendor.status} label={vendorStatusLabel(vendor)} />
            <span className="inline-flex items-center gap-1" title={vendor.onboarding_profile?.rating ? `Rated ${vendor.onboarding_profile.rating} out of 5` : 'Not rated yet'}>
              <StarRating value={vendor.onboarding_profile?.rating} size="sm" />
              {!vendor.onboarding_profile?.rating && 'Not rated'}
            </span>
            {vendor.vendor_reference_no && <span>{vendor.vendor_reference_no}</span>}
            <span>{vendor.vendor_type_display}</span>
            {vendor.current_approval_stage?.level_name && <span>&middot; Approval: {vendor.current_approval_stage.level_name}</span>}
          </div>
          <OnboardingStepCards
            steps={steps}
            scrollKey={vendor.id}
            onStepClick={onStepClick ? (key) => onStepClick(vendor, key as VendorOnboardingStepKey) : undefined}
            clickHint={(step) => (isVendorEditable(vendor) && step.key !== 'approved' ? `Edit ${step.title}` : `View ${step.title}`)}
          />
        </div>
      )}
    </div>
  );
};
