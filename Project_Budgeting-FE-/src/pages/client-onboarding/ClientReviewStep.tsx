import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldCheck } from 'lucide-react';
import { ReviewSection, FormSection, type ReviewRow } from '../../components/onboarding/OnboardingWizard';
import { FieldShell } from '../../components/onboarding/FieldShell';
import { INPUT_CLASS } from '../../components/onboarding/fieldStyles';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { RequestChangesDialog } from '../../components/RequestChangesDialog';
import type { CountryConfig } from '../../services/countries';
import {
  approveClient,
  listChangeRequests,
  readClientApiError,
  resolveChangeRequest,
  updateClient,
} from '../../services/clientOnboarding';
import { applicableBankFields } from '../../components/onboarding/bankForm';
import { isIndianCountry, slotStatus, type ClientFormState } from './clientForm';
import {
  BENEFICIAL_OWNERSHIP_OPTIONS,
  DOCUMENT_STATUS_LABELS,
  ENHANCED_DUE_DILIGENCE_OPTIONS,
  KYC_STATUS_OPTIONS,
  REVIEWER_KYC_FLAGS,
  RISK_RATING_OPTIONS,
  SANCTIONS_SCREENING_OPTIONS,
  TAX_RESIDENCY_STATUS_OPTIONS,
  bankingVerificationStatusLabel,
  billingFrequencyLabel,
  changeRequestSectionLabel,
  clientTypeLabel,
  documentStatusVariant,
  invoiceRequirementsLabel,
  kycStatusLabel,
  kycStatusVariant,
  paymentTermsLabel,
  riskRatingLabel,
  riskRatingVariant,
  type BeneficialOwnershipStatus,
  type Client,
  type ClientChangeRequest,
  type ClientDocument,
  type ClientDocumentSlot,
  type ClientRecordPermissions,
  type CompanyTag,
  type EnhancedDueDiligenceStatus,
  type KycStatus,
  type RiskRating,
  type SanctionsScreeningStatus,
  type TaxResidencyStatus,
  type WizardStepKey,
} from './clientTypes';

interface ClientReviewStepProps {
  form: ClientFormState;
  record?: Client;
  perms: ClientRecordPermissions;
  countryConfig: CountryConfig | null;
  bankConfig: CountryConfig | null;
  /** Problems per step (client-side checks + server errors), shown in each section. */
  stepIssues: Partial<Record<WizardStepKey, string[]>>;
  slots: ClientDocumentSlot[];
  documents: ClientDocument[];
  tags: CompanyTag[];
  dirty: boolean;
  onEditStep: (step: WizardStepKey) => void;
  /** The client changed on the server (compliance review, change request ...). */
  onRecordChange: (client: Client) => void;
  /** Final approval succeeded. */
  onApproved: (client: Client) => void;
}

const Yes = (v: boolean | undefined) => (v ? 'Yes' : 'No');

export const ClientReviewStep: React.FC<ClientReviewStepProps> = ({
  form, record, perms, countryConfig, bankConfig, stepIssues, slots, documents, tags, dirty, onEditStep, onRecordChange, onApproved,
}) => {
  const individual = form.client_type === 'individual';
  const indian = isIndianCountry(form.country);
  const applies = applicableBankFields(bankConfig);
  const bankRules = bankConfig?.bank;
  const taxRule = countryConfig?.tax[individual ? 'individual' : 'business'];
  const reviewer = perms.approve || perms.request_changes || perms.edit_compliance;

  const tagNames = tags.filter((t) => form.tags.includes(t.id)).map((t) => t.name).join(', ');
  const missing = (value: string, required: boolean) => required && !value.trim();

  const basicRows: ReviewRow[] = [
    { label: individual ? 'Full legal name' : 'Legal name', value: form.company_name, missing: missing(form.company_name, true), wide: true },
    { label: 'Client type', value: clientTypeLabel(form.client_type) },
    { label: 'Country', value: form.country, missing: missing(form.country, true) },
    { label: 'Billing currency', value: form.currency },
    ...(!individual ? [{ label: 'Contact person', value: form.contact_person }] : []),
    { label: 'Email', value: form.email, missing: missing(form.email, true) },
    { label: 'Phone', value: form.phone, missing: missing(form.phone, true) },
    { label: 'Tags', value: tagNames },
  ];

  const identityRows: ReviewRow[] = [
    ...(indian
      ? [
          { label: 'PAN', value: form.pan, missing: missing(form.pan, true) },
          { label: 'GSTIN', value: form.gstin },
        ]
      : [{ label: taxRule?.label ?? 'Tax ID', value: form.tax_id, missing: missing(form.tax_id, !!taxRule?.required) }]),
    ...(!individual
      ? [
          { label: 'Registration number', value: form.registration_no, missing: missing(form.registration_no, form.client_type === 'company' || form.client_type === 'government') },
          { label: 'Authorised signatory', value: [form.authorised_signatory_name, form.authorised_signatory_role].filter(Boolean).join(' · '), missing: missing(form.authorised_signatory_name, true) },
        ]
      : []),
  ];

  const addressRows: ReviewRow[] = [
    { label: 'Address', value: [form.address.line1, form.address.line2].filter(Boolean).join(', '), missing: missing(form.address.line1, true), wide: true },
    { label: 'City', value: form.address.city, missing: missing(form.address.city, true) },
    { label: countryConfig?.address.state_label || 'State / region', value: form.address.state },
    ...(countryConfig?.address.postal.has_postal_code === false
      ? []
      : [{ label: countryConfig?.address.postal.label || 'Postal code', value: form.address.postal_code, missing: missing(form.address.postal_code, !!countryConfig?.address.postal.required) }]),
  ];

  const accountShown = form.bank.account_number
    ? `New number ending ${form.bank.account_number.slice(-4)}`
    : record?.bank_account_number_masked || '';
  const bankRows: ReviewRow[] = [
    { label: 'Bank country', value: form.bank.bank_country || form.country },
    { label: 'Account holder', value: form.bank.account_holder_name, missing: missing(form.bank.account_holder_name, true) },
    { label: 'Bank', value: [form.bank.bank_name, form.bank.branch_name].filter(Boolean).join(' · '), missing: missing(form.bank.bank_name, true) },
    ...(applies.account_number ? [{ label: bankRules?.account_number?.label || 'Account number', value: accountShown, missing: !accountShown }] : []),
    ...(applies.ifsc_code ? [{ label: 'IFSC code', value: form.bank.ifsc_code, missing: missing(form.bank.ifsc_code, true) }] : []),
    ...(applies.routing_code && bankRules?.routing ? [{ label: bankRules.routing.label, value: form.bank.routing_code, missing: missing(form.bank.routing_code, bankRules.routing.required) }] : []),
    ...(applies.swift_code ? [{ label: 'SWIFT / BIC', value: form.bank.swift_code, missing: missing(form.bank.swift_code, bankRules?.swift === 'required') }] : []),
    ...(applies.iban ? [{ label: 'IBAN', value: form.bank.iban, missing: missing(form.bank.iban, bankRules?.iban === 'required') }] : []),
    { label: 'Verification', value: bankingVerificationStatusLabel(form.banking_verification_status) },
  ];

  const commercialRows: ReviewRow[] = [
    { label: 'Payment terms', value: form.payment_terms === 'custom' ? form.custom_payment_terms || 'Custom' : paymentTermsLabel(form.payment_terms) },
    { label: 'Billing frequency', value: billingFrequencyLabel(form.billing_frequency) },
    { label: 'Invoice requirements', value: invoiceRequirementsLabel(form.invoice_requirements) },
    { label: 'PO required', value: Yes(form.po_required) },
    { label: 'Withholding tax', value: form.withholding_tax_applicable ? `${form.withholding_tax_percentage || '?'}%` : 'No' },
    { label: 'Billing contact', value: [form.billing_contact, form.billing_email].filter(Boolean).join(' · '), missing: !form.billing_contact.trim() || !form.billing_email.trim() },
  ];

  const documentRows: ReviewRow[] = slots
    .filter((s) => s.required || slotStatus(s, documents) !== 'missing')
    .map((slot) => {
      const status = slotStatus(slot, documents);
      return {
        label: slot.reviewer_only ? `${slot.label} (reviewer)` : slot.label,
        value: <StatusBadge status={status} variant={documentStatusVariant(status)} label={DOCUMENT_STATUS_LABELS[status]} />,
      };
    });

  return (
    <div className="space-y-4">
      <StatusPanel record={record} dirty={dirty} perms={perms} />

      <ReviewSection title="Basic Information" rows={basicRows} issues={stepIssues.basic} onEdit={() => onEditStep('basic')} />
      <ReviewSection title="Identity & KYC" rows={identityRows} issues={stepIssues.identity} onEdit={() => onEditStep('identity')} />
      <ReviewSection title="Address" rows={addressRows} issues={stepIssues.address} onEdit={() => onEditStep('address')} />
      <ReviewSection title="Banking" rows={bankRows} issues={stepIssues.banking} onEdit={() => onEditStep('banking')} />
      <ReviewSection title="Commercials" rows={commercialRows} issues={stepIssues.commercials} onEdit={() => onEditStep('commercials')} />
      <ReviewSection
        title="KYC Documents"
        rows={documentRows.length ? documentRows : [{ label: 'Documents', value: record ? 'None required yet' : 'Save the client first', wide: true }]}
        issues={stepIssues.documents}
        onEdit={() => onEditStep('documents')}
      />

      {record && reviewer && <ReviewerPanel record={record} perms={perms} onRecordChange={onRecordChange} onApproved={onApproved} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Workflow status                                                     */
/* ------------------------------------------------------------------ */

const StatusPanel: React.FC<{ record?: Client; dirty: boolean; perms: ClientRecordPermissions }> = ({ record, dirty, perms }) => {
  if (!record) {
    return (
      <Notice tone="info">This client hasn't been saved yet. Save the Basic Information first, then upload the KYC documents and submit.</Notice>
    );
  }
  const status = record.kyc_status;
  let text: React.ReactNode;
  if (status === 'submitted') {
    text = perms.locked
      ? 'Submitted for approval. It is read-only until a reviewer approves it or requests changes.'
      : 'Submitted for approval - review it below and approve it or request changes.';
  } else if (status === 'verified') {
    text = record.is_project_ready ? 'Approved - this client is project-ready.' : 'KYC verified.';
  } else if (status === 'changes_requested') {
    text = 'A reviewer requested changes. Update the client; the request is resolved by the reviewer, then submit again.';
  } else if (status === 'enhanced_review' || status === 'review_due') {
    text = `Flagged for ${kycStatusLabel(status).toLowerCase()} by compliance. Bring the details up to date and submit again.`;
  } else {
    text = 'Draft - complete every step and upload the required documents, then submit for approval.';
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} variant={kycStatusVariant(status)} label={`KYC: ${kycStatusLabel(status)}`} />
        <StatusBadge status={record.risk_rating} variant={riskRatingVariant(record.risk_rating)} label={`${riskRatingLabel(record.risk_rating)} risk`} />
        {record.is_project_ready && <StatusBadge status="ready" variant="success" label="Project-ready" />}
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{text}</p>
      {dirty && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">You have unsaved changes - they are saved when you submit.</p>}
      {record.kyc_verified_at && status === 'verified' && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Approved {new Date(record.kyc_verified_at).toLocaleString()}{record.approval_remarks ? ` · “${record.approval_remarks}”` : ''}
        </p>
      )}
    </div>
  );
};

const Notice: React.FC<{ tone: 'info' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
      tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
        : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
    }`}
  >
    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
    <div>{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Reviewer panel: compliance review, change requests, approval        */
/* ------------------------------------------------------------------ */

interface ComplianceState {
  sanctions_screening_status: SanctionsScreeningStatus;
  beneficial_ownership_status: BeneficialOwnershipStatus;
  tax_residency_status: TaxResidencyStatus;
  enhanced_due_diligence_status: EnhancedDueDiligenceStatus;
  risk_rating: RiskRating;
  compliance_remarks: string;
  kyc_flag: '' | KycStatus;
}

const complianceFrom = (c: Client): ComplianceState => ({
  sanctions_screening_status: c.sanctions_screening_status ?? 'not_checked',
  beneficial_ownership_status: c.beneficial_ownership_status ?? 'not_verified',
  tax_residency_status: c.tax_residency_status ?? 'pending',
  enhanced_due_diligence_status: c.enhanced_due_diligence_status ?? 'not_required',
  risk_rating: c.risk_rating,
  compliance_remarks: c.compliance_remarks ?? '',
  kyc_flag: '',
});

interface ReviewerPanelProps {
  record: Client;
  perms: ClientRecordPermissions;
  onRecordChange: (client: Client) => void;
  onApproved: (client: Client) => void;
}

const ReviewerPanel: React.FC<ReviewerPanelProps> = ({ record, perms, onRecordChange, onApproved }) => {
  const [compliance, setCompliance] = useState<ComplianceState>(() => complianceFrom(record));
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [approving, setApproving] = useState(false);
  const [approvalMissing, setApprovalMissing] = useState<string[] | null>(null);
  const [requests, setRequests] = useState<ClientChangeRequest[] | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const individual = record.client_type === 'individual';

  // Re-seed the compliance form when the client itself changes (e.g. after an approval / save).
  const [seededFrom, setSeededFrom] = useState(record);
  if (seededFrom !== record) {
    setSeededFrom(record);
    setCompliance(complianceFrom(record));
  }

  useEffect(() => {
    let alive = true;
    listChangeRequests(record.id)
      .then((rows) => {
        if (alive) setRequests(rows);
      })
      .catch(() => {
        if (alive) setRequests([]);
      });
    return () => {
      alive = false;
    };
  }, [record.id, record.kyc_status]);

  const original = complianceFrom(record);
  const changed = (Object.keys(compliance) as (keyof ComplianceState)[]).filter((k) => k !== 'kyc_flag' && compliance[k] !== original[k]);
  const complianceDirty = changed.length > 0 || !!compliance.kyc_flag;

  const saveCompliance = async () => {
    const payload: Record<string, unknown> = {};
    changed.forEach((k) => {
      payload[k] = compliance[k];
    });
    if (compliance.kyc_flag) payload.kyc_status = compliance.kyc_flag;
    setSavingCompliance(true);
    try {
      const updated = await updateClient(record.id, payload);
      toast.success('Compliance review saved');
      onRecordChange(updated);
    } catch (err) {
      toast.error(readClientApiError(err, 'Could not save the compliance review.').message);
    } finally {
      setSavingCompliance(false);
    }
  };

  const approve = async () => {
    setApproving(true);
    setApprovalMissing(null);
    try {
      const updated = await approveClient(record.id, remarks);
      toast.success('Client approved and marked project-ready');
      onApproved(updated);
    } catch (err) {
      const apiError = readClientApiError(err, 'Could not approve the client.');
      if (apiError.missing.length) setApprovalMissing(apiError.missing);
      else toast.error(apiError.message);
    } finally {
      setApproving(false);
    }
  };

  const resolve = async (cr: ClientChangeRequest) => {
    setResolvingId(cr.id);
    try {
      const updated = await resolveChangeRequest(record.id, cr.id);
      setRequests((prev) => (prev ?? []).map((r) => (r.id === cr.id ? updated : r)));
      toast.success('Change request resolved');
      onRecordChange(record); // caller re-reads the client (status may return to draft)
    } catch (err) {
      toast.error(readClientApiError(err, 'Could not resolve the change request.').message);
    } finally {
      setResolvingId(null);
    }
  };

  const blockers = record.approval_blockers ?? [];
  const openRequests = (requests ?? []).filter((r) => r.status === 'open');
  const canApproveNow = perms.approve && !record.is_project_ready;
  const kycFlagOptions = [
    { value: '', label: `No change (${kycStatusLabel(record.kyc_status)})` },
    ...KYC_STATUS_OPTIONS.filter((o) => REVIEWER_KYC_FLAGS.includes(o.value) && o.value !== record.kyc_status),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-violet-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reviewer</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Visible to compliance reviewers and approvers only.</span>
      </div>

      {perms.edit_compliance && (
        <FormSection title="Compliance review" description="Screening results recorded by the reviewer. Saved separately from the client's details.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <SelectField
              id="client-sanctions_screening_status"
              label="Sanctions screening"
              options={SANCTIONS_SCREENING_OPTIONS}
              value={compliance.sanctions_screening_status}
              onChange={(e) => setCompliance((c) => ({ ...c, sanctions_screening_status: e.target.value as SanctionsScreeningStatus }))}
            />
            {!individual && (
              <SelectField
                id="client-beneficial_ownership_status"
                label="Beneficial ownership"
                options={BENEFICIAL_OWNERSHIP_OPTIONS}
                value={compliance.beneficial_ownership_status}
                onChange={(e) => setCompliance((c) => ({ ...c, beneficial_ownership_status: e.target.value as BeneficialOwnershipStatus }))}
              />
            )}
            <SelectField
              id="client-tax_residency_status"
              label="Tax residency"
              options={TAX_RESIDENCY_STATUS_OPTIONS}
              value={compliance.tax_residency_status}
              onChange={(e) => setCompliance((c) => ({ ...c, tax_residency_status: e.target.value as TaxResidencyStatus }))}
            />
            <SelectField
              id="client-risk_rating"
              label="Risk rating"
              options={RISK_RATING_OPTIONS}
              value={compliance.risk_rating}
              onChange={(e) => setCompliance((c) => ({ ...c, risk_rating: e.target.value as RiskRating }))}
            />
            <SelectField
              id="client-enhanced_due_diligence_status"
              label="Enhanced due diligence"
              options={ENHANCED_DUE_DILIGENCE_OPTIONS}
              value={compliance.enhanced_due_diligence_status}
              onChange={(e) => setCompliance((c) => ({ ...c, enhanced_due_diligence_status: e.target.value as EnhancedDueDiligenceStatus }))}
            />
            {perms.approve && (
              <SelectField
                id="client-kyc_flag"
                label="Flag KYC status"
                options={kycFlagOptions}
                value={compliance.kyc_flag}
                onChange={(e) => setCompliance((c) => ({ ...c, kyc_flag: e.target.value as KycStatus | '' }))}
              />
            )}
            <div className="md:col-span-2">
              <FieldShell label="Compliance remarks" htmlFor="client-compliance_remarks">
                <textarea
                  id="client-compliance_remarks"
                  rows={3}
                  value={compliance.compliance_remarks}
                  onChange={(e) => setCompliance((c) => ({ ...c, compliance_remarks: e.target.value }))}
                  placeholder="Screening source, findings, reasons for the risk rating"
                  className={`${INPUT_CLASS} min-h-[84px]`}
                />
              </FieldShell>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {record.compliance_reviewed_at && (
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-auto">Last reviewed {new Date(record.compliance_reviewed_at).toLocaleString()}</span>
            )}
            <button
              type="button"
              onClick={saveCompliance}
              disabled={!complianceDirty || savingCompliance}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {savingCompliance && <Loader2 className="w-4 h-4 animate-spin" />}
              Save compliance review
            </button>
          </div>
        </FormSection>
      )}

      <FormSection
        title="Change requests"
        description="Ask the maker to fix a section. The client returns to draft once every open request is resolved."
        actions={
          perms.request_changes ? (
            <button
              type="button"
              onClick={() => setRequestDialogOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              Request changes
            </button>
          ) : undefined
        }
      >
        {requests === null ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : openRequests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No open change requests.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {openRequests.map((cr) => (
              <li key={cr.id} className="py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{changeRequestSectionLabel(cr.section)}</p>
                  <p className="text-sm text-gray-700 break-words dark:text-gray-300">{cr.required_changes}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {cr.requested_by_name || 'Reviewer'} · {new Date(cr.requested_at).toLocaleString()}
                  </p>
                </div>
                {perms.request_changes && (
                  <button
                    type="button"
                    onClick={() => resolve(cr)}
                    disabled={resolvingId === cr.id}
                    className="self-start px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {resolvingId === cr.id ? 'Resolving…' : 'Mark resolved'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      {perms.approve !== undefined && (
        <FormSection title="Final approval" description="Approval needs every required document verified, the compliance checks passed and the bank account verified.">
          {record.is_project_ready ? (
            <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" /> Approved - project-ready.
            </p>
          ) : (
            <>
              {blockers.length > 0 ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Before this client can be approved:</p>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
              ) : (
                <p className="mb-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> Every approval check passes.
                </p>
              )}
              {approvalMissing && approvalMissing.length > 0 && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  <p className="font-semibold">The server refused the approval:</p>
                  <ul className="mt-1 list-disc list-inside">{approvalMissing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {canApproveNow ? (
                <>
                  <FieldShell label="Approval remarks" htmlFor="client-approval_remarks" optional>
                    <textarea
                      id="client-approval_remarks"
                      rows={2}
                      maxLength={2000}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className={`${INPUT_CLASS} min-h-[64px]`}
                    />
                  </FieldShell>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={approve}
                      disabled={approving || blockers.length > 0}
                      title={blockers.length > 0 ? 'Resolve the items above first' : undefined}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {approving ? 'Approving…' : 'Approve client'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {perms.approve
                    ? 'Approval opens once the client is submitted.'
                    : 'Approving a client needs the client approval permission.'}
                </p>
              )}
            </>
          )}
        </FormSection>
      )}

      <RequestChangesDialog
        isOpen={requestDialogOpen}
        clientId={record.id}
        onClose={() => setRequestDialogOpen(false)}
        onCreated={(cr) => {
          setRequests((prev) => [cr, ...(prev ?? [])]);
          onRecordChange(record); // caller re-reads the client (now changes_requested)
        }}
      />
    </div>
  );
};
