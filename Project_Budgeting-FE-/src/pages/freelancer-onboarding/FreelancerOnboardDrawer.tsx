import React from 'react';
import { Drawer } from '../../components/Drawer';
import { CompactFields } from '../../components/fieldDensity';
import type { Freelancer, FreelancerChoices } from '../../types/freelancerOnboarding.types';
import { FreelancerWorkspace } from './components/FreelancerWorkspace';
import type { FreelancerStepKey } from './components/freelancerDisplay';

interface Props {
  isOpen: boolean;
  /** Existing freelancer; null = onboard a new one. */
  freelancerId: number | null;
  /** Wizard step to open on (from a step card). */
  initialStep?: FreelancerStepKey;
  choices: FreelancerChoices | null;
  /** Kept for callers - labels now come from the record's status_display. */
  statusLabel?: (status: string) => string;
  onClose: () => void;
  onSaved: (freelancer: Freelancer) => void;
}

/**
 * Onboarding drawer: the same 7-step wizard as the freelancer's secure link (Basic
 * Information -> Identity & KYC -> Address -> Banking -> Professional -> KYC Documents ->
 * Review), reviewer actions on Review, and the operational tabs once the record exists.
 * The wizard footer sits in the Drawer's footer slot.
 */
export const FreelancerOnboardDrawer: React.FC<Props> = ({ isOpen, freelancerId, initialStep, choices, onClose, onSaved }) => {
  if (!isOpen) return null;
  return (
    <FreelancerWorkspace
      key={freelancerId ?? 'new'}
      freelancerId={freelancerId}
      initialStep={initialStep}
      choices={choices}
      onSaved={onSaved}
      onClose={onClose}
    >
      {({ title, subtitle, header, body, footer }) => (
        <Drawer isOpen onClose={onClose} title={title} subtitle={subtitle} size="xl" footer={footer}>
          <CompactFields>
            <div className="space-y-5">
              {header}
              {body}
            </div>
          </CompactFields>
        </Drawer>
      )}
    </FreelancerWorkspace>
  );
};
