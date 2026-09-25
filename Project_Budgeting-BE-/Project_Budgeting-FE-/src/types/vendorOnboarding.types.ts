export interface Choice {
  value: string;
  label: string;
}

export interface VendorOnboardingChoices {
  vendor_types: Choice[];
  vendor_statuses: Choice[];
  msme_categories: Choice[];
  document_categories: Choice[];
  change_request_sections: Choice[];
  currencies: Choice[];
}

export interface VendorPublicChoices {
  vendor_types: Choice[];
  msme_categories: Choice[];
  document_categories: Choice[];
  currencies: Choice[];
}

export type VendorRequestStatus =
  | 'invited'
  | 'draft'
  | 'submitted'
  | 'action_required'
  | 'resubmitted'
  | 'approval_in_progress'
  | 'approved';

export const CHANGE_REQUEST_SECTIONS = [
  'vendor_details',
  'kyv_compliance',
  'bank_details',
  'business_procurement',
  'documents',
] as const;

export type ChangeRequestSection = (typeof CHANGE_REQUEST_SECTIONS)[number];

/** Maps a change-request section to the wizard step index it corresponds to. */
export const SECTION_TO_STEP: Record<string, number> = {
  vendor_details: 1,
  kyv_compliance: 2,
  bank_details: 3,
  business_procurement: 4,
  documents: 5,
};

export interface VendorOnboardingProfile {
  company_code: string;
  plant: string;
  contact_person_name: string;
  contact_person_designation: string;
  gst_registered: boolean;
  gstin: string;
  msme_registered: boolean;
  udyam_number: string;
  msme_category: string;
  address_line1: string;
  address_line2: string;
  city: string;
  district: string;
  state: string;
  country: string;
  pin_code: string;
  landmark: string;
  vendor_introduction: string;
  finance_manager_name: string;
  finance_manager_email: string;
  finance_manager_mobile: string;
}

export interface VendorKYC {
  country_of_tax_residence: string;
  pan: string;
  cin: string;
  incorporation_date: string | null;
  tan: string;
  tan_mobile: string;
  epf_number: string;
  esic_number: string;
  esic_district: string;
}

export interface VendorBankDetail {
  account_number_masked?: string;
  account_number?: string;
  bank_name: string;
  account_holder_name: string;
  ifsc_code: string;
  bank_id: string;
  bank_country_key: string;
  bank_control_key: string;
  branch: string;
  region: string;
  street: string;
  city: string;
}

export interface VendorProcurementDetail {
  account_group: string;
  purchasing_org: string;
  payment_terms: string;
  order_currency: string;
  grouping_key: string;
  partner_category: string;
  incoterms_1: string;
  incoterms_2: string;
  reconciliation_account: string;
  schema_group: string;
  gr_based_invoice_verification: boolean;
  check_double_invoice: boolean;
}

export interface VendorDocument {
  id: number;
  vendor: number;
  file: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  is_required: boolean;
  status: string;
  uploaded_by: number | null;
  uploaded_by_role: 'admin' | 'vendor';
  uploaded_at: string;
}

export interface VendorApprovalStage {
  level_order: number;
  level_name: string | null;
}

export interface VendorChangeRequest {
  id: number;
  section: ChangeRequestSection;
  section_display: string;
  required_changes: string;
  comments: string;
  requested_by: number | null;
  requested_by_name: string | null;
  requested_at: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
}

export interface VendorSubmissionVersion {
  id: number;
  version_number: number;
  snapshot: Record<string, unknown>;
  is_resubmission: boolean;
  created_at: string;
}

export interface VendorRequestSummary {
  total: number;
  invited: number;
  draft: number;
  submitted: number;
  action_required: number;
  resubmitted: number;
  approval_in_progress: number;
  approved: number;
  archived: number;
}

/**
 * Admin-facing vendor onboarding request. This is the same accounts.Vendor
 * row throughout the whole lifecycle (invited -> ... -> approved) - there is
 * no separate request/master split, so these field names match the backend
 * response directly.
 */
export interface VendorOnboardingDetail {
  id: number;
  name: string;
  vendor_type: string;
  vendor_type_display: string;
  email: string;
  phone: string;
  vendor_reference_no: string | null;
  contact_person_name: string;
  company_code: string;
  plant: string;
  internal_requester: string;
  initial_comments: string;
  status: VendorRequestStatus;
  status_display: string;
  current_stage: string;
  progress_percentage: number;
  last_saved_step: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  onboarding_profile: VendorOnboardingProfile | null;
  kyc: VendorKYC | null;
  bank_detail: VendorBankDetail | null;
  procurement_detail: VendorProcurementDetail | null;
  documents: VendorDocument[];
  change_requests: VendorChangeRequest[];
  current_approval_stage: VendorApprovalStage | null;
  is_current_approver: boolean;
  is_archived: boolean;
}

export interface VendorApprovalHistoryEvent {
  id: number;
  level_order: number | null;
  actor: number | null;
  actor_name: string | null;
  actor_role_snapshot: string;
  action: 'invited' | 'submitted' | 'resubmitted' | 'approved' | 'requested_changes';
  previous_status: string;
  new_status: string;
  comments: string;
  required_changes: string;
  section: ChangeRequestSection | null;
  created_at: string;
}

export interface VendorApprovalLevel {
  id: number;
  config: number;
  level_order: number;
  name: string;
  approver_role: number | null;
  approver_user: number | null;
}

export interface VendorApprovalWorkflowConfig {
  id: number;
  name: string;
  company_code: string | null;
  plant: string | null;
  vendor_type: string | null;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  levels: VendorApprovalLevel[];
}

export interface VendorListFilters {
  search?: string;
  /** Comma-separated for grouped filters (e.g. the "Action Required" bucket
   * covers submitted + resubmitted + action_required) - a single status
   * still works the same way. */
  status?: string;
  vendor_type?: string;
  company_code?: string;
  plant?: string;
  gst_registered?: string;
  msme_registered?: string;
  date_from?: string;
  date_to?: string;
  /** 'true' = archived only, 'all' = both, omitted/anything else = active only (default). */
  archived?: string;
}

/** The dashboard's consolidated "needs attention" bucket - used as the
 * `status` filter value everywhere the "Action Required" label appears
 * (card, tab, and the advanced filter dropdown) so it means the same thing
 * in all three places. */
export const ACTION_REQUIRED_STATUS_GROUP = 'action_required,submitted,resubmitted';

export interface RaiseVendorRequestPayload {
  name: string;
  email: string;
  phone: string;
  vendor_type: string;
  contact_person_name: string;
  company_code?: string;
  plant?: string;
  internal_requester?: string;
  initial_comments?: string;
}

export interface RequestChangesPayload {
  section: ChangeRequestSection;
  required_changes: string;
  comments?: string;
}
