import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';

export const Step2Address: React.FC = () => {
  const { register, formState: { errors } } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Current Address</h3>
        <div>
          <label className="block text-base font-medium text-gray-900 mb-2">Current Address *</label>
          <textarea
            {...register('step2.current_address')}
            rows={3}
            className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all"
          />
          {errors.step2?.current_address?.message && (
            <p className="mt-1.5 text-sm text-red-600">{errors.step2.current_address.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 mt-2">
          <InputField label="City *" {...register('step2.city')} error={errors.step2?.city?.message} />
          <InputField label="State *" {...register('step2.state')} error={errors.step2?.state?.message} />
          <InputField label="Country *" {...register('step2.country')} error={errors.step2?.country?.message} />
          <InputField label="PIN Code *" {...register('step2.pin_code')} error={errors.step2?.pin_code?.message} />
        </div>
      </section>
    </div>
  );
};
