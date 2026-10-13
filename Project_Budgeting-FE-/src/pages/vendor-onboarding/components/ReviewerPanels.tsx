import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { SelectField } from '../../../components/SelectField';
import { StatusBadge } from '../../../components/StatusBadge';
import { FieldShell } from '../../../components/onboarding/FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '../../../components/onboarding/fieldStyles';
import type { VendorOnboardingChoices } from '../../../types/vendorOnboarding.types';
import { choiceLabel, vendorFieldId } from '../vendorOnboardingForm';
import type { VendorWizard } from './useVendorWizard';

const REVIEW_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  verified: 'success', rejected: 'danger', enhanced_review: 'warning', under_review: 'info', documents_uploaded: 'info',
};

const Panel: React.FC<{ title: string; status: React.ReactNode; children: React.ReactNode }> = ({ title, status, children }) => (
  <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5 dark:border-violet-500/30 dark:bg-violet-500/5">
    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 dark:text-white"><ShieldCheck className="w-4 h-4" /> {title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Internal only - never shown to the vendor.</p>
      </div>
      {status}
    </div>
    {children}
  </section>
);

const Remarks: React.FC<{ wiz: VendorWizard; field: 'compliance_remarks' | 'bank_verification_remarks'; label: string; placeholder: string }> = ({ wiz, field, label, placeholder }) => {
  const error = wiz.errors[`review.${field}`];
  return (
    <FieldShell label={label} htmlFor={vendorFieldId(`review.${field}`)} error={error} className="md:col-span-2">
      <textarea
        id={vendorFieldId(`review.${field}`)}
        rows={2}
        value={wiz.values.review[field]}
        placeholder={placeholder}
        onChange={(e) => wiz.patch('review', { [field]: e.target.value })}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      />
    </FieldShell>
  );
};

const SaveButton: React.FC<{ onClick: () => void; busy: boolean; disabled: boolean; label: string }> = ({ onClick, busy, disabled, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-700"
  >
    {busy && <Loader2 className="w-4 h-4 animate-spin" />} {label}
  </button>
);

/** KYC status / risk / compliance remarks. Reviewers (vendor.verify) edit it; other internal users see the status. */
export const KycReviewPanel: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const record = wiz.adminRecord;
  if (!wiz.internal || !record) return null;
  const choices = wiz.choices as VendorOnboardingChoices | null;
  const saved = record.review;
  const statusBadge = (
    <StatusBadge status={saved.kyc_status} variant={REVIEW_VARIANT[saved.kyc_status] ?? 'neutral'}
      label={`KYC: ${choiceLabel(choices?.kyc_statuses ?? [], saved.kyc_status) || saved.kyc_status}`} />
  );
  if (!wiz.canVerify) {
    return (
      <Panel title="KYC review" status={statusBadge}>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Risk rating: <strong>{choiceLabel(choices?.risk_ratings ?? [], saved.risk_rating) || saved.risk_rating}</strong>
          {saved.compliance_remarks && <> · {saved.compliance_remarks}</>}
        </p>
      </Panel>
    );
  }
  const r = wiz.values.review;
  const changed = r.kyc_status !== saved.kyc_status || r.risk_rating !== saved.risk_rating || r.compliance_remarks !== (saved.compliance_remarks || '');
  return (
    <Panel title="KYC review" status={statusBadge}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <SelectField id={vendorFieldId('review.kyc_status')} label="KYC status" options={choices?.kyc_statuses ?? []} value={r.kyc_status}
          onChange={(e) => wiz.patch('review', { kyc_status: e.target.value })} />
        <SelectField id={vendorFieldId('review.risk_rating')} label="Risk rating" options={choices?.risk_ratings ?? []} value={r.risk_rating}
          onChange={(e) => wiz.patch('review', { risk_rating: e.target.value })} />
        <Remarks wiz={wiz} field="compliance_remarks" label="Compliance remarks"
          placeholder="Required when rejecting, and for high-risk vendors (record the enhanced review)" />
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={() => void wiz.saveReview('kyc')} busy={wiz.busy === 'review'} disabled={!!wiz.busy || !changed} label="Save KYC review" />
      </div>
    </Panel>
  );
};

/** Bank account verification - set only by a reviewer after checking the bank proof. */
export const BankReviewPanel: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const record = wiz.adminRecord;
  if (!wiz.internal || !record || !wiz.canVerify) return null;
  const choices = wiz.choices as VendorOnboardingChoices | null;
  const saved = record.review;
  const r = wiz.values.review;
  const changed = r.bank_verification_status !== saved.bank_verification_status || r.bank_verification_remarks !== (saved.bank_verification_remarks || '');
  return (
    <Panel
      title="Bank account verification"
      status={<StatusBadge status={saved.bank_verification_status} variant={REVIEW_VARIANT[saved.bank_verification_status] ?? 'neutral'}
        label={choiceLabel(choices?.bank_verification_statuses ?? [], saved.bank_verification_status) || saved.bank_verification_status} />}
    >
      <p className="text-xs text-gray-600 mb-3 dark:text-gray-300">
        Mark the account verified only after checking the bank proof against the details. Changing the bank details later resets this to Not Verified.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <SelectField id={vendorFieldId('review.bank_verification_status')} label="Verification status" options={choices?.bank_verification_statuses ?? []}
          value={r.bank_verification_status} onChange={(e) => wiz.patch('review', { bank_verification_status: e.target.value })} />
        <div />
        <Remarks wiz={wiz} field="bank_verification_remarks" label="Verification remarks" placeholder="Required when rejecting" />
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={() => void wiz.saveReview('bank')} busy={wiz.busy === 'review'} disabled={!!wiz.busy || !changed} label="Save bank verification" />
      </div>
    </Panel>
  );
};
