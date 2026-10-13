import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Lock } from 'lucide-react';
import { Drawer } from './Drawer';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { CompactFields } from './fieldDensity';
import { ClientDocumentsSection } from './ClientDocumentsSection';
import { WizardFooter, WizardProgress, type WizardStep, type WizardStepState } from './onboarding/OnboardingWizard';
import { useCountryCurrency } from './onboarding/useCountryCurrency';
import type { AddressValue } from './onboarding/addressForm';
import type { BankFormValue } from './onboarding/bankForm';
import { useCountries, useCountryConfig } from '../hooks/useCountries';
import {
  createClient,
  fetchClient,
  fetchCompanyTags,
  listClientDocuments,
  readClientApiError,
  revealClientBankAccount,
  submitClient,
  updateClient,
} from '../services/clientOnboarding';
import {
  ADDRESS_FIELD,
  BANK_FIELD,
  WIZARD_STEP_ORDER,
  buildClientForm,
  changedPayload,
  createPayload,
  documentProblems,
  effectiveBankCountry,
  firstStepWithError,
  isBillingCurrency,
  isFormDirty,
  slotStatus,
  stepForField,
  validateAll,
  validateStep,
  type ClientFormState,
  type FieldErrors,
  type ValidationContext,
} from '../pages/client-onboarding/clientForm';
import { AddressStep, BankingStep, BasicStep, CommercialsStep, IdentityStep, type IdentityVerificationSummary } from '../pages/client-onboarding/ClientWizardSteps';
import { ClientReviewStep } from '../pages/client-onboarding/ClientReviewStep';
import { clientRecordPermissions, useClientPermissions } from '../pages/client-onboarding/useClientPermissions';
import {
  BILLING_CURRENCIES,
  clientTypeLabel,
  kycStatusLabel,
  kycStatusVariant,
  type Client,
  type ClientDocument,
  type ClientDocumentSlot,
  type CompanyTag,
  type UserRole,
  type WizardStepKey,
} from '../pages/client-onboarding/clientTypes';

interface ClientKycDrawerProps {
  isOpen: boolean;
  /** Omit to onboard a new client. */
  client?: Client;
  userRole: UserRole;
  /** Step to open on (e.g. from an onboarding step card). */
  initialStep?: WizardStepKey;
  onClose: () => void;
  /** Any saved change (create, draft, submit, approval, compliance review) - keeps the caller's list in sync. */
  onClientChanged: (client: Client) => void;
}

const STEPS: { key: WizardStepKey; title: string; description: string }[] = [
  { key: 'basic', title: 'Basic Information', description: 'Legal name, type, country, currency and contact' },
  { key: 'identity', title: 'Identity & KYC', description: 'PAN / GSTIN or the country tax ID, registration and signatory' },
  { key: 'address', title: 'Address', description: 'Registered address' },
  { key: 'banking', title: 'Banking', description: 'Bank account, verified by a reviewer' },
  { key: 'commercials', title: 'Commercials', description: 'Payment terms, billing contact and invoicing' },
  { key: 'documents', title: 'KYC Documents', description: 'Required documents for this client' },
  { key: 'review', title: 'Review & Submit', description: 'Check everything and submit for approval' },
];

const IDENTITY_CATEGORIES = new Set(['pan_document', 'gst_certificate', 'registration_certificate', 'authorised_signatory_id', 'government_id', 'tax_certificate', 'tax_residency_certificate']);

const FORM_KEY_TO_API: Partial<Record<keyof ClientFormState, string>> = { phone: 'mobile_number' };

function identityVerification(slots: ClientDocumentSlot[], documents: ClientDocument[], saved: boolean): IdentityVerificationSummary {
  const identity = slots.filter((s) => s.required && IDENTITY_CATEGORIES.has(s.category));
  if (!saved || identity.length === 0) {
    return { tone: 'neutral', label: 'Not started', detail: 'Upload the identity documents in KYC Documents; a reviewer verifies them.' };
  }
  const statuses = identity.map((s) => slotStatus(s, documents));
  if (statuses.every((s) => s === 'verified')) return { tone: 'ok', label: 'Verified by reviewer', detail: 'Every required identity document has been verified.' };
  if (statuses.includes('rejected')) return { tone: 'bad', label: 'Document rejected', detail: 'A reviewer rejected an identity document - see KYC Documents.' };
  if (statuses.includes('expired')) return { tone: 'bad', label: 'Document expired', detail: 'Upload a current version of the expired document.' };
  if (statuses.includes('missing')) return { tone: 'neutral', label: 'Documents missing', detail: 'Some required identity documents have not been uploaded yet.' };
  return { tone: 'warn', label: 'Awaiting reviewer verification', detail: 'Uploaded documents are not verified until a reviewer checks them.' };
}

/**
 * Client onboarding wizard in a drawer: Basic Information -> Identity & KYC -> Address -> Banking
 * -> Commercials -> KYC Documents -> Review & Submit. One form state for every step; Save draft
 * PATCHes only changed fields (only malformed values are rejected), Save & next validates the
 * step first, Submit validates everything and the server re-checks required fields and documents.
 */
export const ClientKycDrawer: React.FC<ClientKycDrawerProps> = (props) => (props.isOpen ? <ClientKycWizard {...props} /> : null);

const ClientKycWizard: React.FC<ClientKycDrawerProps> = ({ client, userRole, initialStep, onClose, onClientChanged }) => {
  const { countries } = useCountries();
  const { can } = useClientPermissions(userRole);
  const [record, setRecord] = useState<Client | undefined>(client);
  const [form, setForm] = useState<ClientFormState>(() => buildClientForm(client));
  const [baseline, setBaseline] = useState<ClientFormState>(() => buildClientForm(client));
  const [step, setStep] = useState<WizardStepKey>(initialStep ?? 'basic');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<{ text: string; items?: string[] } | null>(null);
  const [busy, setBusy] = useState<null | 'saving' | 'submitting'>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);

  const recordId = record?.id;
  const perms = clientRecordPermissions(can, record);
  const readOnly = !perms.edit;
  const bankingReadOnly = readOnly || !perms.edit_banking;
  const commercialsReadOnly = readOnly || !perms.edit_commercials;

  const { config: countryConfig } = useCountryConfig(form.country);
  const { config: bankConfig } = useCountryConfig(effectiveBankCountry(form));

  const dirty = isFormDirty(form, baseline);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // List rows can be stale: re-read the client (permissions, document slots) when the drawer opens.
  const initialId = client?.id;
  useEffect(() => {
    if (!initialId) return;
    let alive = true;
    fetchClient(initialId)
      .then((fresh) => {
        if (!alive) return;
        setRecord(fresh);
        if (!dirtyRef.current) {
          setForm(buildClientForm(fresh));
          setBaseline(buildClientForm(fresh));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [initialId]);

  useEffect(() => {
    let alive = true;
    fetchCompanyTags()
      .then((rows) => {
        if (alive) setTags(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!recordId) return;
    let alive = true;
    listClientDocuments(recordId)
      .then((rows) => {
        if (!alive) return;
        setDocuments(rows);
        setDocsError(null);
      })
      .catch((err) => {
        if (alive) setDocsError(readClientApiError(err, 'Unable to load the KYC documents.').message);
      });
    return () => {
      alive = false;
    };
  }, [recordId]);

  const reloadDocuments = () => {
    if (!recordId) return;
    setDocsError(null);
    listClientDocuments(recordId)
      .then(setDocuments)
      .catch((err) => setDocsError(readClientApiError(err, 'Unable to load the KYC documents.').message));
  };

  /** Re-reads the client after a server-side change (documents, review actions) without touching the form. */
  const refreshRecord = (id = recordId) => {
    if (!id) return;
    fetchClient(id)
      .then((fresh) => {
        setRecord(fresh);
        onClientChanged(fresh);
      })
      .catch(() => undefined);
  };

  const currency = useCountryCurrency({
    currency: form.currency,
    setCurrency: (code) => setForm((f) => ({ ...f, currency: isBillingCurrency(code) ? code : f.currency })),
    allowed: BILLING_CURRENCIES,
  });

  const clearErrors = (keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  const setField = <K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors([FORM_KEY_TO_API[key] ?? key]);
  };
  const patchAddress = (patch: Partial<AddressValue>) => {
    setForm((f) => ({ ...f, address: { ...f.address, ...patch } }));
    clearErrors(Object.keys(patch).map((k) => ADDRESS_FIELD[k] ?? k));
  };
  const patchBank = (patch: Partial<BankFormValue>) => {
    setForm((f) => ({ ...f, bank: { ...f.bank, ...patch } }));
    clearErrors(Object.keys(patch).map((k) => BANK_FIELD[k] ?? k));
  };
  const changeCountry = (name: string) => {
    const previous = form.country;
    setForm((f) => ({ ...f, country: name }));
    clearErrors(['country', 'tax_id', 'pan', 'gstin', 'postal_code']);
    currency.onCountryChange(previous, name);
  };

  const slots = record?.document_slots ?? [];
  const slotCategories = slots.map((s) => s.category as string);
  const ctx: ValidationContext = {
    countries,
    countryConfig,
    bankConfig,
    hasSavedAccount: !!record?.bank_account_number_masked,
    slots,
    documents: documents ?? [],
  };

  const showErrors = (found: FieldErrors, message: string) => {
    setErrors(found);
    const target = firstStepWithError(found, slotCategories);
    if (target) setStep(target);
    toast.error(message);
  };

  const applySaved = (saved: Client) => {
    const next = buildClientForm(saved);
    setRecord(saved);
    setForm(next);
    setBaseline(next);
    setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    onClientChanged(saved);
  };

  const showSaveError = (err: unknown, fallback: string) => {
    const apiError = readClientApiError(err, fallback);
    const fieldErrors = { ...apiError.fields };
    apiError.issues.forEach((issue) => {
      fieldErrors[issue.field] = issue.message;
    });
    const mapped = Object.keys(fieldErrors).filter((f) => stepForField(f, slotCategories));
    setErrors(fieldErrors);
    setBanner({ text: apiError.message, items: apiError.missing.length > 1 ? apiError.missing : undefined });
    const target = apiError.issues[0]?.step ?? firstStepWithError(fieldErrors, slotCategories);
    if (target && mapped.length) setStep(target);
    toast.error(apiError.message);
  };

  /** Creates the client or PATCHes the changed fields. Returns the saved client, or null on failure. */
  const persist = async (): Promise<Client | null> => {
    try {
      if (!record) {
        const created = await createClient(createPayload(form, bankConfig));
        applySaved(created);
        toast.success('Client saved as a draft - continue with the next steps');
        return created;
      }
      const payload = changedPayload(form, baseline, bankConfig);
      if (Object.keys(payload).length === 0) return record;
      const updated = await updateClient(record.id, payload);
      applySaved(updated);
      return updated;
    } catch (err) {
      showSaveError(err, 'Could not save the client.');
      return null;
    }
  };

  const goTo = (key: WizardStepKey) => {
    setBanner(null);
    setStep(key);
  };

  const stepIndex = WIZARD_STEP_ORDER.indexOf(step);

  const handleSaveDraft = async () => {
    setBanner(null);
    const found = { ...validateAll(form, ctx, 'draft'), ...(record ? {} : validateStep('basic', form, ctx, 'full')) };
    if (Object.keys(found).length) {
      showErrors(found, record ? 'Fix the highlighted values before saving.' : 'Complete Basic Information to save the client.');
      return;
    }
    setBusy('saving');
    const wasNew = !record;
    const saved = await persist();
    setBusy(null);
    if (saved && !wasNew) toast.success('Draft saved');
  };

  const handleNext = async () => {
    const next = WIZARD_STEP_ORDER[stepIndex + 1];
    if (!next) return;
    if (readOnly || step === 'documents' || step === 'review') {
      if (step === 'documents' && record && documentProblems(slots, documents ?? []).length) {
        toast('Some required documents are still missing - you can upload them before submitting.', { icon: '⚠️' });
      }
      goTo(next);
      return;
    }
    setBanner(null);
    const found = {
      ...validateAll(form, ctx, 'draft'),
      ...(record ? {} : validateStep('basic', form, ctx, 'full')),
      ...validateStep(step, form, ctx, 'full'),
    };
    if (Object.keys(found).length) {
      showErrors(found, 'Complete the highlighted fields to continue.');
      return;
    }
    setBusy('saving');
    const saved = await persist();
    setBusy(null);
    if (saved) {
      setErrors({});
      goTo(next);
    }
  };

  const handlePrevious = () => {
    const previous = WIZARD_STEP_ORDER[stepIndex - 1];
    if (previous) goTo(previous);
  };

  const handleSubmit = async () => {
    if (!record) return;
    setBanner(null);
    const found = validateAll(form, ctx, 'full');
    if (Object.keys(found).length) {
      showErrors(found, 'Complete the highlighted fields before submitting.');
      return;
    }
    setBusy('submitting');
    try {
      const saved = await persist();
      if (!saved) return;
      const submitted = await submitClient(saved.id);
      applySaved(submitted);
      toast.success('Submitted for approval');
      onClose();
    } catch (err) {
      showSaveError(err, 'Could not submit the client.');
    } finally {
      setBusy(null);
    }
  };

  const requestClose = () => {
    if (dirty && !readOnly) setConfirmClose(true);
    else onClose();
  };

  const revealAccount = async () => {
    if (!recordId) return null;
    try {
      return await revealClientBankAccount(recordId);
    } catch (err) {
      toast.error(readClientApiError(err, 'Could not reveal the account number.').message);
      return null;
    }
  };

  /* ---------------- step states / issues ---------------- */

  const docList = documents ?? [];
  const docProblems = record ? documentProblems(slots, docList) : [];
  const stepIssues: Partial<Record<WizardStepKey, string[]>> = {};
  const addIssue = (key: WizardStepKey, message: string) => {
    const list = (stepIssues[key] ??= []);
    if (!list.includes(message)) list.push(message);
  };
  Object.entries(validateAll(form, ctx, 'full')).forEach(([field, message]) => {
    const key = stepForField(field, slotCategories);
    if (key) addIssue(key, message);
  });
  Object.entries(errors).forEach(([field, message]) => {
    const key = stepForField(field, slotCategories);
    if (key) addIssue(key, message);
  });
  if (!record) addIssue('documents', 'Save the client to upload its KYC documents');

  const stateFor = (key: WizardStepKey): WizardStepState => {
    if (Object.keys(errors).some((f) => stepForField(f, slotCategories) === key)) return 'error';
    if (key === 'review') return record && (record.kyc_status === 'submitted' || record.kyc_status === 'verified') ? 'complete' : 'incomplete';
    if (key === 'documents') return record && documents && docProblems.length === 0 ? 'complete' : 'incomplete';
    return stepIssues[key]?.length ? 'incomplete' : 'complete';
  };
  const wizardSteps: WizardStep[] = STEPS.map((s) => ({ ...s, state: stateFor(s.key) }));

  const submitBlockedReason = !record
    ? 'Save the client and upload its documents first'
    : documents === null
      ? 'Loading documents…'
      : docProblems.length
        ? `Required documents missing, rejected or expired: ${docProblems.map((p) => p.slot.label).join(', ')}`
        : undefined;

  const statusText = record ? (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status={record.kyc_status} variant={kycStatusVariant(record.kyc_status)} label={`KYC: ${kycStatusLabel(record.kyc_status)}`} />
      {perms.locked && (
        <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <Lock className="w-3.5 h-3.5" /> Read-only while awaiting approval
        </span>
      )}
      {!perms.locked && readOnly && <span className="text-gray-500 dark:text-gray-400">Read-only - you don't have permission to edit this client</span>}
    </span>
  ) : (
    'New client - nothing is saved until you save the Basic Information.'
  );

  const note = dirty ? 'Unsaved changes' : savedAt ? `Saved at ${savedAt}` : undefined;

  const footer = (
    <WizardFooter
      isFirst={stepIndex === 0}
      isLast={step === 'review'}
      onPrevious={handlePrevious}
      onNext={handleNext}
      onSaveDraft={readOnly ? undefined : handleSaveDraft}
      onSubmit={perms.submit || !record ? handleSubmit : undefined}
      onCancel={requestClose}
      isSaving={busy === 'saving'}
      isSubmitting={busy === 'submitting'}
      submitLabel="Submit for approval"
      submitBlockedReason={submitBlockedReason}
      readOnly={readOnly}
      note={note}
    />
  );

  const title = record ? record.company_name : 'Onboard client';
  const subtitle = record
    ? [clientTypeLabel(record.client_type), record.country, record.currency].filter(Boolean).join(' · ')
    : 'New client onboarding';

  return (
    <Drawer isOpen onClose={requestClose} title={title} subtitle={subtitle} size="xl" footer={footer}>
      <CompactFields>
        <div className="space-y-5">
          <div className="sticky top-0 z-20 -mx-6 -mt-5 px-6 pt-5 pb-3 bg-white border-b border-gray-100 dark:bg-gray-900 dark:border-gray-800">
            <WizardProgress steps={wizardSteps} currentKey={step} onStepChange={(key) => goTo(key as WizardStepKey)} statusText={statusText} />
          </div>

          {banner && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {banner.text}</p>
              {banner.items && (
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {banner.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
          )}

          {step === 'basic' && (
            <BasicStep
              form={form}
              errors={errors}
              readOnly={readOnly}
              setField={setField}
              tags={tags}
              onCountryChange={changeCountry}
              currencyNotice={currency.notice}
            />
          )}
          {step === 'identity' && (
            <IdentityStep
              form={form}
              errors={errors}
              readOnly={readOnly}
              setField={setField}
              countryConfig={countryConfig}
              verification={identityVerification(slots, docList, !!record)}
            />
          )}
          {step === 'address' && <AddressStep form={form} errors={errors} readOnly={readOnly} patchAddress={patchAddress} />}
          {step === 'banking' && (
            <BankingStep
              form={form}
              errors={errors}
              readOnly={bankingReadOnly}
              noBankingPermission={!readOnly && !perms.edit_banking}
              patchBank={patchBank}
              maskedAccountNumber={record?.bank_account_number_masked}
              onRevealAccountNumber={perms.view_unmasked_bank && record ? revealAccount : undefined}
              canVerify={perms.verify_documents && !!record}
              verifyDisabled={readOnly}
              onVerificationChange={(value) => setField('banking_verification_status', value)}
            />
          )}
          {step === 'commercials' && (
            <CommercialsStep
              form={form}
              errors={errors}
              readOnly={commercialsReadOnly}
              setField={setField}
              noCommercialPermission={!readOnly && !perms.edit_commercials}
            />
          )}
          {step === 'documents' &&
            (record ? (
              <ClientDocumentsSection
                clientId={record.id}
                slots={slots}
                documents={docList}
                onDocumentsChange={setDocuments}
                onChanged={() => refreshRecord()}
                canUpload={perms.upload_documents}
                canDelete={perms.delete_documents}
                canVerify={perms.verify_documents}
                readOnly={!perms.upload_documents}
                loading={documents === null && !docsError}
                loadError={docsError}
                onRetry={reloadDocuments}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Save the Basic Information first - documents are uploaded against the saved client.
              </p>
            ))}
          {step === 'review' && (
            <ClientReviewStep
              form={form}
              record={record}
              perms={perms}
              countryConfig={countryConfig}
              bankConfig={bankConfig}
              stepIssues={stepIssues}
              slots={slots}
              documents={docList}
              tags={tags}
              dirty={dirty}
              onEditStep={goTo}
              onRecordChange={(updated) => refreshRecord(updated.id)}
              onApproved={(approved) => {
                applySaved(approved);
                onClose();
              }}
            />
          )}
        </div>
      </CompactFields>

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        message="You have changes that haven't been saved. Close the onboarding form anyway?"
        confirmLabel="Discard changes"
      />
    </Drawer>
  );
};
