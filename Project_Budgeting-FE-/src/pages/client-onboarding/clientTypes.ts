/**
 * Clients & KYC: types, option lists and label helpers shared by the client screens
 * (list, details, onboarding wizard, approval panel). Mirrors client/models.py and the
 * client/onboarding.py rules served by the backend.
 */

/** Mirrors the role union stored in auth/authSlice.ts. */
export type UserRole = 'admin' | 'user' | 'manager';

export interface CompanyTag {
  id: number;
  name: string;
}

export type ClientType = 'individual' | 'company' | 'government' | 'other';
export type ClientCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'SGD' | 'JPY';
export type KycStatus = 'draft' | 'submitted' | 'changes_requested' | 'verified' | 'enhanced_review' | 'review_due';
export type RiskRating = 'low' | 'medium' | 'high';
export type OnboardingStep = 'intake' | 'identity_kyc' | 'compliance' | 'banking' | 'commercials' | 'approved';
export type Jurisdiction = 'Indian' | 'Overseas';

export type BankingVerificationStatus = 'not_verified' | 'documents_uploaded' | 'under_review' | 'verified' | 'rejected';
export type SanctionsScreeningStatus = 'not_checked' | 'in_progress' | 'passed' | 'failed';
export type BeneficialOwnershipStatus = 'not_verified' | 'verified' | 'failed';
export type TaxResidencyStatus = 'pending' | 'verified' | 'requires_review';
export type EnhancedDueDiligenceStatus = 'not_required' | 'required' | 'completed';
export type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60' | 'net_90' | 'custom';
export type InvoiceRequirements = 'standard' | 'po_required' | 'other';
export type BillingFrequency = 'one_time' | 'monthly' | 'milestone_based' | 'custom';

/** Server-computed status per (legacy) onboarding step - drives the list page's step cards. */
export type StepStatusValue = 'pending' | 'in_progress' | 'completed' | 'requires_review';
export interface StepStatuses {
  intake: StepStatusValue;
  identity_kyc: StepStatusValue;
  compliance: StepStatusValue;
  banking: StepStatusValue;
  commercials: StepStatusValue;
  approved: StepStatusValue;
}

/** Steps of the onboarding wizard (same keys as the backend's submission issues). */
export type WizardStepKey = 'basic' | 'identity' | 'address' | 'banking' | 'commercials' | 'documents' | 'review';

/** Something still missing before "Submit for approval" (client/onboarding.py submission_issues). */
export interface SubmissionIssue {
  step: Exclude<WizardStepKey, 'review'>;
  /** Company field or document category to highlight. */
  field: string;
  message: string;
}

export type ClientDocumentCategory =
  | 'registration_certificate'
  | 'tax_certificate'
  | 'bank_proof'
  | 'authorised_signatory_id'
  | 'sanctions_screening'
  | 'gst_certificate'
  | 'pan_document'
  | 'cin_llpin'
  | 'w8ben_e'
  | 'beneficial_ownership_proof'
  | 'tax_residency_certificate'
  | 'government_id'
  | 'other';

export type ClientDocumentStatus = 'uploaded' | 'under_review' | 'verified' | 'rejected' | 'expired';
export type DocumentSlotStatus = ClientDocumentStatus | 'missing';

/** One KYC document slot for a client - which documents are required depends on the client's
 * jurisdiction and type, and is decided by the backend (document_slots). */
export interface ClientDocumentSlot {
  category: ClientDocumentCategory;
  label: string;
  required: boolean;
  tracks_expiry: boolean;
  help_text: string;
  /** Categories that satisfy the slot (its own first, then legacy alternates). */
  accepts: ClientDocumentCategory[];
  /** Supplied by the compliance reviewer (e.g. the sanctions screening report). */
  reviewer_only: boolean;
  status: DocumentSlotStatus;
  document_id: number | null;
  expiry_date: string | null;
}

/** What the signed-in user may do in Clients & KYC (GET /client/permissions/). */
export interface ClientPermissionFlags {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  request_changes: boolean;
  edit_compliance: boolean;
  edit_banking: boolean;
  edit_commercials: boolean;
  view_documents: boolean;
  upload_documents: boolean;
  delete_documents: boolean;
  verify_documents: boolean;
  view_audit_log: boolean;
  view_unmasked_bank: boolean;
}

/** The same flags narrowed to one client's workflow state (client detail `permissions`). */
export interface ClientRecordPermissions extends ClientPermissionFlags {
  submit: boolean;
  /** Submitted and awaiting approval - frozen for makers. */
  locked: boolean;
}

export interface Client {
  id: number;
  company_name: string;
  /** Read: dialing code of the stored phone ("+91"). Write: legacy half of the phone pair. */
  country_code?: string;
  /** Read: national number. Write: E.164 ("+919876543210"). */
  mobile_number: string;
  /** Read-only E.164 phone. */
  phone?: string;
  email: string;
  contact_person?: string;
  gstin?: string;
  address1?: string;
  address2?: string;
  street_address?: string; // read-only, backend-derived from address1 + address2
  city?: string;
  postal_code?: string;
  state?: string;
  country?: string;
  tags: CompanyTag[];
  created_at?: string;
  updated_at?: string;
  pocs?: POC[]; // POCs nested in the /client/pocs/ response shape

  // --- Identity & KYC ---
  client_type: ClientType;
  currency: ClientCurrency;
  registration_no?: string;
  pan?: string;
  /** Tax identifier outside India (EIN, VAT, UEN, ABN ...), validated per country. */
  tax_id?: string;
  authorised_signatory_name?: string;
  authorised_signatory_role?: string;

  // --- Banking ---
  bank_account_holder_name?: string;
  bank_name?: string;
  /** Write-only on input; never returned by the server. */
  bank_account_number?: string;
  /** Read-only, e.g. "XXXXXX1234". */
  bank_account_number_masked?: string;
  bank_ifsc_code?: string;
  bank_routing_code?: string;
  bank_swift_code?: string;
  bank_iban?: string;
  bank_account_type?: string;
  /** Legacy single "IFSC / SWIFT / IBAN" value - read-only. */
  bank_code?: string;
  bank_branch?: string;
  bank_country?: string;
  bank_address?: string;
  /** ISO code of the bank's country (falls back to the client's country). */
  bank_country_code?: string;
  banking_verification_status?: BankingVerificationStatus;

  kyc_status: KycStatus;
  kyc_status_display?: string;
  risk_rating: RiskRating;
  onboarding_step: OnboardingStep;
  is_active: boolean;

  // --- Compliance (reviewer) ---
  sanctions_screening_status?: SanctionsScreeningStatus;
  beneficial_ownership_status?: BeneficialOwnershipStatus;
  tax_residency_status?: TaxResidencyStatus;
  enhanced_due_diligence_status?: EnhancedDueDiligenceStatus;
  compliance_remarks?: string;
  /** Read-only: stamped by the server when a compliance status changes. */
  compliance_reviewed_by?: string | number | null;
  compliance_reviewed_at?: string | null;

  // --- Commercials ---
  payment_terms?: PaymentTerms;
  custom_payment_terms?: string;
  withholding_tax_applicable?: boolean;
  withholding_tax_percentage?: string | number | null;
  invoice_requirements?: InvoiceRequirements;
  po_required?: boolean;
  billing_frequency?: BillingFrequency;
  billing_contact?: string;
  billing_email?: string;
  commercial_remarks?: string;

  // --- Approval, read-only: set only by POST /client/<id>/approve/ ---
  kyc_verified_by?: string | number | null;
  kyc_verified_at?: string | null;
  approval_remarks?: string | null;

  // --- Computed, read-only ---
  is_project_ready?: boolean;
  jurisdiction?: Jurisdiction;
  step_statuses?: StepStatuses;
  /** Everything blocking final approval. Empty = ready to approve. */
  approval_blockers?: string[];
  /** Everything blocking the maker's submission. */
  submission_issues?: SubmissionIssue[];
  /** Every document slot for this client (required ones first). */
  document_slots?: ClientDocumentSlot[];
  required_documents?: ClientDocumentSlot[];
  /** The requesting user's permissions for this client. */
  permissions?: Partial<ClientRecordPermissions>;
}

export const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.'] as const;

export interface POC {
  id: number;
  company: number;
  company_name: string;
  salutation: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  poc_name: string; // read-only, backend-derived full name
  designation: string;
  /** E.164 ("+919876543210"). */
  poc_mobile: string;
  poc_email: string;
}

export interface ClientDocument {
  id: number;
  company: number;
  /** Write-only upload field - never returned; files are fetched via the signed download endpoint. */
  file?: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: ClientDocumentCategory;
  category_label?: string;
  is_required: boolean;
  status: ClientDocumentStatus;
  /** 'expired' once past expiry_date (server-derived). */
  effective_status?: ClientDocumentStatus;
  expiry_date?: string | null;
  document_number?: string | null;
  uploaded_by?: string | number | null;
  uploaded_by_name?: string | null;
  uploaded_at: string;
  /** Only ever set by POST /documents/<id>/verify/. */
  verified_by?: string | number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  remarks?: string | null;
}

export type ChangeRequestSection = 'intake' | 'identity_kyc' | 'address' | 'compliance' | 'banking' | 'commercials' | 'documents';
export type ChangeRequestStatus = 'open' | 'resolved';

export interface ClientChangeRequest {
  id: number;
  company: number;
  section: ChangeRequestSection;
  required_changes: string;
  comments?: string;
  requested_by?: string | number | null;
  requested_by_name?: string | null;
  requested_at: string;
  status: ChangeRequestStatus;
  resolved_at?: string | null;
}

export type ClientAuditAction =
  | 'created'
  | 'updated'
  | 'kyc_status_changed'
  | 'risk_rating_changed'
  | 'document_uploaded'
  | 'deleted'
  | 'compliance_updated'
  | 'banking_verified'
  | 'banking_rejected'
  | 'commercials_completed'
  | 'kyc_submitted'
  | 'change_requested'
  | 'change_resolved'
  | 'project_ready_marked'
  | 'submitted_for_approval'
  | 'document_verified'
  | 'document_rejected'
  | 'document_under_review'
  | 'document_deleted'
  | 'document_replaced'
  | 'bank_account_viewed';

export interface ClientAuditLogEntry {
  id: number;
  company: number;
  company_name: string;
  action: ClientAuditAction;
  action_label?: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_by?: string | number | null;
  performed_by_name?: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Option lists / labels                                               */
/* ------------------------------------------------------------------ */

export const CLIENT_TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Business' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

export const BILLING_CURRENCIES: ClientCurrency[] = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'JPY'];

export const CURRENCY_OPTIONS: { value: ClientCurrency; label: string }[] = BILLING_CURRENCIES.map((c) => ({ value: c, label: c }));

export const KYC_STATUS_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Awaiting Approval' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'verified', label: 'Verified' },
  { value: 'enhanced_review', label: 'Enhanced Review' },
  { value: 'review_due', label: 'Review Due' },
];

/** Statuses a compliance reviewer can flag directly (everything else goes through the workflow). */
export const REVIEWER_KYC_FLAGS: KycStatus[] = ['enhanced_review', 'review_due'];

export const RISK_RATING_OPTIONS: { value: RiskRating; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** Fixed 6-step onboarding sequence used by the list page's step cards. */
export const ONBOARDING_STEPS: { value: OnboardingStep; label: string }[] = [
  { value: 'intake', label: 'Intake' },
  { value: 'identity_kyc', label: 'Identity & KYC' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'banking', label: 'Banking' },
  { value: 'commercials', label: 'Commercials' },
  { value: 'approved', label: 'Approved' },
];

export const DOCUMENT_CATEGORY_OPTIONS: { value: ClientDocumentCategory; label: string }[] = [
  { value: 'registration_certificate', label: 'Registration Certificate' },
  { value: 'tax_certificate', label: 'Tax Certificate' },
  { value: 'bank_proof', label: 'Bank Proof' },
  { value: 'authorised_signatory_id', label: 'Authorised Signatory ID' },
  { value: 'sanctions_screening', label: 'Sanctions Screening' },
  { value: 'gst_certificate', label: 'GST Certificate' },
  { value: 'pan_document', label: 'PAN Document' },
  { value: 'cin_llpin', label: 'CIN / LLPIN' },
  { value: 'w8ben_e', label: 'W-8BEN-E' },
  { value: 'beneficial_ownership_proof', label: 'Beneficial Ownership Document' },
  { value: 'tax_residency_certificate', label: 'Tax Residency Document' },
  { value: 'government_id', label: 'Government Photo ID' },
  { value: 'other', label: 'Other Document' },
];

export const BANKING_VERIFICATION_STATUS_OPTIONS: { value: BankingVerificationStatus; label: string }[] = [
  { value: 'not_verified', label: 'Not Verified' },
  { value: 'documents_uploaded', label: 'Documents Uploaded' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

export const SANCTIONS_SCREENING_OPTIONS: { value: SanctionsScreeningStatus; label: string }[] = [
  { value: 'not_checked', label: 'Not Checked' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
];

export const BENEFICIAL_OWNERSHIP_OPTIONS: { value: BeneficialOwnershipStatus; label: string }[] = [
  { value: 'not_verified', label: 'Not Verified' },
  { value: 'verified', label: 'Verified' },
  { value: 'failed', label: 'Failed' },
];

export const TAX_RESIDENCY_STATUS_OPTIONS: { value: TaxResidencyStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'requires_review', label: 'Requires Review' },
];

export const ENHANCED_DUE_DILIGENCE_OPTIONS: { value: EnhancedDueDiligenceStatus; label: string }[] = [
  { value: 'not_required', label: 'Not Required' },
  { value: 'required', label: 'Required' },
  { value: 'completed', label: 'Completed' },
];

export const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_45', label: 'Net 45' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'net_90', label: 'Net 90' },
  { value: 'custom', label: 'Custom' },
];

export const INVOICE_REQUIREMENTS_OPTIONS: { value: InvoiceRequirements; label: string }[] = [
  { value: 'standard', label: 'Standard Invoice' },
  { value: 'po_required', label: 'Client PO Required' },
  { value: 'other', label: 'Other' },
];

export const BILLING_FREQUENCY_OPTIONS: { value: BillingFrequency; label: string }[] = [
  { value: 'one_time', label: 'One Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'milestone_based', label: 'Milestone Based' },
  { value: 'custom', label: 'Custom' },
];

export const CHANGE_REQUEST_SECTION_OPTIONS: { value: ChangeRequestSection; label: string }[] = [
  { value: 'intake', label: 'Basic Information' },
  { value: 'identity_kyc', label: 'Identity & KYC' },
  { value: 'address', label: 'Address' },
  { value: 'banking', label: 'Banking' },
  { value: 'commercials', label: 'Commercials' },
  { value: 'documents', label: 'KYC Documents' },
  { value: 'compliance', label: 'Compliance' },
];

export const STEP_STATUS_OPTIONS: { value: StepStatusValue; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'requires_review', label: 'Requires Review' },
];

export const AUDIT_ACTION_LABELS: Record<ClientAuditAction, string> = {
  created: 'Client Created',
  updated: 'Client Updated',
  kyc_status_changed: 'KYC Status Changed',
  risk_rating_changed: 'Risk Rating Changed',
  document_uploaded: 'Document Uploaded',
  deleted: 'Client Deleted',
  compliance_updated: 'Compliance Updated',
  banking_verified: 'Bank Account Verified',
  banking_rejected: 'Bank Account Rejected',
  commercials_completed: 'Commercials Completed',
  kyc_submitted: 'KYC Submitted for Approval',
  change_requested: 'Changes Requested',
  change_resolved: 'Change Request Resolved',
  project_ready_marked: 'Approved - Marked Project Ready',
  submitted_for_approval: 'Submitted for Approval',
  document_verified: 'Document Verified',
  document_rejected: 'Document Rejected',
  document_under_review: 'Document Marked Under Review',
  document_deleted: 'Document Deleted',
  document_replaced: 'Document Replaced',
  bank_account_viewed: 'Bank Account Number Viewed',
};

const optionLabel = <V extends string>(options: { value: V; label: string }[], value: V | undefined): string =>
  options.find((o) => o.value === value)?.label ?? (value || '-');

export const clientTypeLabel = (v: ClientType | undefined) => optionLabel(CLIENT_TYPE_OPTIONS, v);
export const kycStatusLabel = (v: KycStatus | undefined) => optionLabel(KYC_STATUS_OPTIONS, v);
export const riskRatingLabel = (v: RiskRating | undefined) => optionLabel(RISK_RATING_OPTIONS, v);
export const onboardingStepLabel = (v: OnboardingStep | undefined) => optionLabel(ONBOARDING_STEPS, v);
export const bankingVerificationStatusLabel = (v: BankingVerificationStatus | undefined) => optionLabel(BANKING_VERIFICATION_STATUS_OPTIONS, v);
export const sanctionsScreeningLabel = (v: SanctionsScreeningStatus | undefined) => optionLabel(SANCTIONS_SCREENING_OPTIONS, v);
export const beneficialOwnershipLabel = (v: BeneficialOwnershipStatus | undefined) => optionLabel(BENEFICIAL_OWNERSHIP_OPTIONS, v);
export const taxResidencyStatusLabel = (v: TaxResidencyStatus | undefined) => optionLabel(TAX_RESIDENCY_STATUS_OPTIONS, v);
export const enhancedDueDiligenceLabel = (v: EnhancedDueDiligenceStatus | undefined) => optionLabel(ENHANCED_DUE_DILIGENCE_OPTIONS, v);
export const paymentTermsLabel = (v: PaymentTerms | undefined) => optionLabel(PAYMENT_TERMS_OPTIONS, v);
export const invoiceRequirementsLabel = (v: InvoiceRequirements | undefined) => optionLabel(INVOICE_REQUIREMENTS_OPTIONS, v);
export const billingFrequencyLabel = (v: BillingFrequency | undefined) => optionLabel(BILLING_FREQUENCY_OPTIONS, v);
export const changeRequestSectionLabel = (v: ChangeRequestSection | undefined) => optionLabel(CHANGE_REQUEST_SECTION_OPTIONS, v);
export const stepStatusLabel = (v: StepStatusValue | undefined) => optionLabel(STEP_STATUS_OPTIONS, v);
export const auditActionLabel = (entry: Pick<ClientAuditLogEntry, 'action' | 'action_label'>) =>
  AUDIT_ACTION_LABELS[entry.action] ?? entry.action_label ?? entry.action;

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const kycStatusVariant = (status: KycStatus): BadgeVariant => {
  if (status === 'verified') return 'success';
  if (status === 'submitted') return 'info';
  if (status === 'changes_requested') return 'danger';
  if (status === 'enhanced_review' || status === 'review_due') return 'warning';
  return 'neutral';
};

export const riskRatingVariant = (risk: RiskRating): 'success' | 'warning' | 'danger' => {
  if (risk === 'low') return 'success';
  if (risk === 'medium') return 'warning';
  return 'danger';
};

export const stepStatusVariant = (status: StepStatusValue | undefined): 'success' | 'warning' | 'neutral' | 'info' => {
  if (status === 'completed') return 'success';
  if (status === 'requires_review') return 'warning';
  if (status === 'in_progress') return 'info';
  return 'neutral';
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentSlotStatus, string> = {
  missing: 'Missing',
  uploaded: 'Uploaded',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const documentStatusVariant = (status: DocumentSlotStatus): BadgeVariant => {
  if (status === 'verified') return 'success';
  if (status === 'under_review') return 'warning';
  if (status === 'uploaded') return 'info';
  return 'danger';
};

export const onboardingStepIndex = (step: OnboardingStep): number =>
  Math.max(0, ONBOARDING_STEPS.findIndex((s) => s.value === step)) + 1;

/** Client-side mirror of Company.jurisdiction for live previews (blank = Indian, like legacy rows). */
export const computeJurisdiction = (country: string | undefined): Jurisdiction => {
  const c = (country || '').trim().toLowerCase();
  if (!c || ['india', 'in', 'ind', 'bharat'].includes(c)) return 'Indian';
  return 'Overseas';
};

/** The wizard step that edits a (legacy) onboarding step - e.g. a step card click on the list. */
export const wizardStepForOnboardingStep = (step: OnboardingStep | undefined): WizardStepKey => {
  switch (step) {
    case 'identity_kyc':
      return 'identity';
    case 'banking':
      return 'banking';
    case 'commercials':
      return 'commercials';
    case 'compliance':
    case 'approved':
      return 'review';
    default:
      return 'basic';
  }
};

/** Drives the step cards' completed / requires-review badges from the server-computed
 * step_statuses (falls back to the onboarding_step position for a stale cached client). */
export const deriveStepProgress = (client: Client): { completedSteps: Set<number>; errorSteps: Set<number> } => {
  const completedSteps = new Set<number>();
  const errorSteps = new Set<number>();
  if (client.step_statuses) {
    ONBOARDING_STEPS.forEach((step, i) => {
      const status = client.step_statuses?.[step.value];
      if (status === 'completed') completedSteps.add(i + 1);
      else if (status === 'requires_review') errorSteps.add(i + 1);
    });
  } else {
    const idx = onboardingStepIndex(client.onboarding_step);
    for (let i = 1; i < idx; i++) completedSteps.add(i);
  }
  return { completedSteps, errorSteps };
};

/** Step cards for the list page's onboarding panel - same 6 steps as ONBOARDING_STEPS. */
export const ONBOARDING_STEP_CARDS: { value: OnboardingStep; title: string; description: string }[] = [
  { value: 'intake', title: 'Intake', description: 'Legal name, client type, country, contact and address' },
  { value: 'identity_kyc', title: 'Identity KYC', description: 'PAN / GSTIN in India, the local tax ID elsewhere, ID documents' },
  { value: 'compliance', title: 'Compliance', description: 'Sanctions, beneficial ownership, tax residency and risk (reviewer)' },
  { value: 'banking', title: 'Banking', description: 'Bank account with IFSC, routing code or IBAN / SWIFT, verified by a reviewer' },
  { value: 'commercials', title: 'Commercials', description: 'Currency, payment terms, withholding and invoicing rules' },
  { value: 'approved', title: 'Approved', description: 'Submitted, approved and available in the New Project dropdown' },
];

export type OnboardingCardStatus = 'completed' | 'in_progress' | 'pending' | 'requires_review' | 'failed';

export interface ResolvedOnboardingStep {
  value: OnboardingStep;
  title: string;
  description: string;
  status: OnboardingCardStatus;
  isCurrent: boolean;
}

/** A "requires review" step escalates to "failed" when one of its underlying checks hard-failed. */
const stepHasHardFailure = (client: Client, step: OnboardingStep): boolean => {
  if (step === 'compliance') {
    return client.sanctions_screening_status === 'failed' || client.beneficial_ownership_status === 'failed';
  }
  if (step === 'banking') return client.banking_verification_status === 'rejected';
  return false;
};

/** Maps a client's step_statuses onto the 6 onboarding step cards, plus the current step and completion %. */
export const resolveOnboardingSteps = (
  client: Client
): { steps: ResolvedOnboardingStep[]; current: ResolvedOnboardingStep | null; completedCount: number; percent: number } => {
  const { completedSteps, errorSteps } = deriveStepProgress(client);
  const hasApprovalBlockers = (client.approval_blockers?.length ?? 0) > 0;

  const steps: ResolvedOnboardingStep[] = ONBOARDING_STEP_CARDS.map((card, i) => {
    const n = i + 1;
    let status: OnboardingCardStatus;
    if (card.value === 'approved') {
      status = client.is_project_ready || (completedSteps.has(n) && !hasApprovalBlockers) ? 'completed' : client.kyc_status === 'submitted' ? 'in_progress' : 'pending';
    } else if (errorSteps.has(n)) {
      status = stepHasHardFailure(client, card.value) ? 'failed' : 'requires_review';
    } else if (completedSteps.has(n)) {
      status = 'completed';
    } else {
      status = client.step_statuses?.[card.value] === 'in_progress' ? 'in_progress' : 'pending';
    }
    return { ...card, status, isCurrent: false };
  });

  // Current = the client's onboarding_step unless that step is already complete - then the first that isn't.
  const ownIndex = steps.findIndex((s) => s.value === client.onboarding_step);
  const currentIndex =
    ownIndex >= 0 && steps[ownIndex].status !== 'completed' ? ownIndex : steps.findIndex((s) => s.status !== 'completed');
  if (currentIndex >= 0) steps[currentIndex].isCurrent = true;

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  return {
    steps,
    current: currentIndex >= 0 ? steps[currentIndex] : null,
    completedCount,
    percent: Math.round((completedCount / steps.length) * 100),
  };
};
