import type { VendorOnboardingDetail } from '../../../types/vendorOnboarding.types';

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
      return (vendor.onboarding?.completed_steps ?? 0) > 0 || vendor.last_saved_step > 1 ? 'In Progress' : 'Draft';
    case 'approval_in_progress':
      return 'Under Review';
    case 'action_required':
      return 'Changes Requested';
    default:
      return vendor.status_display;
  }
};
