import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { DocumentList, type DocumentSlotConfig } from '../../../components/DocumentList';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { VendorDocument } from '../../../types/vendorOnboarding.types';

interface Props {
  documents: VendorDocument[];
  onUpload: (category: string, file: File) => Promise<void>;
  onDelete: (docId: number) => Promise<void>;
  onDownload: (docId: number) => void;
  disabled?: boolean;
}

export const Step5Documents: React.FC<Props> = ({ documents, onUpload, onDelete, onDownload, disabled }) => {
  const { watch } = useFormContext<VendorOnboardingFormValues>();
  const vendorType = watch('step1.vendor_type');
  const gstRegistered = watch('step1.gst_registered');
  const msmeRegistered = watch('step1.msme_registered');
  const epfNumber = watch('step2.epf_number');
  const esicNumber = watch('step2.esic_number');

  const slots: DocumentSlotConfig[] = useMemo(() => {
    const list: DocumentSlotConfig[] = [
      { key: 'pan', label: 'PAN Document', required: true },
      { key: 'bank_proof_cancelled_cheque', label: 'Bank Proof - Cancelled Cheque', required: false },
      { key: 'bank_proof_bank_statement', label: 'Bank Proof - Bank Statement', required: false },
      { key: 'bank_proof_bank_certificate', label: 'Bank Proof - Bank Certificate', required: false },
    ];
    if (gstRegistered) list.push({ key: 'gst_certificate', label: 'GST Certificate', required: true });
    if (vendorType === 'company') list.push({ key: 'cin_incorporation_certificate', label: 'CIN / Incorporation Certificate', required: true });
    if (msmeRegistered) list.push({ key: 'msme_udyam_certificate', label: 'UDYAM / MSME Certificate', required: true });
    if (epfNumber) list.push({ key: 'epf_certificate', label: 'EPF Certificate', required: true });
    if (esicNumber) list.push({ key: 'esic_certificate', label: 'ESIC Certificate', required: true });
    list.push({ key: 'other', label: 'Other Document', required: false });
    return list;
  }, [vendorType, gstRegistered, msmeRegistered, epfNumber, esicNumber]);

  const bankProofCategories = new Set(['bank_proof_cancelled_cheque', 'bank_proof_bank_statement', 'bank_proof_bank_certificate']);
  const hasBankProof = documents.some((d) => bankProofCategories.has(d.category));

  return (
    <div className="space-y-4">
      {!hasBankProof && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-md px-3 py-2">
          At least one bank proof document (cancelled cheque, bank statement, or bank certificate) is required.
        </p>
      )}
      <DocumentList
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
