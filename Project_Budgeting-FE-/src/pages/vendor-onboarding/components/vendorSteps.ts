import type { ChangeRequestSection, VendorOnboardingStepKey } from '../../../types/vendorOnboarding.types';

/**
 * The vendor onboarding steps - one list for the wizard (admin drawer, full page, vendor portal),
 * the list page's process panel and the status header. The backend's steps
 * (vendor_onboarding/progress.py VENDOR_ONBOARDING_STEPS) are the same; the wizard's last step,
 * "Review & Submit", is the backend's "approved" step.
 */

export type VendorWizardStepKey = 'basic' | 'kyc' | 'address' | 'banking' | 'commercial' | 'documents' | 'review';

export interface VendorWizardStepMeta {
  key: VendorWizardStepKey;
  /** The backend step whose status / issues belong to this wizard step. */
  serverStep: VendorOnboardingStepKey;
  title: string;
  description: string;
}

export const VENDOR_WIZARD_STEPS: VendorWizardStepMeta[] = [
  { key: 'basic', serverStep: 'basic', title: 'Basic Information', description: 'Legal name, vendor type, country and contacts' },
  { key: 'kyc', serverStep: 'kyc', title: 'Identity & KYC', description: 'Tax identifiers and statutory registrations' },
  { key: 'address', serverStep: 'address', title: 'Address', description: 'Registered address' },
  { key: 'banking', serverStep: 'banking', title: 'Banking', description: 'Bank account for payments' },
  { key: 'commercial', serverStep: 'commercial', title: 'Commercial', description: 'Contract, currency and payment terms' },
  { key: 'documents', serverStep: 'documents', title: 'KYC Documents', description: 'Identity, registration and bank proofs' },
  { key: 'review', serverStep: 'approved', title: 'Review & Submit', description: 'Check everything and submit for approval' },
];

/** The backend's steps, as the list page's process panel shows them. */
export const VENDOR_ONBOARDING_STEPS: { key: VendorOnboardingStepKey; title: string; description: string }[] = [
  ...VENDOR_WIZARD_STEPS.filter((s) => s.key !== 'review').map((s) => ({ key: s.serverStep, title: s.title, description: s.description })),
  { key: 'approved', title: 'Approved', description: 'Ready for projects, POs and invoices' },
];

export const wizardStepForServerStep = (step: VendorOnboardingStepKey | string | null | undefined): VendorWizardStepKey => {
  if (!step) return 'basic';
  if (step === 'approved') return 'review';
  return (VENDOR_WIZARD_STEPS.find((s) => s.serverStep === step)?.key ?? 'basic');
};

export const wizardStepIndex = (key: VendorWizardStepKey) => Math.max(0, VENDOR_WIZARD_STEPS.findIndex((s) => s.key === key));

/** Steps a reviewer's change request points the vendor to. */
export const CHANGE_REQUEST_STEPS: Record<ChangeRequestSection, VendorWizardStepKey[]> = {
  vendor_details: ['basic', 'address'],
  kyv_compliance: ['kyc'],
  bank_details: ['banking'],
  business_procurement: ['commercial'],
  documents: ['documents'],
};

/** Statuses in which the onboarding data may still be edited (vendor_onboarding/access.py). */
export const EDITABLE_VENDOR_STATUSES = ['invited', 'draft', 'action_required'];
export const UNDER_REVIEW_VENDOR_STATUSES = ['submitted', 'resubmitted', 'approval_in_progress'];
