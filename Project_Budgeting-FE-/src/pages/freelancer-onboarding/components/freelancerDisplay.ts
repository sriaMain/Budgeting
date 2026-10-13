import { markCurrentStep, type StepCardItem, type StepCardStatus } from '../../../components/OnboardingStepCards';
import type { AccessLinkSummary, Freelancer, KycStatus, OnboardingStepKey } from '../../../types/freelancerOnboarding.types';
import { WIZARD_STEPS, type WizardStepKey } from '../wizard/freelancerWizardModel';

export type FreelancerStepKey = WizardStepKey;

/** The onboarding wizard's 7 steps - each step card opens the drawer at that step. */
export const FREELANCER_ONBOARDING_STEPS: { key: FreelancerStepKey; title: string; description: string }[] = WIZARD_STEPS;

/** Approved (or legacy active) freelancers - onboarding finished. */
export const APPROVED_STATUSES = ['active', 'available', 'assigned', 'on_hold', 'inactive'];
export const ONBOARDING_STATUSES = ['draft', 'invited', 'onboarding', 'changes_requested'];
export const REVIEW_STATUSES = ['completed'];

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'neutral', invited: 'info', onboarding: 'info', changes_requested: 'warning', completed: 'warning',
  active: 'success', available: 'success', assigned: 'success', on_hold: 'neutral', inactive: 'neutral',
  blocked: 'danger', offboarded: 'danger',
};
export const statusVariant = (status: string): BadgeVariant => STATUS_VARIANTS[status] ?? 'neutral';

const KYC_VARIANTS: Record<KycStatus, BadgeVariant> = {
  not_started: 'neutral', submitted: 'info', under_review: 'warning', verified: 'success', rejected: 'danger', changes_requested: 'warning',
};
export const kycVariant = (status: KycStatus): BadgeVariant => KYC_VARIANTS[status] ?? 'neutral';

const REVOKE_TEXT: Record<string, string> = {
  reissued: 'replaced by a newer link', approved: 'closed after approval', closed: 'closed', manual: 'revoked',
};
export function linkStatusText(link: AccessLinkSummary | undefined): string {
  if (!link || link.status === 'none') return 'No onboarding link sent';
  if (link.status === 'active') return `Link active until ${new Date(link.expires_at!).toLocaleDateString()}`;
  if (link.status === 'expired') return 'Link expired';
  return `Link ${REVOKE_TEXT[link.revoke_reason] || 'revoked'}`;
}

const started = (...values: unknown[]) => values.some((v) => v !== null && v !== undefined && String(v).trim() !== '');

const STARTED: Record<OnboardingStepKey, (f: Freelancer) => boolean> = {
  basic: (f) => started(f.phone, f.date_of_birth, f.nationality),
  identity: (f) => started(f.country_of_residence, f.id_document_type, f.pan_masked),
  address: (f) => started(f.permanent_address_line1, f.permanent_city),
  banking: (f) => started(f.payment_method),
  professional: (f) => started(f.professional_title, f.skills),
  documents: () => false,
};

/** Derived from the list payload: step_completion is computed server-side with the submit rules. */
export function freelancerStepStatuses(f: Freelancer): Record<FreelancerStepKey, StepCardStatus> {
  const result = {} as Record<FreelancerStepKey, StepCardStatus>;
  (Object.keys(STARTED) as OnboardingStepKey[]).forEach((key) => {
    result[key] = f.step_completion?.[key] ? 'completed' : STARTED[key](f) ? 'in_progress' : 'pending';
  });
  result.review = APPROVED_STATUSES.includes(f.status)
    ? 'completed'
    : f.status === 'completed' ? 'requires_review'
    : f.status === 'changes_requested' ? 'in_progress'
    : 'pending';
  return result;
}

export const resolveFreelancerSteps = (f: Freelancer): StepCardItem[] => {
  const statuses = freelancerStepStatuses(f);
  return markCurrentStep(FREELANCER_ONBOARDING_STEPS.map((s) => ({ ...s, status: statuses[s.key] })));
};

export const freelancerPercent = (f: Freelancer) => {
  const statuses = freelancerStepStatuses(f);
  const done = FREELANCER_ONBOARDING_STEPS.filter((s) => statuses[s.key] === 'completed').length;
  return Math.round((done * 100) / FREELANCER_ONBOARDING_STEPS.length);
};

export const isOnboarded = (f: Freelancer) => APPROVED_STATUSES.includes(f.status);

export const initials = (name: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const money = (currency: string, value: string | number) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${currency} ${value}`;
  }
};

export const formatRate = (f: Pick<Freelancer, 'rate' | 'currency'>) =>
  f.rate !== null && f.rate !== undefined && f.rate !== '' ? money(f.currency, f.rate) : '—';
