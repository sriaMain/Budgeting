import React from 'react';
import { DocumentUploadCard } from './DocumentUploadCard';
import type { EmployeeDocument } from '../types/employeeOnboarding.types';

export interface DocumentSlotConfig {
  key: string;
  label: string;
  required: boolean;
  /** HTML `accept` attribute for this slot's file input, e.g. "image/jpeg,image/png". */
  accept?: string;
  /** Human-readable form of `accept`, e.g. "JPG, JPEG or PNG". */
  allowedTypesText?: string;
}

interface EmployeeDocumentListProps {
  slots: DocumentSlotConfig[];
  documents: EmployeeDocument[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
}

export const EmployeeDocumentList: React.FC<EmployeeDocumentListProps> = ({ slots, documents, onUpload, onDelete, onDownload, disabled }) => {
  const byCategory = new Map<string, EmployeeDocument>();
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
            accept={slot.accept}
            allowedTypesText={slot.allowedTypesText}
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
