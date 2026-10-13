import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import { Checkbox } from '../../components/Checkbox';
import { FormSection } from '../../components/onboarding/OnboardingWizard';
import { CountrySelect } from '../../components/onboarding/CountrySelect';
import { PhoneInput } from '../../components/onboarding/PhoneInput';
import { AddressFields } from '../../components/onboarding/AddressFields';
import { BankDetailsFields } from '../../components/onboarding/BankDetailsFields';
import { FieldShell } from '../../components/onboarding/FieldShell';
import { INPUT_CLASS } from '../../components/onboarding/fieldStyles';
import type { AddressValue } from '../../components/onboarding/addressForm';
import type { BankFormValue } from '../../components/onboarding/bankForm';
import type { CountryConfig } from '../../services/countries';
import { addressErrorsFrom, bankErrorsFrom, isIndianCountry, type ClientFormState, type FieldErrors } from './clientForm';
import {
  BANKING_VERIFICATION_STATUS_OPTIONS,
  BILLING_FREQUENCY_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  INVOICE_REQUIREMENTS_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  type BankingVerificationStatus,
  type BillingFrequency,
  type ClientCurrency,
  type ClientType,
  type CompanyTag,
  type InvoiceRequirements,
  type PaymentTerms,
} from './clientTypes';

type SetField = <K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) => void;

interface StepBaseProps {
  form: ClientFormState;
  errors: FieldErrors;
  readOnly: boolean;
  setField: SetField;
}

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="-mt-3.5 mb-5 text-xs text-gray-500 dark:text-gray-400">{children}</p>
);

const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[84px]`;

/* ------------------------------------------------------------------ */
/* 1. Basic information                                                */
/* ------------------------------------------------------------------ */

interface BasicStepProps extends StepBaseProps {
  tags: CompanyTag[];
  onCountryChange: (name: string) => void;
  currencyNotice: React.ReactNode;
}

export const BasicStep: React.FC<BasicStepProps> = ({ form, errors, readOnly, setField, tags, onCountryChange, currencyNotice }) => {
  const individual = form.client_type === 'individual';
  const toggleTag = (id: number) =>
    setField('tags', form.tags.includes(id) ? form.tags.filter((t) => t !== id) : [...form.tags, id]);

  return (
    <div className="space-y-4">
      <FormSection title="Client" description="Legal identity and country. These details (plus email and phone) are all that's needed to save a draft.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="md:col-span-2">
            <InputField
              id="client-company_name"
              label={individual ? 'Full legal name *' : 'Legal name *'}
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
              error={errors.company_name}
              disabled={readOnly}
              maxLength={255}
              placeholder={individual ? 'As on the government ID' : 'As registered, e.g. Acme Technologies Pvt Ltd'}
            />
          </div>
          <SelectField
            id="client-client_type"
            label="Client type *"
            options={CLIENT_TYPE_OPTIONS}
            value={form.client_type}
            onChange={(e) => setField('client_type', e.target.value as ClientType)}
            error={errors.client_type}
            disabled={readOnly}
          />
          <CountrySelect
            id="client-country"
            label="Country"
            required
            value={form.country}
            onChange={(name) => onCountryChange(name)}
            error={errors.country}
            disabled={readOnly}
            showCurrency
          />
          <div>
            <SelectField
              id="client-currency"
              label="Billing currency *"
              options={CURRENCY_OPTIONS}
              value={form.currency}
              onChange={(e) => setField('currency', e.target.value as ClientCurrency)}
              error={errors.currency}
              disabled={readOnly}
            />
            {currencyNotice}
          </div>
        </div>
      </FormSection>

      <FormSection title="Contact" description="How to reach the client. The phone number is stored with its country dialing code.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {!individual && (
            <div className="md:col-span-2">
              <InputField
                id="client-contact_person"
                label="Contact person"
                value={form.contact_person}
                onChange={(e) => setField('contact_person', e.target.value)}
                error={errors.contact_person}
                disabled={readOnly}
                maxLength={150}
                placeholder="Primary contact at the client"
              />
            </div>
          )}
          <InputField
            id="client-email"
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            error={errors.email}
            disabled={readOnly}
            placeholder="contact@client.com"
            autoComplete="off"
          />
          <PhoneInput
            id="client-phone"
            label="Phone"
            required
            value={form.phone}
            onChange={(e164) => setField('phone', e164)}
            defaultCountry={form.country}
            error={errors.mobile_number || errors.country_code}
            disabled={readOnly}
          />
        </div>
      </FormSection>

      <FormSection title="Tags" description="Industry or segment tags (optional).">
        {tags.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No tags configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {tags.map((tag) => (
              <Checkbox
                key={tag.id}
                id={`client-tag-${tag.id}`}
                label={tag.name}
                checked={form.tags.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
                disabled={readOnly}
              />
            ))}
          </div>
        )}
        {errors.tags && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.tags}</p>}
      </FormSection>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 2. Identity & KYC                                                   */
/* ------------------------------------------------------------------ */

export interface IdentityVerificationSummary {
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  label: string;
  detail: string;
}

interface IdentityStepProps extends StepBaseProps {
  countryConfig: CountryConfig | null;
  verification: IdentityVerificationSummary;
}

export const IdentityStep: React.FC<IdentityStepProps> = ({ form, errors, readOnly, setField, countryConfig, verification }) => {
  const individual = form.client_type === 'individual';
  const indian = isIndianCountry(form.country);
  const registrationRequired = form.client_type === 'company' || form.client_type === 'government';
  const taxRule = countryConfig?.tax[individual ? 'individual' : 'business'];
  const toCode = (value: string, max: number) => value.toUpperCase().replace(/\s/g, '').slice(0, max);

  return (
    <div className="space-y-4">
      <FormSection
        title="Tax identity"
        description={
          indian
            ? 'Indian clients are identified by PAN, plus GSTIN when GST registered.'
            : form.country
              ? `The tax identifier issued in ${countryConfig?.name ?? form.country}.`
              : 'Select the client country on Basic Information first.'
        }
      >
        {indian ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div>
              <InputField
                id="client-pan"
                label="PAN *"
                value={form.pan}
                onChange={(e) => setField('pan', toCode(e.target.value, 10))}
                error={errors.pan}
                disabled={readOnly}
                placeholder="AAAAA9999A"
                autoComplete="off"
              />
              {!errors.pan && <Hint>10-character Permanent Account Number{individual ? '' : ' of the business'}.</Hint>}
            </div>
            <div>
              <InputField
                id="client-gstin"
                label="GSTIN"
                value={form.gstin}
                onChange={(e) => setField('gstin', toCode(e.target.value, 15))}
                error={errors.gstin}
                disabled={readOnly}
                placeholder="22AAAAA0000A1Z5"
                autoComplete="off"
              />
              {!errors.gstin && <Hint>Only when GST registered. Characters 3-12 of a GSTIN are the PAN.</Hint>}
            </div>
          </div>
        ) : form.country ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div>
              <InputField
                id="client-tax_id"
                label={`${taxRule?.label ?? 'Tax ID'}${taxRule?.required ? ' *' : ''}`}
                value={form.tax_id}
                onChange={(e) => setField('tax_id', e.target.value.toUpperCase().slice(0, 50))}
                error={errors.tax_id}
                disabled={readOnly}
                placeholder={taxRule?.example || ''}
                autoComplete="off"
              />
              {!errors.tax_id && (taxRule?.help || taxRule?.example) && (
                <Hint>{taxRule?.help || `e.g. ${taxRule?.example}`}</Hint>
              )}
            </div>
          </div>
        ) : null}
      </FormSection>

      {!individual && (
        <FormSection title="Registration & authorised signatory" description="The person who signs for the client must be named here; their photo ID goes in KYC Documents.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div className="md:col-span-2">
              <InputField
                id="client-registration_no"
                label={`${indian ? 'CIN / LLPIN / registration number' : 'Company registration number'}${registrationRequired ? ' *' : ''}`}
                value={form.registration_no}
                onChange={(e) => setField('registration_no', e.target.value.slice(0, 50))}
                error={errors.registration_no}
                disabled={readOnly}
                placeholder={indian ? 'e.g. U72900KA2015PTC012345' : 'Registry number'}
                autoComplete="off"
              />
            </div>
            <InputField
              id="client-authorised_signatory_name"
              label="Authorised signatory name *"
              value={form.authorised_signatory_name}
              onChange={(e) => setField('authorised_signatory_name', e.target.value)}
              error={errors.authorised_signatory_name}
              disabled={readOnly}
              maxLength={150}
              placeholder="Full name"
            />
            <InputField
              id="client-authorised_signatory_role"
              label="Signatory role"
              value={form.authorised_signatory_role}
              onChange={(e) => setField('authorised_signatory_role', e.target.value)}
              error={errors.authorised_signatory_role}
              disabled={readOnly}
              maxLength={100}
              placeholder="e.g. Director, CFO"
            />
          </div>
        </FormSection>
      )}

      <FormSection title="Identity verification" description="Read-only - set by a reviewer when the identity documents are verified.">
        <div className="flex items-start gap-2 text-sm">
          {verification.tone === 'ok' ? (
            <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <ShieldAlert className={`w-5 h-5 flex-shrink-0 ${verification.tone === 'bad' ? 'text-red-500' : verification.tone === 'warn' ? 'text-amber-500' : 'text-gray-400'}`} />
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{verification.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{verification.detail}</p>
          </div>
        </div>
      </FormSection>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 3. Address                                                          */
/* ------------------------------------------------------------------ */

interface AddressStepProps {
  form: ClientFormState;
  errors: FieldErrors;
  readOnly: boolean;
  patchAddress: (patch: Partial<AddressValue>) => void;
}

export const AddressStep: React.FC<AddressStepProps> = ({ form, errors, readOnly, patchAddress }) => (
  <FormSection
    title={form.client_type === 'individual' ? 'Residential address' : 'Registered address'}
    description={
      <>
        Country: <strong className="font-semibold text-gray-700 dark:text-gray-200">{form.country || 'not selected'}</strong> (change it on Basic Information).
        The postal code format and lookup follow the country.
      </>
    }
  >
    <AddressFields
      idPrefix="client-address"
      value={form.address}
      onChange={patchAddress}
      country={form.country}
      errors={addressErrorsFrom(errors)}
      required
      disabled={readOnly}
    />
  </FormSection>
);

/* ------------------------------------------------------------------ */
/* 4. Banking                                                          */
/* ------------------------------------------------------------------ */

interface BankingStepProps {
  form: ClientFormState;
  errors: FieldErrors;
  /** Bank fields are read-only (whole client read-only, or no client.banking.edit). */
  readOnly: boolean;
  noBankingPermission: boolean;
  patchBank: (patch: Partial<BankFormValue>) => void;
  maskedAccountNumber?: string;
  onRevealAccountNumber?: () => Promise<string | null>;
  /** Reviewer (client.document.verify) can set the verification status. */
  canVerify: boolean;
  verifyDisabled: boolean;
  onVerificationChange: (status: BankingVerificationStatus) => void;
}

export const BankingStep: React.FC<BankingStepProps> = ({
  form, errors, readOnly, noBankingPermission, patchBank, maskedAccountNumber, onRevealAccountNumber, canVerify, verifyDisabled, onVerificationChange,
}) => (
  <div className="space-y-4">
    <FormSection
      title="Bank account"
      description="The client's bank account (for refunds and payment matching). Changing it after verification sends it back for verification."
    >
      {noBankingPermission && (
        <p className="mb-4 text-xs rounded-md bg-gray-50 px-3 py-2 text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          You can view the bank details but not change them.
        </p>
      )}
      <BankDetailsFields
        idPrefix="client-bank"
        value={{ ...form.bank, bank_country: form.bank.bank_country || form.country }}
        onChange={patchBank}
        errors={bankErrorsFrom(errors)}
        disabled={readOnly}
        maskedAccountNumber={maskedAccountNumber || undefined}
        onRevealAccountNumber={onRevealAccountNumber}
        verificationStatus={form.banking_verification_status}
      />
    </FormSection>

    {canVerify && (
      <FormSection title="Bank verification (reviewer)" description="Mark the account verified only after checking it against the bank proof document.">
        <div className="max-w-sm">
          <SelectField
            id="client-banking_verification_status"
            label="Verification status"
            options={BANKING_VERIFICATION_STATUS_OPTIONS}
            value={form.banking_verification_status}
            onChange={(e) => onVerificationChange(e.target.value as BankingVerificationStatus)}
            error={errors.banking_verification_status}
            disabled={verifyDisabled}
          />
        </div>
      </FormSection>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* 5. Commercials                                                      */
/* ------------------------------------------------------------------ */

interface CommercialsStepProps extends StepBaseProps {
  noCommercialPermission: boolean;
}

export const CommercialsStep: React.FC<CommercialsStepProps> = ({ form, errors, readOnly, setField, noCommercialPermission }) => (
  <div className="space-y-4">
    {noCommercialPermission && (
      <p className="text-xs rounded-md bg-gray-50 px-3 py-2 text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
        You can view the commercial terms but not change them.
      </p>
    )}
    <FormSection title="Payment terms" description={`Invoices are raised in ${form.currency || 'the billing currency'} (set on Basic Information).`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <SelectField
          id="client-payment_terms"
          label="Payment terms *"
          options={PAYMENT_TERMS_OPTIONS}
          value={form.payment_terms}
          onChange={(e) => setField('payment_terms', e.target.value as PaymentTerms)}
          error={errors.payment_terms}
          disabled={readOnly}
        />
        {form.payment_terms === 'custom' && (
          <InputField
            id="client-custom_payment_terms"
            label="Custom payment terms *"
            value={form.custom_payment_terms}
            onChange={(e) => setField('custom_payment_terms', e.target.value)}
            error={errors.custom_payment_terms}
            disabled={readOnly}
            maxLength={150}
            placeholder="e.g. 50% advance, balance in 30 days"
          />
        )}
        <SelectField
          id="client-billing_frequency"
          label="Billing frequency"
          options={BILLING_FREQUENCY_OPTIONS}
          value={form.billing_frequency}
          onChange={(e) => setField('billing_frequency', e.target.value as BillingFrequency)}
          error={errors.billing_frequency}
          disabled={readOnly}
        />
        <SelectField
          id="client-invoice_requirements"
          label="Invoice requirements"
          options={INVOICE_REQUIREMENTS_OPTIONS}
          value={form.invoice_requirements}
          onChange={(e) => setField('invoice_requirements', e.target.value as InvoiceRequirements)}
          error={errors.invoice_requirements}
          disabled={readOnly}
        />
        <div className="flex flex-col justify-center gap-3 mb-5">
          <Checkbox
            id="client-po_required"
            label="Client PO required before invoicing"
            checked={form.po_required}
            onChange={(e) => setField('po_required', e.target.checked)}
            disabled={readOnly}
          />
          <Checkbox
            id="client-withholding_tax_applicable"
            label="Client withholds tax on payments"
            checked={form.withholding_tax_applicable}
            onChange={(e) => setField('withholding_tax_applicable', e.target.checked)}
            disabled={readOnly}
          />
        </div>
        {form.withholding_tax_applicable && (
          <InputField
            id="client-withholding_tax_percentage"
            label="Withholding tax % *"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.01"
            value={form.withholding_tax_percentage}
            onChange={(e) => setField('withholding_tax_percentage', e.target.value)}
            error={errors.withholding_tax_percentage}
            disabled={readOnly}
            placeholder="e.g. 10"
          />
        )}
      </div>
    </FormSection>

    <FormSection title="Billing contact" description="Who receives invoices and payment reminders.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <InputField
          id="client-billing_contact"
          label="Billing contact *"
          value={form.billing_contact}
          onChange={(e) => setField('billing_contact', e.target.value)}
          error={errors.billing_contact}
          disabled={readOnly}
          maxLength={150}
          placeholder="Name of the accounts contact"
        />
        <InputField
          id="client-billing_email"
          label="Billing email *"
          type="email"
          value={form.billing_email}
          onChange={(e) => setField('billing_email', e.target.value)}
          error={errors.billing_email}
          disabled={readOnly}
          placeholder="accounts@client.com"
          autoComplete="off"
        />
        <div className="md:col-span-2">
          <FieldShell label="Commercial remarks" htmlFor="client-commercial_remarks" error={errors.commercial_remarks}>
            <textarea
              id="client-commercial_remarks"
              value={form.commercial_remarks}
              onChange={(e) => setField('commercial_remarks', e.target.value)}
              disabled={readOnly}
              rows={3}
              placeholder="Anything finance should know about invoicing this client"
              className={TEXTAREA_CLASS}
            />
          </FieldShell>
        </div>
      </div>
    </FormSection>
  </div>
);
