import React from 'react';
import { AlertTriangle, CheckCircle2, FileStack } from 'lucide-react';
import { DocumentList } from '../../../components/DocumentList';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import { countKycDocuments, MAX_VENDOR_KYC_DOCUMENTS, type VendorDocumentGroup } from '../../../schemas/vendorOnboarding.schemas';
import type { VendorWizard } from '../components/useVendorWizard';

const GROUPS: { key: VendorDocumentGroup; title: string; description: string }[] = [
  { key: 'kyc', title: 'Identity & registration documents', description: 'Tax and registration proofs for the details given in Identity & KYC.' },
  { key: 'banking', title: 'Bank proof', description: 'One proof of the account is required - a reviewer checks it before the account is marked verified.' },
  { key: 'other', title: 'Contract & other documents', description: "Optional - these don't count toward the KYC document limit." },
];

const STATE_TONE: Record<string, string> = {
  verified: 'text-green-700 dark:text-green-400',
  present: 'text-gray-700 dark:text-gray-300',
  missing: 'text-amber-700 dark:text-amber-400',
  rejected: 'text-red-600 dark:text-red-400',
  expired: 'text-red-600 dark:text-red-400',
};
const STATE_LABEL: Record<string, string> = {
  verified: 'Verified', present: 'Uploaded - awaiting verification', missing: 'Missing', rejected: 'Rejected - upload a replacement', expired: 'Expired - upload a current one',
};

/** Step 6 - every document slot, grouped, with Missing / Uploaded / Verified / Rejected / Expired states. */
export const DocumentsStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { docSlots, docStatus, documents, editable, internal, permissions, canVerify, busy, errors } = wiz;
  const limit = wiz.choices?.max_kyc_documents ?? MAX_VENDOR_KYC_DOCUMENTS;
  const kycCount = countKycDocuments(documents);
  const canUpload = editable && (!internal || permissions?.upload_documents !== false);
  const satisfied = docStatus.filter((d) => d.state === 'present' || d.state === 'verified').length;
  const verified = docStatus.filter((d) => d.state === 'verified').length;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <strong className="font-semibold">{satisfied}</strong> of {docStatus.length} required documents provided
            <span className="text-gray-400"> · </span>
            <strong className="font-semibold text-green-700 dark:text-green-400">{verified}</strong> verified
          </p>
          <p className={`inline-flex items-center gap-1.5 text-xs font-medium ${kycCount >= limit ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <FileStack className="w-3.5 h-3.5" /> KYC documents: {kycCount} / {limit}
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {docStatus.map(({ rule, state }) => (
            <li key={rule.key} className="flex items-start gap-2 text-xs">
              {state === 'verified' || state === 'present'
                ? <CheckCircle2 className={`w-3.5 h-3.5 mt-px shrink-0 ${state === 'verified' ? 'text-green-600' : 'text-gray-400'}`} />
                : <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500" />}
              <span className="text-gray-700 dark:text-gray-300">{rule.label}: <span className={STATE_TONE[state]}>{STATE_LABEL[state]}</span></span>
            </li>
          ))}
        </ul>
        {errors['documents.required'] && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{errors['documents.required']}</p>
        )}
        {kycCount >= limit && canUpload && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            The limit of {limit} KYC documents is reached - replace a document (Replace keeps the count) or remove one to add another.
          </p>
        )}
      </section>

      {GROUPS.map((group) => {
        const slots = docSlots.filter((s) => s.group === group.key);
        if (!slots.length) return null;
        return (
          <FormSection key={group.key} title={group.title} description={group.description}>
            <DocumentList
              slots={slots}
              documents={documents}
              onUpload={wiz.uploadDocument}
              onDelete={wiz.deleteDocument}
              onDownload={(id) => void wiz.openDocument(id)}
              onPreview={(id) => void wiz.openDocument(id)}
              disabled={!!busy}
              readOnly={!canUpload}
              canVerify={canVerify}
              onVerify={canVerify ? wiz.verifyDocument : undefined}
              requireRejectReason
              lockVerified={!internal}
              uploadedLabel="Uploaded · Pending verification"
            />
          </FormSection>
        );
      })}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        PDF, JPG, JPEG or PNG, up to 10 MB each · at most {limit} KYC documents per vendor (rejected and replaced documents don't count).
        Uploading never verifies a document - a reviewer does.
      </p>
    </div>
  );
};
