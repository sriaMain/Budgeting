import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Edit2 } from 'lucide-react';
import type { AdminOnboardingFormValues } from '../AdminFillOnboardingPage';
import type { EmployeeDocument, EmployeeOnboardingDetail } from '../../../types/employeeOnboarding.types';

interface Props {
  detail: EmployeeOnboardingDetail;
  documents: EmployeeDocument[];
  onEditStep: (step: number) => void;
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

export const AdminStep8Review: React.FC<Props> = ({ detail, documents, onEditStep }) => {
  const { getValues } = useFormContext<AdminOnboardingFormValues>();
  const values = getValues();

  return (
    <div className="space-y-8">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          This is everything filled in so far on <strong>{detail.account.display_name}</strong>'s behalf. It's saved
          as you go, so you can leave and come back anytime from Manage Users. The employee will fill in anything
          left blank and submit it themselves using the secure link they were emailed.
        </p>
      </div>

      <section className="border-t pt-6">
        <SectionHeader title="Personal Details" step={1} onEdit={onEditStep} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="First Name" value={detail.account.first_name} />
          <Field label="Last Name" value={detail.account.last_name} />
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
          <Field label="Employee ID" value={values.step3.employee_code} />
          <Field label="Department" value={values.step3.department} />
          <Field label="Designation" value={values.step3.designation} />
          <Field label="Joining Date" value={values.step3.joining_date} />
          <Field label="Employment Type" value={values.step3.employment_type} />
          <Field label="Work Location" value={values.step3.work_location} />
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
    </div>
  );
};
