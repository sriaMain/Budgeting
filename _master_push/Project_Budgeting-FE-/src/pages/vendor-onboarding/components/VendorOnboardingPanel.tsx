import React, { useMemo } from 'react';
import { OnboardingStepCards, markCurrentStep, type StepCardItem } from '../../../components/OnboardingStepCards';
import { StatusBadge } from '../../../components/StatusBadge';
import { StarRating } from './StarRating';
import { vendorStatusLabel } from './vendorDisplay';
import type { VendorOnboardingDetail, VendorOnboardingStepKey } from '../../../types/vendorOnboarding.types';

/** The 5 vendor onboarding steps, in the same order as the backend's VENDOR_ONBOARDING_STEPS. */
export const VENDOR_ONBOARDING_STEPS: { key: VendorOnboardingStepKey; title: string; description: string; wizardStep?: number }[] = [
  { key: 'intake', title: 'Intake', description: 'Legal entity, services and contacts', wizardStep: 1 },
  { key: 'tax_kyc', title: 'Tax & KYC', description: 'Tax ID, ownership, compliance and documents', wizardStep: 2 },
  { key: 'banking', title: 'Banking', description: 'Account and routing verification', wizardStep: 3 },
  { key: 'contract', title: 'Contract', description: 'Payment terms, currency and procurement', wizardStep: 4 },
  { key: 'approved', title: 'Approved', description: 'Ready for projects, POs and invoices' },
];

/** Statuses in which the backend still accepts admin edits (views._is_editable). */
export const isVendorEditable = (vendor: VendorOnboardingDetail) =>
  vendor.status === 'invited' || vendor.status === 'draft' || vendor.status === 'action_required';

export const resolveVendorSteps = (vendor: VendorOnboardingDetail): StepCardItem[] =>
  markCurrentStep(
    VENDOR_ONBOARDING_STEPS.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      status: vendor.onboarding?.step_statuses?.[s.key] ?? 'pending',
    })),
    vendor.onboarding?.current_step
  );

interface VendorOnboardingPanelProps {
  vendor: VendorOnboardingDetail | null;
  onStepClick?: (vendor: VendorOnboardingDetail, step: VendorOnboardingStepKey) => void;
}

/** "Vendor onboarding process" panel - the selected vendor's 5 steps, or the generic flow when none is selected. */
export const VendorOnboardingPanel: React.FC<VendorOnboardingPanelProps> = ({ vendor, onStepClick }) => {
  const steps = useMemo(
    () =>
      vendor
        ? resolveVendorSteps(vendor)
        : VENDOR_ONBOARDING_STEPS.map((s) => ({ key: s.key, title: s.title, description: s.description, status: 'pending' as const, isCurrent: false })),
    [vendor]
  );
  const current = steps.find((s) => s.isCurrent);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Vendor onboarding process</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {vendor ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-200">{vendor.name || 'Untitled vendor'}</span>
                {' '}&middot; {current ? `Pending at ${current.title}` : 'All steps complete'} &middot; {vendor.onboarding?.percent ?? 0}% complete
              </>
            ) : (
              <>Intake &rarr; tax and KYC &rarr; banking &rarr; contract &rarr; approved</>
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500 sm:whitespace-nowrap dark:text-gray-400">
          {VENDOR_ONBOARDING_STEPS.length} steps &middot; intake to approved
        </p>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-3">
        {vendor ? (
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
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">Select a vendor below to see where its onboarding is, then click a step to open it.</p>
        )}
        <OnboardingStepCards
          steps={steps}
          showStatus={!!vendor}
          scrollKey={vendor?.id ?? null}
          onStepClick={vendor && onStepClick ? (key) => onStepClick(vendor, key as VendorOnboardingStepKey) : undefined}
          clickHint={(step) => (vendor && isVendorEditable(vendor) && step.key !== 'approved' ? `Edit ${step.title}` : `View ${step.title}`)}
        />
      </div>
    </div>
  );
};
