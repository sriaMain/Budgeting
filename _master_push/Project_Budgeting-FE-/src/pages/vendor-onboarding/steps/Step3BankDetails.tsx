import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { vendorJurisdiction, type VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';

interface Props {
  existingAccountNumberMasked?: string;
}

const SECTION_TITLE = 'text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300';

/** Step 3 - Banking. Indian vendors give an IFSC; overseas vendors a SWIFT and/or IBAN. */
export const Step3BankDetails: React.FC<Props> = ({ existingAccountNumberMasked }) => {
  const { register, watch, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const indian = vendorJurisdiction(watch('step1.country'), watch('step2.country_of_tax_residence')) === 'Indian';
  const e = errors.step3;

  return (
    <div className="space-y-8">
      <section>
        <h3 className={SECTION_TITLE}>Bank Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Bank Name *" {...register('step3.bank_name')} error={e?.bank_name?.message} />
          <InputField label="Account Holder Name *" {...register('step3.account_holder_name')} error={e?.account_holder_name?.message} />
          <InputField
            label="Account Number *"
            placeholder={existingAccountNumberMasked ? `On file: ${existingAccountNumberMasked} - leave blank to keep` : undefined}
            autoComplete="off"
            {...register('step3.account_number')}
            error={e?.account_number?.message}
          />
          {indian ? (
            <InputField label="IFSC *" {...register('step3.ifsc_code')} error={e?.ifsc_code?.message} placeholder="e.g. HDFC0001234" />
          ) : (
            <InputField label="SWIFT / BIC" {...register('step3.swift_code')} error={e?.swift_code?.message} />
          )}
          {!indian && <InputField label="IBAN" {...register('step3.iban')} error={e?.iban?.message} />}
          {!indian && <InputField label="Bank Country *" {...register('step3.bank_country')} error={e?.bank_country?.message} />}
          <InputField label="Branch" {...register('step3.branch')} />
          {!indian && <InputField label="Bank Address" {...register('step3.bank_address')} />}
        </div>
        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
          {indian ? '' : 'Provide at least a SWIFT code or an IBAN. '}
          Account numbers are stored masked (e.g. XXXXXX4821) and never shown in full in vendor lists.
        </p>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Additional Bank Details (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Bank ID" {...register('step3.bank_id')} />
          <InputField label="Bank Country Key" {...register('step3.bank_country_key')} />
          <InputField label="Bank Control Key" {...register('step3.bank_control_key')} />
          <InputField label="Region" {...register('step3.region')} />
          <InputField label="Street" {...register('step3.street')} />
          <InputField label="City" {...register('step3.city')} />
        </div>
      </section>
    </div>
  );
};
