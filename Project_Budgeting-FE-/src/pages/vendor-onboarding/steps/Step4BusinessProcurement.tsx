import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { Checkbox } from '../../../components/Checkbox';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { Choice } from '../../../types/vendorOnboarding.types';

interface Props {
  currencyOptions: Choice[];
}

export const Step4BusinessProcurement: React.FC<Props> = ({ currencyOptions }) => {
  const { register, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Procurement Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Account Group *" {...register('step4.account_group')} error={errors.step4?.account_group?.message} />
          <InputField label="Purchasing Organization *" {...register('step4.purchasing_org')} error={errors.step4?.purchasing_org?.message} />
          <InputField label="Payment Terms *" {...register('step4.payment_terms')} error={errors.step4?.payment_terms?.message} />
          <SelectField
            label="Order Currency *"
            options={currencyOptions}
            placeholder="Select currency"
            {...register('step4.order_currency')}
            error={errors.step4?.order_currency?.message}
          />
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Additional Details (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Grouping Key" {...register('step4.grouping_key')} />
          <InputField label="Partner Category" {...register('step4.partner_category')} />
          <InputField label="Incoterms Location 1" {...register('step4.incoterms_1')} />
          <InputField label="Incoterms Location 2" {...register('step4.incoterms_2')} />
          <InputField label="Reconciliation Account" {...register('step4.reconciliation_account')} />
          <InputField label="Schema Group for Suppliers" {...register('step4.schema_group')} />
        </div>
        <div className="flex flex-col gap-3 mt-4">
          <Checkbox label="GR-Based Invoice Verification" {...register('step4.gr_based_invoice_verification')} />
          <Checkbox label="Check Double Invoice" {...register('step4.check_double_invoice')} />
        </div>
      </section>
    </div>
  );
};
