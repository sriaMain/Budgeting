import React, { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Loader2, AlertTriangle, Eye, Mail } from 'lucide-react';
import { Drawer } from '../../components/Drawer';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { SelectField } from '../../components/SelectField';
import { CompactFields, COMPACT_LABEL } from '../../components/fieldDensity';
import { parseApiErrors } from '../../utils/parseApiErrors';
import * as api from '../../services/vendorOnboarding';
import { EMPTY_FORM_VALUES, type VendorOnboardingFormValues } from '../../schemas/vendorOnboarding.schemas';
import type {
  VendorDocument, VendorOnboardingChoices, VendorOnboardingDetail, VendorOnboardingStepKey, VendorPermissions, VendorStepStatus,
} from '../../types/vendorOnboarding.types';
import { Step1VendorDetails } from './steps/Step1VendorDetails';
import { Step2KycCompliance } from './steps/Step2KycCompliance';
import { Step3BankDetails } from './steps/Step3BankDetails';
import { Step4BusinessProcurement } from './steps/Step4BusinessProcurement';
import { Step5Documents } from './steps/Step5Documents';
import {
  vendorToFormValues, persistVendorSection, validateVendorSection, adminSectionApi, formJurisdiction, vendorMasterPayload,
  type VendorFormSection,
} from './vendorOnboardingForm';
import { VENDOR_ONBOARDING_STEPS } from './components/VendorOnboardingPanel';
import { VendorApprovalStep } from './components/VendorApprovalStep';
import { VendorStatusHeader } from './components/VendorStatusHeader';
import { VendorMasterFields } from './components/VendorMasterFields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_SECTIONS: VendorFormSection[] = [1, 2, 3, 4];
const SECTION_KEYS: Record<VendorFormSection, VendorOnboardingStepKey> = { 1: 'intake', 2: 'tax_kyc', 3: 'banking', 4: 'contract' };

const STEP_PILL: Record<VendorStepStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  pending: { label: 'Pending', variant: 'neutral' },
  in_progress: { label: 'In Progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  requires_review: { label: 'Requires Review', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
};

/** Before a vendor record exists, assume the creator may edit - the backend still enforces every permission. */
const NEW_VENDOR_PERMISSIONS: VendorPermissions = {
  edit: true, submit: true, verify: false, approve: false, request_changes: false, send_email: true,
  delete: false, view_unmasked_bank: false, upload_documents: true, delete_documents: true,
};

interface VendorOnboardDrawerProps {
  isOpen: boolean;
  /** Existing vendor to open; null/undefined = onboard a new vendor. */
  vendorId?: number | null;
  /** Section to scroll to on open (e.g. from a step card). */
  initialSection?: VendorOnboardingStepKey;
  onClose: () => void;
  /** Called with the re-fetched vendor after every successful save / review / submit / approval. */
  onSaved: (vendor: VendorOnboardingDetail) => void;
}

/** Drawer wrapper - the content unmounts while closed, so every open starts from fresh server data. */
export const VendorOnboardDrawer: React.FC<VendorOnboardDrawerProps> = (props) => {
  const [title, setTitle] = useState('Onboard Vendor');
  return (
    <Drawer
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.vendorId ? title : 'Onboard Vendor'}
      subtitle="Vendor identity, compliance, banking and commercial setup"
      size="xl"
    >
      <VendorOnboardDrawerContent {...props} onTitleChange={setTitle} />
    </Drawer>
  );
};

/** One scrolling form (like the client drawer): Intake, Tax & KYC, Banking, Contract and Approval
 * sections, all saved together by a single Save button. */
const VendorOnboardDrawerContent: React.FC<VendorOnboardDrawerProps & { onTitleChange: (t: string) => void }> = ({
  vendorId: initialVendorId, initialSection, onClose, onSaved, onTitleChange,
}) => {
  const formRef = useRef<HTMLDivElement>(null);
  const methods = useForm<VendorOnboardingFormValues>({ defaultValues: EMPTY_FORM_VALUES, shouldUnregister: false });

  const [vendorId, setVendorId] = useState<number | null>(initialVendorId ?? null);
  const [vendor, setVendor] = useState<VendorOnboardingDetail | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'send'>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [revealedAccount, setRevealedAccount] = useState<string | null>(null);

  // A saved vendor without a permissions payload (older backend) is only treated as editable in
  // the statuses the backend accepts edits in - otherwise every save would be refused with a 403.
  const perms: VendorPermissions = !vendor
    ? NEW_VENDOR_PERMISSIONS
    : vendor.permissions ?? {
        ...NEW_VENDOR_PERMISSIONS,
        edit: ['invited', 'draft', 'action_required'].includes(vendor.status),
        edit_master: true,
      };
  const editable = !vendor || perms.edit;
  const canReview = !!vendor && perms.verify && vendor.status !== 'approved';
  // Rating / headcount stay editable after submission and approval.
  const canEditMaster = editable || !!perms.edit_master;
  const canSave = editable || canReview || canEditMaster;
  const hasSavedBankAccount = !!vendor?.bank_detail?.account_number_masked;

  // Clear a manually-set (zod) error as soon as its field changes.
  useEffect(() => {
    const sub = methods.watch((_v, { name }) => {
      if (name && methods.getFieldState(name as never).error) methods.clearErrors(name as never);
    });
    return () => sub.unsubscribe();
  }, [methods]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const choicesRes = await api.getChoices();
        if (cancelled) return;
        setChoices(choicesRes);
        if (initialVendorId) {
          // Always the full record from the backend - never the list payload.
          const [v, docs] = await Promise.all([api.getVendor(initialVendorId), api.listDocuments(initialVendorId)]);
          if (cancelled) return;
          methods.reset(vendorToFormValues(v));
          setVendor(v);
          setDocuments(docs);
          onTitleChange(v.name || 'Vendor');
        }
      } catch (err) {
        console.error('Failed to load vendor onboarding', err);
        if (!cancelled) setLoadError('Unable to load this vendor. Please close the drawer and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVendorId]);

  // Opened from a step card - scroll that section into view once the form is on screen.
  useEffect(() => {
    if (loading || !initialSection) return;
    formRef.current?.querySelector(`[data-vendor-section="${initialSection}"]`)?.scrollIntoView({ block: 'start' });
  }, [loading, initialSection]);

  const values = methods.watch();
  const jurisdiction = formJurisdiction(values);

  const focusField = (name: string) => {
    setTimeout(() => {
      try {
        methods.setFocus(name as never);
      } catch {
        /* conditional field not mounted */
      }
    }, 0);
  };

  /** Creates the draft the first time anything needs a vendor id (save, email, document upload). */
  const ensureVendorId = async (): Promise<number> => {
    if (vendorId) return vendorId;
    const step1 = methods.getValues('step1');
    if (!step1.name.trim()) {
      methods.setError('step1.name', { message: 'Enter the legal name first' });
      focusField('step1.name');
      throw new Error('name_required');
    }
    const created = await api.createDraft({ name: step1.name, vendor_type: step1.vendor_type, email: step1.email, phone: step1.phone });
    setVendorId(created.id);
    setVendor(created);
    return created.id;
  };

  const refetch = async (id: number) => {
    const [fresh, docs] = await Promise.all([api.getVendor(id), api.listDocuments(id)]);
    setVendor(fresh);
    setDocuments(docs);
    methods.setValue('review', vendorToFormValues(fresh).review);
    onTitleChange(fresh.name || 'Vendor');
    onSaved(fresh);
    return fresh;
  };

  /** Maps server field errors back onto the form (or toasts a general message). */
  const applyServerErrors = (err: unknown, group: string) => {
    const errors = parseApiErrors(err);
    const groupValues = methods.getValues(group as never) as unknown as Record<string, unknown> | undefined;
    const fieldErrors = Object.entries(errors).filter(([k, v]) => k !== 'general' && v && groupValues && k in groupValues);
    fieldErrors.forEach(([k, v]) => methods.setError(`${group}.${k}` as never, { message: String(v) }));
    if (fieldErrors.length) focusField(`${group}.${fieldErrors[0][0]}`);
    toast.error(errors.general || (fieldErrors.length ? 'Please fix the highlighted fields.' : 'Unable to save. Please try again.'));
  };

  /** Saves the internal KYC / bank review fields when the user may verify and they changed. */
  const saveReview = async (id: number): Promise<boolean> => {
    if (!canReview || !vendor) return true;
    const r = methods.getValues('review');
    const current = vendor.review as unknown as Record<string, string>;
    const isChanged = (group: Record<string, string>) => Object.entries(group).some(([k, v]) => current[k] !== v);
    // Each group is sent whole - a rejection's reason must arrive with the status.
    const kyc = { kyc_status: r.kyc_status, risk_rating: r.risk_rating, compliance_remarks: r.compliance_remarks };
    const bank = { bank_verification_status: r.bank_verification_status, bank_verification_remarks: r.bank_verification_remarks };
    const payload = { ...(isChanged(kyc) ? kyc : {}), ...(isChanged(bank) ? bank : {}) };
    if (!Object.keys(payload).length) return true;
    try {
      await api.reviewVendor(id, payload);
      return true;
    } catch (err) {
      applyServerErrors(err, 'review');
      return false;
    }
  };

  /** Saves every section. `validate` (before submitting for review) checks all required fields;
   * a plain save keeps partial data, like a draft. Returns the vendor id, or null on failure. */
  const saveAll = async (validate: boolean): Promise<number | null> => {
    methods.clearErrors();
    if (validate && editable) {
      const invalid = FORM_SECTIONS.map((s) => validateVendorSection(methods, s, { hasSavedBankAccount, documents })).find(Boolean);
      if (invalid) {
        toast.error('Please complete the highlighted fields.');
        focusField(invalid);
        return null;
      }
    }
    if (!editable && !vendorId) return null;
    let id: number;
    try {
      id = await ensureVendorId();
    } catch (err) {
      if ((err as Error).message !== 'name_required') toast.error(parseApiErrors(err).general || 'Unable to create the vendor.');
      return null;
    }
    if (editable) {
      for (const section of FORM_SECTIONS) {
        try {
          await persistVendorSection(methods.getValues(), section, adminSectionApi(id));
        } catch (err) {
          console.error(`Saving vendor section ${section} failed`, err);
          applyServerErrors(err, `step${section}`);
          await refetch(id).catch(() => {});
          return null;
        }
      }
      await api.patchDraft(id, { last_saved_step: Math.max(vendor?.last_saved_step ?? 1, 5) }).catch(() => {});
    } else if (canEditMaster) {
      try {
        await api.patchProfile(id, vendorMasterPayload(methods.getValues('step1')));
      } catch (err) {
        applyServerErrors(err, 'step1');
        return null;
      }
    }
    if (!(await saveReview(id))) return null;
    await refetch(id).catch(() => {});
    return id;
  };

  const handleSave = async () => {
    const isNew = !vendorId;
    setBusy('save');
    try {
      if (await saveAll(false)) {
        toast.success(isNew ? 'Vendor created' : 'Vendor details saved');
        // Like the client drawer: stay open after creating (documents, email, submit), close after an update.
        if (!isNew) onClose();
      }
    } finally {
      setBusy(null);
    }
  };

  const requestSend = () => {
    const step1 = methods.getValues('step1');
    if (!step1.name.trim() || !EMAIL_RE.test(step1.email.trim())) {
      if (!step1.name.trim()) methods.setError('step1.name', { message: 'Legal name is required to send the onboarding email' });
      if (!EMAIL_RE.test(step1.email.trim())) methods.setError('step1.email', { message: 'A valid contact email is required to send the onboarding email' });
      focusField(!step1.name.trim() ? 'step1.name' : 'step1.email');
      return;
    }
    setConfirmSend(true);
  };

  const handleSendEmail = async () => {
    setBusy('send');
    try {
      let id = vendorId;
      if (editable) {
        id = await ensureVendorId();
        // Make sure the saved contact email matches what's on screen before emailing it.
        const { name, vendor_type, email, phone } = methods.getValues('step1');
        await api.patchDraft(id, { name, vendor_type, email, phone });
      }
      if (!id) return;
      await api.resendInvite(id);
      const fresh = await refetch(id);
      if (fresh.email_status?.status === 'failed') toast.error('The onboarding email could not be sent. Check the address and try again.');
      else toast.success(`Onboarding email sent to ${fresh.email}`);
    } catch (err) {
      if ((err as Error).message === 'name_required') return;
      console.error('Sending vendor onboarding email failed', err);
      toast.error(parseApiErrors(err).general || 'Unable to send the onboarding email. Please try again.');
    } finally {
      setBusy(null);
      setConfirmSend(false);
    }
  };

  // ---------- documents ----------
  const docProps = {
    documents,
    disabled: !!busy,
    readOnly: !editable || !perms.upload_documents,
    canVerify: perms.verify && !!vendorId,
    onUpload: async (category: string, file: File) => {
      const id = await ensureVendorId();
      await api.uploadDocument(id, category, file);
      await refetch(id);
    },
    onDelete: async (docId: number) => {
      if (!vendorId) return;
      await api.deleteDocument(vendorId, docId);
      await refetch(vendorId);
    },
    onVerify: async (docId: number, status: 'verified' | 'rejected', remarks?: string) => {
      if (!vendorId) return;
      await api.verifyDocument(vendorId, docId, status, remarks || '');
      toast.success(status === 'verified' ? 'Document verified' : 'Document rejected');
      await refetch(vendorId);
    },
    onDownload: async (docId: number) => {
      if (!vendorId) return;
      try {
        const { download_url } = await api.downloadDocument(vendorId, docId);
        window.open(download_url, '_blank', 'noopener');
      } catch {
        toast.error('Unable to open the document.');
      }
    },
  };

  const revealAccount = async () => {
    if (!vendorId) return;
    try {
      const detail = await api.getUnmaskedBankDetail(vendorId);
      setRevealedAccount(detail.account_number || null);
    } catch {
      toast.error('You are not authorized to view the full account number.');
    }
  };

  if (loading || !choices) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
        {loadError ?? (<><Loader2 className="w-4 h-4 animate-spin" /> Loading vendor…</>)}
      </p>
    );
  }

  const statuses = vendor?.onboarding?.step_statuses;
  const reviewSelect = (name: 'review.kyc_status' | 'review.risk_rating' | 'review.bank_verification_status', label: string, options: { value: string; label: string }[]) => (
    <SelectField label={label} options={options} {...methods.register(name)} error={(methods.formState.errors.review as Record<string, { message?: string }> | undefined)?.[name.split('.')[1]]?.message} />
  );
  const reviewTextarea = (name: 'review.compliance_remarks' | 'review.bank_verification_remarks', label: string, placeholder: string) => {
    const err = (methods.formState.errors.review as Record<string, { message?: string }> | undefined)?.[name.split('.')[1]]?.message;
    return (
      <div className="md:col-span-2">
        <label className={COMPACT_LABEL}>{label}</label>
        <textarea
          {...methods.register(name)}
          rows={2}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-800 dark:focus:ring-violet-500 ${err ? 'ring-2 ring-red-500' : ''}`}
        />
        {err && <p className="text-xs text-red-600 mt-1 dark:text-red-400">{err}</p>}
      </div>
    );
  };

  const internalPanel = (title: string, children: React.ReactNode) => (
    <fieldset disabled={!!busy} className="min-w-0">
      <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">Internal only - never shown to the vendor.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{children}</div>
      </section>
    </fieldset>
  );

  /** Numbered section header with the step's server-computed status pill (existing vendors only). */
  const sectionHeader = (index: number, key: VendorOnboardingStepKey) => {
    const meta = VENDOR_ONBOARDING_STEPS[index];
    const status = statuses?.[key];
    return (
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{index + 1}. {meta.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
        </div>
        {status && <StatusBadge status={status} variant={STEP_PILL[status].variant} label={STEP_PILL[status].label} />}
      </div>
    );
  };

  const sectionDocuments = (section: VendorFormSection, title: string) => (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 dark:text-gray-300">{title}</h4>
      <Step5Documents {...docProps} step={SECTION_KEYS[section] as 'intake' | 'tax_kyc' | 'banking' | 'contract'} />
    </div>
  );

  const SECTION_CLASS = 'border-t pt-6 dark:border-gray-800';

  return (
    <FormProvider {...methods}>
      <CompactFields>
        <div ref={formRef} className="space-y-8">
          {vendor && <VendorStatusHeader vendor={vendor} />}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {jurisdiction} vendor &middot; {vendor?.onboarding?.percent ?? 0}% complete
            </p>
            {perms.send_email && vendor?.status !== 'approved' && (
              <button
                type="button"
                onClick={requestSend}
                disabled={!!busy}
                title="Email the vendor a secure link to complete onboarding themselves"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-blue-600 text-blue-700 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50 dark:border-violet-500 dark:text-violet-300 dark:hover:bg-violet-500/10"
              >
                {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                {vendor?.email_status?.status === 'sent' ? 'Resend Onboarding Email' : 'Send Onboarding Email'}
              </button>
            )}
          </div>

          {!editable && vendor && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                This vendor is {vendor.status_display.toLowerCase()} - its details are read-only here.
                {canReview && ' You can still record the KYC, banking and document review.'}
                {canEditMaster && ' Headcount and rating can still be updated.'}
              </span>
            </div>
          )}
          {vendor?.status === 'action_required' && vendor.change_requests.find((c) => c.status === 'open') && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <span className="font-semibold">Changes requested: </span>
              {vendor.change_requests.find((c) => c.status === 'open')!.required_changes}
            </div>
          )}

          {/* 1. Intake */}
          <section data-vendor-section="intake">
            {sectionHeader(0, 'intake')}
            <fieldset disabled={!editable || !!busy} className="min-w-0">
              <Step1VendorDetails vendorTypeOptions={choices.vendor_types} />
            </fieldset>
            <fieldset disabled={!canEditMaster || !!busy} className="min-w-0">
              <VendorMasterFields financials={vendor?.financials} disabled={!canEditMaster || !!busy} />
            </fieldset>
            {sectionDocuments(1, 'Intake Documents')}
            {!values.step1.msme_registered && (
              <p className="text-xs text-gray-500 dark:text-gray-400">No documents are needed for Intake unless the vendor is MSME registered.</p>
            )}
          </section>

          {/* 2. Tax & KYC */}
          <section data-vendor-section="tax_kyc" className={SECTION_CLASS}>
            {sectionHeader(1, 'tax_kyc')}
            <fieldset disabled={!editable || !!busy} className="min-w-0">
              <Step2KycCompliance />
            </fieldset>
            {canReview && internalPanel('KYC Review', <>
              {reviewSelect('review.kyc_status', 'KYC Status', choices.kyc_statuses)}
              {reviewSelect('review.risk_rating', 'Risk Rating', choices.risk_ratings)}
              {reviewTextarea('review.compliance_remarks', 'Compliance Remarks', 'Required when rejecting, and for high-risk vendors (record the enhanced review)')}
            </>)}
            {sectionDocuments(2, 'Tax & KYC Documents')}
          </section>

          {/* 3. Banking */}
          <section data-vendor-section="banking" className={SECTION_CLASS}>
            {sectionHeader(2, 'banking')}
            <fieldset disabled={!editable || !!busy} className="min-w-0">
              <Step3BankDetails existingAccountNumberMasked={vendor?.bank_detail?.account_number_masked || undefined} />
            </fieldset>
            {perms.view_unmasked_bank && vendor?.bank_detail?.account_number_masked && (
              <p className="text-xs text-gray-500 mb-4 dark:text-gray-400">
                Account on file: <span className="font-mono">{revealedAccount ?? vendor.bank_detail.account_number_masked}</span>{' '}
                {!revealedAccount && (
                  <button type="button" onClick={revealAccount} className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-violet-300">
                    <Eye className="w-3.5 h-3.5" /> Reveal
                  </button>
                )}
              </p>
            )}
            {canReview && internalPanel('Bank Verification', <>
              {reviewSelect('review.bank_verification_status', 'Bank Verification Status', choices.bank_verification_statuses)}
              <div />
              {reviewTextarea('review.bank_verification_remarks', 'Verification Remarks', 'Required when rejecting')}
            </>)}
            {sectionDocuments(3, 'Banking Documents')}
          </section>

          {/* 4. Contract */}
          <section data-vendor-section="contract" className={SECTION_CLASS}>
            {sectionHeader(3, 'contract')}
            <fieldset disabled={!editable || !!busy} className="min-w-0">
              <Step4BusinessProcurement
                currencyOptions={choices.onboarding_currencies?.length ? choices.onboarding_currencies : (choices.currencies ?? [])}
                paymentTermOptions={choices.payment_terms}
                billingFrequencyOptions={choices.billing_frequencies}
              />
            </fieldset>
            {sectionDocuments(4, 'Contract Documents')}
          </section>

          {/* 5. Approval - checklist, submit for review, approve / request changes, history */}
          <section data-vendor-section="approved" className={SECTION_CLASS}>
            {sectionHeader(4, 'approved')}
            {vendor ? (
              <VendorApprovalStep
                vendor={vendor}
                sectionOptions={choices.change_request_sections}
                onBeforeSubmit={async () => !!(await saveAll(true))}
                onSendEmail={requestSend}
                isSendingEmail={busy === 'send'}
                onChanged={(v) => {
                  refetch(v.id).catch(() => setVendor(v));
                }}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Save the vendor first - the approval checklist and Submit for Review appear once it exists.</p>
            )}
          </section>

          {/* Footer - one save for every section */}
          <div className="sticky bottom-0 -mx-6 -mb-5 px-6 py-4 bg-white border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 dark:bg-gray-900 dark:border-gray-800">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Fields marked * are required to submit for review. You can save partial details at any time.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={!!busy}
                className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {canSave ? 'Cancel' : 'Close'}
              </button>
              {canSave && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!!busy}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-md disabled:opacity-50"
                >
                  {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {!vendor ? 'Create Vendor' : 'Save Vendor'}
                </button>
              )}
            </div>
          </div>
        </div>
      </CompactFields>

      <ConfirmDialog
        isOpen={confirmSend}
        onClose={() => (busy === 'send' ? undefined : setConfirmSend(false))}
        onConfirm={handleSendEmail}
        title="Send onboarding email"
        message={
          <>
            The vendor will receive a secure link to complete their onboarding at <strong>{methods.getValues('step1.email')}</strong>.
            Any link sent earlier will stop working.
          </>
        }
        confirmLabel="Send Email"
      />
    </FormProvider>
  );
};
