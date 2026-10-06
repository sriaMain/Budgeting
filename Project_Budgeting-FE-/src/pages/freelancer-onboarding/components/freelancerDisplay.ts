import { markCurrentStep, type StepCardItem, type StepCardStatus } from '../../../components/OnboardingStepCards';
import type { Freelancer } from '../../../types/freelancerOnboarding.types';

export type FreelancerStepKey = 'profile' | 'address' | 'availability' | 'bank' | 'active';

/** The 5 freelancer onboarding steps (same shape as the vendor flow). Each one maps to a
 * section of the onboarding drawer, so clicking a step card opens the form at that section. */
export const FREELANCER_ONBOARDING_STEPS: { key: FreelancerStepKey; title: string; description: string }[] = [
  { key: 'profile', title: 'Profile', description: 'Basic and professional details' },
  { key: 'address', title: 'Address', description: 'Permanent, temporary and emergency contact' },
  { key: 'availability', title: 'Availability', description: 'Capacity, start date and time zone' },
  { key: 'bank', title: 'Bank & KYC', description: 'PAN, payment method and bank account' },
  { key: 'active', title: 'Active', description: 'Ready for projects, tasks and time entries' },
];

/** Statuses that mean onboarding is finished. */
const ONBOARDED_STATUSES = ['completed', 'active', 'available', 'assigned'];

const filled = (...values: unknown[]) => values.every((v) => v !== null && v !== undefined && String(v).trim() !== '');
const started = (...values: unknown[]) => values.some((v) => v !== null && v !== undefined && String(v).trim() !== '');

/** Derived only from fields the list/detail API already returns - nothing new is stored. */
export function freelancerStepStatuses(f: Freelancer): Record<FreelancerStepKey, StepCardStatus> {
  const status = (complete: boolean, begun: boolean): StepCardStatus => (complete ? 'completed' : begun ? 'in_progress' : 'pending');
  return {
    profile: status(filled(f.full_name, f.email, f.phone, f.professional_title), started(f.phone, f.professional_title, f.skills)),
    address: status(
      filled(f.permanent_address_line1, f.permanent_city, f.permanent_country),
      started(f.permanent_address_line1, f.permanent_city, f.emergency_contact_name),
    ),
    availability: status(filled(f.availability, f.timezone), started(f.availability, f.timezone, f.hours_per_week)),
    // PAN on file is the KYC marker the list payload carries (bank details load separately).
    bank: status(!!f.pan_masked, !!f.payment_method),
    active: ONBOARDED_STATUSES.includes(f.status) ? 'completed' : f.status === 'onboarding' ? 'in_progress' : 'pending',
  };
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

export const isOnboarded = (f: Freelancer) => ONBOARDED_STATUSES.includes(f.status);

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
