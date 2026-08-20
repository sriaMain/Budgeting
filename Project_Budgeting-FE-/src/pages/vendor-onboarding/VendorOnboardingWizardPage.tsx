import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import {
  EMPTY_FORM_VALUES, vendorDetailsSchema, kycComplianceSchema, bankDetailsSchema,
  businessProcurementSchema, computeMissingDocuments,
  type VendorOnboardingFormValues,
} from '../../schemas/vendorOnboarding.schemas';
import type { VendorOnboardingChoices, VendorOnboardingDetail, VendorDocument } from '../../types/vendorOnboarding.types';
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

function vendorToFormValues(vendor: VendorOnboardingDetail): VendorOnboardingFormValues {
  const p = vendor.onboarding_profile;
  const k = vendor.kyc;
  const b = vendor.bank_detail;
  const proc = vendor.procurement_detail;

  return {
    step1: {
      name: vendor.name || '', vendor_type: vendor.vendor_type || '', email: vendor.email || '', phone: vendor.phone || '',
      company_code: p?.company_code || '', plant: p?.plant || '',
      contact_person_name: p?.contact_person_name || '', contact_person_designation: p?.contact_person_designation || '',
      gst_registered: p?.gst_registered || false, gstin: p?.gstin || '',
      msme_registered: p?.msme_registered || false, udyam_number: p?.udyam_number || '', msme_category: p?.msme_category || '',
      address_line1: p?.address_line1 || '', address_line2: p?.address_line2 || '', city: p?.city || '',
      district: p?.district || '', state: p?.state || '', country: p?.country || '', pin_code: p?.pin_code || '',
      landmark: p?.landmark || '', vendor_introduction: p?.vendor_introduction || '',
      finance_manager_name: p?.finance_manager_name || '', finance_manager_email: p?.finance_manager_email || '',
      finance_manager_mobile: p?.finance_manager_mobile || '',
    },
    step2: {
      country_of_tax_residence: k?.country_of_tax_residence || '', pan: k?.pan || '', cin: k?.cin || '',
      incorporation_date: k?.incorporation_date || '', tan: k?.tan || '', tan_mobile: k?.tan_mobile || '',
      epf_number: k?.epf_number || '', esic_number: k?.esic_number || '', esic_district: k?.esic_district || '',
      vendor_type: vendor.vendor_type || '',
    },
    step3: {
      bank_name: b?.bank_name || '', account_holder_name: b?.account_holder_name || '', account_number: b?.account_number || '',
      ifsc_code: b?.ifsc_code || '', bank_id: b?.bank_id || '', bank_country_key: b?.bank_country_key || '',
      bank_control_key: b?.bank_control_key || '', branch: b?.branch || '', region: b?.region || '',
      street: b?.street || '', city: b?.city || '',
    },
    step4: {
      account_group: proc?.account_group || '', purchasing_org: proc?.purchasing_org || '', payment_terms: proc?.payment_terms || '',
      order_currency: proc?.order_currency || '', grouping_key: proc?.grouping_key || '', partner_category: proc?.partner_category || '',
      incoterms_1: proc?.incoterms_1 || '', incoterms_2: proc?.incoterms_2 || '', reconciliation_account: proc?.reconciliation_account || '',
      schema_group: proc?.schema_group || '', gr_based_invoice_verification: proc?.gr_based_invoice_verification || false,
      check_double_invoice: proc?.check_double_invoice || false,
    },
  };
}

const VendorOnboardingWizardPage: React.FC = () => {
  const { vendorId: vendorIdParam } = useParams<{ vendorId: string }>();
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
        setCurrentStep(step);
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
    if (step === 1) {
      await api.patchDraft(id, {
        name: values.step1.name, vendor_type: values.step1.vendor_type,
        email: values.step1.email, phone: values.step1.phone,
      });
      await api.patchProfile(id, {
        company_code: values.step1.company_code, plant: values.step1.plant,
        contact_person_name: values.step1.contact_person_name, contact_person_designation: values.step1.contact_person_designation,
        gst_registered: values.step1.gst_registered, gstin: values.step1.gstin,
        msme_registered: values.step1.msme_registered, udyam_number: values.step1.udyam_number, msme_category: values.step1.msme_category,
        address_line1: values.step1.address_line1, address_line2: values.step1.address_line2, city: values.step1.city,
        district: values.step1.district, state: values.step1.state, country: values.step1.country, pin_code: values.step1.pin_code,
        landmark: values.step1.landmark, vendor_introduction: values.step1.vendor_introduction,
        finance_manager_name: values.step1.finance_manager_name, finance_manager_email: values.step1.finance_manager_email,
        finance_manager_mobile: values.step1.finance_manager_mobile,
      });
    } else if (step === 2) {
      const { vendor_type: _vt2, ...kycRest } = values.step2;
      void _vt2;
      // Django's DateField rejects "" (only a real date or null) - an empty
      // incorporation_date must be sent as null, not as the RHF default "".
      await api.patchKYC(id, { ...kycRest, incorporation_date: kycRest.incorporation_date || null });
    } else if (step === 3) {
      // Never send a blank account_number - the field always reloads blank (the backend
      // only ever returns a masked value), so an untouched field must not overwrite what's
      // already on file. Omitting the key entirely leaves the stored value alone.
      const bankPayload = { ...values.step3 };
      if (!bankPayload.account_number) delete (bankPayload as Partial<typeof bankPayload>).account_number;
      await api.patchBankDetail(id, bankPayload);
      if (values.step3.account_number) setHasSavedBankAccount(true);
    } else if (step === 4) {
      await api.patchProcurementDetail(id, values.step4);
    }
  };

  const validateStep = (step: number): boolean => {
    const values = methods.getValues();
    if (step === 1) {
      const result = vendorDetailsSchema.safeParse(values.step1);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          methods.setError(`step1.${issue.path.join('.')}` as never, { message: issue.message });
        });
        focusFirstInvalidField(`step1.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 2) {
      const result = kycComplianceSchema.safeParse({ ...values.step2, vendor_type: values.step1.vendor_type });
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          methods.setError(`step2.${issue.path.join('.')}` as never, { message: issue.message });
        });
        focusFirstInvalidField(`step2.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 3) {
      const result = bankDetailsSchema.safeParse(values.step3);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          methods.setError(`step3.${issue.path.join('.')}` as never, { message: issue.message });
        });
        focusFirstInvalidField(`step3.${result.error.issues[0].path.join('.')}`);
        return false;
      }
      if (!values.step3.account_number && !hasSavedBankAccount) {
        methods.setError('step3.account_number', { message: 'Account number is required' });
        focusFirstInvalidField('step3.account_number');
        return false;
      }
    } else if (step === 4) {
      const result = businessProcurementSchema.safeParse(values.step4);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          methods.setError(`step4.${issue.path.join('.')}` as never, { message: issue.message });
        });
        focusFirstInvalidField(`step4.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    }
    return true;
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

  const { missingItems, completionPercent } = useMemo(() => {
    const values = methods.getValues();
    const missing: string[] = [];
    const bankDetailsComplete = bankDetailsSchema.safeParse(values.step3).success
      && (!!values.step3.account_number || hasSavedBankAccount);

    if (!vendorDetailsSchema.safeParse(values.step1).success) missing.push('Vendor Details (Step 1) is incomplete');
    if (!kycComplianceSchema.safeParse({ ...values.step2, vendor_type: values.step1.vendor_type }).success) missing.push('KYV / Compliance (Step 2) is incomplete');
    if (!bankDetailsComplete) missing.push('Bank Details (Step 3) is incomplete');
    if (!businessProcurementSchema.safeParse(values.step4).success) missing.push('Business / Procurement (Step 4) is incomplete');

    const categoriesPresent = new Set(documents.map((d) => d.category));
    const missingDocs = computeMissingDocuments(categoriesPresent, {
      vendorType: values.step1.vendor_type,
      gstRegistered: values.step1.gst_registered,
      msmeRegistered: values.step1.msme_registered,
      hasEpf: !!values.step2.epf_number,
      hasEsic: !!values.step2.esic_number,
    });
    missingDocs.forEach((d) => missing.push(`Missing document: ${d}`));

    const totalSections = 5; // 4 form steps + documents
    const passedSections = totalSections - [
      !vendorDetailsSchema.safeParse(values.step1).success,
      !kycComplianceSchema.safeParse({ ...values.step2, vendor_type: values.step1.vendor_type }).success,
      !bankDetailsComplete,
      !businessProcurementSchema.safeParse(values.step4).success,
      missingDocs.length > 0,
    ].filter(Boolean).length;

    return { missingItems: missing, completionPercent: Math.round((passedSections / totalSections) * 100) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, currentStep, hasSavedBankAccount, methods.watch()]);

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
        <div className="text-center p-12 text-gray-500">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout userRole={layoutRole} currentPage="vendors" onNavigate={() => {}}>
      <FormProvider {...methods}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vendorIdParam ? 'Edit Vendor' : 'Add Vendor'}</h1>
            {vendorRefNo && <p className="text-sm text-gray-500 mt-1">Reference: {vendorRefNo}</p>}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <VendorStepper
              steps={STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            {currentStep === 1 && <Step1VendorDetails vendorTypeOptions={choices.vendor_types} />}
            {currentStep === 2 && <Step2KycCompliance />}
            {currentStep === 3 && <Step3BankDetails existingAccountNumberMasked={savedAccountNumberMasked} />}
            {currentStep === 4 && <Step4BusinessProcurement currencyOptions={currencyOptions} />}
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

          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
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
