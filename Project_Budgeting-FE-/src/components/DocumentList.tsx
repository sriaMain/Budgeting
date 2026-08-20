import React from 'react';
import { DocumentUploadCard } from './DocumentUploadCard';
import type { VendorDocument } from '../types/vendorOnboarding.types';

export interface DocumentSlotConfig {
  key: string;
  label: string;
  required: boolean;
}

interface DocumentListProps {
  slots: DocumentSlotConfig[];
  documents: VendorDocument[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({ slots, documents, onUpload, onDelete, onDownload, disabled }) => {
  const byCategory = new Map<string, VendorDocument>();
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
                    status: doc.status,
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
