import React from 'react';
import { DocumentUploadCard, type UploadOptions } from './DocumentUploadCard';
import { latestByCategory, summarizeDocuments } from '../utils/documentStatus';

export type { UploadOptions } from './DocumentUploadCard';

export interface DocumentSlotConfig {
  key: string;
  label: string;
  required: boolean;
  /** Ask for an expiry date on upload (passport, certificates with validity). */
  tracksExpiry?: boolean;
  helpText?: string;
}

/** Minimal shape any onboarding module's document record needs to satisfy -
 * structural typing means Client / Vendor / Freelancer documents all fit it. */
export interface UploadedDocumentLike {
  id: number;
  category: string;
  file_name: string;
  file_size: number;
  file_type: string;
  status?: string;
  uploaded_at: string;
  verified_by?: string | number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  remarks?: string | null;
  expiry_date?: string | null;
  document_number?: string | null;
}

interface DocumentListProps {
  slots: DocumentSlotConfig[];
  documents: UploadedDocumentLike[];
  /** Upload a file into a slot. `opts.replaces` is set when it replaces an existing document:
   * pass it to the server so the swap is atomic (the old file is only removed once the new
   * one is stored). Modules whose API can't replace should set `serverReplace={false}`. */
  onUpload: (category: string, file: File, opts?: UploadOptions) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
  canVerify?: boolean;
  onVerify?: (docId: number, status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
  onPreview?: (docId: number) => void;
  /** Review-only: no upload/replace/delete, verify still allowed. */
  readOnly?: boolean;
  requireRejectReason?: boolean;
  uploadedLabel?: string;
  /** Default true. When false, a replacement is uploaded first and the old document deleted after. */
  serverReplace?: boolean;
  /** Show the "x of y required documents" summary above the slots. */
  showSummary?: boolean;
  /** Portal users can't replace a verified document. */
  lockVerified?: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  slots, documents, onUpload, onDelete, onDownload, disabled, canVerify, onVerify, onPreview, readOnly, requireRejectReason, uploadedLabel,
  serverReplace = true, showSummary = false, lockVerified,
}) => {
  const byCategory = latestByCategory(documents);

  const handleUpload = async (slotKey: string, file: File, opts: UploadOptions) => {
    const existing = byCategory.get(slotKey);
    if (!existing || serverReplace) {
      await onUpload(slotKey, file, opts);
      return;
    }
    // Upload first, delete second: a failed upload must never lose the document on file.
    await onUpload(slotKey, file, { ...opts, replaces: undefined });
    await onDelete(existing.id);
  };

  const summary = showSummary ? summarizeDocuments(slots, documents) : null;

  return (
    <div className="space-y-3">
      {summary && summary.requiredTotal > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
          <span>
            <strong className="font-semibold text-gray-900 dark:text-white">{summary.requiredPresent}</strong> of {summary.requiredTotal} required documents provided
          </span>
          <span><strong className="font-semibold text-green-700 dark:text-green-400">{summary.verified}</strong> verified</span>
          {summary.rejected > 0 && <span className="text-red-600 dark:text-red-400">{summary.rejected} rejected</span>}
          {summary.expired > 0 && <span className="text-red-600 dark:text-red-400">{summary.expired} expired</span>}
        </div>
      )}
      {slots.map((slot) => {
        const doc = byCategory.get(slot.key);
        return (
          <DocumentUploadCard
            key={slot.key}
            label={slot.label}
            required={slot.required}
            tracksExpiry={slot.tracksExpiry}
            helpText={slot.helpText}
            disabled={disabled}
            lockVerified={lockVerified}
            existingDoc={
              doc
                ? {
                    id: doc.id,
                    fileName: doc.file_name,
                    sizeBytes: doc.file_size,
                    mimeType: doc.file_type,
                    status: doc.status ?? 'uploaded',
                    uploadedAt: doc.uploaded_at,
                    verifiedBy: doc.verified_by_name || doc.verified_by,
                    verifiedAt: doc.verified_at,
                    remarks: doc.remarks,
                    expiryDate: doc.expiry_date,
                    documentNumber: doc.document_number,
                  }
                : undefined
            }
            onUpload={(file, opts) => handleUpload(slot.key, file, opts)}
            onDelete={doc ? () => onDelete(doc.id) : undefined}
            onDownload={doc ? () => onDownload(doc.id) : undefined}
            canVerify={canVerify}
            onVerify={doc && onVerify ? (status, remarks) => onVerify(doc.id, status, remarks) : undefined}
            onPreview={doc && onPreview ? () => onPreview(doc.id) : undefined}
            readOnly={readOnly}
            requireRejectReason={requireRejectReason}
            uploadedLabel={uploadedLabel}
          />
        );
      })}
    </div>
  );
};
