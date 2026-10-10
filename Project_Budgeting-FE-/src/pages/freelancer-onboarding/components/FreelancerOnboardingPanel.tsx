import React, { useMemo } from 'react';
import { OnboardingStepCards } from '../../../components/OnboardingStepCards';
import { StatusBadge } from '../../../components/StatusBadge';
import type { Freelancer } from '../../../types/freelancerOnboarding.types';
import { FREELANCER_ONBOARDING_STEPS, freelancerPercent, resolveFreelancerSteps, type FreelancerStepKey } from './freelancerDisplay';

interface Props {
  freelancer: Freelancer | null;
  statusLabel: (status: string) => string;
  onStepClick?: (freelancer: Freelancer, step: FreelancerStepKey) => void;
}

/** "Freelancer onboarding process" panel - the selected freelancer's 5 steps, or the generic flow when none is selected. */
export const FreelancerOnboardingPanel: React.FC<Props> = ({ freelancer, statusLabel, onStepClick }) => {
  const steps = useMemo(
    () =>
      freelancer
        ? resolveFreelancerSteps(freelancer)
        : FREELANCER_ONBOARDING_STEPS.map((s) => ({ ...s, status: 'pending' as const, isCurrent: false })),
    [freelancer]
  );
  const current = steps.find((s) => s.isCurrent);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Freelancer onboarding process</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {freelancer ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-200">{freelancer.full_name || 'Untitled freelancer'}</span>
                {' '}&middot; {current ? `Pending at ${current.title}` : 'All steps complete'} &middot; {freelancerPercent(freelancer)}% complete
              </>
            ) : (
              <>Profile &rarr; address &rarr; availability &rarr; bank and KYC &rarr; active</>
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500 sm:whitespace-nowrap dark:text-gray-400">
          {FREELANCER_ONBOARDING_STEPS.length} steps &middot; profile to active
        </p>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-3">
        {freelancer ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={freelancer.status} label={statusLabel(freelancer.status)} />
            {freelancer.freelancer_code && <span className="font-mono">{freelancer.freelancer_code}</span>}
            {freelancer.professional_title && <span>{freelancer.professional_title}</span>}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">Select a freelancer below to see where its onboarding is, then click a step to open it.</p>
        )}
        <OnboardingStepCards
          steps={steps}
          showStatus={!!freelancer}
          scrollKey={freelancer?.id ?? null}
          onStepClick={freelancer && onStepClick ? (key) => onStepClick(freelancer, key as FreelancerStepKey) : undefined}
          clickHint={(step) => `Open ${step.title}`}
        />
      </div>
    </div>
  );
};
