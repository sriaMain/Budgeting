import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../../../components/Button';
import { StatusBadge } from '../../../components/StatusBadge';
import { CompactFields } from '../../../components/fieldDensity';
import { Step1VendorDetails } from '../steps/Step1VendorDetails';
import { Step2KycCompliance } from '../steps/Step2KycCompliance';
import { Step3BankDetails } from '../steps/Step3BankDetails';
import { Step4BusinessProcurement } from '../steps/Step4BusinessProcurement';
import { Step5Documents } from '../steps/Step5Documents';
import { ActionRequiredBanner } from './ActionRequiredBanner';
import { EMPTY_FORM_VALUES, type VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import {
  publicDetailToFormValues, persistVendorSection, validateVendorSection, computeVendorCompletion, publicSectionApi,
  type VendorFormSection,
} from '../vendorOnboardingForm';
import type { VendorPublicChoices } from '../../../types/vendorOnboarding.types';
import type { VendorPublicDetail } from '../../../types/vendorOnboardingPublic.types';
import type { VendorDocument } from '../../../types/vendorOnboarding.types';
import * as api from '../../../services/vendorOnboardingPublic';
import { parseApiErrors } from '../../../utils/parseApiErrors';

const FORM_SECTIONS: VendorFormSection[] = [1, 2, 3, 4];
/** Same sections, order and document placement as the internal onboarding drawer. */
const SECTIONS: { section: VendorFormSection; key: 'intake' | 'tax_kyc' | 'banking' | 'contract'; title: string; description: string; changeRequestSections: string[] }[] = [
  { section: 1, key: 'intake', title: 'Vendor Information', description: 'Legal entity, services and contacts', changeRequestSections: ['vendor_details'] },
  { section: 2, key: 'tax_kyc', title: 'Tax & KYC', description: 'Tax ID, ownership, compliance and documents', changeRequestSections: ['kyv_compliance', 'documents'] },
  { section: 3, key: 'banking', title: 'Banking', description: 'Account and routing details', changeRequestSections: ['bank_details'] },
  { section: 4, key: 'contract', title: 'Contract / Commercial', description: 'Payment terms, currency and procurement', changeRequestSections: ['business_procurement'] },
];

const EDITABLE_STATUSES = new Set(['invited', 'draft', 'action_required']);
const UNDER_REVIEW_STATUSES = new Set(['submitted', 'resubmitted', 'approval_in_progress']);

const PortalHeader: React.FC<{ detail: VendorPublicDetail }> = ({ detail }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1 dark:text-blue-400">Vendor Onboarding</p>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{detail.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">Reference: {detail.vendor_reference_no}</p>
      </div>
      <StatusBadge status={detail.status} />
    </div>
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Progress</span>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{detail.progress_percentage}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-800">
        <div
          className={`h-full transition-all ${detail.progress_percentage === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${detail.progress_percentage}%` }}
        />
      </div>
    </div>
  </div>
);

const VendorPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [choices, setChoices] = useState<VendorPublicChoices | null>(null);
  const [detail, setDetail] = useState<VendorPublicDetail | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [hasSavedBankAccount, setHasSavedBankAccount] = useState(false);
  const [savedAccountNumberMasked, setSavedAccountNumberMasked] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'submit'>(null);

  const methods = useForm<VendorOnboardingFormValues>({
    defaultValues: EMPTY_FORM_VALUES,
    shouldUnregister: false,
  });

  // Manually-set errors (via methods.setError below) don't clear themselves
  // as the user types, since this form validates with zod outside RHF's
  // resolver - clear a field's error the moment its value changes so a
  // corrected field doesn't keep showing a stale error message.
  useEffect(() => {
    const subscription = methods.watch((_value, { name }) => {
      if (name && methods.getFieldState(name as never).error) {
        methods.clearErrors(name as never);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstInvalidField = (fieldName: string) => {
    setTimeout(() => {
      try {
        methods.setFocus(fieldName as never);
      } catch {
        /* field isn't mounted (e.g. a conditional field) - nothing to focus */
      }
    }, 0);
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [choicesData, detailData, docs] = await Promise.all([
        api.getPublicChoices(),
        api.getRequestByToken(token),
        api.listDocumentsByToken(token),
      ]);
      setChoices(choicesData);
      setDetail(detailData);
      setDocuments(docs);
      methods.reset(publicDetailToFormValues(detailData));
      setHasSavedBankAccount(!!detailData.bank_detail?.account_number_masked);
      setSavedAccountNumberMasked(detailData.bank_detail?.account_number_masked || undefined);
    } catch (err) {
      console.error(err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = parseApiErrors(err).general;
      // A proxy / server outage returns an HTML error page - never show that raw markup to the vendor.
      const serverDown = !status || status >= 500 || /<html/i.test(message || '');
      setLoadError(
        serverDown
          ? 'The onboarding service is temporarily unavailable. Please try again in a few minutes.'
          : message || 'Invalid or unavailable vendor onboarding link.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Asked for changes - scroll straight to the section the reviewer flagged.
  const flaggedSection = detail?.status === 'action_required' ? detail.open_change_request?.section : undefined;
  useEffect(() => {
    const target = flaggedSection && SECTIONS.find((s) => s.changeRequestSections.includes(flaggedSection));
    if (target) document.querySelector(`[data-portal-section="${target.key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [flaggedSection]);

  const refreshDocuments = async () => {
    if (!token) return;
    setDocuments(await api.listDocumentsByToken(token));
  };

  /** Saves every section. With `validate`, every required field must be filled in first. */
  const saveAll = async (validate: boolean): Promise<boolean> => {
    if (!token) return false;
    methods.clearErrors();
    if (validate) {
      const invalid = FORM_SECTIONS.map((section) => validateVendorSection(methods, section, { hasSavedBankAccount, documents })).find(Boolean);
      if (invalid) {
        toast.error('Please complete the highlighted fields.');
        focusFirstInvalidField(invalid);
        return false;
      }
    }
    const values = methods.getValues();
    for (const section of FORM_SECTIONS) {
      try {
        await persistVendorSection(values, section, publicSectionApi(token));
      } catch (err) {
        const errors = parseApiErrors(err);
        const group = values[`step${section}` as 'step1'] as unknown as Record<string, unknown>;
        const fieldErrors = Object.entries(errors).filter(([k, v]) => k !== 'general' && v && k in group);
        fieldErrors.forEach(([k, v]) => methods.setError(`step${section}.${k}` as never, { message: String(v) }));
        if (fieldErrors.length) focusFirstInvalidField(`step${section}.${fieldErrors[0][0]}`);
        toast.error(errors.general || (fieldErrors.length ? 'Please fix the highlighted fields.' : 'Unable to save. Please try again.'));
        return false;
      }
    }
    await api.patchIdentityByToken(token, { last_saved_step: 5 }).catch(() => {});
    const refreshed = await api.getRequestByToken(token);
    setDetail(refreshed);
    const masked = refreshed.bank_detail?.account_number_masked || undefined;
    setSavedAccountNumberMasked(masked);
    setHasSavedBankAccount(!!masked);
    // The full account number is never sent back - clear it so an untouched field doesn't resend it.
    if (masked) methods.setValue('step3.account_number', '');
    return true;
  };

  const handleSave = async () => {
    setBusy('save');
    try {
      if (await saveAll(false)) {
        toast.success('Your onboarding information has been saved. You can close this page and continue later using the same link.');
      }
    } finally {
      setBusy(null);
    }
  };

  const { missingItems, completionPercent } = useMemo(
    () => computeVendorCompletion(methods.getValues(), documents, hasSavedBankAccount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, hasSavedBankAccount, methods.watch()]
  );

  const handleSubmit = async () => {
    if (!token) return;
    setBusy('submit');
    try {
      if (!(await saveAll(true))) return;
      const updated = await api.submitByToken(token);
      setDetail(updated);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success('Thank you! Your information has been submitted for approval.');
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Submission failed - please review the missing items.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto py-16 text-center text-gray-500 dark:text-gray-400 dark:bg-gray-950 min-h-screen">Loading...</div>;
  }

  if (loadError || !detail) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center dark:bg-gray-950 min-h-screen">
        <p className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">Link not available</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{loadError}</p>
      </div>
    );
  }

  const docHandlers = {
    documents,
    disabled: !!busy,
    onUpload: async (category: string, file: File) => {
      if (!token) return;
      await api.uploadDocumentByToken(token, category, file);
      await refreshDocuments();
    },
    onDelete: async (docId: number) => {
      if (!token) return;
      await api.deleteDocumentByToken(token, docId);
      await refreshDocuments();
    },
    onDownload: async (docId: number) => {
      if (!token) return;
      const { download_url } = await api.downloadDocumentByToken(token, docId);
      window.open(download_url, '_blank', 'noopener');
    },
    onPreview: async (docId: number) => {
      if (!token) return;
      const { download_url } = await api.downloadDocumentByToken(token, docId);
      window.open(download_url, '_blank', 'noopener');
    },
  };

  const sectionFields = (section: VendorFormSection) => {
    if (!choices) return null;
    if (section === 1) return <Step1VendorDetails vendorTypeOptions={choices.vendor_types} />;
    if (section === 2) return <Step2KycCompliance />;
    if (section === 3) return <Step3BankDetails existingAccountNumberMasked={savedAccountNumberMasked} />;
    return (
      <Step4BusinessProcurement
        currencyOptions={choices.onboarding_currencies?.length ? choices.onboarding_currencies : choices.currencies}
        paymentTermOptions={choices.payment_terms}
        billingFrequencyOptions={choices.billing_frequencies}
      />
    );
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6 dark:bg-gray-950 min-h-screen">
      <PortalHeader detail={detail} />

      {detail.status === 'action_required' && detail.open_change_request && (
        <ActionRequiredBanner changeRequest={detail.open_change_request} />
      )}

      {UNDER_REVIEW_STATUSES.has(detail.status) && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <Clock className="w-10 h-10 text-blue-500 mx-auto mb-3 dark:text-blue-400" />
          <h2 className="text-lg font-bold text-gray-900 mb-1 dark:text-white">Your information is under review</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Thank you for completing your vendor onboarding. Our team is reviewing your submission
            ({detail.current_stage}) and will contact you if anything else is needed.
          </p>
        </div>
      )}

      {detail.status === 'approved' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3 dark:text-green-400" />
          <h2 className="text-lg font-bold text-gray-900 mb-1 dark:text-white">You&apos;re approved!</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Your vendor onboarding has been fully approved. Thank you for completing the process.
          </p>
        </div>
      )}

      {EDITABLE_STATUSES.has(detail.status) && choices && (
        <FormProvider {...methods}>
          <CompactFields>
            {/* One scrolling form - the same sections as the internal onboarding drawer */}
            <fieldset disabled={!!busy} className="min-w-0 bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-100 dark:bg-gray-900 dark:border-gray-800 dark:divide-gray-800">
              {SECTIONS.map(({ section, key, title, description, changeRequestSections }) => (
                <section key={key} data-portal-section={key} className="p-6 scroll-mt-4">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{section}. {title}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                    </div>
                    {flaggedSection && changeRequestSections.includes(flaggedSection) && (
                      <StatusBadge status="changes" variant="warning" label="Changes requested" />
                    )}
                  </div>
                  {sectionFields(section)}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 dark:text-gray-300">{title} Documents</h3>
                    <Step5Documents {...docHandlers} step={key} />
                    {section === 1 && !methods.watch('step1.msme_registered') && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">No documents are needed here unless you are MSME registered.</p>
                    )}
                  </div>
                </section>
              ))}

              {/* 5. Review & submit */}
              <section className="p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1 dark:text-white">5. Review &amp; Submit</h2>
                <p className="text-sm text-gray-600 mb-3 dark:text-gray-300">
                  Onboarding completion: <span className="font-semibold">{completionPercent}%</span>
                </p>
                {missingItems.length > 0 ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">Still needed before you can submit:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {missingItems.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" /> Everything is complete - you can submit for review.
                  </p>
                )}
              </section>
            </fieldset>
          </CompactFields>

          {/* Footer - one save for every section */}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Fields marked * are required to submit. Save at any time and continue later with the same link.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="!w-auto px-6" onClick={handleSave} isLoading={busy === 'save'} disabled={!!busy}>
                Save
              </Button>
              <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={busy === 'submit'} disabled={!!busy}>
                {detail.status === 'action_required' ? 'Save & Resubmit' : 'Save & Submit'}
              </Button>
            </div>
          </div>
        </FormProvider>
      )}
    </div>
  );
};

export default VendorPortalPage;
