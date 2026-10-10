import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { DocumentList } from '../../../components/DocumentList';
import {
  vendorDocumentSlots, BANK_PROOF_CATEGORIES, type VendorOnboardingFormValues, type VendorDocumentStep,
} from '../../../schemas/vendorOnboarding.schemas';
import type { VendorDocument } from '../../../types/vendorOnboarding.types';
import { documentRuleContext } from '../vendorOnboardingForm';

interface Props {
  documents: VendorDocument[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
  /** Only this onboarding step's documents (the drawer shows them inside each step); omit for all. */
  step?: VendorDocumentStep;
  /** Internal reviewers: verify / reject (a rejection needs a reason). */
  canVerify?: boolean;
  onVerify?: (docId: number, status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
  onPreview?: (docId: number) => void;
  /** Review-only - upload/delete locked, verification still possible. */
  readOnly?: boolean;
}

export const Step5Documents: React.FC<Props> = ({ documents, onUpload, onDelete, onDownload, disabled, step, canVerify, onVerify, onPreview, readOnly }) => {
  const { watch } = useFormContext<VendorOnboardingFormValues>();
  const values = watch();
  const ctx = documentRuleContext(values);
  const ctxKey = JSON.stringify(ctx);

  const slots = useMemo(
    () => vendorDocumentSlots(ctx).filter((s) => !step || s.step === step).map(({ key, label, required }) => ({ key, label, required })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctxKey, step]
  );

  const showBankNote = (!step || step === 'banking') &&
    !documents.some((d) => BANK_PROOF_CATEGORIES.includes(d.category) && d.status !== 'rejected');

  if (slots.length === 0) return null;

  return (
    <div className="space-y-4">
      {showBankNote && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-md px-3 py-2 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20">
          {ctx.jurisdiction === 'Indian'
            ? 'A bank letter, cancelled cheque or bank statement is required.'
            : 'A bank letter (or bank statement) is required.'}
        </p>
      )}
      <DocumentList
        slots={slots}
        documents={documents}
        onUpload={onUpload}
        onDelete={onDelete}
        onDownload={onDownload}
        disabled={disabled}
        canVerify={canVerify}
        onVerify={onVerify}
        onPreview={onPreview}
        readOnly={readOnly}
        requireRejectReason
        uploadedLabel="Uploaded · Pending Verification"
      />
      <p className="text-xs text-gray-400 dark:text-gray-500">
        PDF, JPG, JPEG or PNG, up to 10 MB each &middot; maximum 8 KYC documents per vendor. Uploading never verifies a document.
      </p>
    </div>
  );
};
