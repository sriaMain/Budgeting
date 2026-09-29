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
  onboarding_currencies: Choice[];
  payment_terms: Choice[];
  billing_frequencies: Choice[];
  document_statuses: Choice[];
  // Internal review enums - admin choices only, stripped from the public payload.
  kyc_statuses: Choice[];
  risk_ratings: Choice[];
  bank_verification_statuses: Choice[];
}

export interface VendorPublicChoices {
  vendor_types: Choice[];
  msme_categories: Choice[];
  document_categories: Choice[];
  currencies: Choice[];
  onboarding_currencies: Choice[];
  payment_terms: Choice[];
  billing_frequencies: Choice[];
  document_statuses: Choice[];
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
  service_category: string;
  registration_number: string;
  /** Internal vendor-master fields (admin only - the portal never returns them). */
  headcount?: number | null;
  /** 1-5 stars; null = not rated yet. */
  rating?: number | null;
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
  tax_id: string;
  beneficial_ownership_details: string;
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
  swift_code: string;
  iban: string;
  bank_country: string;
  bank_address: string;
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
  contract_number: string;
  po_number: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  custom_payment_terms: string;
  billing_frequency: string;
  service_rate: string | null;
  rate_unit: string;
  withholding_tax_applicable: boolean;
  withholding_tax_percentage: string | null;
  tax_remarks: string;
}

export interface VendorDocument {
  id: number;
  vendor: number;
  /** Write-only upload field - never returned; files open via the signed download endpoint. */
  file?: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  is_required: boolean;
  status: string;
  uploaded_by: number | null;
  uploaded_by_role: 'admin' | 'vendor';
  uploaded_at: string;
  /** Set only by the verify endpoint - uploading never verifies a document. */
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  remarks?: string;
}

/** Internal review state - admin detail payload only, never sent to the vendor portal. */
export interface VendorReview {
  kyc_status: string;
  risk_rating: string;
  compliance_remarks: string;
  bank_verification_status: string;
  bank_verification_remarks: string;
}

export interface VendorEmailStatus {
  status: 'not_sent' | 'sent' | 'failed';
  recipient: string | null;
  sent_at: string | null;
  sender: string | null;
}

/** What the requesting user may do with this vendor (server-computed from their role's permissions). */
export interface VendorPermissions {
  edit: boolean;
  submit: boolean;
  verify: boolean;
  approve: boolean;
  request_changes: boolean;
  send_email: boolean;
  delete: boolean;
  view_unmasked_bank: boolean;
  upload_documents: boolean;
  delete_documents: boolean;
  /** Rating / headcount - still editable after the vendor is submitted or approved. */
  edit_master?: boolean;
}

export interface VendorRequirementIssue {
  key: string;
  step: VendorOnboardingStepKey;
  stage: 'submission' | 'approval';
  kind: 'missing' | 'invalid';
  message: string;
}

export interface VendorAuditLogEntry {
  id: number;
  action: string;
  action_display: string;
  field_name: string;
  old_value: string;
  new_value: string;
  remarks: string;
  performed_by: number | null;
  performed_by_name: string | null;
  created_at: string;
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
  /** Data-driven 5-step onboarding summary, computed server-side from the vendor's records. */
  onboarding: VendorOnboardingSummary;
  /** Committed POs / vendor bills (internal only - never returned by the public portal). */
  financials: VendorFinancials | null;
  service_categories: string[];
  review: VendorReview;
  email_status: VendorEmailStatus;
  permissions: VendorPermissions;
}

export type VendorOnboardingStepKey = 'intake' | 'tax_kyc' | 'banking' | 'contract' | 'approved';
export type VendorStepStatus = 'pending' | 'in_progress' | 'completed' | 'requires_review' | 'failed';

export interface VendorOnboardingSummary {
  step_statuses: Record<VendorOnboardingStepKey, VendorStepStatus>;
  current_step: VendorOnboardingStepKey | null;
  completed_steps: number;
  total_steps: number;
  percent: number;
  jurisdiction: 'Indian' | 'Overseas';
  /** Must be filled in / uploaded before submitting for review. */
  submission_issues: VendorRequirementIssue[];
  /** Must be verified internally before final approval. */
  approval_issues: VendorRequirementIssue[];
}

/** Decimal amounts arrive as strings to avoid float rounding. */
export interface VendorFinancials {
  po_count: number;
  po_total: string;
  latest_po_no: string | null;
  latest_po_issue_date: string | null;
  billed_total: string;
  paid_total: string;
  outstanding_total: string;
  pending_bills: number;
  fy_spend: string;
  fy_start: string;
  po_consumption_percent: number | null;
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
