import React, { useMemo } from 'react';
import { OnboardingStepCards } from '../../../components/OnboardingStepCards';
import { StatusBadge } from '../../../components/StatusBadge';
import type { Freelancer } from '../../../types/freelancerOnboarding.types';
import { FREELANCER_ONBOARDING_STEPS, freelancerPercent, resolveFreelancerSteps, statusVariant, type FreelancerStepKey } from './freelancerDisplay';

interface Props {
  freelancer: Freelancer | null;
  statusLabel: (status: string) => string;
  onStepClick?: (freelancer: Freelancer, step: FreelancerStepKey) => void;
}

/** "Freelancer onboarding process" panel - like the client list's: a one-line prompt until a freelancer
 * is selected, then that freelancer's steps as status cards (a step click opens the drawer there). */
export const FreelancerOnboardingPanel: React.FC<Props> = ({ freelancer, statusLabel, onStepClick }) => {
  const steps = useMemo(() => (freelancer ? resolveFreelancerSteps(freelancer) : []), [freelancer]);
  const current = steps.find((s) => s.isCurrent);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-4 sm:px-5 pt-4 pb-3 ${freelancer ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Freelancer onboarding process</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {freelancer ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-200">{freelancer.full_name || 'Untitled freelancer'}</span>
                {' '}&middot; {current ? `Pending at ${current.title}` : 'All steps complete'} &middot; {freelancerPercent(freelancer)}% complete
              </>
            ) : (
              'Click a freelancer card to see their onboarding progress here.'
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500 sm:whitespace-nowrap dark:text-gray-400">
          {FREELANCER_ONBOARDING_STEPS.length} steps &middot; invite to approval
        </p>
      </div>

      {freelancer && (
        <div className="px-4 sm:px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={freelancer.status} variant={statusVariant(freelancer.status)} label={statusLabel(freelancer.status)} />
            {freelancer.freelancer_code && <span className="font-mono">{freelancer.freelancer_code}</span>}
            {freelancer.professional_title && <span>{freelancer.professional_title}</span>}
          </div>
          <OnboardingStepCards
            steps={steps}
            scrollKey={freelancer.id}
            onStepClick={onStepClick ? (key) => onStepClick(freelancer, key as FreelancerStepKey) : undefined}
            clickHint={(step) => `Open ${step.title}`}
          />
        </div>
      )}
    </div>
  );
};
