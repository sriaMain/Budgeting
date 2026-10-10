import type {
  VendorOnboardingDetail,
  VendorOnboardingStepKey,
  VendorOnboardingSummary,
  VendorStepStatus,
} from '../../../types/vendorOnboarding.types';

const STEP_KEYS: VendorOnboardingStepKey[] = ['intake', 'tax_kyc', 'banking', 'contract', 'approved'];

/** The vendor's 5-step onboarding summary. Uses the backend's data-driven `onboarding` when the
 * API sends it; a backend without it (no vendor_onboarding/progress.py) would otherwise leave every
 * step "pending" - so an Approved vendor showed "Pending at Intake, 0%". In that case the steps are
 * derived from the workflow status instead: approved = all done, under review = 4 data steps done,
 * draft = the steps before last_saved_step done. */
export const vendorOnboarding = (
  vendor: Pick<VendorOnboardingDetail, 'status' | 'onboarding' | 'last_saved_step'>
): VendorOnboardingSummary => {
  if (vendor.onboarding?.step_statuses) return vendor.onboarding;

  let done: number;
  let nextStatus: VendorStepStatus = 'pending';
  switch (vendor.status) {
    case 'approved':
      done = 5;
      break;
    case 'submitted':
    case 'resubmitted':
    case 'approval_in_progress':
      done = 4;
      nextStatus = 'in_progress';
      break;
    case 'action_required':
      done = 4;
      nextStatus = 'requires_review';
      break;
    default:
      done = Math.min(4, Math.max(0, (vendor.last_saved_step ?? 1) - 1));
      if (done > 0) nextStatus = 'in_progress';
  }

  const step_statuses = Object.fromEntries(
    STEP_KEYS.map((key, i) => [key, i < done ? 'completed' : i === done ? nextStatus : 'pending'])
  ) as Record<VendorOnboardingStepKey, VendorStepStatus>;

  return {
    step_statuses,
    current_step: done < STEP_KEYS.length ? STEP_KEYS[done] : null,
    completed_steps: done,
    total_steps: STEP_KEYS.length,
    percent: Math.round((done * 100) / STEP_KEYS.length),
    jurisdiction: vendor.onboarding?.jurisdiction ?? 'Indian',
    submission_issues: vendor.onboarding?.submission_issues ?? [],
    approval_issues: vendor.onboarding?.approval_issues ?? [],
  };
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatAmount = (value: string | undefined) => inr.format(Number(value || 0));

/** Indian FY label, e.g. fy_start 2026-04-01 -> "FY 26-27". */
export const fyLabel = (fyStart?: string) => {
  const year = fyStart ? Number(fyStart.slice(0, 4)) : NaN;
  return Number.isFinite(year) ? `FY ${String(year).slice(2)}-${String(year + 1).slice(2)}` : 'FY';
};

/** Reviewer-facing name for the vendor's workflow status. The backend statuses are unchanged -
 * a draft with any completed step reads "In Progress", approval stages read "Under Review". */
export const vendorStatusLabel = (vendor: Pick<VendorOnboardingDetail, 'status' | 'status_display' | 'onboarding' | 'last_saved_step'>) => {
  switch (vendor.status) {
    case 'draft':
      return vendorOnboarding(vendor).completed_steps > 0 || vendor.last_saved_step > 1 ? 'In Progress' : 'Draft';
    case 'approval_in_progress':
      return 'Under Review';
    case 'action_required':
      return 'Changes Requested';
    default:
      return vendor.status_display;
  }
};
