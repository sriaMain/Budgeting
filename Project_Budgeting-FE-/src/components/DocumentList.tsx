import React from 'react';
import { DocumentUploadCard } from './DocumentUploadCard';

export interface DocumentSlotConfig {
  key: string;
  label: string;
  required: boolean;
}

/** Minimal shape any onboarding module's document record needs to satisfy -
 * structural typing means VendorDocument/EmployeeDocument/FreelancerDocument
 * all already fit this without any changes to their own type definitions.
 * `status` is optional since not every module tracks an uploaded/verified
 * distinction (e.g. Freelancer's simpler onboarding doesn't). */
export interface UploadedDocumentLike {
  id: number;
  category: string;
  file_name: string;
  file_size: number;
  file_type: string;
  status?: string;
  uploaded_at: string;
  /** Only ever set once a reviewer has acted on the document via the verify endpoint -
   * optional so modules without a review workflow (vendor/employee/freelancer) are unaffected. */
  verified_by?: string | number | null;
  verified_at?: string | null;
  remarks?: string | null;
}

interface DocumentListProps {
  slots: DocumentSlotConfig[];
  documents: UploadedDocumentLike[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
  /** Admin/manager-only verify affordance, shown per-document when both are provided. */
  canVerify?: boolean;
  onVerify?: (docId: number, status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
}

export const DocumentList: React.FC<DocumentListProps> = ({ slots, documents, onUpload, onDelete, onDownload, disabled, canVerify, onVerify }) => {
  const byCategory = new Map<string, UploadedDocumentLike>();
  documents.forEach((d) => {
    if (!byCategory.has(d.category)) byCategory.set(d.category, d);
  });

  const handleUpload = async (slotKey: string, file: File) => {
    const existing = byCategory.get(slotKey);
    if (existing) {
      await onDelete(existing.id);
    }
    await onUpload(slotKey, file);
  };

  return (
    <div className="space-y-3">
      {slots.map((slot) => {
        const doc = byCategory.get(slot.key);
        return (
          <DocumentUploadCard
            key={slot.key}
            label={slot.label}
            required={slot.required}
            disabled={disabled}
            existingDoc={
              doc
                ? {
                    id: doc.id,
                    fileName: doc.file_name,
                    sizeBytes: doc.file_size,
                    mimeType: doc.file_type,
                    status: doc.status ?? 'uploaded',
                    uploadedAt: doc.uploaded_at,
                    verifiedBy: doc.verified_by,
                    verifiedAt: doc.verified_at,
                    remarks: doc.remarks,
                  }
                : undefined
            }
            onUpload={(file) => handleUpload(slot.key, file)}
            onDelete={doc ? () => onDelete(doc.id) : undefined}
            onDownload={doc ? () => onDownload(doc.id) : undefined}
            canVerify={canVerify}
            onVerify={doc && onVerify ? (status, remarks) => onVerify(doc.id, status, remarks) : undefined}
          />
        );
      })}
    </div>
  );
};
