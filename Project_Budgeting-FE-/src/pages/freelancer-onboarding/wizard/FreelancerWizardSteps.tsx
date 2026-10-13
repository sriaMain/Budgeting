import React, { useRef, useState } from 'react';
import { AlertTriangle, Camera, Clock, Download, Eye, FileText, Loader2, Trash2 } from 'lucide-react';
import { FormSection, ReviewSection, type ReviewRow } from '../../../components/onboarding/OnboardingWizard';
import { FieldShell } from '../../../components/onboarding/FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '../../../components/onboarding/fieldStyles';
import { CountrySelect } from '../../../components/onboarding/CountrySelect';
import { PhoneInput } from '../../../components/onboarding/PhoneInput';
import { AddressFields } from '../../../components/onboarding/AddressFields';
import { DocumentList } from '../../../components/DocumentList';
import { SkillsInput } from '../../../components/SkillsInput';
import { StatusBadge } from '../../../components/StatusBadge';
import { effectiveDocStatus, latestByCategory, todayIso } from '../../../utils/documentStatus';
import { formatFileSize } from '../../../utils/fileHelpers';
import type { ChoiceOption } from '../../../types/freelancerOnboarding.types';
import { FreelancerPaymentFields } from '../FreelancerBankDetailTab';
import type { FreelancerWizard } from './useFreelancerWizard';
import {
  WIZARD_STEPS, addressErrorsFor, browserTimeZone, timeZoneOptions,
  type FreelancerFormState, type WizardStepKey,
} from './freelancerWizardModel';

export interface WizardChoices {
  genders?: ChoiceOption[];
  id_document_types?: ChoiceOption[];
  bank_payment_methods?: ChoiceOption[];
  availabilities?: ChoiceOption[];
  currencies?: ChoiceOption[];
}

export interface WizardReveal {
  accountNumber?: () => Promise<string | null>;
  taxNumber?: () => Promise<string | null>;
  idNumber?: () => Promise<string | null>;
}

interface BodyProps {
  w: FreelancerWizard;
  choices: WizardChoices | null;
  /** Reviewer verify / reject on document cards. */
  canVerifyDocuments?: boolean;
  onVerifyDocument?: (docId: number, status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
  /** No upload / replace / delete (e.g. admin without the upload permission). */
  documentsReadOnly?: boolean;
  reveal?: WizardReveal;
  /** Shown at the end of the Review step (admin reviewer actions). */
  reviewExtras?: React.ReactNode;
}

const GRID = 'grid grid-cols-1 md:grid-cols-2 gap-x-6';
const label = (options: ChoiceOption[] | undefined, value: string) => options?.find((o) => o.value === value)?.label || value;

/* ------------------------------------------------------------------ */
/* Small controls                                                      */
/* ------------------------------------------------------------------ */

interface TextProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string;
  list?: string;
  autoComplete?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

const TextInput: React.FC<TextProps> = ({ id, label: text, value, onChange, error, required, optional, hint, disabled, type = 'text', className, ...rest }) => (
  <FieldShell label={text} htmlFor={id} required={required} optional={optional} error={error} hint={hint} className={className}>
    <input
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={!!error}
      className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      {...rest}
    />
  </FieldShell>
);

interface SelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
}

const SelectInput: React.FC<SelectProps> = ({ id, label: text, value, onChange, options, placeholder = 'Select', error, required, disabled, hint }) => {
  // A stored value that isn't in the list (legacy free text) stays visible so it's never silently dropped.
  const extra = value && !options.some((o) => o.value === value) ? [{ value, label: `${value} (not in list)` }] : [];
  return (
    <FieldShell label={text} htmlFor={id} required={required} error={error} hint={hint}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      >
        <option value="">{placeholder}</option>
        {[...extra, ...options].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
};

const TextArea: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string }> = ({ id, label: text, value, onChange, disabled, hint }) => (
  <FieldShell label={text} htmlFor={id} optional hint={hint} className="md:col-span-2">
    <textarea id={id} rows={3} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
  </FieldShell>
);

const RevealButton: React.FC<{ onReveal: () => Promise<string | null> }> = ({ onReveal }) => {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (value) return <span className="font-mono text-gray-700 dark:text-gray-200">{value}</span>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          setValue(await onReveal());
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-violet-400"
    >
      <Eye className="w-3.5 h-3.5" /> Reveal
    </button>
  );
};

const OnFile: React.FC<{ masked: string | null | undefined; onReveal?: () => Promise<string | null>; editable: boolean }> = ({ masked, onReveal, editable }) =>
  masked ? (
    <span className="flex flex-wrap items-center gap-x-2">
      <span>On file: <span className="font-mono">{masked}</span>.</span>
      {editable && <span>Leave blank to keep it.</span>}
      {onReveal && <RevealButton onReveal={onReveal} />}
    </span>
  ) : null;

const VerificationNote: React.FC<{ status?: string; remarks?: string; what: string }> = ({ status, remarks, what }) => {
  if (!status) return null;
  const tone = status === 'verified' ? 'text-green-700 dark:text-green-400' : status === 'rejected' ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400';
  const text = status === 'verified' ? `${what} verified by a reviewer` : status === 'rejected' ? `${what} rejected by a reviewer` : `${what} not verified yet`;
  return <p className={`-mt-3 mb-4 text-xs ${tone}`}>{text}{status === 'rejected' && remarks ? ` - ${remarks}` : ''}</p>;
};

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

type StepProps = BodyProps & { disabled: boolean };

const BasicStep: React.FC<StepProps> = ({ w, choices, disabled }) => {
  const { form, errors, patch, mode, record } = w;
  const residence = form.country_of_residence || form.permanent_country || form.nationality;
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoUrl = record?.profile_photo_url;
  const maxDob = (() => {
    const [y, m, d] = todayIso().split('-');
    return `${Number(y) - 18}-${m}-${d}`;
  })();
  return (
    <div className="space-y-4">
      <FormSection title="Name" description="As it appears on your government ID.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
          <TextInput id="fl-first_name" label="First name" required value={form.first_name} onChange={(v) => patch({ first_name: v })} error={errors.first_name} disabled={disabled} autoComplete="given-name" />
          <TextInput id="fl-middle_name" label="Middle name" optional value={form.middle_name} onChange={(v) => patch({ middle_name: v })} disabled={disabled} autoComplete="additional-name" />
          <TextInput id="fl-last_name" label="Last name" optional value={form.last_name} onChange={(v) => patch({ last_name: v })} disabled={disabled} autoComplete="family-name" />
        </div>
      </FormSection>
      <FormSection title="Contact details">
        <div className={GRID}>
          <TextInput
            id="fl-email" label="Email address" type="email" required value={form.email}
            onChange={(v) => patch({ email: v })} error={errors.email}
            disabled={disabled || mode === 'portal'}
            hint={mode === 'portal' ? 'The address your invitation was sent to - contact us to change it.' : undefined}
            autoComplete="email"
          />
          <PhoneInput id="fl-phone" label="Phone number" required value={form.phone} onChange={(v) => patch({ phone: v })} defaultCountry={residence} error={errors.phone} disabled={disabled} />
          <PhoneInput id="fl-alternate_phone" label="Alternate phone" value={form.alternate_phone} onChange={(v) => patch({ alternate_phone: v })} defaultCountry={residence} error={errors.alternate_phone} disabled={disabled} />
        </div>
      </FormSection>
      <FormSection title="Personal details">
        <div className={GRID}>
          <TextInput id="fl-dob" label="Date of birth" type="date" required max={maxDob} value={form.date_of_birth} onChange={(v) => patch({ date_of_birth: v })} error={errors.date_of_birth} disabled={disabled} />
          <SelectInput id="fl-gender" label="Gender" value={form.gender} onChange={(v) => patch({ gender: v })} options={choices?.genders || []} placeholder="Select (optional)" error={errors.gender} disabled={disabled} />
          <CountrySelect id="fl-nationality" label="Nationality" required value={form.nationality} onChange={(name) => patch({ nationality: name })} error={errors.nationality} disabled={disabled} />
        </div>
      </FormSection>
      {(w.canUploadPhoto || photoUrl) && (
        <FormSection title="Profile photo" description="Optional. JPG or PNG, up to 5 MB.">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center dark:bg-gray-800">
              {photoUrl ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-gray-400" />}
            </div>
            {w.canUploadPhoto && (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setPhotoBusy(true);
                    try {
                      await w.uploadPhoto(file);
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                />
                <button type="button" disabled={photoBusy || disabled} onClick={() => photoInput.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  {photoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} {photoUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {photoUrl && (
                  <button type="button" disabled={photoBusy || disabled} onClick={() => void w.removePhoto()} className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">Remove</button>
                )}
              </>
            )}
          </div>
          {errors.photo && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.photo}</p>}
        </FormSection>
      )}
    </div>
  );
};

const INDIA_ID_ORDER = ['aadhaar_masked', 'passport', 'driving_licence', 'national_id', 'other'];
const OTHER_ID_ORDER = ['passport', 'national_id', 'driving_licence', 'other'];

const ID_HINTS: Record<string, string> = {
  aadhaar_masked: 'Only the last 4 digits are stored - enter e.g. XXXX XXXX 1234.',
  passport: 'As printed on the photo page.',
  driving_licence: 'As printed on the licence.',
};

const IdentityStep: React.FC<StepProps> = ({ w, choices, disabled, reveal }) => {
  const { form, errors, patch, record, bank, india, taxRule } = w;
  const order = india ? INDIA_ID_ORDER : OTHER_ID_ORDER;
  const idOptions = (choices?.id_document_types || [])
    .filter((o) => order.includes(o.value) || o.value === form.id_document_type)
    .sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
  const editable = !disabled;
  return (
    <div className="space-y-4">
      <FormSection title="Residence" description="Where you live decides which documents and tax details we need.">
        <div className={GRID}>
          <CountrySelect id="fl-residence" label="Country of residence" required value={form.country_of_residence} onChange={(name) => w.setResidence(name)} error={errors.country_of_residence} disabled={disabled} showDialCode={false} />
          <CountrySelect
            id="fl-tax-residency" label="Tax residency" required value={form.tax_residency_country}
            onChange={(name) => patch({ tax_residency_country: name })} error={errors.tax_residency_country} disabled={disabled}
            hint="The country where you pay income tax - usually your country of residence."
          />
        </div>
      </FormSection>
      <FormSection title="Government photo ID">
        <div className={GRID}>
          <SelectInput id="fl-id-type" label="ID document type" required value={form.id_document_type} onChange={(v) => patch({ id_document_type: v })} options={idOptions} placeholder="Select ID type" error={errors.id_document_type} disabled={disabled} />
          <TextInput
            id="fl-id-number" label="ID document number" required={!record?.has_id_document_number}
            value={form.id_document_number} onChange={(v) => patch({ id_document_number: v })} error={errors.id_document_number} disabled={disabled}
            placeholder={form.id_document_type === 'aadhaar_masked' ? 'XXXX XXXX 1234' : ''} autoComplete="off"
            hint={record?.has_id_document_number
              ? <OnFile masked={record.id_document_number_masked} onReveal={reveal?.idNumber} editable={editable} />
              : ID_HINTS[form.id_document_type]}
          />
        </div>
      </FormSection>
      <FormSection title="Tax identification" description={india ? 'Residents of India must provide their PAN.' : taxRule.help || undefined}>
        <div className={GRID}>
          <TextInput
            id="fl-tax-number" label={taxRule.label} required={taxRule.required && !bank?.has_tax_number} optional={!taxRule.required}
            value={form.tax_number} onChange={(v) => patch({ tax_number: india ? v.toUpperCase() : v })} error={errors.tax_number} disabled={disabled}
            placeholder={taxRule.example ? `e.g. ${taxRule.example}` : ''} autoComplete="off"
            hint={bank?.has_tax_number ? <OnFile masked={bank.tax_number_masked} onReveal={reveal?.taxNumber} editable={editable} /> : undefined}
          />
        </div>
        {bank?.has_tax_number && <VerificationNote status={bank.pan_verification_status} remarks={bank.pan_verification_remarks} what={india ? 'PAN' : 'Tax ID'} />}
        <p className="text-xs text-gray-500 dark:text-gray-400">ID and tax numbers are stored securely and shown masked everywhere.</p>
      </FormSection>
    </div>
  );
};

const AddressStep: React.FC<StepProps> = ({ w, disabled }) => {
  const { form, errors, patch, patchAddress } = w;
  const tempStarted = !!(form.temp.line1.trim() || form.temp.city.trim() || form.temp.postal_code.trim());
  return (
    <div className="space-y-4">
      <FormSection title="Permanent address">
        <AddressFields
          idPrefix="fl-perm" value={form.permanent} onChange={(p) => patchAddress('permanent', p)} country={form.permanent_country}
          onCountryChange={(name) => patch({ permanent_country: name })} errors={addressErrorsFor(errors, 'permanent')} required disabled={disabled}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={form.temp_same_as_permanent}
            disabled={disabled}
            onChange={(e) => patch({ temp_same_as_permanent: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-800"
          />
          I currently live at my permanent address
        </label>
      </FormSection>
      {!form.temp_same_as_permanent && (
        <FormSection title="Current address" description="Where you live now, if different.">
          <AddressFields
            idPrefix="fl-temp" value={form.temp} onChange={(p) => patchAddress('temp', p)} country={form.temp_country}
            onCountryChange={(name) => patch({ temp_country: name })} errors={addressErrorsFor(errors, 'temp')} required={tempStarted} disabled={disabled}
          />
        </FormSection>
      )}
      <FormSection title="Emergency contact" description="Optional - someone we can reach in an emergency.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
          <TextInput id="fl-ec-name" label="Name" optional value={form.emergency_contact_name} onChange={(v) => patch({ emergency_contact_name: v })} disabled={disabled} />
          <PhoneInput id="fl-ec-phone" label="Phone" value={form.emergency_contact_phone} onChange={(v) => patch({ emergency_contact_phone: v })} defaultCountry={form.country_of_residence || form.permanent_country} error={errors.emergency_contact_phone} disabled={disabled} required={!!form.emergency_contact_name.trim()} />
          <TextInput id="fl-ec-rel" label="Relationship" optional value={form.emergency_contact_relationship} onChange={(v) => patch({ emergency_contact_relationship: v })} disabled={disabled} />
        </div>
      </FormSection>
    </div>
  );
};

const BankingStep: React.FC<StepProps> = ({ w, choices, disabled, reveal }) => {
  const { form, errors, patch, patchBank, bank, mode, bankEditable } = w;
  if (mode === 'admin' && !bankEditable && !bank) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">You don't have access to this freelancer's payout details.</p>;
  }
  return (
    <FormSection title="Payout details" description="How you would like to be paid. Details are only marked verified after a reviewer checks them.">
      <FreelancerPaymentFields
        idPrefix="fl-pay"
        paymentMethods={choices?.bank_payment_methods || []}
        method={form.payment_method}
        onMethodChange={w.setPaymentMethod}
        bank={form.bank}
        onBankChange={patchBank}
        identifiers={{ upi_id: form.upi_id, paypal_email: form.paypal_email, wise_email: form.wise_email }}
        onIdentifierChange={(field, value) => patch({ [field]: value } as Partial<FreelancerFormState>)}
        errors={errors}
        disabled={disabled || !bankEditable}
        maskedAccountNumber={bank?.has_account_number ? bank.account_number_masked : undefined}
        onRevealAccountNumber={reveal?.accountNumber}
        verificationStatus={bank ? bank.payment_status : undefined}
        verificationRemarks={bank?.verification_remarks}
        paymentTerms={mode === 'admin' ? form.payment_terms : undefined}
        onPaymentTermsChange={mode === 'admin' ? (v) => patch({ payment_terms: v }) : undefined}
      />
    </FormSection>
  );
};

const ProfessionalStep: React.FC<StepProps> = ({ w, choices, disabled }) => {
  const { form, errors, patch, mode } = w;
  const zones = timeZoneOptions();
  const deviceZone = browserTimeZone();
  return (
    <div className="space-y-4">
      <FormSection title="Role & skills">
        <div className={GRID}>
          <TextInput id="fl-title" label="Professional title" required value={form.professional_title} onChange={(v) => patch({ professional_title: v })} error={errors.professional_title} disabled={disabled} placeholder="e.g. Senior React Developer" />
          <TextInput id="fl-years" label="Years of experience" optional type="number" min={0} max={70} inputMode="numeric" value={form.years_of_experience} onChange={(v) => patch({ years_of_experience: v })} error={errors.years_of_experience} disabled={disabled} />
        </div>
        <FieldShell label="Skills" required error={errors.skills}>
          <SkillsInput value={form.skills} onChange={(v) => patch({ skills: v })} disabled={disabled} />
        </FieldShell>
        <div className={GRID}>
          <TextInput id="fl-portfolio" label="Portfolio / website" optional value={form.portfolio_url} onChange={(v) => patch({ portfolio_url: v })} error={errors.portfolio_url} disabled={disabled} placeholder="https://" />
          <TextInput id="fl-linkedin" label="LinkedIn profile" optional value={form.linkedin_url} onChange={(v) => patch({ linkedin_url: v })} error={errors.linkedin_url} disabled={disabled} placeholder="https://www.linkedin.com/in/…" />
        </div>
      </FormSection>
      <FormSection title="Availability">
        <div className={GRID}>
          <SelectInput id="fl-availability" label="Availability" required value={form.availability} onChange={(v) => patch({ availability: v })} options={choices?.availabilities || []} error={errors.availability} disabled={disabled} />
          <TextInput id="fl-start" label="Preferred start date" optional type="date" value={form.preferred_start_date} onChange={(v) => patch({ preferred_start_date: v })} error={errors.preferred_start_date} disabled={disabled} />
          <TextInput id="fl-until" label="Available until" optional type="date" min={form.preferred_start_date || undefined} value={form.available_until} onChange={(v) => patch({ available_until: v })} error={errors.available_until} disabled={disabled} />
          <TextInput id="fl-notice" label="Notice period (days)" optional type="number" min={0} max={365} value={form.notice_period_days} onChange={(v) => patch({ notice_period_days: v })} error={errors.notice_period_days} disabled={disabled} />
          <TextInput id="fl-hpd" label="Hours per day" optional type="number" min={0} max={24} step="0.5" value={form.hours_per_day} onChange={(v) => patch({ hours_per_day: v })} error={errors.hours_per_day} disabled={disabled} />
          <TextInput id="fl-hpw" label="Hours per week (max capacity)" optional type="number" min={0} max={168} step="0.5" value={form.hours_per_week} onChange={(v) => patch({ hours_per_week: v })} error={errors.hours_per_week} disabled={disabled} />
          <TextInput
            id="fl-tz" label="Time zone" optional value={form.timezone} onChange={(v) => patch({ timezone: v })} error={errors.timezone} disabled={disabled}
            list={zones.length ? 'fl-tz-options' : undefined} placeholder="e.g. Asia/Kolkata"
            hint={deviceZone && deviceZone !== form.timezone && !disabled ? (
              <button type="button" className="text-blue-600 hover:underline dark:text-violet-400" onClick={() => patch({ timezone: deviceZone })}>
                Use this device's time zone ({deviceZone})
              </button>
            ) : undefined}
          />
          {zones.length > 0 && (
            <datalist id="fl-tz-options">
              {zones.map((z) => <option key={z} value={z} />)}
            </datalist>
          )}
        </div>
      </FormSection>
      {mode === 'admin' && (
        <FormSection title="Commercial & internal" description="Only visible to your team - never shown on the freelancer's link.">
          <div className={GRID}>
            <div>
              <SelectInput id="fl-currency" label="Currency" value={form.currency} onChange={(v) => patch({ currency: v })} options={choices?.currencies || []} placeholder="Select currency" error={errors.currency} disabled={disabled} />
              {w.currencyNotice}
            </div>
            <TextInput id="fl-rate" label="Default pay rate" optional type="number" min={0} step="0.01" value={form.rate} onChange={(v) => patch({ rate: v })} error={errors.rate} disabled={disabled} hint="Project rates come from rate cards." />
            <TextArea id="fl-notes" label="Notes" value={form.notes} onChange={(v) => patch({ notes: v })} disabled={disabled} />
            <TextArea id="fl-internal" label="Internal remarks" value={form.internal_remarks} onChange={(v) => patch({ internal_remarks: v })} disabled={disabled} hint="Staff only." />
          </div>
        </FormSection>
      )}
    </div>
  );
};

const DocumentsStep: React.FC<StepProps> = ({ w, disabled, canVerifyDocuments, onVerifyDocument, documentsReadOnly }) => {
  const { record, slots, documents, otherDocs, errors, mode } = w;
  if (!record) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Save the onboarding first (Save draft), then upload the documents here.</p>;
  }
  const readOnly = disabled || !!documentsReadOnly;
  return (
    <div className="space-y-4">
      {errors.documents && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {errors.documents}
        </div>
      )}
      <DocumentList
        slots={slots}
        documents={documents}
        onUpload={w.uploadDocument}
        onDelete={w.deleteDocument}
        onDownload={w.downloadDocument}
        readOnly={readOnly}
        canVerify={canVerifyDocuments}
        onVerify={onVerifyDocument}
        requireRejectReason
        showSummary
        lockVerified={mode === 'portal'}
      />
      {otherDocs.length > 0 && (
        <FormSection title="Other documents on file" description="Earlier uploads and documents outside the list above.">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {otherDocs.map((d) => {
              const status = effectiveDocStatus(d.status, d.expiry_date);
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 min-w-0 text-sm text-gray-800 dark:text-gray-200">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate" title={d.file_name}>{d.category_display} · {d.file_name}</span>
                    <span className="text-xs text-gray-400">{formatFileSize(d.file_size)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={status} variant={status === 'verified' ? 'success' : status === 'rejected' || status === 'expired' ? 'danger' : 'info'} label={status.replace(/_/g, ' ')} />
                    <button type="button" onClick={() => w.downloadDocument(d.id)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={`Download ${d.file_name}`}>
                      <Download className="w-4 h-4" />
                    </button>
                    {!readOnly && !(mode === 'portal' && d.status === 'verified') && (
                      <button type="button" onClick={() => void w.deleteDocument(d.id).catch(() => undefined)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label={`Remove ${d.file_name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </FormSection>
      )}
    </div>
  );
};

const joinAddress = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(', ');
const last4 = (v: string) => (v.length > 4 ? `••••${v.slice(-4)}` : '••••');

const ReviewStep: React.FC<StepProps> = ({ w, choices, reviewExtras }) => {
  const { form, record, bank, slots, documents, india, taxRule, mode } = w;
  const edit = (key: WizardStepKey) => (w.readOnly ? undefined : () => w.goTo(key));
  const issues = (key: WizardStepKey) => w.stepIssues(key);
  const method = form.payment_method;
  const bankRows: ReviewRow[] = method === 'bank_transfer'
    ? [
        { label: 'Account holder', value: form.bank.account_holder_name },
        { label: 'Bank', value: joinAddress([form.bank.bank_name, form.bank.branch_name]) },
        { label: 'Bank country', value: form.bank.bank_country },
        { label: 'Account number', value: form.bank.account_number ? last4(form.bank.account_number) : bank?.account_number_masked || '' },
        { label: 'IFSC / routing', value: form.bank.ifsc_code || form.bank.routing_code || form.bank.iban || '' },
        { label: 'SWIFT / BIC', value: form.bank.swift_code },
      ]
    : method === 'upi' ? [{ label: 'UPI ID', value: form.upi_id }]
    : method === 'paypal' ? [{ label: 'PayPal email', value: form.paypal_email }]
    : method === 'wise' ? [{ label: 'Wise email', value: form.wise_email }]
    : [];
  const latest = latestByCategory(documents);
  return (
    <div className="space-y-4">
      <ReviewSection
        title="Basic Information" onEdit={edit('basic')} issues={issues('basic')}
        rows={[
          { label: 'Name', value: [form.first_name, form.middle_name, form.last_name].map((p) => p.trim()).filter(Boolean).join(' ') },
          { label: 'Email', value: form.email },
          { label: 'Phone', value: form.phone },
          { label: 'Alternate phone', value: form.alternate_phone },
          { label: 'Date of birth', value: form.date_of_birth },
          { label: 'Gender', value: label(choices?.genders, form.gender) },
          { label: 'Nationality', value: form.nationality },
        ]}
      />
      <ReviewSection
        title="Identity & KYC" onEdit={edit('identity')} issues={issues('identity')}
        rows={[
          { label: 'Country of residence', value: form.country_of_residence },
          { label: 'Tax residency', value: form.tax_residency_country },
          { label: 'ID document', value: joinAddress([label(choices?.id_document_types, form.id_document_type), form.id_document_number ? last4(form.id_document_number) : record?.id_document_number_masked || ''] ) },
          { label: india ? 'PAN' : taxRule.label, value: form.tax_number ? last4(form.tax_number) : bank?.tax_number_masked || '' },
        ]}
      />
      <ReviewSection
        title="Address" onEdit={edit('address')} issues={issues('address')}
        rows={[
          { label: 'Permanent address', value: joinAddress([form.permanent.line1, form.permanent.line2, form.permanent.city, form.permanent.state, form.permanent.postal_code, form.permanent_country]), wide: true },
          { label: 'Current address', value: form.temp_same_as_permanent ? 'Same as permanent' : joinAddress([form.temp.line1, form.temp.line2, form.temp.city, form.temp.state, form.temp.postal_code, form.temp_country]), wide: true },
          { label: 'Emergency contact', value: joinAddress([form.emergency_contact_name, form.emergency_contact_relationship, form.emergency_contact_phone]), wide: true },
        ]}
      />
      <ReviewSection
        title="Banking" onEdit={edit('banking')} issues={issues('banking')}
        rows={[{ label: 'Payment method', value: label(choices?.bank_payment_methods, method) }, ...bankRows]}
      />
      <ReviewSection
        title="Professional" onEdit={edit('professional')} issues={issues('professional')}
        rows={[
          { label: 'Title', value: form.professional_title },
          { label: 'Experience', value: form.years_of_experience ? `${form.years_of_experience} years` : '' },
          { label: 'Skills', value: form.skills, wide: true },
          { label: 'Availability', value: label(choices?.availabilities, form.availability) },
          { label: 'Start date', value: form.preferred_start_date },
          { label: 'Hours per week', value: form.hours_per_week },
          { label: 'Time zone', value: form.timezone },
          ...(mode === 'admin' ? [{ label: 'Currency / rate', value: joinAddress([form.currency, form.rate]) }] : []),
        ]}
      />
      <ReviewSection
        title="KYC Documents" onEdit={edit('documents')} issues={issues('documents')}
        rows={slots.filter((s) => s.required || latest.has(s.key)).map((s) => {
          const doc = latest.get(s.key);
          const status = doc ? effectiveDocStatus(doc.status, doc.expiry_date) : 'missing';
          return { label: s.label, value: status === 'missing' ? (s.required ? 'Missing' : 'Not uploaded') : status.replace(/_/g, ' '), missing: s.required && status === 'missing' };
        })}
      />
      {mode === 'portal' && !w.readOnly && (
        <p className="text-xs text-gray-500 dark:text-gray-400">By submitting you confirm the information above is accurate. A reviewer will verify your documents and details.</p>
      )}
      {reviewExtras}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Body                                                                */
/* ------------------------------------------------------------------ */

/** Renders the current wizard step. */
export const FreelancerWizardBody: React.FC<BodyProps> = (props) => {
  const { w } = props;
  const disabled = w.readOnly || !!w.busy;
  const stepProps: StepProps = { ...props, disabled };
  const current = WIZARD_STEPS.find((s) => s.key === w.step);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{current?.title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{current?.description}</p>
      </div>
      {w.step === 'basic' && <BasicStep {...stepProps} />}
      {w.step === 'identity' && <IdentityStep {...stepProps} />}
      {w.step === 'address' && <AddressStep {...stepProps} />}
      {w.step === 'banking' && <BankingStep {...stepProps} />}
      {w.step === 'professional' && <ProfessionalStep {...stepProps} />}
      {w.step === 'documents' && <DocumentsStep {...stepProps} />}
      {w.step === 'review' && <ReviewStep {...stepProps} />}
    </div>
  );
};

/** "Submitted on ..." / "Last saved ..." line under the progress bar. */
export const WizardStatusLine: React.FC<{ w: FreelancerWizard }> = ({ w }) => {
  const submitted = w.record?.submitted_at;
  if (submitted) {
    return <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Submitted {new Date(submitted).toLocaleString()}</span>;
  }
  return w.isDirty && !w.readOnly ? <span>Unsaved changes - use Save draft or Save &amp; next.</span> : null;
};
