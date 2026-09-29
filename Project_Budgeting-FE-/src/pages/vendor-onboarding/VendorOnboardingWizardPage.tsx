import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/Button';
import { useAppSelector } from '../../hooks/useAppSelector';
import { VendorStepper, type StepConfig } from './components/VendorStepper';
import { Step1VendorDetails } from './steps/Step1VendorDetails';
import { Step2KycCompliance } from './steps/Step2KycCompliance';
import { Step3BankDetails } from './steps/Step3BankDetails';
import { Step4BusinessProcurement } from './steps/Step4BusinessProcurement';
import { Step5Documents } from './steps/Step5Documents';
import { Step6ReviewSubmit } from './steps/Step6ReviewSubmit';
import { EMPTY_FORM_VALUES, type VendorOnboardingFormValues } from '../../schemas/vendorOnboarding.schemas';
import type { VendorOnboardingChoices, VendorDocument } from '../../types/vendorOnboarding.types';
import {
  vendorToFormValues, persistVendorSection, validateVendorSection, computeVendorCompletion, adminSectionApi, type VendorFormSection,
} from './vendorOnboardingForm';
import * as api from '../../services/vendorOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import axiosInstance from '../../utils/axiosInstance';
import type { Choice } from '../../types/vendorOnboarding.types';

const STEPS: StepConfig[] = [
  { index: 1, label: 'Vendor Details' },
  { index: 2, label: 'KYV / Compliance' },
  { index: 3, label: 'Bank Details' },
  { index: 4, label: 'Business / Procurement' },
  { index: 5, label: 'Documents' },
  { index: 6, label: 'Review & Submit' },
];

const VendorOnboardingWizardPage: React.FC = () => {
  const { vendorId: vendorIdParam } = useParams<{ vendorId: string }>();
  // Optional ?step=N (e.g. from a Vendors-list step card) - honoured only up to the step the
  // vendor has already reached, so the wizard's own step order is never bypassed.
  const [searchParams] = useSearchParams();
  const requestedStep = Number(searchParams.get('step')) || null;
  const navigate = useNavigate();
  const userRole = useAppSelector((state) => state.auth.userRole) || 'user';

  const [vendorId, setVendorId] = useState<number | null>(vendorIdParam ? Number(vendorIdParam) : null);
  const [vendorRefNo, setVendorRefNo] = useState<string | null>(null);
  const [vendorStatus, setVendorStatus] = useState<string>('draft');
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [hasSavedBankAccount, setHasSavedBankAccount] = useState(false);
  const [savedAccountNumberMasked, setSavedAccountNumberMasked] = useState<string | undefined>(undefined);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [currencyOptions, setCurrencyOptions] = useState<Choice[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Whenever the visible step changes (Next, Back, step-click, or the
  // initial load resuming at a saved step), scroll back to the top so the
  // new step is never left showing from wherever the previous step had
  // scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const focusFirstInvalidField = (fieldName: string) => {
    setTimeout(() => {
      try {
        methods.setFocus(fieldName as never);
      } catch {
        /* field isn't mounted (e.g. a conditional field) - nothing to focus */
      }
    }, 0);
  };

  useEffect(() => {
    api.getChoices().then(setChoices).catch(() => toast.error('Failed to load form options'));
    axiosInstance.get('/accounts/currencies/').then((res) => {
      setCurrencyOptions((res.data as { code: string; name: string }[]).map((c) => ({ value: c.code, label: c.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!vendorIdParam) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const vendor = await api.getVendor(Number(vendorIdParam));
        methods.reset(vendorToFormValues(vendor));
        setVendorId(vendor.id);
        setVendorRefNo(vendor.vendor_reference_no);
        setVendorStatus(vendor.status);
        setHasSavedBankAccount(!!vendor.bank_detail?.account_number_masked);
        setSavedAccountNumberMasked(vendor.bank_detail?.account_number_masked || undefined);
        const step = Math.min(Math.max(vendor.last_saved_step || 1, 1), 6);
        setCurrentStep(requestedStep && requestedStep >= 1 && requestedStep <= step ? requestedStep : step);
        setCompletedSteps(new Set(Array.from({ length: step - 1 }, (_, i) => i + 1)));
        const docs = await api.listDocuments(vendor.id);
        setDocuments(docs);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load vendor');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorIdParam]);

  const refreshDocuments = async () => {
    if (!vendorId) return;
    const docs = await api.listDocuments(vendorId);
    setDocuments(docs);
  };

  const ensureVendorId = async (): Promise<number> => {
    if (vendorId) return vendorId;
    const step1 = methods.getValues('step1');
    const vendor = await api.createDraft({
      name: step1.name, vendor_type: step1.vendor_type, email: step1.email, phone: step1.phone,
    });
    setVendorId(vendor.id);
    setVendorRefNo(vendor.vendor_reference_no);
    navigate(`/vendors/${vendor.id}/edit`, { replace: true });
    return vendor.id;
  };

  const persistStep = async (step: number, id: number) => {
    const values = methods.getValues();
    await persistVendorSection(values, step as VendorFormSection, adminSectionApi(id));
    if (step === 3 && values.step3.account_number) setHasSavedBankAccount(true);
  };

  const validateStep = (step: number): boolean => {
    const invalidField = validateVendorSection(methods, step as VendorFormSection, { hasSavedBankAccount, documents });
    if (invalidField) focusFirstInvalidField(invalidField);
    return !invalidField;
  };

  const handleNext = async () => {
    if (currentStep <= 4 && !validateStep(currentStep)) {
      toast.error('Please fix the highlighted fields before continuing.');
      return;
    }
    setIsSaving(true);
    try {
      const id = await ensureVendorId();
      if (currentStep <= 4) await persistStep(currentStep, id);
      await api.patchDraft(id, { last_saved_step: Math.min(currentStep + 1, 6) });
      setCompletedSteps((prev) => new Set(prev).add(currentStep));
      setCurrentStep((s) => Math.min(s + 1, 6));
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Failed to save this step');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const handleStepClick = (step: number) => {
    if (completedSteps.has(step) || step === currentStep || step < currentStep) setCurrentStep(step);
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const id = await ensureVendorId();
      if (currentStep <= 4) {
        methods.clearErrors();
        await persistStep(currentStep, id);
      }
      await api.patchDraft(id, { last_saved_step: currentStep });
      toast.success('Draft saved');
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const { missingItems, completionPercent } = useMemo(
    () => computeVendorCompletion(methods.getValues(), documents, hasSavedBankAccount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, currentStep, hasSavedBankAccount, methods.watch()]
  );

  const canSubmit = completionPercent === 100 && vendorId && (vendorStatus === 'draft' || vendorStatus === 'action_required');

  const handleSubmitForApproval = async () => {
    if (!vendorId) return;
    setIsSubmitting(true);
    try {
      await api.submitForApproval(vendorId);
      toast.success('Vendor submitted for approval');
      navigate(`/vendors/${vendorId}`);
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Submission failed - please review the missing items.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const layoutRole = (userRole as 'admin' | 'user' | 'manager') || 'admin';

  if (loading || !choices) {
    return (
      <Layout userRole={layoutRole} currentPage="vendors" onNavigate={() => {}}>
        <div className="text-center p-12 text-gray-500 dark:text-gray-400">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout userRole={layoutRole} currentPage="vendors" onNavigate={() => {}}>
      <FormProvider {...methods}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{vendorIdParam ? 'Edit Vendor' : 'Add Vendor'}</h1>
            {vendorRefNo && <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Reference: {vendorRefNo}</p>}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <VendorStepper
              steps={STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            {currentStep === 1 && <Step1VendorDetails vendorTypeOptions={choices.vendor_types} />}
            {currentStep === 2 && <Step2KycCompliance />}
            {currentStep === 3 && <Step3BankDetails existingAccountNumberMasked={savedAccountNumberMasked} />}
            {currentStep === 4 && (
              <Step4BusinessProcurement
                currencyOptions={choices.onboarding_currencies?.length ? choices.onboarding_currencies : currencyOptions}
                paymentTermOptions={choices.payment_terms}
                billingFrequencyOptions={choices.billing_frequencies}
              />
            )}
            {currentStep === 5 && vendorId && (
              <Step5Documents
                documents={documents}
                onUpload={async (category, file) => {
                  await api.uploadDocument(vendorId, category, file);
                  await refreshDocuments();
                }}
                onDelete={async (docId) => {
                  await api.deleteDocument(vendorId, docId);
                  await refreshDocuments();
                }}
                onDownload={async (docId) => {
                  const { download_url } = await api.downloadDocument(vendorId, docId);
                  window.open(download_url, '_blank');
                }}
              />
            )}
            {currentStep === 6 && (
              <Step6ReviewSubmit
                documents={documents}
                completionPercent={completionPercent}
                missingItems={missingItems}
                onEditStep={setCurrentStep}
                existingAccountNumberMasked={savedAccountNumberMasked}
              />
            )}
          </div>

          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            {currentStep > 1 ? (
              <Button variant="secondary" className="!w-auto px-6" onClick={handleBack}>
                Back
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="!w-auto px-6" onClick={handleSaveDraft} isLoading={isSaving}>
                Save Draft
              </Button>
              {currentStep < 6 && (
                <Button className="!w-auto px-6" onClick={handleNext} isLoading={isSaving}>
                  Next
                </Button>
              )}
              {currentStep === 6 && canSubmit && (
                <Button className="!w-auto px-6" onClick={handleSubmitForApproval} isLoading={isSubmitting}>
                  Submit for Approval
                </Button>
              )}
            </div>
          </div>
        </div>
      </FormProvider>
    </Layout>
  );
};

export default VendorOnboardingWizardPage;
