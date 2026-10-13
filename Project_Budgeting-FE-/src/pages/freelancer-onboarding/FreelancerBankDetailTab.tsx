import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { BankDetailsFields } from '../../components/onboarding/BankDetailsFields';
import { FieldShell } from '../../components/onboarding/FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '../../components/onboarding/fieldStyles';
import type { BankFormValue } from '../../components/onboarding/bankForm';
import { useCountryConfig } from '../../hooks/useCountries';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { ChoiceOption, FreelancerBankDetail } from '../../types/freelancerOnboarding.types';
import {
  bankDetailPayload, bankErrorsFor, bankSliceFrom, formErrorsFromServer, validateStep, EMPTY_FORM,
  type FormErrors, type FreelancerFormState,
} from './wizard/freelancerWizardModel';

type IdentifierField = 'upi_id' | 'paypal_email' | 'wise_email';

const IDENTIFIERS: Record<string, { field: IdentifierField; label: string; placeholder: string; hint: string; type: string }> = {
  upi: { field: 'upi_id', label: 'UPI ID', placeholder: 'name@okhdfcbank', hint: 'The UPI ID (VPA) payments should be sent to.', type: 'text' },
  paypal: { field: 'paypal_email', label: 'PayPal email', placeholder: 'you@example.com', hint: 'The email address of your PayPal account.', type: 'email' },
  wise: { field: 'wise_email', label: 'Wise account email', placeholder: 'you@example.com', hint: 'The email address registered with Wise.', type: 'email' },
};

const STATUS_TEXT: Record<string, string> = {
  verified: 'Verified by a reviewer',
  rejected: 'Rejected by a reviewer',
  on_hold: 'On hold',
  pending: 'Not verified yet',
};

interface PaymentFieldsProps {
  idPrefix: string;
  paymentMethods: ChoiceOption[];
  method: string;
  onMethodChange: (method: string) => void;
  bank: BankFormValue;
  onBankChange: (patch: Partial<BankFormValue>) => void;
  identifiers: Record<IdentifierField, string>;
  onIdentifierChange: (field: IdentifierField, value: string) => void;
  /** Wizard error keys: payment_method, upi_id, paypal_email, wise_email, bank.* */
  errors: FormErrors;
  disabled?: boolean;
  maskedAccountNumber?: string;
  onRevealAccountNumber?: () => Promise<string | null>;
  /** Reviewer status of the payout details (payment_status) and the reason when rejected. */
  verificationStatus?: string;
  verificationRemarks?: string;
  /** Admin only. */
  paymentTerms?: string;
  onPaymentTermsChange?: (value: string) => void;
}

/** Payment method + the identifiers that method needs: full country-aware bank details for a
 * bank transfer (BankDetailsFields), or a UPI ID / PayPal / Wise email. Controlled. */
export const FreelancerPaymentFields: React.FC<PaymentFieldsProps> = ({
  idPrefix, paymentMethods, method, onMethodChange, bank, onBankChange, identifiers, onIdentifierChange, errors, disabled,
  maskedAccountNumber, onRevealAccountNumber, verificationStatus, verificationRemarks, paymentTerms, onPaymentTermsChange,
}) => {
  const identifier = IDENTIFIERS[method];
  const showStatus = !!method && !!verificationStatus && method !== 'bank_transfer';
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <FieldShell label="Payment method" htmlFor={`${idPrefix}-payment_method`} required error={errors.payment_method}>
          <select
            id={`${idPrefix}-payment_method`}
            value={method}
            disabled={disabled}
            onChange={(e) => onMethodChange(e.target.value)}
            aria-invalid={!!errors.payment_method}
            className={`${INPUT_CLASS} ${errors.payment_method ? INPUT_ERROR_CLASS : ''}`}
          >
            <option value="">Select how you want to be paid</option>
            {paymentMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </FieldShell>
        {onPaymentTermsChange && (
          <FieldShell label="Payment terms" htmlFor={`${idPrefix}-payment_terms`} optional hint="Internal - e.g. Net 15. Not shown to the freelancer.">
            <input
              id={`${idPrefix}-payment_terms`}
              value={paymentTerms ?? ''}
              disabled={disabled}
              onChange={(e) => onPaymentTermsChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </FieldShell>
        )}
      </div>

      {method === 'bank_transfer' && (
        <BankDetailsFields
          idPrefix={`${idPrefix}-bank`}
          value={bank}
          onChange={onBankChange}
          errors={bankErrorsFor(errors)}
          disabled={disabled}
          maskedAccountNumber={maskedAccountNumber || undefined}
          onRevealAccountNumber={onRevealAccountNumber}
          verificationStatus={verificationStatus}
        />
      )}
      {method === 'bank_transfer' && verificationStatus === 'rejected' && verificationRemarks && (
        <p className="text-xs text-red-700 dark:text-red-300">Reviewer note: {verificationRemarks}</p>
      )}

      {identifier && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <FieldShell label={identifier.label} htmlFor={`${idPrefix}-${identifier.field}`} required error={errors[identifier.field]} hint={identifier.hint}>
            <input
              id={`${idPrefix}-${identifier.field}`}
              type={identifier.type}
              value={identifiers[identifier.field]}
              disabled={disabled}
              placeholder={identifier.placeholder}
              autoComplete="off"
              onChange={(e) => onIdentifierChange(identifier.field, e.target.value)}
              aria-invalid={!!errors[identifier.field]}
              className={`${INPUT_CLASS} ${errors[identifier.field] ? INPUT_ERROR_CLASS : ''}`}
            />
          </FieldShell>
        </div>
      )}
      {method === 'other' && (
        <p className="text-sm text-gray-600 dark:text-gray-300">Our team will contact you to agree how payments are made.</p>
      )}

      {showStatus && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          {verificationStatus === 'verified' ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldAlert className={`w-4 h-4 ${verificationStatus === 'rejected' ? 'text-red-500' : 'text-amber-500'}`} />}
          <span>Payout details: <strong className="font-semibold">{STATUS_TEXT[verificationStatus!] ?? verificationStatus}</strong></span>
          {verificationStatus === 'rejected' && verificationRemarks && <span className="text-red-700 dark:text-red-300">- {verificationRemarks}</span>}
        </div>
      )}
    </div>
  );
};

interface TabProps {
  freelancerId: number;
  paymentMethods: ChoiceOption[];
  /** Default bank country when none is saved yet. */
  residenceCountry?: string;
  canEdit?: boolean;
  canReveal?: boolean;
  onSaved?: (bank: FreelancerBankDetail) => void;
}

/** Standalone payout editor (loads and saves the bank-detail record itself). */
export const FreelancerBankDetailTab: React.FC<TabProps> = ({ freelancerId, paymentMethods, residenceCountry = '', canEdit = true, canReveal, onSaved }) => {
  const [detail, setDetail] = useState<FreelancerBankDetail | null>(null);
  const [form, setForm] = useState<FreelancerFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { config: bankConfig } = useCountryConfig(form.bank.bank_country || residenceCountry);

  useEffect(() => {
    let alive = true;
    api.getBankDetail(freelancerId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setForm({ ...EMPTY_FORM, country_of_residence: residenceCountry, ...bankSliceFrom(d) });
      })
      .catch(() => alive && toast.error('Failed to load payment details'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [freelancerId, residenceCountry]);

  const save = async () => {
    const found = validateStep('banking', form, {
      mode: 'admin', countries: [], kycConfig: null, permanentConfig: null, tempConfig: null, bankConfig,
      saved: { hasIdNumber: false, hasTaxNumber: !!detail?.has_tax_number, hasAccountNumber: !!detail?.has_account_number },
      slots: [], documents: [], hasRecord: true,
    }, false);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please complete the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.updateBankDetail(freelancerId, bankDetailPayload(form, bankConfig, 'admin'));
      setDetail(saved);
      setForm((f) => ({ ...f, ...bankSliceFrom(saved) }));
      onSaved?.(saved);
      toast.success('Payment details saved');
    } catch (err) {
      const parsed = parseApiErrors(err);
      setErrors(formErrorsFromServer(parsed));
      toast.error(parsed.general || 'Failed to save payment details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="flex items-center gap-2 p-6 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading payment details…</p>;
  }

  return (
    <div className="space-y-4">
      <FreelancerPaymentFields
        idPrefix={`fl-bank-${freelancerId}`}
        paymentMethods={paymentMethods}
        method={form.payment_method}
        onMethodChange={(m) => setForm((f) => ({ ...f, payment_method: m, bank: m === 'bank_transfer' && !f.bank.bank_country ? { ...f.bank, bank_country: residenceCountry } : f.bank }))}
        bank={form.bank}
        onBankChange={(p) => setForm((f) => ({ ...f, bank: { ...f.bank, ...p } }))}
        identifiers={{ upi_id: form.upi_id, paypal_email: form.paypal_email, wise_email: form.wise_email }}
        onIdentifierChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        errors={errors}
        disabled={!canEdit || saving}
        maskedAccountNumber={detail?.account_number_masked}
        onRevealAccountNumber={canReveal ? async () => {
          try {
            return (await api.getBankDetailUnmasked(freelancerId)).account_number || null;
          } catch {
            toast.error('You are not allowed to view the full account number');
            return null;
          }
        } : undefined}
        verificationStatus={detail?.payment_status}
        verificationRemarks={detail?.verification_remarks}
        paymentTerms={form.payment_terms}
        onPaymentTermsChange={(v) => setForm((f) => ({ ...f, payment_terms: v }))}
      />
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-700"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save payment details
          </button>
        </div>
      )}
    </div>
  );
};
