import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Edit2 } from 'lucide-react';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { VendorDocument } from '../../../types/vendorOnboarding.types';

interface Props {
  documents: VendorDocument[];
  completionPercent: number;
  missingItems: string[];
  onEditStep: (step: number) => void;
  existingAccountNumberMasked?: string;
}

const SectionHeader: React.FC<{ title: string; step: number; onEdit: (s: number) => void }> = ({ title, step, onEdit }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
    <button onClick={() => onEdit(step)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
      <Edit2 className="w-3.5 h-3.5" /> Edit
    </button>
  </div>
);

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm text-gray-900 font-medium">{value || '-'}</p>
  </div>
);

export const Step6ReviewSubmit: React.FC<Props> = ({ documents, completionPercent, missingItems, onEditStep, existingAccountNumberMasked }) => {
  const { getValues } = useFormContext<VendorOnboardingFormValues>();
  const values = getValues();

  return (
    <div className="space-y-8">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">Vendor Onboarding Completion: {completionPercent}%</p>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${completionPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        {missingItems.length > 0 && (
          <ul className="mt-3 text-xs text-red-600 list-disc list-inside space-y-0.5">
            {missingItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>

      <section className="border-t pt-6">
        <SectionHeader title="Vendor Details" step={1} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Legal Name" value={values.step1.name} />
          <Field label="Vendor Type" value={values.step1.vendor_type} />
          <Field label="Company Code" value={values.step1.company_code} />
          <Field label="Plant" value={values.step1.plant} />
          <Field label="Primary Email" value={values.step1.email} />
          <Field label="Primary Mobile" value={values.step1.phone} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Address" step={1} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Address Line 1" value={values.step1.address_line1} />
          <Field label="City" value={values.step1.city} />
          <Field label="State" value={values.step1.state} />
          <Field label="Country" value={values.step1.country} />
          <Field label="PIN Code" value={values.step1.pin_code} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="KYV / Compliance" step={2} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="PAN" value={values.step2.pan} />
          <Field label="Country of Tax Residence" value={values.step2.country_of_tax_residence} />
          <Field label="CIN" value={values.step2.cin} />
          <Field label="TAN" value={values.step2.tan} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Bank Details" step={3} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Bank Name" value={values.step3.bank_name} />
          <Field label="Account Holder" value={values.step3.account_holder_name} />
          <Field
            label="Account Number"
            value={
              values.step3.account_number
                ? `XXXXXX${values.step3.account_number.slice(-4)}`
                : existingAccountNumberMasked || ''
            }
          />
          <Field label="IFSC Code" value={values.step3.ifsc_code} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Business / Procurement" step={4} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Account Group" value={values.step4.account_group} />
          <Field label="Purchasing Org" value={values.step4.purchasing_org} />
          <Field label="Payment Terms" value={values.step4.payment_terms} />
          <Field label="Order Currency" value={values.step4.order_currency} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Documents" step={5} onEdit={onEditStep} />
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((d) => (
              <li key={d.id} className="text-sm text-gray-700">{d.file_name} <span className="text-xs text-gray-400">({d.category})</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
