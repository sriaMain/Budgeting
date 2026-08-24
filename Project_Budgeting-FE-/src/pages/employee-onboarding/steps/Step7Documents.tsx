import React, { useMemo } from 'react';
import { EmployeeDocumentList, type DocumentSlotConfig } from '../../../components/EmployeeDocumentList';
import type { EmployeeDocument } from '../../../types/employeeOnboarding.types';

interface Props {
  documents: EmployeeDocument[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
}

const PDF_OR_IMAGE = {
  accept: 'application/pdf,image/jpeg,image/png',
  allowedTypesText: 'PDF, JPG, JPEG or PNG',
};

const IMAGE_ONLY = {
  // No PDF for a passport-size photo - it must be an actual image.
  accept: 'image/jpeg,image/png',
  allowedTypesText: 'JPG, JPEG or PNG',
};

const MANDATORY_SLOTS: DocumentSlotConfig[] = [
  { key: 'pan', label: 'PAN Card', required: true, ...PDF_OR_IMAGE },
  { key: 'aadhaar', label: 'Aadhaar Card', required: true, ...PDF_OR_IMAGE },
  { key: 'bank_proof', label: 'Bank Proof / Cancelled Cheque', required: true, ...PDF_OR_IMAGE },
  { key: 'photo', label: 'Passport-size Photo', required: true, ...IMAGE_ONLY },
  { key: 'education_certificate', label: 'Highest Education Certificate', required: true, ...PDF_OR_IMAGE },
];

const OPTIONAL_SLOTS: DocumentSlotConfig[] = [
  { key: 'experience_certificate', label: 'Experience Certificate', required: false, ...PDF_OR_IMAGE },
  { key: 'passport', label: 'Passport', required: false, ...PDF_OR_IMAGE },
  { key: 'driving_license', label: 'Driving License', required: false, ...PDF_OR_IMAGE },
  { key: 'esic', label: 'ESIC Document', required: false, ...PDF_OR_IMAGE },
  { key: 'other', label: 'Other Document', required: false, ...PDF_OR_IMAGE },
];

export const Step7Documents: React.FC<Props> = ({ documents, onUpload, onDelete, onDownload, disabled }) => {
  const slots = useMemo(() => [...MANDATORY_SLOTS, ...OPTIONAL_SLOTS], []);

  return (
    <div className="space-y-4">
      <EmployeeDocumentList
        slots={slots}
        documents={documents}
        onUpload={onUpload}
        onDelete={onDelete}
        onDownload={onDownload}
        disabled={disabled}
      />
    </div>
  );
};
