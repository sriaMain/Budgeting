import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useCountries, useCountryConfig } from '../../../hooks/useCountries';
import { useCountryCurrency } from '../../../components/onboarding/useCountryCurrency';
import type { WizardStep } from '../../../components/onboarding/OnboardingWizard';
import type { AddressValue } from '../../../components/onboarding/addressForm';
import type { BankFormValue } from '../../../components/onboarding/bankForm';
import type { UploadOptions } from '../../../components/DocumentList';
import { parseApiErrors } from '../../../utils/parseApiErrors';
import type {
  FreelancerBankDetail, FreelancerBankDetailPayload, FreelancerDocument, FreelancerProfilePayload, OnboardingIssue,
} from '../../../types/freelancerOnboarding.types';
import {
  WIZARD_STEPS, bankDetailPayload, bankSliceOf, countryCodeOf, defaultTimeZone, documentBlockReason, errorsForStep,
  firstErrorStep, formErrorsFromIssues, formErrorsFromServer, formFromRecord, isUsPerson, kycCountryOf, otherDocuments,
  profilePayload, residenceOf, sameValue, stepAt, stepIndex, stepOfKey, taxRule, toSlots, usesIndiaRules, validateAll, validateStep,
  type FormErrors, type FreelancerFormState, type FreelancerRecord, type ValidationContext, type WizardMode, type WizardStepKey,
} from './freelancerWizardModel';

/** How the wizard talks to the backend - the portal (token) and the admin (id) each provide one. */
export interface FreelancerWizardAdapter {
  /** Create (current null) or update the profile. */
  saveProfile: (payload: FreelancerProfilePayload, current: FreelancerRecord | null) => Promise<FreelancerRecord>;
  saveBank: (payload: FreelancerBankDetailPayload, record: FreelancerRecord) => Promise<FreelancerBankDetail>;
  submit: (record: FreelancerRecord) => Promise<FreelancerRecord>;
  /** Fresh record (required documents / issues change with uploads) and documents. */
  reload: (record: FreelancerRecord) => Promise<{ record: FreelancerRecord; documents: FreelancerDocument[] }>;
  uploadDocument: (record: FreelancerRecord, category: string, file: File, opts: UploadOptions) => Promise<unknown>;
  deleteDocument: (record: FreelancerRecord, docId: number) => Promise<void>;
  downloadDocument: (record: FreelancerRecord, docId: number) => Promise<void>;
  uploadPhoto?: (record: FreelancerRecord, file: File) => Promise<FreelancerRecord>;
  removePhoto?: (record: FreelancerRecord) => Promise<FreelancerRecord>;
}

export interface UseFreelancerWizardOptions {
  mode: WizardMode;
  adapter: FreelancerWizardAdapter;
  initialRecord: FreelancerRecord | null;
  initialBank: FreelancerBankDetail | null;
  initialDocuments: FreelancerDocument[];
  initialStep?: WizardStepKey;
  /** Nothing can be changed (submitted portal link, or no edit permission). */
  readOnly: boolean;
  /** The payout / tax record may be written (admin: bank_detail.edit). */
  bankEditable: boolean;
  /** Billing currencies the admin's currency field accepts. */
  allowedCurrencies?: string[];
  submitLabel?: string;
  /** False when the record is past submission (admin reviewing) - Submit is hidden. */
  canSubmit: boolean;
  onRecordChange?: (record: FreelancerRecord) => void;
  onSubmitted?: (record: FreelancerRecord) => void;
  /** Called after a step change (e.g. scroll the container to the top). */
  onNavigate?: () => void;
}

const BANK_KEYS = new Set(['payment_method', 'bank', 'upi_id', 'paypal_email', 'wise_email', 'payment_terms', 'tax_number']);
const profileSliceOf = (form: FreelancerFormState) =>
  Object.fromEntries(Object.entries(form).filter(([k]) => !BANK_KEYS.has(k)));

const clearKeys = (errors: FormErrors, keys: string[]) => {
  if (!keys.some((k) => errors[k])) return errors;
  const next = { ...errors };
  keys.forEach((k) => delete next[k]);
  return next;
};

export function useFreelancerWizard(opts: UseFreelancerWizardOptions) {
  const { mode, adapter, readOnly, bankEditable, canSubmit } = opts;
  const [record, setRecord] = useState<FreelancerRecord | null>(opts.initialRecord);
  const [bank, setBank] = useState<FreelancerBankDetail | null>(opts.initialBank);
  const [documents, setDocuments] = useState<FreelancerDocument[]>(opts.initialDocuments);
  const [form, setForm] = useState<FreelancerFormState>(() => formFromRecord(opts.initialRecord, opts.initialBank));
  const [savedForm, setSavedForm] = useState<FreelancerFormState>(() => formFromRecord(opts.initialRecord, opts.initialBank));
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverIssues, setServerIssues] = useState<OnboardingIssue[]>([]);
  const [step, setStep] = useState<WizardStepKey>(() => {
    if (opts.initialStep) return opts.initialStep;
    const initial = opts.initialRecord;
    const editable = initial && 'can_edit' in initial ? initial.can_edit : true;
    return mode === 'portal' && editable ? stepAt((initial?.last_saved_step || 1) - 1) : 'basic';
  });
  const [busy, setBusy] = useState<null | 'save' | 'submit'>(null);

  const { countries } = useCountries();
  const kycCountry = kycCountryOf(form);
  const { config: kycConfig } = useCountryConfig(kycCountry);
  const { config: permanentConfig } = useCountryConfig(form.permanent_country);
  const { config: tempConfig } = useCountryConfig(form.temp_same_as_permanent ? '' : form.temp_country);
  const { config: bankConfig } = useCountryConfig(form.bank.bank_country || residenceOf(form));
  const currency = useCountryCurrency({
    currency: form.currency,
    setCurrency: (code) => setForm((f) => ({ ...f, currency: code })),
    allowed: opts.allowedCurrencies,
  });

  const slots = useMemo(() => toSlots(record?.required_documents), [record]);
  const india = usesIndiaRules(form, countries);
  const ctx: ValidationContext = {
    mode, countries, kycConfig, permanentConfig, tempConfig, bankConfig, slots, documents,
    hasRecord: !!record,
    saved: {
      hasIdNumber: !!record?.has_id_document_number,
      hasTaxNumber: !!bank?.has_tax_number,
      hasAccountNumber: !!bank?.has_account_number,
    },
  };

  /* ---------------- field updates ---------------- */

  const patch = (p: Partial<FreelancerFormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => clearKeys(e, Object.keys(p)));
  };
  const patchAddress = (prefix: 'permanent' | 'temp', p: Partial<AddressValue>) => {
    setForm((f) => ({ ...f, [prefix]: { ...f[prefix], ...p } }));
    setErrors((e) => clearKeys(e, Object.keys(p).map((k) => `${prefix}.${k}`)));
  };
  const patchBank = (p: Partial<BankFormValue>) => {
    setForm((f) => ({ ...f, bank: { ...f.bank, ...p } }));
    setErrors((e) => clearKeys(e, Object.keys(p).map((k) => `bank.${k}`)));
  };

  /** Residence drives the tax residency, permanent-address country, time zone, bank country and currency defaults. */
  const setResidence = (name: string) => {
    const previous = form.country_of_residence;
    const code = countryCodeOf(countries, name);
    setForm((f) => {
      const next: FreelancerFormState = { ...f, country_of_residence: name };
      if (!f.tax_residency_country || f.tax_residency_country === f.country_of_residence) next.tax_residency_country = name;
      if (!f.permanent_country) next.permanent_country = name;
      if (!f.timezone && defaultTimeZone(code)) next.timezone = defaultTimeZone(code);
      if (f.payment_method === 'bank_transfer' && !f.bank.bank_country) next.bank = { ...f.bank, bank_country: name };
      return next;
    });
    setErrors((e) => clearKeys(e, ['country_of_residence', 'tax_residency_country']));
    if (mode === 'admin') currency.onCountryChange(previous, name);
  };

  const setPaymentMethod = (method: string) => {
    setForm((f) => ({
      ...f,
      payment_method: method,
      bank: method === 'bank_transfer' && !f.bank.bank_country ? { ...f.bank, bank_country: residenceOf(f) } : f.bank,
    }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('bank.') && !['payment_method', 'upi_id', 'paypal_email', 'wise_email'].includes(k))));
  };

  /* ---------------- navigation ---------------- */

  const goTo = (key: WizardStepKey) => {
    setStep(key);
    opts.onNavigate?.();
  };
  const index = stepIndex(step);

  /* ---------------- persistence ---------------- */

  const applyServerErrors = (err: unknown, fallback: string) => {
    const parsed = parseApiErrors(err);
    const fieldErrors = formErrorsFromServer(parsed);
    setErrors((e) => ({ ...e, ...fieldErrors }));
    const target = firstErrorStep(fieldErrors);
    if (target && target !== step) goTo(target);
    toast.error(parsed.general || fallback);
  };

  const refresh = async (rec: FreelancerRecord | null = record) => {
    if (!rec) return;
    try {
      const fresh = await adapter.reload(rec);
      setRecord(fresh.record);
      setDocuments(fresh.documents);
      opts.onRecordChange?.(fresh.record);
    } catch (err) {
      console.error('Freelancer reload failed', (err as { response?: { status?: number } })?.response?.status);
    }
  };

  /** Saves what changed (profile, then payout / tax). Returns the saved record, or null on failure. */
  const persist = async (nextIndex?: number): Promise<FreelancerRecord | null> => {
    const snapshot = form;
    let rec = record;
    const lastStep = nextIndex !== undefined ? nextIndex + 1 : undefined;
    const profileChanged = !sameValue(profileSliceOf(snapshot), profileSliceOf(savedForm));
    const stepAdvanced = mode === 'portal' && !!lastStep && lastStep > (rec?.last_saved_step || 1);
    const bankChanged = bankEditable && !sameValue(bankSliceOf(snapshot), bankSliceOf(savedForm));
    setBusy('save');
    try {
      if (!rec || profileChanged || stepAdvanced) {
        rec = await adapter.saveProfile(profilePayload(snapshot, mode, mode === 'portal' ? lastStep : undefined), rec);
        setRecord(rec);
        opts.onRecordChange?.(rec);
      }
      if (bankChanged && rec) {
        const savedBank = await adapter.saveBank(bankDetailPayload(snapshot, bankConfig, mode), rec);
        setBank(savedBank);
        const fresh = await adapter.reload(rec);
        rec = fresh.record;
        setRecord(rec);
        setDocuments(fresh.documents);
        opts.onRecordChange?.(rec);
      }
      // Write-only values are never read back: clear them once stored.
      const cleared = (f: FreelancerFormState): FreelancerFormState => ({
        ...f,
        id_document_number: '',
        tax_number: bankChanged ? '' : f.tax_number,
        bank: bankChanged ? { ...f.bank, account_number: '', confirm_account_number: '' } : f.bank,
      });
      setForm((f) => ({
        ...f,
        id_document_number: f.id_document_number === snapshot.id_document_number ? '' : f.id_document_number,
        tax_number: bankChanged && f.tax_number === snapshot.tax_number ? '' : f.tax_number,
        bank: bankChanged && f.bank.account_number === snapshot.bank.account_number
          ? { ...f.bank, account_number: '', confirm_account_number: '' }
          : f.bank,
      }));
      setSavedForm(cleared(snapshot));
      return rec;
    } catch (err) {
      applyServerErrors(err, 'Could not save - check the highlighted fields.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (readOnly) return;
    const found = validateAll(form, ctx, true);
    setErrors(found);
    if (Object.keys(found).length) {
      const target = firstErrorStep(found);
      if (target && target !== step) goTo(target);
      toast.error('Some values are not valid - fix the highlighted fields.');
      return;
    }
    if (await persist()) toast.success('Draft saved');
  };

  const next = async () => {
    if (index >= WIZARD_STEPS.length - 1) return;
    if (readOnly) {
      goTo(stepAt(index + 1));
      return;
    }
    const found = validateStep(step, form, ctx, false);
    setErrors((e) => ({ ...Object.fromEntries(Object.entries(e).filter(([k]) => stepOfKey(k) !== step)), ...found }));
    if (Object.keys(found).length) {
      toast.error(step === 'documents' ? 'Upload the required documents to continue.' : 'Please complete the highlighted fields.');
      return;
    }
    if (await persist(index + 1)) goTo(stepAt(index + 1));
  };

  const previous = () => goTo(stepAt(index - 1));

  const submit = async () => {
    if (readOnly || !canSubmit) return;
    const found = validateAll(form, ctx, false);
    setErrors(found);
    if (Object.keys(found).length) {
      const target = firstErrorStep(found);
      if (target) goTo(target);
      toast.error('Some required information is missing - see the highlighted step.');
      return;
    }
    const rec = await persist(index);
    if (!rec) return;
    setBusy('submit');
    try {
      const updated = await adapter.submit(rec);
      setRecord(updated);
      setServerIssues([]);
      opts.onRecordChange?.(updated);
      opts.onSubmitted?.(updated);
    } catch (err) {
      const data = (err as { response?: { data?: { missing?: OnboardingIssue[]; error?: string } } })?.response?.data;
      if (data?.missing?.length) {
        setServerIssues(data.missing);
        const issueErrors = formErrorsFromIssues(data.missing);
        setErrors(issueErrors);
        const target = firstErrorStep(issueErrors);
        if (target) goTo(target);
        toast.error(data.error || 'Some required information is missing.');
      } else {
        applyServerErrors(err, 'Submission failed - please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- documents / photo ---------------- */

  const requireRecord = () => {
    if (!record) throw new Error('Save the onboarding before uploading documents.');
    return record;
  };
  const uploadDocument = async (category: string, file: File, uploadOpts?: UploadOptions) => {
    await adapter.uploadDocument(requireRecord(), category, file, uploadOpts || {});
    await refresh();
  };
  const deleteDocument = async (docId: number) => {
    await adapter.deleteDocument(requireRecord(), docId);
    await refresh();
  };
  const downloadDocument = (docId: number) => {
    if (!record) return;
    adapter.downloadDocument(record, docId).catch(() => toast.error('Could not open the document.'));
  };
  const uploadPhoto = async (file: File) => {
    if (!record || !adapter.uploadPhoto) return;
    try {
      const updated = await adapter.uploadPhoto(record, file);
      setRecord(updated);
      opts.onRecordChange?.(updated);
      toast.success('Photo updated');
    } catch (err) {
      applyServerErrors(err, 'Could not upload the photo.');
    }
  };
  const removePhoto = async () => {
    if (!record || !adapter.removePhoto) return;
    try {
      const updated = await adapter.removePhoto(record);
      setRecord(updated);
      opts.onRecordChange?.(updated);
    } catch (err) {
      applyServerErrors(err, 'Could not remove the photo.');
    }
  };

  /* ---------------- derived ---------------- */

  const stepErrors = (key: WizardStepKey) => Object.keys(errorsForStep(errors, key)).length > 0;
  const fullStepValid = (key: WizardStepKey) => Object.keys(validateStep(key, form, ctx, false)).length === 0;
  const steps: WizardStep[] = WIZARD_STEPS.map((s) => {
    if (s.key === 'review') {
      const allValid = WIZARD_STEPS.filter((x) => x.key !== 'review').every((x) => fullStepValid(x.key));
      return { ...s, state: allValid ? 'complete' : 'incomplete' };
    }
    return { ...s, state: stepErrors(s.key) ? 'error' : fullStepValid(s.key) ? 'complete' : 'incomplete' };
  });
  /** Everything still missing / invalid in a step (local rules + the last server `missing` list). */
  const stepIssues = (key: WizardStepKey): string[] => [
    ...new Set([
      ...Object.values(validateStep(key, form, ctx, false)),
      ...serverIssues.filter((i) => i.step === key && !i.key.startsWith('document:')).map((i) => i.message),
    ]),
  ];
  const isDirty = !sameValue(form, savedForm);
  const submitBlockedReason = record ? documentBlockReason(slots, documents) : 'Save the onboarding first';

  return {
    mode, form, savedForm, errors, setErrors, record, setRecord, bank, setBank, documents, setDocuments, slots,
    otherDocs: otherDocuments(slots, documents),
    step, goTo, index, steps, stepIssues, readOnly, bankEditable, busy, isDirty, serverIssues,
    countries, kycConfig, permanentConfig, tempConfig, bankConfig, india, usPerson: isUsPerson(form, countries),
    taxRule: taxRule(india, kycConfig), currencyNotice: currency.notice,
    patch, patchAddress, patchBank, setResidence, setPaymentMethod,
    saveDraft, next, previous, submit, persist, refresh,
    uploadDocument, deleteDocument, downloadDocument, uploadPhoto, removePhoto,
    canUploadPhoto: !!adapter.uploadPhoto && !!record && !readOnly,
    footer: {
      isFirst: index === 0,
      isLast: index === WIZARD_STEPS.length - 1,
      onPrevious: previous,
      onNext: () => void next(),
      onSaveDraft: readOnly ? undefined : () => void saveDraft(),
      onSubmit: canSubmit && !readOnly ? () => void submit() : undefined,
      isSaving: busy === 'save',
      isSubmitting: busy === 'submit',
      submitLabel: opts.submitLabel,
      submitBlockedReason: canSubmit ? submitBlockedReason || undefined : undefined,
      readOnly,
      note: !readOnly && isDirty ? 'Unsaved changes' : undefined,
    },
  };
}

export type FreelancerWizard = ReturnType<typeof useFreelancerWizard>;
