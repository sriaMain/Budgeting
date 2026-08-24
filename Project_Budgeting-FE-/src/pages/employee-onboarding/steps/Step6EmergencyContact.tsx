import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';

export const Step6EmergencyContact: React.FC = () => {
  const { register, formState: { errors } } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Emergency Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Emergency Contact Name *" {...register('step6.contact_name')} error={errors.step6?.contact_name?.message} />
          <InputField label="Emergency Contact Number *" {...register('step6.contact_number')} error={errors.step6?.contact_number?.message} />
          <InputField label="Relationship *" {...register('step6.relationship')} error={errors.step6?.relationship?.message} />
        </div>
      </section>
    </div>
  );
};
