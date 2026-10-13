import React from 'react';
import { Info } from 'lucide-react';
import { Checkbox } from '../../../components/Checkbox';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { CountrySelect } from '../../../components/onboarding/CountrySelect';
import { FieldShell } from '../../../components/onboarding/FieldShell';
import { PhoneInput } from '../../../components/onboarding/PhoneInput';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '../../../components/onboarding/fieldStyles';
import { INCORPORATED_VENDOR_TYPES, type VendorKycValues } from '../../../schemas/vendorOnboarding.schemas';
import { todayIso } from '../../../utils/documentStatus';
import { vendorFieldId } from '../vendorOnboardingForm';
import { KycReviewPanel } from '../components/ReviewerPanels';
import type { VendorWizard } from '../components/useVendorWizard';

const GRID = 'grid grid-cols-1 md:grid-cols-2 gap-x-6';

/** Step 2 - India keeps PAN / GST / CIN-LLPIN / TAN / EPF / ESIC / UDYAM; every other country gets
 * its own tax identifier (label, format and example from the country's rules). */
export const IdentityKycStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, indian, entity, editable, taxConfig, countryConfig } = wiz;
  const k = values.kyc;
  const vendorType = values.basic.vendor_type;
  const business = entity === 'business';
  const incorporated = INCORPORATED_VENDOR_TYPES.includes(vendorType);
  const msmeCategories = wiz.choices?.msme_categories ?? [];

  const text = (key: keyof VendorKycValues, label: string, opts: { upper?: boolean; placeholder?: string; hint?: string; maxLength?: number } = {}) => (
    <div>
      <InputField
        id={vendorFieldId(`kyc.${key}`)}
        label={label}
        value={String(k[key] ?? '')}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        autoComplete="off"
        className={opts.upper ? 'uppercase' : ''}
        onChange={(e) => patch('kyc', { [key]: opts.upper ? e.target.value.toUpperCase() : e.target.value })}
        error={errors[`kyc.${key}`]}
      />
      {opts.hint && !errors[`kyc.${key}`] && <p className="-mt-4 mb-5 text-xs text-gray-500 dark:text-gray-400">{opts.hint}</p>}
    </div>
  );
  const date = (key: 'incorporation_date', label: string) => (
    <InputField id={vendorFieldId(`kyc.${key}`)} label={label} type="date" max={todayIso()} value={k[key]}
      onChange={(e) => patch('kyc', { [key]: e.target.value })} error={errors[`kyc.${key}`]} />
  );
  const boDetails = (required: boolean) => (
    <FormSection
      title="Beneficial ownership"
      description={required
        ? 'People who own or control 25% or more (name, country, % held) - or upload a beneficial ownership document on the KYC Documents step.'
        : 'Optional - owners holding 10% or more, where applicable.'}
    >
      <FieldShell label="Beneficial owners" htmlFor={vendorFieldId('kyc.beneficial_ownership_details')} required={required}
        error={errors['kyc.beneficial_ownership_details']}>
        <textarea
          id={vendorFieldId('kyc.beneficial_ownership_details')}
          rows={3}
          value={k.beneficial_ownership_details}
          onChange={(e) => patch('kyc', { beneficial_ownership_details: e.target.value })}
          className={`${INPUT_CLASS} ${errors['kyc.beneficial_ownership_details'] ? INPUT_ERROR_CLASS : ''}`}
        />
      </FieldShell>
    </FormSection>
  );

  const taxRule = (taxConfig ?? countryConfig)?.tax[entity];

  return (
    <div className="space-y-5">
      <fieldset disabled={!editable} className="min-w-0 space-y-5">
        <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" />
          {indian
            ? 'Indian statutory details. Identifiers are checked for format here and verified by our team against the uploaded documents.'
            : `Tax details for ${values.basic.country || 'the vendor\'s country'} - fields follow that country's rules.`}
        </p>

        {indian ? (
          <>
            <FormSection title="Tax registration">
              <div className={GRID}>
                {text('pan', 'PAN *', { upper: true, placeholder: 'ABCDE1234F', maxLength: 10, hint: '10 characters - the 4th letter shows the holder type (C company, F firm / LLP, P individual).' })}
                <div className="mb-5 md:pt-7">
                  <Checkbox
                    id={vendorFieldId('kyc.gst_registered')}
                    label="Registered under GST"
                    checked={k.gst_registered}
                    onChange={(e) => patch('kyc', { gst_registered: e.target.checked })}
                  />
                </div>
                {k.gst_registered && text('gstin', 'GSTIN *', { upper: true, placeholder: '22AAAAA0000A1Z5', maxLength: 15, hint: 'Characters 3-12 are the PAN.' })}
              </div>
            </FormSection>

            {business && (
              <FormSection title={incorporated ? 'Incorporation' : 'Registration'} description={incorporated ? undefined : 'Optional - firm, trust or society registration.'}>
                <div className={GRID}>
                  {incorporated
                    ? text('cin', vendorType === 'company' ? 'CIN *' : 'LLPIN *', {
                        upper: true,
                        placeholder: vendorType === 'company' ? 'U72900KA2015PTC082988' : 'AAB-1234',
                        maxLength: 21,
                        hint: vendorType === 'company' ? '21-character Corporate Identification Number.' : 'LLP Identification Number (a CIN is accepted too).',
                      })
                    : text('registration_number', 'Registration number')}
                  {incorporated && date('incorporation_date', 'Date of incorporation *')}
                </div>
              </FormSection>
            )}

            <FormSection title="Statutory registrations" description="Fill in what applies - each one adds its certificate to the required documents.">
              <div className={GRID}>
                {text('tan', 'TAN', { upper: true, placeholder: 'ABCD12345E', maxLength: 10 })}
                {k.tan.trim() ? (
                  <PhoneInput
                    id={vendorFieldId('kyc.tan_mobile')}
                    label="Mobile linked to the TAN"
                    required
                    value={k.tan_mobile}
                    onChange={(v) => patch('kyc', { tan_mobile: v })}
                    defaultCountry="IN"
                    error={errors['kyc.tan_mobile']}
                  />
                ) : <div className="hidden md:block" />}
                {text('epf_number', 'EPF establishment code', { upper: true })}
                {text('esic_number', 'ESIC code', { upper: true })}
                {k.esic_number.trim() && text('esic_district', 'ESIC district')}
              </div>
              <div className="mb-4">
                <Checkbox
                  id={vendorFieldId('kyc.msme_registered')}
                  label="MSME registered (UDYAM)"
                  checked={k.msme_registered}
                  onChange={(e) => patch('kyc', { msme_registered: e.target.checked })}
                />
              </div>
              {k.msme_registered && (
                <div className={GRID}>
                  {text('udyam_number', 'UDYAM registration number *', { upper: true, placeholder: 'UDYAM-MH-01-0000001' })}
                  <SelectField
                    id={vendorFieldId('kyc.msme_category')}
                    label="MSME category *"
                    options={msmeCategories}
                    placeholder="Select category"
                    value={k.msme_category}
                    onChange={(e) => patch('kyc', { msme_category: e.target.value })}
                    error={errors['kyc.msme_category']}
                  />
                </div>
              )}
            </FormSection>
            {business && boDetails(false)}
          </>
        ) : (
          <>
            <FormSection title="Tax identification">
              <div className={GRID}>
                <CountrySelect
                  id={vendorFieldId('kyc.country_of_tax_residence')}
                  label="Country of tax residence"
                  required
                  value={k.country_of_tax_residence}
                  onChange={(name) => patch('kyc', { country_of_tax_residence: name, tax_id: '' })}
                  error={errors['kyc.country_of_tax_residence']}
                />
                {text('tax_id', `${taxRule?.label || 'Tax identification number'}${taxRule?.required ? ' *' : ''}`, {
                  upper: true,
                  placeholder: taxRule?.example || undefined,
                  hint: [taxRule?.help, taxRule?.example ? `e.g. ${taxRule.example}` : ''].filter(Boolean).join(' '),
                })}
              </div>
            </FormSection>
            {business && (
              <FormSection title="Company registration" description="As shown on the registration document.">
                <div className={GRID}>
                  {text('registration_number', 'Company / business registration number')}
                  {date('incorporation_date', 'Date of incorporation / registration')}
                </div>
              </FormSection>
            )}
            {business && boDetails(true)}
          </>
        )}
      </fieldset>
      <KycReviewPanel wiz={wiz} />
    </div>
  );
};
