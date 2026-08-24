import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';

interface Props {
  existingAccountNumberMasked?: string;
}

export const Step5BankDetails: React.FC<Props> = ({ existingAccountNumberMasked }) => {
  const { register, formState: { errors } } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Account Holder Name *" {...register('step5.account_holder_name')} error={errors.step5?.account_holder_name?.message} />
          <InputField label="Bank Name *" {...register('step5.bank_name')} error={errors.step5?.bank_name?.message} />
          <InputField
            label="Account Number *"
            {...register('step5.account_number')}
            error={errors.step5?.account_number?.message}
            placeholder={existingAccountNumberMasked ? `On file: ${existingAccountNumberMasked}` : undefined}
          />
          <InputField label="IFSC Code *" {...register('step5.ifsc_code')} error={errors.step5?.ifsc_code?.message} />
        </div>
        {existingAccountNumberMasked && (
          <p className="text-xs text-gray-500 mt-1">
            An account number is already on file ({existingAccountNumberMasked}). Leave this blank to keep it, or enter a new one to replace it.
          </p>
        )}
      </section>
    </div>
  );
};
