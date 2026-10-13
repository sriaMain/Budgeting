import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '../../../components/Checkbox';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import type { VendorCommercialValues } from '../../../schemas/vendorOnboarding.schemas';
import type { Choice } from '../../../types/vendorOnboarding.types';
import { vendorFieldId } from '../vendorOnboardingForm';
import type { VendorWizard } from '../components/useVendorWizard';

const GRID = 'grid grid-cols-1 md:grid-cols-2 gap-x-6';

/** Keeps a legacy value selectable when it isn't one of the standard options. */
const withCurrent = (options: Choice[], current: string): Choice[] =>
  current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current.replace(/_/g, ' ') }] : options;

/** Step 5 - contract dates, order currency, payment terms, billing and withholding; ERP settings (internal). */
export const CommercialStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, editable, internal, choices } = wiz;
  const c = values.commercial;

  const text = (key: keyof VendorCommercialValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <InputField
      id={vendorFieldId(`commercial.${key}`)}
      label={label}
      value={String(c[key] ?? '')}
      onChange={(e) => patch('commercial', { [key]: e.target.value })}
      error={errors[`commercial.${key}`]}
      {...props}
    />
  );
  const select = (key: keyof VendorCommercialValues, label: string, options: Choice[], placeholder: string) => (
    <SelectField
      id={vendorFieldId(`commercial.${key}`)}
      label={label}
      options={withCurrent(options, String(c[key] ?? ''))}
      placeholder={placeholder}
      value={String(c[key] ?? '')}
      onChange={(e) => patch('commercial', { [key]: e.target.value })}
      error={errors[`commercial.${key}`]}
    />
  );
  const check = (key: 'withholding_tax_applicable' | 'gr_based_invoice_verification' | 'check_double_invoice', label: string) => (
    <Checkbox id={vendorFieldId(`commercial.${key}`)} label={label} checked={c[key]} onChange={(e) => patch('commercial', { [key]: e.target.checked })} />
  );

  return (
    <fieldset disabled={!editable} className="min-w-0 space-y-5">
      <FormSection title="Contract">
        <div className={GRID}>
          {text('contract_number', 'Contract number')}
          {text('po_number', 'PO number', { placeholder: 'Reference PO, if already issued' })}
          {text('contract_start_date', 'Contract start date *', { type: 'date' })}
          {text('contract_end_date', 'Contract end date *', { type: 'date', min: c.contract_start_date || undefined })}
        </div>
      </FormSection>

      <FormSection title="Commercial terms">
        <div className={GRID}>
          <div>
            {select('order_currency', 'Order currency *', choices?.onboarding_currencies ?? [], 'Select currency')}
            {wiz.currencyNotice}
          </div>
          {select('payment_terms', 'Payment terms *', choices?.payment_terms ?? [], 'Select payment terms')}
          {c.payment_terms === 'custom' && text('custom_payment_terms', 'Custom payment terms *', { placeholder: 'e.g. 50% advance, 50% on delivery' })}
          {select('billing_frequency', 'Billing frequency *', choices?.billing_frequencies ?? [], 'Select billing frequency')}
          {text('service_rate', `Rate${c.order_currency ? ` (${c.order_currency})` : ''}`, { type: 'number', step: '0.01', min: 0, inputMode: 'decimal' })}
          {text('rate_unit', 'Rate unit', { placeholder: 'e.g. per hour, per month' })}
        </div>
      </FormSection>

      <FormSection title="Tax / withholding">
        <div className="mb-4">{check('withholding_tax_applicable', 'Withholding tax applies')}</div>
        <div className={GRID}>
          {c.withholding_tax_applicable && text('withholding_tax_percentage', 'Withholding tax % *', { type: 'number', step: '0.01', min: 0, max: 100 })}
          {text('tax_remarks', 'Tax remarks', { placeholder: 'e.g. TDS section, treaty rate' })}
        </div>
      </FormSection>

      {internal && (
        <details className="group rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Procurement / ERP settings</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Optional, internal only - account group, purchasing org, incoterms, reconciliation.</span>
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 sm:px-5">
            <div className={GRID}>
              {text('account_group', 'Account group')}
              {text('purchasing_org', 'Purchasing organization')}
              {text('grouping_key', 'Grouping key')}
              {text('partner_category', 'Partner category')}
              {text('incoterms_1', 'Incoterms')}
              {text('incoterms_2', 'Incoterms location')}
              {text('reconciliation_account', 'Reconciliation account')}
              {text('schema_group', 'Schema group for suppliers')}
            </div>
            <div className="flex flex-col gap-3">
              {check('gr_based_invoice_verification', 'GR-based invoice verification')}
              {check('check_double_invoice', 'Check double invoice')}
            </div>
          </div>
        </details>
      )}
    </fieldset>
  );
};
