import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import type { Choice } from '../../../types/employeeOnboarding.types';
import type { AdminOnboardingFormValues } from '../AdminFillOnboardingPage';

interface ManagerOption {
  id: number | string;
  first_name?: string;
  last_name?: string;
}

interface Props {
  employmentTypeOptions: Choice[];
  managerOptions: ManagerOption[];
  currentAccountId: number;
}

export const AdminStep3EmploymentDetails: React.FC<Props> = ({ employmentTypeOptions, managerOptions, currentAccountId }) => {
  const { register, formState: { errors } } = useFormContext<AdminOnboardingFormValues>();

  const managerChoices: Choice[] = managerOptions
    .filter((m) => String(m.id) !== String(currentAccountId))
    .map((m) => ({ value: String(m.id), label: `${m.first_name || ''} ${m.last_name || ''}`.trim() || `User #${m.id}` }));

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Employment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Employee ID" {...register('step3.employee_code')} error={errors.step3?.employee_code?.message} />
          <InputField label="Department" {...register('step3.department')} error={errors.step3?.department?.message} />
          <InputField label="Designation / Position" {...register('step3.designation')} error={errors.step3?.designation?.message} />
          <SelectField
            label="Reporting Manager"
            options={managerChoices}
            placeholder="Select reporting manager"
            {...register('step3.reporting_manager')}
            error={errors.step3?.reporting_manager?.message}
          />
          <InputField label="Joining Date" type="date" {...register('step3.joining_date')} error={errors.step3?.joining_date?.message} />
          <SelectField
            label="Employment Type"
            options={employmentTypeOptions}
            placeholder="Select employment type"
            {...register('step3.employment_type')}
            error={errors.step3?.employment_type?.message}
          />
          <InputField label="Work Location" {...register('step3.work_location')} error={errors.step3?.work_location?.message} />
        </div>
        <label className="flex items-center gap-2 mt-2 text-sm text-gray-700">
          <input type="checkbox" {...register('step3.pf_applicable')} className="rounded border-gray-300" />
          PF Applicable (makes UAN mandatory for the employee)
        </label>
      </section>
    </div>
  );
};
