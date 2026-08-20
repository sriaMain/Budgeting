import type {
  VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail,
  VendorDocument, VendorChangeRequest, VendorRequestStatus,
} from "./vendorOnboarding.types";

/**
 * The vendor self-service portal's own view of the vendor record - the
 * public serializer exposes the same field names as the admin one
 * (name/email/phone/vendor_reference_no), just scoped down to non-admin
 * fields.
 */
export interface VendorPublicDetail {
  vendor_reference_no: string;
  name: string;
  email: string;
  phone: string;
  vendor_type: string;
  vendor_type_display: string;
  contact_person_name: string;
  company_code: string;
  plant: string;
  status: VendorRequestStatus;
  status_display: string;
  current_stage: string;
  last_saved_step: number;
  progress_percentage: number;
  submitted_at: string | null;
  approved_at: string | null;
  profile: VendorOnboardingProfile | null;
  kyc: VendorKYC | null;
  bank_detail: VendorBankDetail | null;
  procurement_detail: VendorProcurementDetail | null;
  documents: VendorDocument[];
  open_change_request: VendorChangeRequest | null;
}
