import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';

interface Props {
  existingAccountNumberMasked?: string;
}

export const Step3BankDetails: React.FC<Props> = ({ existingAccountNumberMasked }) => {
  const { register, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Bank Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Bank Name *" {...register('step3.bank_name')} error={errors.step3?.bank_name?.message} />
          <InputField label="Account Holder Name *" {...register('step3.account_holder_name')} error={errors.step3?.account_holder_name?.message} />
          <InputField
            label={existingAccountNumberMasked ? `Account Number * (on file: ${existingAccountNumberMasked})` : 'Account Number *'}
            placeholder={existingAccountNumberMasked ? 'Leave blank to keep the number on file' : undefined}
            {...register('step3.account_number')}
            error={errors.step3?.account_number?.message}
          />
          <InputField label="IFSC Code *" {...register('step3.ifsc_code')} error={errors.step3?.ifsc_code?.message} />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Account numbers are masked everywhere in the app except to explicitly authorized users.
        </p>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Additional Bank Details (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Bank ID" {...register('step3.bank_id')} />
          <InputField label="Bank Country Key" {...register('step3.bank_country_key')} />
          <InputField label="Bank Control Key" {...register('step3.bank_control_key')} />
          <InputField label="Branch" {...register('step3.branch')} />
          <InputField label="Region" {...register('step3.region')} />
          <InputField label="Street" {...register('step3.street')} />
          <InputField label="City" {...register('step3.city')} />
        </div>
      </section>
    </div>
  );
};
