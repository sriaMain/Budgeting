import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Users, ShieldCheck, AlertTriangle, Globe2, ShieldAlert } from 'lucide-react';
import { ReusableTable, type Column } from '../components/ReusableTable';
import { StatusBadge } from '../components/StatusBadge';
import { StatCard } from '../components/StatCard';
import { VendorStepper, type StepConfig } from '../pages/vendor-onboarding/components/VendorStepper';

/** Mirrors the role union stored in auth/authSlice.ts (that slice doesn't export a
 * standalone type alias for it, only inline on its state shape). */
export type UserRole = 'admin' | 'user' | 'manager';

/**
 * ==================================================================
 * SECTION: Types & Interfaces
 * ==================================================================
 */

export interface CompanyTag {
  id: number;
  name: string;
}

export type ClientType = 'individual' | 'company' | 'government' | 'other';
export type ClientCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'SGD' | 'JPY';
export type KycStatus = 'draft' | 'verified' | 'enhanced_review' | 'review_due';
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

/** Server-computed status per onboarding step - drives the VendorStepper's completed/
 * requires_review badges instead of purely inferring position from onboarding_step. */
export type StepStatusValue = 'pending' | 'in_progress' | 'completed' | 'requires_review';
export interface StepStatuses {
  intake: StepStatusValue;
  identity_kyc: StepStatusValue;
  compliance: StepStatusValue;
  banking: StepStatusValue;
  commercials: StepStatusValue;
  approved: StepStatusValue;
}

export interface Client {
  id: number;
  company_name: string;
  /** Write-only on input (paired with mobile_number to form the full phone number). */
  country_code?: string;
  mobile_number: string;
  email: string;
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
  pocs?: POC[];  // POCs nested in the /client/pocs/ response shape

  // --- KYC fields ---
  client_type: ClientType;
  currency: ClientCurrency;
  registration_no?: string;
  pan?: string;
  /** Blank text - overseas equivalent of GSTIN/PAN, no format validation. */
  tax_id?: string;
  authorised_signatory_name?: string;
  authorised_signatory_role?: string;
  bank_name?: string;
  /** Write-only on input; never returned by the server. */
  bank_account_number?: string;
  /** Read-only, e.g. "XXXXXX1234". */
  bank_account_number_masked?: string;
  bank_code?: string;
  bank_branch?: string;
  bank_country?: string;
  bank_address?: string;
  banking_verification_status?: BankingVerificationStatus;
  kyc_status: KycStatus;
  risk_rating: RiskRating;
  onboarding_step: OnboardingStep;
  is_active: boolean;

  // --- Compliance fields ---
  sanctions_screening_status?: SanctionsScreeningStatus;
  beneficial_ownership_status?: BeneficialOwnershipStatus;
  tax_residency_status?: TaxResidencyStatus;
  enhanced_due_diligence_status?: EnhancedDueDiligenceStatus;
  compliance_remarks?: string;
  /** User id, write via PATCH. */
  compliance_reviewed_by?: string | number | null;
  /** Datetime, settable via PATCH too - a plain field the reviewer fills in. */
  compliance_reviewed_at?: string | null;

  // --- Commercials fields ---
  payment_terms?: PaymentTerms;
  /** Required only when payment_terms === 'custom'. */
  custom_payment_terms?: string;
  withholding_tax_applicable?: boolean;
  /** Required only when withholding_tax_applicable is true. */
  withholding_tax_percentage?: string | number | null;
  invoice_requirements?: InvoiceRequirements;
  po_required?: boolean;
  billing_frequency?: BillingFrequency;
  billing_contact?: string;
  billing_email?: string;
  commercial_remarks?: string;

  // --- Approval, read-only: set only by POST /submit-for-approval/, never a plain PATCH ---
  kyc_verified_by?: string | number | null;
  kyc_verified_at?: string | null;
  approval_remarks?: string | null;

  // --- Computed, read-only ---
  is_project_ready?: boolean;
  jurisdiction?: Jurisdiction;
  /** One status per onboarding step, always server-computed from the underlying fields. */
  step_statuses?: StepStatuses;
  /** Human-readable strings, e.g. "Tax Residency Verification". Empty array = ready to approve. */
  approval_blockers?: string[];
}

export const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr."] as const;

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
  poc_mobile: string;
  poc_email: string;
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
  | 'other';

export type ClientDocumentStatus = 'uploaded' | 'under_review' | 'verified' | 'rejected' | 'expired';

export interface ClientDocument {
  id: number;
  company: number;
  file: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: ClientDocumentCategory;
  is_required: boolean;
  status: ClientDocumentStatus;
  uploaded_by?: string | number | null;
  uploaded_at: string;
  /** Only ever set by POST /documents/<id>/verify/. */
  verified_by?: string | number | null;
  verified_at?: string | null;
  remarks?: string | null;
}

export type ChangeRequestSection = 'intake' | 'identity_kyc' | 'compliance' | 'banking' | 'commercials' | 'documents';
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
  | 'deleted';

export interface ClientAuditLogEntry {
  id: number;
  company: number;
  company_name: string;
  action: ClientAuditAction;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_by?: string | number | null;
  performed_by_name?: string | null;
  created_at: string;
}

/**
 * ==================================================================
 * SECTION: Shared option lists / labels (single source of truth,
 * exported per this file's existing convention of owning Client-related
 * types, reused by ClientKycDrawerContent, ClientDetailsPage, etc.)
 * ==================================================================
 */

export const CLIENT_TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

export const CURRENCY_OPTIONS: { value: ClientCurrency; label: string }[] = [
  'INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'JPY',
].map((c) => ({ value: c as ClientCurrency, label: c }));

export const KYC_STATUS_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'verified', label: 'Verified' },
  { value: 'enhanced_review', label: 'Enhanced Review' },
  { value: 'review_due', label: 'Review Due' },
];

export const RISK_RATING_OPTIONS: { value: RiskRating; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** Fixed 6-step onboarding sequence, in order. */
export const ONBOARDING_STEPS: { value: OnboardingStep; label: string }[] = [
  { value: 'intake', label: 'Intake' },
  { value: 'identity_kyc', label: 'Identity & KYC' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'banking', label: 'Banking' },
  { value: 'commercials', label: 'Commercials' },
  { value: 'approved', label: 'Approved' },
];

/** Onboarding Step select options for the KYC drawer - "Approved" is deliberately excluded:
 * it's now only ever set by POST /submit-for-approval/, never a plain dropdown choice. */
export const EDITABLE_ONBOARDING_STEPS = ONBOARDING_STEPS.filter((s) => s.value !== 'approved');

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
  { value: 'intake', label: 'Intake' },
  { value: 'identity_kyc', label: 'Identity & KYC' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'banking', label: 'Banking' },
  { value: 'commercials', label: 'Commercials' },
  { value: 'documents', label: 'Documents' },
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

export const kycStatusVariant = (status: KycStatus): 'success' | 'warning' | 'neutral' => {
  if (status === 'verified') return 'success';
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

export const onboardingStepIndex = (step: OnboardingStep): number =>
  Math.max(0, ONBOARDING_STEPS.findIndex((s) => s.value === step)) + 1;

export const onboardingProgressPercent = (step: OnboardingStep): number =>
  Math.round((onboardingStepIndex(step) / ONBOARDING_STEPS.length) * 100);

/** Drives the VendorStepper's completed/requires_review badges from the server-computed
 * `step_statuses`, instead of purely inferring them from onboarding_step's list position.
 * Falls back to the old position-based inference if step_statuses hasn't been returned yet
 * (e.g. a stale cached client). */
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

/** Client-side mirror of the backend's Company.jurisdiction property, for live previews
 * before a save round-trip (e.g. in the KYC drawer footer summary). */
export const computeJurisdiction = (country: string | undefined): Jurisdiction => {
  const c = (country || '').trim().toLowerCase();
  if (!c || c === 'india' || c === 'in') return 'Indian';
  return 'Overseas';
};

/**
 * ==================================================================
 * SECTION: ClientListPage Component
 * ==================================================================
 */

interface ClientListProps {
  clients: Client[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  userRole: UserRole;
  onAddClient: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (client: Client) => void;
  onViewClient: (id: number) => void;
  /** Debounced fetch callback wired to the real `?search=` query param on the parent's fetch. */
  onSearch: (query: string) => void;
  /** Optional lookup for a client's primary point of contact, shown under their name/phone in the table. */
  getPrimaryContact?: (clientId: number) => string | undefined;
}

const STEPPER_STEPS: StepConfig[] = ONBOARDING_STEPS.map((s, i) => ({ index: i + 1, label: s.label }));

const PAGE_SIZE = 10;

export function ClientListPage({
  clients,
  isLoading = false,
  error,
  onRetry,
  userRole,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onViewClient,
  onSearch,
  getPrimaryContact,
}: ClientListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Debounce the search box before calling back up to the parent, which owns the actual
  // `GET /client/?search=` fetch (server-side filtering, not a client-side .filter()).
  useEffect(() => {
    const timer = setTimeout(() => onSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [clients.length]);

  const canOnboard = userRole === 'admin' || userRole === 'manager';
  const canEdit = userRole === 'admin' || userRole === 'manager';
  const canDelete = userRole === 'admin';

  const kpis = useMemo(() => {
    const total = clients.length;
    const verified = clients.filter((c) => c.kyc_status === 'verified').length;
    const needsReview = clients.filter((c) => c.kyc_status === 'enhanced_review' || c.kyc_status === 'review_due').length;
    const overseas = clients.filter((c) => (c.jurisdiction ?? computeJurisdiction(c.country)) === 'Overseas').length;
    const riskWatch = clients.filter((c) => c.risk_rating === 'medium' || c.risk_rating === 'high').length;
    const highRisk = clients.filter((c) => c.risk_rating === 'high').length;
    return { total, verified, needsReview, overseas, riskWatch, highRisk };
  }, [clients]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  const paginatedClients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, page]);

  const handleRowClick = (client: Client) => setSelectedClientId(client.id);

  const columns: Column<Client>[] = [
    {
      header: 'Client',
      accessor: (c) => {
        const primaryContact = getPrimaryContact?.(c.id);
        return (
          <div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewClient(c.id);
              }}
              className="font-bold text-gray-900 hover:text-blue-600 hover:underline text-left dark:text-white dark:hover:text-blue-400"
            >
              {c.company_name}
            </button>
            <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{c.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.mobile_number}</p>
            {primaryContact && <p className="text-xs text-gray-400 dark:text-gray-500">{primaryContact}</p>}
          </div>
        );
      },
    },
    {
      header: 'Jurisdiction',
      accessor: (c) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{c.jurisdiction ?? computeJurisdiction(c.country)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{[c.country, c.currency].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    {
      header: 'KYC',
      accessor: (c) => <StatusBadge status={c.kyc_status} variant={kycStatusVariant(c.kyc_status)} label={kycStatusLabel(c.kyc_status)} />,
    },
    {
      header: 'Onboarding',
      accessor: (c) => (
        <div className="min-w-[8rem]">
          <p className="text-xs font-medium text-gray-700 mb-1 dark:text-gray-300">{onboardingStepLabel(c.onboarding_step)}</p>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
            <div
              className={`h-full rounded-full ${c.onboarding_step === 'approved' ? 'bg-green-600' : 'bg-blue-600'}`}
              style={{ width: `${onboardingProgressPercent(c.onboarding_step)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      header: 'Active',
      accessor: (c) => <StatusBadge status={c.is_active ? 'active' : 'inactive'} variant={c.is_active ? 'success' : 'neutral'} label={c.is_active ? 'Active' : 'Inactive'} />,
    },
    {
      header: 'Risk',
      accessor: (c) => <StatusBadge status={c.risk_rating} variant={riskRatingVariant(c.risk_rating)} label={riskRatingLabel(c.risk_rating)} />,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Clients</h2>

        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
          </div>
          {canOnboard && (
            <button
              onClick={onAddClient}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
            >
              <Plus size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Onboard Client</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          label="Registered Clients"
          value={String(kpis.total)}
          icon={<Users size={16} />}
          loading={isLoading}
          status="good"
        />
        <StatCard
          label="Verified KYC"
          value={String(kpis.verified)}
          icon={<ShieldCheck size={16} />}
          loading={isLoading}
          status="good"
        />
        <StatCard
          label="Needs Review"
          value={String(kpis.needsReview)}
          icon={<AlertTriangle size={16} />}
          loading={isLoading}
          status={kpis.needsReview > 0 ? 'watch' : 'good'}
          statusLabel={kpis.needsReview > 0 ? 'Awaiting KYC action' : undefined}
        />
        <StatCard
          label="Overseas Clients"
          value={String(kpis.overseas)}
          icon={<Globe2 size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Risk Watch"
          value={String(kpis.riskWatch)}
          icon={<ShieldAlert size={16} />}
          loading={isLoading}
          status={kpis.highRisk > 0 ? 'risk' : kpis.riskWatch > 0 ? 'watch' : 'good'}
          statusLabel={kpis.highRisk > 0 ? `${kpis.highRisk} high-risk` : undefined}
        />
      </div>

      {/* Onboarding stepper - bound to whichever client was last row-clicked */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-5 dark:bg-gray-900 dark:border-gray-800">
        {selectedClient ? (
          <>
            <p className="text-sm font-semibold text-gray-900 mb-3 dark:text-white">
              {selectedClient.company_name} &middot; {onboardingStepLabel(selectedClient.onboarding_step)} &middot; {onboardingProgressPercent(selectedClient.onboarding_step)}% complete
            </p>
            <VendorStepper
              steps={STEPPER_STEPS}
              currentStep={onboardingStepIndex(selectedClient.onboarding_step)}
              completedSteps={deriveStepProgress(selectedClient).completedSteps}
              errorSteps={deriveStepProgress(selectedClient).errorSteps}
              onStepClick={() => {}}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Click a client row to see its onboarding progress here.</p>
        )}
      </div>

      <ReusableTable<Client>
        data={paginatedClients}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onRowClick={handleRowClick}
        onEdit={canEdit ? onEditClient : undefined}
        onDelete={canDelete ? onDeleteClient : undefined}
        emptyMessage='No clients found. Click "Onboard Client" to create one.'
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={clients.length}
        onPageChange={setPage}
      />
    </div>
  );
}
