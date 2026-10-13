import type {
  VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail,
  VendorDocument, VendorChangeRequest, VendorRequestStatus, VendorOnboardingSummary,
} from "./vendorOnboarding.types";

/**
 * The vendor self-service portal's own view of the vendor record - the
 * public serializer exposes the same field names as the admin one
 * (name/email/phone/vendor_reference_no), scoped down to vendor-facing
 * fields (no internal codes, reviewer identities or review results).
 */
export interface VendorPublicDetail {
  vendor_reference_no: string;
  name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  /** Set by the inviting team - read-only on the portal. */
  email: string;
  phone: string;
  /** Set by the inviting team - read-only on the portal. */
  vendor_type: string;
  vendor_type_display: string;
  contact_person_name: string;
  status: VendorRequestStatus;
  status_display: string;
  current_stage: string;
  last_saved_step: number;
  /** Same figure as onboarding.percent. */
  progress_percentage: number;
  /** Steps, percentage and submission issues (approval issues are internal and always empty here). */
  onboarding?: VendorOnboardingSummary;
  /** The vendor may still change its information (invited / draft / changes requested). */
  editable?: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  onboarding_profile: VendorOnboardingProfile | null;
  kyc: VendorKYC | null;
  bank_detail: VendorBankDetail | null;
  procurement_detail: VendorProcurementDetail | null;
  documents: VendorDocument[];
  open_change_request: VendorChangeRequest | null;
}
