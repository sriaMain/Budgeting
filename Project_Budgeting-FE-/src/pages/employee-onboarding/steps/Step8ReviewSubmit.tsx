import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Edit2 } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';
import type { EmployeeDocument } from '../../../types/employeeOnboarding.types';
import type { EmployeePublicDetail } from '../../../types/employeeOnboardingPublic.types';

interface Props {
  detail: EmployeePublicDetail;
  documents: EmployeeDocument[];
  completionPercent: number;
  missingItems: string[];
  onEditStep: (step: number) => void;
  existingAccountNumberMasked?: string;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
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

export const Step8ReviewSubmit: React.FC<Props> = ({
  detail, documents, completionPercent, missingItems, onEditStep, existingAccountNumberMasked, onSubmit, isSubmitting,
}) => {
  const { getValues } = useFormContext<EmployeeOnboardingFormValues>();
  const values = getValues();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirmSubmit = async () => {
    await onSubmit();
    setIsConfirmOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">Onboarding Completion: {completionPercent}%</p>
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
        <SectionHeader title="Personal Details" step={1} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="First Name" value={values.step1.first_name} />
          <Field label="Last Name" value={values.step1.last_name} />
          <Field label="Personal Email" value={values.step1.personal_email} />
          <Field label="Mobile Number" value={values.step1.mobile_number} />
          <Field label="Date of Birth" value={values.step1.date_of_birth} />
          <Field label="Gender" value={values.step1.gender} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Address" step={2} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Current Address" value={values.step2.current_address} />
          <Field label="City" value={values.step2.city} />
          <Field label="State" value={values.step2.state} />
          <Field label="Country" value={values.step2.country} />
          <Field label="PIN Code" value={values.step2.pin_code} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Employment Details" step={3} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Employee ID" value={detail.employee_code} />
          <Field label="Department" value={detail.department} />
          <Field label="Designation" value={detail.designation} />
          <Field label="Reporting Manager" value={detail.reporting_manager_name} />
          <Field label="Joining Date" value={detail.joining_date} />
          <Field label="Employment Type" value={detail.employment_type_display} />
          <Field label="Work Location" value={detail.work_location} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Statutory Details" step={4} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="PAN Number" value={values.step4.pan} />
          <Field label="Aadhaar Number" value={values.step4.aadhaar_number} />
          <Field label="UAN Number" value={values.step4.uan_number} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Bank Details" step={5} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Account Holder" value={values.step5.account_holder_name} />
          <Field label="Bank Name" value={values.step5.bank_name} />
          <Field
            label="Account Number"
            value={
              values.step5.account_number
                ? `XXXXXX${values.step5.account_number.slice(-4)}`
                : existingAccountNumberMasked || ''
            }
          />
          <Field label="IFSC Code" value={values.step5.ifsc_code} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Emergency Contact" step={6} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Name" value={values.step6.contact_name} />
          <Field label="Number" value={values.step6.contact_number} />
          <Field label="Relationship" value={values.step6.relationship} />
        </div>
      </section>

      <section className="border-t pt-6">
        <SectionHeader title="Documents" step={7} onEdit={onEditStep} />
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

      <div className="border-t pt-6 flex justify-end">
        <Button
          className="!w-auto px-6"
          onClick={() => setIsConfirmOpen(true)}
          disabled={completionPercent < 100}
          isLoading={isSubmitting}
        >
          {detail.status === 'action_required' ? 'Resubmit' : 'Submit'}
        </Button>
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Confirm Submission"
        footer={
          <>
            <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsConfirmOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button className="!w-auto px-6" onClick={handleConfirmSubmit} isLoading={isSubmitting}>
              Submit
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">Are you sure you want to submit your employee onboarding information?</p>
      </Modal>
    </div>
  );
};
