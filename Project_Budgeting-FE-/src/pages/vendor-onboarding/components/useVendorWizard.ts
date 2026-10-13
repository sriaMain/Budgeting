import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { WizardStep, WizardStepState } from '../../../components/onboarding/OnboardingWizard';
import { useCountryCurrency } from '../../../components/onboarding/useCountryCurrency';
import type { UploadOptions } from '../../../components/DocumentUploadCard';
import { useCountries, useCountryConfig } from '../../../hooks/useCountries';
import { fetchCountryConfig, findCountry, type CountryConfig } from '../../../services/countries';
import * as adminApi from '../../../services/vendorOnboarding';
import * as publicApi from '../../../services/vendorOnboardingPublic';
import {
  EMPTY_VENDOR_FORM, SECTION_VALIDATORS, validateAddress, validateBank, validateBasic, validateCommercial, validateKyc,
  vendorDocumentRules, vendorDocumentSlots, vendorDocumentStatus, vendorEntity,
  type VendorFieldErrors, type VendorFormSection, type VendorFormValues, type VendorValidationContext,
} from '../../../schemas/vendorOnboarding.schemas';
import type {
  RequestChangesPayload, VendorOnboardingChoices, VendorOnboardingDetail, VendorPermissions, VendorPublicChoices,
  VendorRequirementIssue,
} from '../../../types/vendorOnboarding.types';
import type { VendorPublicDetail } from '../../../types/vendorOnboardingPublic.types';
import {
  anyDirty, bankCountryNeedsSaving, buildSectionsPayload, dirtySections, parseVendorError, recordToFormValues,
  sectionsToSend, stepForPath, stepsWithErrors, vendorFieldId, type DirtySections,
} from '../vendorOnboardingForm';
import {
  CHANGE_REQUEST_STEPS, EDITABLE_VENDOR_STATUSES, VENDOR_WIZARD_STEPS, wizardStepForServerStep, wizardStepIndex,
  type VendorWizardStepKey,
} from './vendorSteps';

/**
 * Everything the vendor onboarding wizard needs - shared by the admin drawer, the full-page
 * wizard and the vendor's self-service portal, so the three can't drift:
 * one form state for all steps, country-aware validation, one-request saves (/sections/),
 * documents, submission and (admin) review / approval actions.
 */

export type VendorWizardMode = 'admin' | 'portal';
export type VendorWizardRecord = VendorOnboardingDetail | VendorPublicDetail;
export type VendorWizardBusy = null | 'save' | 'submit' | 'review' | 'approve' | 'email';

export interface UseVendorWizardOptions {
  mode: VendorWizardMode;
  /** Admin: the vendor to open; null = onboard a new vendor. */
  vendorId?: number | null;
  /** Portal: the secure link's token. */
  token?: string;
  initialStep?: VendorWizardStepKey;
  /** Admin: called with the fresh record after every save / review / submit / approval. */
  onSaved?: (record: VendorOnboardingDetail) => void;
  /** Admin: called once when a new vendor is created by its first save. */
  onCreated?: (id: number) => void;
}

/** Before a vendor record exists, assume the creator may edit - the backend still enforces every permission. */
const NEW_VENDOR_PERMISSIONS: VendorPermissions = {
  edit: true, submit: true, verify: false, approve: false, request_changes: false, send_email: true,
  delete: false, view_unmasked_bank: false, upload_documents: true, delete_documents: true, edit_master: true,
};

const INDIA_NAMES = ['india', 'in', 'ind', 'bharat'];
const sameCountry = (a: string, b: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

function loadErrorMessage(err: unknown, mode: VendorWizardMode): string {
  const parsed = parseVendorError(err, mode === 'portal' ? 'Invalid or unavailable vendor onboarding link.' : 'Unable to load this vendor.');
  // A proxy / server outage returns an HTML error page - never show that raw markup.
  if (!parsed.status || parsed.status >= 500 || /<html/i.test(parsed.general)) {
    return 'The onboarding service is temporarily unavailable. Please try again in a few minutes.';
  }
  return parsed.general;
}

function initialStepFor(record: VendorWizardRecord, mode: VendorWizardMode, requested?: VendorWizardStepKey): VendorWizardStepKey {
  if (requested) return requested;
  if (mode === 'portal') {
    const cr = (record as VendorPublicDetail).open_change_request;
    if (record.status === 'action_required' && cr) return CHANGE_REQUEST_STEPS[cr.section]?.[0] ?? 'basic';
  }
  return wizardStepForServerStep(record.onboarding?.current_step);
}

const uploadError = (message: string) => Object.assign(new Error(message), { response: { status: 400, data: { message } } });

async function loadConfig(value: string): Promise<CountryConfig | null> {
  if (!value.trim()) return null;
  try {
    return await fetchCountryConfig(value);
  } catch {
    return null;
  }
}

export function useVendorWizard(options: UseVendorWizardOptions) {
  const { mode, token } = options;
  const internal = mode === 'admin';
  const initialVendorId = options.vendorId ?? null;
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [choices, setChoices] = useState<VendorOnboardingChoices | VendorPublicChoices | null>(null);
  const [record, setRecord] = useState<VendorWizardRecord | null>(null);
  const [vendorId, setVendorId] = useState<number | null>(initialVendorId);
  const [values, setValues] = useState<VendorFormValues>(EMPTY_VENDOR_FORM);
  const [saved, setSaved] = useState<VendorFormValues>(EMPTY_VENDOR_FORM);
  const [errors, setErrors] = useState<VendorFieldErrors>({});
  const [step, setStep] = useState<VendorWizardStepKey>(options.initialStep ?? 'basic');
  const [busy, setBusy] = useState<VendorWizardBusy>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitIssues, setSubmitIssues] = useState<VendorRequirementIssue[] | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  /* ---------------- load ---------------- */

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (mode === 'portal') {
          if (!token) throw new Error('missing token');
          const [c, detail] = await Promise.all([publicApi.getPublicChoices(), publicApi.getRequestByToken(token)]);
          if (cancelled) return;
          const form = recordToFormValues(detail);
          setChoices(c);
          setRecord(detail);
          setValues(form);
          setSaved(form);
          setStep(initialStepFor(detail, mode, optionsRef.current.initialStep));
        } else {
          const [c, detail] = await Promise.all([
            adminApi.getChoices(),
            initialVendorId ? adminApi.getVendor(initialVendorId) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setChoices(c);
          if (detail) {
            const form = recordToFormValues(detail);
            setRecord(detail);
            setValues(form);
            setSaved(form);
            setStep(initialStepFor(detail, mode, optionsRef.current.initialStep));
          }
        }
      } catch (err) {
        console.error('Loading vendor onboarding failed', (err as { response?: { status?: number } })?.response?.status);
        if (!cancelled) setLoadError(loadErrorMessage(err, mode));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, token, initialVendorId]);

  /* ---------------- derived ---------------- */

  const { countries } = useCountries();
  const countryValue = values.basic.country;
  const countryCode = findCountry(countries, countryValue)?.code ?? '';
  const indian = countryCode ? countryCode === 'IN' : !countryValue.trim() || INDIA_NAMES.includes(countryValue.trim().toLowerCase());
  const entity = vendorEntity(values.basic.vendor_type);
  const { config: countryConfig } = useCountryConfig(countryValue);
  const taxCountry = indian ? '' : values.kyc.country_of_tax_residence || countryValue;
  const { config: taxConfig } = useCountryConfig(taxCountry);
  const bankCountry = values.bank.bank_country || countryValue || (indian ? 'India' : '');
  const { config: bankConfig } = useCountryConfig(bankCountry);

  const adminRecord = internal ? (record as VendorOnboardingDetail | null) : null;
  const publicRecord = internal ? null : (record as VendorPublicDetail | null);
  const permissions: VendorPermissions | null = internal
    ? adminRecord
      ? adminRecord.permissions ?? { ...NEW_VENDOR_PERMISSIONS, edit: EDITABLE_VENDOR_STATUSES.includes(adminRecord.status) }
      : NEW_VENDOR_PERMISSIONS
    : null;
  const editable = internal ? !!permissions?.edit : !!publicRecord && (publicRecord.editable ?? EDITABLE_VENDOR_STATUSES.includes(publicRecord.status));
  const canVerify = internal && !!adminRecord && !!permissions?.verify;
  const canEditMaster = internal && (editable || !!permissions?.edit_master);
  const canSubmit = editable && (!internal || !!permissions?.submit);
  const documents = useMemo(() => record?.documents ?? [], [record]);
  const maskedAccountNumber = record?.bank_detail?.account_number_masked || undefined;
  const hasSavedAccount = !!maskedAccountNumber;

  const docContext = useMemo(() => ({
    vendorType: values.basic.vendor_type,
    indian,
    gstRegistered: indian && values.kyc.gst_registered,
    msmeRegistered: indian && values.kyc.msme_registered,
    hasEpf: indian && !!values.kyc.epf_number.trim(),
    hasEsic: indian && !!values.kyc.esic_number.trim(),
  }), [values.basic.vendor_type, indian, values.kyc.gst_registered, values.kyc.msme_registered, values.kyc.epf_number, values.kyc.esic_number]);
  const docRules = useMemo(() => vendorDocumentRules(docContext), [docContext]);
  const docSlots = useMemo(() => vendorDocumentSlots(docContext), [docContext]);
  const docStatus = useMemo(() => vendorDocumentStatus(docRules, documents), [docRules, documents]);
  const docProblems = docStatus.filter((d) => d.state === 'missing' || d.state === 'rejected' || d.state === 'expired');

  const dirty: DirtySections = useMemo(() => dirtySections(values, saved), [values, saved]);
  const isDirty = anyDirty(dirty);

  const allowedCurrencies = useMemo(() => choices?.onboarding_currencies?.map((c) => c.value), [choices]);
  const currency = useCountryCurrency({
    currency: values.commercial.order_currency,
    setCurrency: (code) => setValues((v) => ({ ...v, commercial: { ...v.commercial, order_currency: code } })),
    allowed: allowedCurrencies,
  });

  const summary = record?.onboarding ?? null;
  const submissionIssues = submitIssues ?? summary?.submission_issues ?? [];
  const approvalIssues = summary?.approval_issues ?? [];

  const errorSteps = stepsWithErrors(errors);
  const steps: WizardStep[] = VENDOR_WIZARD_STEPS.map((s) => {
    let state: WizardStepState = 'incomplete';
    if (errorSteps.has(s.key)) state = 'error';
    else if (summary) {
      const status = summary.step_statuses[s.serverStep];
      state = status === 'completed' ? 'complete' : status === 'failed' || status === 'requires_review' ? 'error' : 'incomplete';
    }
    return { key: s.key, title: s.title, description: s.description, state };
  });

  /* ---------------- form updates ---------------- */

  const patch = useCallback(<K extends VendorFormSection>(section: K, change: Partial<VendorFormValues[K]>) => {
    setValues((v) => ({ ...v, [section]: { ...v[section], ...change } }));
    setErrors((e) => {
      const keys = Object.keys(change).map((k) => `${section}.${k}`).filter((k) => k in e);
      if (!keys.length) return e;
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  /** Country picker: the bank country and tax residence follow while they still match the old
   * country (and no bank identifiers were typed); the order currency follows via useCountryCurrency. */
  const changeCountry = (name: string) => {
    const previous = values.basic.country;
    setValues((v) => {
      const bankUntouched = !v.bank.bank_country
        || (sameCountry(v.bank.bank_country, previous) && !v.bank.ifsc_code && !v.bank.routing_code && !v.bank.iban && !v.bank.swift_code && !v.bank.account_number);
      return {
        ...v,
        basic: { ...v.basic, country: name },
        bank: bankUntouched ? { ...v.bank, bank_country: name } : v.bank,
        kyc: !v.kyc.country_of_tax_residence || sameCountry(v.kyc.country_of_tax_residence, previous)
          ? { ...v.kyc, country_of_tax_residence: name }
          : v.kyc,
      };
    });
    setErrors((e) => {
      const next = { ...e };
      delete next['basic.country'];
      return next;
    });
    currency.onCountryChange(previous, name);
  };

  const focusPath = (path: string) => {
    setStep(stepForPath(path));
    window.setTimeout(() => document.getElementById(vendorFieldId(path))?.focus(), 80);
  };

  const showErrors = (found: VendorFieldErrors, message: string) => {
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) focusPath(first);
    toast.error(message);
  };

  /** Applies a record returned by a save: the form now mirrors what is stored (normalised
   * values, write-only account number cleared). Unsaved internal review edits are kept. */
  const applySaved = (rec: VendorWizardRecord) => {
    const form = recordToFormValues(rec);
    const reviewEdited = JSON.stringify(values.review) !== JSON.stringify(saved.review);
    setRecord(rec);
    setValues((v) => ({ ...form, review: reviewEdited ? v.review : form.review }));
    setSaved(form);
    setLastSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  };

  const validationContext = (mode_: 'draft' | 'full', configs: { country: CountryConfig | null; tax: CountryConfig | null; bank: CountryConfig | null }): VendorValidationContext => ({
    mode: mode_, internal, countries, countryConfig: configs.country, taxConfig: configs.tax, bankConfig: configs.bank,
    indian, hasSavedAccount, documents,
  });

  const loadConfigs = async () => {
    const [country, tax, bank] = await Promise.all([loadConfig(countryValue), loadConfig(taxCountry), loadConfig(bankCountry)]);
    return { country, tax, bank };
  };

  /* ---------------- save ---------------- */

  /** Validates (changed sections: malformed values only; `validateStep`: everything required) and
   * saves every changed section in ONE request. Returns the stored record, or null. */
  const persist = async ({ validateStep }: { validateStep?: VendorWizardStepKey } = {}): Promise<VendorWizardRecord | null> => {
    if (!internal && !token) return null;
    const isNew = internal && !vendorId;
    setBusy('save');
    try {
      const configs = await loadConfigs();
      const draft = validationContext('draft', configs);
      const found: VendorFieldErrors = {};
      const validators: Record<keyof DirtySections, (v: VendorFormValues, c: VendorValidationContext) => VendorFieldErrors> = {
        basic: validateBasic, kyc: validateKyc, address: validateAddress, bank: validateBank, commercial: validateCommercial,
      };
      (Object.keys(validators) as (keyof DirtySections)[]).forEach((k) => {
        if (dirty[k] || (isNew && k === 'basic')) Object.assign(found, validators[k](values, draft));
      });
      const stepValidator = validateStep ? SECTION_VALIDATORS[validateStep] : undefined;
      if (stepValidator) Object.assign(found, stepValidator(values, { ...draft, mode: 'full' }));
      if (validateStep === 'documents' && docProblems.length) {
        found['documents.required'] = `Upload the required documents: ${docProblems.map((d) => d.rule.label).join(', ')}`;
      }
      if (Object.keys(found).length) {
        showErrors(found, 'Please fix the highlighted fields.');
        return null;
      }
      setErrors({});

      const payload = sectionsToSend(values, dirty, { internal, indian, bankConfig: configs.bank }, { bankCountry: bankCountryNeedsSaving(record, values) });
      const furthest = wizardStepIndex(step) + 1;
      if (furthest > (record?.last_saved_step ?? 1)) payload.last_saved_step = Math.min(furthest, VENDOR_WIZARD_STEPS.length);
      const hasSections = Object.keys(payload).some((k) => k !== 'last_saved_step');
      if (!isNew && !hasSections) {
        if (payload.last_saved_step && record) {
          // Only progress changed - cheap, still one request.
          const rec = internal
            ? await adminApi.saveSections(vendorId!, { last_saved_step: payload.last_saved_step })
            : await publicApi.saveSectionsByToken(token!, { last_saved_step: payload.last_saved_step });
          setRecord(rec);
          if (internal) optionsRef.current.onSaved?.(rec as VendorOnboardingDetail);
          return rec;
        }
        return record;
      }

      let rec: VendorWizardRecord;
      if (internal) {
        if (!vendorId) {
          const all = buildSectionsPayload(values, { internal, indian, bankConfig: configs.bank });
          const created = await adminApi.createVendorWithSections({ ...payload, identity: all.identity });
          setVendorId(created.id);
          optionsRef.current.onCreated?.(created.id);
          rec = created;
        } else {
          rec = await adminApi.saveSections(vendorId, payload);
        }
        optionsRef.current.onSaved?.(rec as VendorOnboardingDetail);
      } else {
        rec = await publicApi.saveSectionsByToken(token!, payload);
      }
      applySaved(rec);
      return rec;
    } catch (err) {
      console.error('Saving vendor onboarding failed', (err as { response?: { status?: number } })?.response?.status);
      const parsed = parseVendorError(err, 'Unable to save. Please try again.');
      if (Object.keys(parsed.fieldErrors).length) showErrors(parsed.fieldErrors, parsed.general || 'Please fix the highlighted fields.');
      else toast.error(parsed.general);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (!isDirty && record && !bankCountryNeedsSaving(record, values)) {
      toast.success('Everything is already saved.');
      return;
    }
    const rec = await persist();
    if (rec) toast.success(internal && !record ? 'Vendor draft created' : 'Draft saved');
  };

  const goTo = (key: VendorWizardStepKey) => setStep(key);
  const previous = () => setStep(VENDOR_WIZARD_STEPS[Math.max(0, wizardStepIndex(step) - 1)].key);
  const next = async () => {
    const target = VENDOR_WIZARD_STEPS[wizardStepIndex(step) + 1]?.key;
    if (!target) return;
    if (!editable) {
      setStep(target);
      return;
    }
    if (await persist({ validateStep: step })) setStep(target);
  };

  /** Full validation of every step + required documents, save, then submit for approval. */
  const submit = async () => {
    if (!canSubmit) return;
    const configs = await loadConfigs();
    const full = validationContext('full', configs);
    const found: VendorFieldErrors = {
      ...validateBasic(values, full), ...validateKyc(values, full), ...validateAddress(values, full),
      ...validateBank(values, full), ...validateCommercial(values, full),
    };
    if (docProblems.length) found['documents.required'] = `Upload the required documents: ${docProblems.map((d) => d.rule.label).join(', ')}`;
    if (Object.keys(found).length) {
      showErrors(found, 'Some required information is missing - the highlighted steps need attention.');
      return;
    }
    const rec = await persist();
    if (!rec) return;
    setBusy('submit');
    try {
      const updated = internal
        ? await adminApi.submitForApproval((rec as VendorOnboardingDetail).id)
        : await publicApi.submitByToken(token!);
      setSubmitIssues(null);
      applySaved(updated);
      if (internal) optionsRef.current.onSaved?.(updated as VendorOnboardingDetail);
      toast.success(internal ? 'Vendor submitted for approval' : 'Thank you! Your information has been submitted for approval.');
    } catch (err) {
      const parsed = parseVendorError(err, 'Submission failed - complete the items listed.');
      if (parsed.issues.length) setSubmitIssues(parsed.issues.filter((i) => i.stage === 'submission'));
      setErrors(parsed.fieldErrors);
      toast.error(parsed.general);
      const first = parsed.issues[0];
      if (first) setStep(wizardStepForServerStep(first.step));
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- documents ---------------- */

  const refresh = async (id: number | null = vendorId): Promise<VendorWizardRecord | null> => {
    const rec = internal ? (id ? await adminApi.getVendor(id) : null) : await publicApi.getRequestByToken(token!);
    if (rec) {
      setRecord(rec);
      if (internal) optionsRef.current.onSaved?.(rec as VendorOnboardingDetail);
    }
    return rec;
  };

  const clearDocumentError = () => setErrors((e) => {
    if (!('documents.required' in e)) return e;
    const nextErrors = { ...e };
    delete nextErrors['documents.required'];
    return nextErrors;
  });

  const uploadDocument = async (category: string, file: File, opts?: UploadOptions) => {
    let id = vendorId;
    if (internal && !id) {
      const rec = await persist();
      if (!rec) throw uploadError("Enter the vendor's name in Basic Information first - the vendor is created on the first save.");
      id = (rec as VendorOnboardingDetail).id;
    }
    const uploadOptions = { onProgress: opts?.onProgress, replaces: opts?.replaces, expiryDate: opts?.expiryDate };
    if (internal) await adminApi.uploadDocument(id!, category, file, uploadOptions);
    else await publicApi.uploadDocumentByToken(token!, category, file, uploadOptions);
    clearDocumentError();
    setSubmitIssues(null);
    await refresh(id);
  };

  const deleteDocument = async (docId: number) => {
    if (internal) {
      if (!vendorId) return;
      await adminApi.deleteDocument(vendorId, docId);
    } else {
      await publicApi.deleteDocumentByToken(token!, docId);
    }
    await refresh();
  };

  const verifyDocument = async (docId: number, status: 'verified' | 'rejected', remarks?: string) => {
    if (!internal || !vendorId) return;
    await adminApi.verifyDocument(vendorId, docId, status, remarks || '');
    toast.success(status === 'verified' ? 'Document verified' : 'Document rejected');
    await refresh();
  };

  const openDocument = async (docId: number) => {
    try {
      const { download_url } = internal
        ? await adminApi.downloadDocument(vendorId!, docId)
        : await publicApi.downloadDocumentByToken(token!, docId);
      window.open(download_url, '_blank', 'noopener');
    } catch {
      toast.error('Unable to open the document.');
    }
  };

  /* ---------------- admin: review, master fields, workflow ---------------- */

  const applyAdminUpdate = (rec: VendorOnboardingDetail, fields?: (keyof VendorFormValues['review'])[]) => {
    setRecord(rec);
    optionsRef.current.onSaved?.(rec);
    if (fields) {
      const form = recordToFormValues(rec);
      const pick = (src: VendorFormValues['review']) => Object.fromEntries(fields.map((f) => [f, src[f]]));
      setValues((v) => ({ ...v, review: { ...v.review, ...pick(form.review) } }));
      setSaved((v) => ({ ...v, review: { ...v.review, ...pick(form.review) } }));
    }
  };

  const saveReview = async (group: 'kyc' | 'bank') => {
    if (!internal || !vendorId) return;
    const r = values.review;
    const fields: (keyof VendorFormValues['review'])[] = group === 'kyc'
      ? ['kyc_status', 'risk_rating', 'compliance_remarks']
      : ['bank_verification_status', 'bank_verification_remarks'];
    if (group === 'kyc' && r.kyc_status === 'rejected' && !r.compliance_remarks.trim()) {
      setErrors((e) => ({ ...e, 'review.compliance_remarks': 'A reason is required when rejecting KYC' }));
      return;
    }
    if (group === 'bank' && r.bank_verification_status === 'rejected' && !r.bank_verification_remarks.trim()) {
      setErrors((e) => ({ ...e, 'review.bank_verification_remarks': 'A reason is required when rejecting the bank account' }));
      return;
    }
    setBusy('review');
    try {
      const rec = await adminApi.reviewVendor(vendorId, Object.fromEntries(fields.map((f) => [f, r[f]])));
      applyAdminUpdate(rec, fields);
      toast.success(group === 'kyc' ? 'KYC review saved' : 'Bank verification saved');
    } catch (err) {
      const parsed = parseVendorError(err, 'Unable to save the review.');
      toast.error(parsed.general);
    } finally {
      setBusy(null);
    }
  };

  /** Rating / headcount / spend - still editable once the vendor is submitted or approved. */
  const saveMasterFields = async () => {
    if (!internal || !vendorId) return;
    const all = buildSectionsPayload(values, { internal, indian, bankConfig });
    const profile = all.profile as Record<string, unknown>;
    setBusy('save');
    try {
      const rec = await adminApi.saveSections(vendorId, {
        profile: { headcount: profile.headcount, rating: profile.rating, manual_amount_spent: profile.manual_amount_spent },
      });
      applySaved(rec);
      optionsRef.current.onSaved?.(rec);
      toast.success('Vendor summary saved');
    } catch (err) {
      const parsed = parseVendorError(err, 'Unable to save the vendor summary.');
      if (Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
      toast.error(parsed.general);
    } finally {
      setBusy(null);
    }
  };

  const approve = async (comments = ''): Promise<string[] | null> => {
    if (!vendorId) return null;
    setBusy('approve');
    try {
      const rec = await adminApi.approveVendor(vendorId, comments);
      applyAdminUpdate(rec);
      toast.success(rec.status === 'approved' ? 'Vendor approved' : 'Approval recorded - moved to the next approval level');
      return null;
    } catch (err) {
      const data = (err as { response?: { data?: { missing?: string[] } } })?.response?.data;
      if (Array.isArray(data?.missing)) return data.missing;
      toast.error(parseVendorError(err, 'Unable to approve this vendor.').general);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const requestChanges = async (payload: RequestChangesPayload) => {
    if (!vendorId) return;
    const rec = await adminApi.requestVendorChanges(vendorId, payload);
    applyAdminUpdate(rec);
    toast.success('Changes requested - the vendor has been notified');
  };

  /** Emails the vendor its secure onboarding link (saving pending changes first). */
  const sendInvite = async () => {
    if (!internal) return;
    let id = vendorId;
    if (!id || isDirty) {
      const rec = await persist();
      if (!rec) return;
      id = (rec as VendorOnboardingDetail).id;
    }
    setBusy('email');
    try {
      await adminApi.resendInvite(id!);
      const rec = (await refresh(id)) as VendorOnboardingDetail | null;
      if (rec?.email_status?.status === 'failed') toast.error('The onboarding email could not be sent. Check the address and try again.');
      else toast.success(`Onboarding email sent to ${rec?.email ?? values.basic.email}`);
    } catch (err) {
      toast.error(parseVendorError(err, 'Unable to send the onboarding email.').general);
    } finally {
      setBusy(null);
    }
  };

  const revealAccountNumber = async (): Promise<string | null> => {
    if (!internal || !vendorId) return null;
    try {
      const detail = await adminApi.getUnmaskedBankDetail(vendorId);
      return detail.account_number || null;
    } catch {
      toast.error('You are not authorized to view the full account number.');
      return null;
    }
  };

  return {
    mode, internal, loading, loadError, busy, choices, record, adminRecord, publicRecord, vendorId,
    values, saved, errors, setErrors, patch, changeCountry, step, steps, goTo, next, previous, saveDraft, submit,
    isDirty, dirty, lastSavedAt, countries, countryCode, indian, entity, countryConfig, taxConfig, bankConfig,
    permissions, editable, canVerify, canEditMaster, canSubmit, documents, maskedAccountNumber,
    docRules, docSlots, docStatus, docProblems, submissionIssues, approvalIssues, summary,
    currencyNotice: currency.notice,
    uploadDocument, deleteDocument, verifyDocument, openDocument, refresh,
    saveReview, saveMasterFields, approve, requestChanges, sendInvite, revealAccountNumber,
  };
}

export type VendorWizard = ReturnType<typeof useVendorWizard>;
