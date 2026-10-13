import React from 'react';
import { InputField } from '../../../components/InputField';
import { CountrySelect } from '../../../components/onboarding/CountrySelect';
import { FieldShell } from '../../../components/onboarding/FieldShell';
import { PhoneInput } from '../../../components/onboarding/PhoneInput';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '../../../components/onboarding/fieldStyles';
import { INDIVIDUAL_VENDOR_TYPES } from '../../../schemas/vendorOnboarding.schemas';
import { choiceLabel, vendorFieldId } from '../vendorOnboardingForm';
import type { VendorWizard } from '../components/useVendorWizard';
import { VendorMasterFields } from '../components/VendorMasterFields';

const GRID = 'grid grid-cols-1 md:grid-cols-2 gap-x-6';

/** Step 1 - who the vendor is, where it is based and how to reach it. */
export const BasicInfoStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, choices, internal, editable } = wiz;
  const b = values.basic;
  const individual = INDIVIDUAL_VENDOR_TYPES.includes(b.vendor_type);
  const vendorTypes = choices?.vendor_types ?? [];
  const typeGroups = [
    { label: 'Individual', options: vendorTypes.filter((t) => INDIVIDUAL_VENDOR_TYPES.includes(t.value)) },
    { label: 'Business', options: vendorTypes.filter((t) => !INDIVIDUAL_VENDOR_TYPES.includes(t.value)) },
  ];
  const showNameParts = individual || !!b.middle_name || !!b.last_name;
  const field = (key: keyof typeof b) => ({
    id: vendorFieldId(`basic.${key}`),
    value: String(b[key] ?? ''),
    error: errors[`basic.${key}`],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => patch('basic', { [key]: e.target.value }),
  });

  return (
    <div className="space-y-5">
    <fieldset disabled={!editable} className="min-w-0 space-y-5">
      <FormSection title="Legal identity" description="As registered with the tax / company authorities.">
        <div className={GRID}>
          <FieldShell label="Vendor type" htmlFor={vendorFieldId('basic.vendor_type')} required error={errors['basic.vendor_type']}
            hint={internal ? 'Individuals give a personal tax ID and government ID; businesses their registration documents.' : undefined}>
            {internal ? (
              <select
                id={vendorFieldId('basic.vendor_type')}
                value={b.vendor_type}
                onChange={(e) => patch('basic', { vendor_type: e.target.value })}
                aria-invalid={!!errors['basic.vendor_type']}
                className={`${INPUT_CLASS} ${errors['basic.vendor_type'] ? INPUT_ERROR_CLASS : ''}`}
              >
                <option value="">Select vendor type</option>
                {typeGroups.map((g) => g.options.length > 0 && (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            ) : (
              <p className="py-2.5 text-sm text-gray-900 dark:text-gray-100">
                {choiceLabel(vendorTypes, b.vendor_type) || '—'}
                <span className="block text-xs text-gray-500 dark:text-gray-400">Set by the team that invited you - contact them to change it.</span>
              </p>
            )}
          </FieldShell>
          <CountrySelect
            id={vendorFieldId('basic.country')}
            label="Country"
            required
            value={b.country}
            onChange={(name) => wiz.changeCountry(name)}
            error={errors['basic.country']}
            showCurrency
            hint="Drives the tax, address, phone and bank rules on the next steps."
          />
        </div>
        {showNameParts ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
            <InputField label={individual ? 'First name *' : 'Legal name *'} placeholder="First name" {...field('first_name')} />
            <InputField label="Middle name" {...field('middle_name')} />
            <InputField label="Last name" {...field('last_name')} />
          </div>
        ) : (
          <InputField label="Legal entity name *" placeholder="e.g. Acme Technologies Private Limited" {...field('first_name')} />
        )}
        <InputField label="Service category *" placeholder="e.g. QA & test engineering" {...field('service_category')} />
      </FormSection>

      <FormSection title="Primary contact">
        <div className={GRID}>
          <InputField label="Contact person *" autoComplete="name" {...field('contact_person_name')} />
          <InputField label="Designation" {...field('contact_person_designation')} />
          {internal ? (
            <InputField label="Contact email *" type="email" autoComplete="email" placeholder="onboarding@vendor.com" {...field('email')} />
          ) : (
            <FieldShell label="Contact email" hint="Onboarding emails go here - ask the inviting team to change it.">
              <p className="py-2.5 text-sm text-gray-900 break-all dark:text-gray-100">{b.email || '—'}</p>
            </FieldShell>
          )}
          <PhoneInput
            id={vendorFieldId('basic.phone')}
            label="Phone"
            value={b.phone}
            onChange={(phone) => patch('basic', { phone })}
            defaultCountry={b.country}
            error={errors['basic.phone']}
          />
        </div>
      </FormSection>

      <FormSection title="Finance contact" description="Optional - who handles invoices and payments.">
        <div className={GRID}>
          <InputField label="Finance manager name" {...field('finance_manager_name')} />
          <InputField label="Finance manager email" type="email" {...field('finance_manager_email')} />
          <PhoneInput
            id={vendorFieldId('basic.finance_manager_mobile')}
            label="Finance manager mobile"
            value={b.finance_manager_mobile}
            onChange={(v) => patch('basic', { finance_manager_mobile: v })}
            defaultCountry={b.country}
            error={errors['basic.finance_manager_mobile']}
          />
        </div>
      </FormSection>

      <FormSection title="About the vendor" description="Optional introduction - services, team, references.">
        <textarea
          id={vendorFieldId('basic.vendor_introduction')}
          rows={3}
          value={b.vendor_introduction}
          onChange={(e) => patch('basic', { vendor_introduction: e.target.value })}
          className={INPUT_CLASS}
        />
      </FormSection>

      {internal && (
        <FormSection title="Internal references" description="Internal only - never shown to the vendor. Company code and plant select the approval chain.">
          <div className={GRID}>
            <InputField label="Company code" {...field('company_code')} />
            <InputField label="Plant" {...field('plant')} />
            <InputField label="Internal requester" {...field('internal_requester')} />
          </div>
          <FieldShell label="Internal comments" htmlFor={vendorFieldId('basic.initial_comments')}>
            <textarea
              id={vendorFieldId('basic.initial_comments')}
              rows={2}
              value={b.initial_comments}
              onChange={(e) => patch('basic', { initial_comments: e.target.value })}
              className={INPUT_CLASS}
            />
          </FieldShell>
        </FormSection>
      )}
    </fieldset>
    {internal && <VendorMasterFields wiz={wiz} />}
    </div>
  );
};
