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
}

interface DocumentListProps {
  slots: DocumentSlotConfig[];
  documents: UploadedDocumentLike[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({ slots, documents, onUpload, onDelete, onDownload, disabled }) => {
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
                  }
                : undefined
            }
            onUpload={(file) => handleUpload(slot.key, file)}
            onDelete={doc ? () => onDelete(doc.id) : undefined}
            onDownload={doc ? () => onDownload(doc.id) : undefined}
          />
        );
      })}
    </div>
  );
};
