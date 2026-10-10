import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { Checkbox } from '../../../components/Checkbox';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { Choice } from '../../../types/vendorOnboarding.types';

interface Props {
  currencyOptions: Choice[];
  paymentTermOptions?: Choice[];
  billingFrequencyOptions?: Choice[];
}

const SECTION_TITLE = 'text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300';

/** Keeps a legacy free-text value selectable when it isn't one of the standard options. */
const withCurrent = (options: Choice[], current: string): Choice[] =>
  current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current }] : options;

/** Step 4 - Contract / commercial terms (plus the existing optional procurement settings). */
export const Step4BusinessProcurement: React.FC<Props> = ({ currencyOptions, paymentTermOptions = [], billingFrequencyOptions = [] }) => {
  const { register, watch, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const paymentTerms = watch('step4.payment_terms');
  const currency = watch('step4.order_currency');
  const withholding = watch('step4.withholding_tax_applicable');
  const e = errors.step4;

  return (
    <div className="space-y-8">
      <section>
        <h3 className={SECTION_TITLE}>Contract</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Contract Number" {...register('step4.contract_number')} error={e?.contract_number?.message} />
          <InputField label="PO Number" {...register('step4.po_number')} error={e?.po_number?.message} placeholder="Reference PO, if already issued" />
          <InputField label="Contract Start Date *" type="date" {...register('step4.contract_start_date')} error={e?.contract_start_date?.message} />
          <InputField label="Contract End Date *" type="date" {...register('step4.contract_end_date')} error={e?.contract_end_date?.message} />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Commercial Terms</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField
            label="Currency *"
            options={withCurrent(currencyOptions, currency)}
            placeholder="Select currency"
            {...register('step4.order_currency')}
            error={e?.order_currency?.message}
          />
          <SelectField
            label="Payment Terms *"
            options={withCurrent(paymentTermOptions, paymentTerms)}
            placeholder="Select payment terms"
            {...register('step4.payment_terms')}
            error={e?.payment_terms?.message}
          />
          {paymentTerms === 'custom' && (
            <InputField label="Custom Payment Terms *" {...register('step4.custom_payment_terms')} error={e?.custom_payment_terms?.message} />
          )}
          <SelectField
            label="Billing Frequency *"
            options={billingFrequencyOptions}
            placeholder="Select billing frequency"
            {...register('step4.billing_frequency')}
            error={e?.billing_frequency?.message}
          />
          <InputField label="Service / Contract Rate" type="number" step="0.01" min="0" {...register('step4.service_rate')} error={e?.service_rate?.message} />
          <InputField label="Rate Unit" {...register('step4.rate_unit')} placeholder="e.g. per hour, per month" />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Tax / Withholding</h3>
        <Checkbox label="Withholding tax applicable" {...register('step4.withholding_tax_applicable')} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 mt-4">
          {withholding && (
            <InputField label="Withholding Tax % *" type="number" step="0.01" min="0" max="100" {...register('step4.withholding_tax_percentage')} error={e?.withholding_tax_percentage?.message} />
          )}
          <InputField label="Tax Remarks" {...register('step4.tax_remarks')} placeholder="e.g. TDS section, treaty rate" />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Procurement Settings (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Account Group" {...register('step4.account_group')} />
          <InputField label="Purchasing Organization" {...register('step4.purchasing_org')} />
          <InputField label="Grouping Key" {...register('step4.grouping_key')} />
          <InputField label="Partner Category" {...register('step4.partner_category')} />
          <InputField label="Incoterms Location 1" {...register('step4.incoterms_1')} />
          <InputField label="Incoterms Location 2" {...register('step4.incoterms_2')} />
          <InputField label="Reconciliation Account" {...register('step4.reconciliation_account')} />
          <InputField label="Schema Group for Suppliers" {...register('step4.schema_group')} />
        </div>
        <div className="flex flex-col gap-3 mt-2">
          <Checkbox label="GR-Based Invoice Verification" {...register('step4.gr_based_invoice_verification')} />
          <Checkbox label="Check Double Invoice" {...register('step4.check_double_invoice')} />
        </div>
      </section>
    </div>
  );
};
