import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';

interface Props {
  pfApplicable: boolean;
}

export const Step4StatutoryDetails: React.FC<Props> = ({ pfApplicable }) => {
  const { register, formState: { errors } } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Statutory Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="PAN Number *" {...register('step4.pan')} error={errors.step4?.pan?.message} placeholder="AAAAA9999A" />
          <InputField label="Aadhaar Number *" {...register('step4.aadhaar_number')} error={errors.step4?.aadhaar_number?.message} placeholder="12-digit number" />
          <InputField
            label={pfApplicable ? 'UAN Number *' : 'UAN Number'}
            {...register('step4.uan_number')}
            error={errors.step4?.uan_number?.message}
          />
          <InputField label="TAN" {...register('step4.tan')} />
          <InputField label="ESIC Number" {...register('step4.esic_number')} />
        </div>
        {!pfApplicable && (
          <p className="text-xs text-gray-500 mt-1">UAN is optional since PF is not marked as applicable for this employee.</p>
        )}
      </section>
    </div>
  );
};
