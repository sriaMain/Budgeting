import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../../../components/Button';
import { StatusBadge } from '../../../components/StatusBadge';
import { VendorStepper, type StepConfig } from '../components/VendorStepper';
import { Step1VendorDetails } from '../steps/Step1VendorDetails';
import { Step2KycCompliance } from '../steps/Step2KycCompliance';
import { Step3BankDetails } from '../steps/Step3BankDetails';
import { Step4BusinessProcurement } from '../steps/Step4BusinessProcurement';
import { Step5Documents } from '../steps/Step5Documents';
import { Step6ReviewSubmit } from '../steps/Step6ReviewSubmit';
import { ActionRequiredBanner } from './ActionRequiredBanner';
import {
  EMPTY_FORM_VALUES, vendorDetailsSchema, kycComplianceSchema, bankDetailsSchema,
  businessProcurementSchema, computeMissingDocuments,
  type VendorOnboardingFormValues,
} from '../../../schemas/vendorOnboarding.schemas';
import { SECTION_TO_STEP } from '../../../types/vendorOnboarding.types';
import type { VendorPublicChoices } from '../../../types/vendorOnboarding.types';
import type { VendorPublicDetail } from '../../../types/vendorOnboardingPublic.types';
import type { VendorDocument } from '../../../types/vendorOnboarding.types';
import * as api from '../../../services/vendorOnboardingPublic';
import { parseApiErrors } from '../../../utils/parseApiErrors';

const STEPS: StepConfig[] = [
  { index: 1, label: 'Vendor Details' },
  { index: 2, label: 'KYV / Compliance' },
  { index: 3, label: 'Bank Details' },
  { index: 4, label: 'Business / Procurement' },
  { index: 5, label: 'Documents' },
  { index: 6, label: 'Review & Submit' },
];

function detailToFormValues(detail: VendorPublicDetail): VendorOnboardingFormValues {
  const p = detail.profile;
  const k = detail.kyc;
  const b = detail.bank_detail;
  const proc = detail.procurement_detail;

  return {
    step1: {
      name: detail.name || '', vendor_type: detail.vendor_type || '', email: detail.email || '', phone: detail.phone || '',
      company_code: p?.company_code || detail.company_code || '', plant: p?.plant || detail.plant || '',
      contact_person_name: p?.contact_person_name || detail.contact_person_name || '', contact_person_designation: p?.contact_person_designation || '',
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
      vendor_type: detail.vendor_type || '',
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

const EDITABLE_STATUSES = new Set(['invited', 'draft', 'action_required']);
const UNDER_REVIEW_STATUSES = new Set(['submitted', 'resubmitted', 'approval_in_progress']);

const PortalHeader: React.FC<{ detail: VendorPublicDetail }> = ({ detail }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Vendor Onboarding</p>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{detail.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reference: {detail.vendor_reference_no}</p>
      </div>
      <StatusBadge status={detail.status} />
    </div>
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">Progress</span>
        <span className="text-xs font-semibold text-gray-700">{detail.progress_percentage}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
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
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      methods.reset(detailToFormValues(detailData));
      setHasSavedBankAccount(!!detailData.bank_detail?.account_number_masked);
      setSavedAccountNumberMasked(detailData.bank_detail?.account_number_masked || undefined);

      const step = Math.min(Math.max(detailData.last_saved_step || 1, 1), 6);
      if (detailData.status === 'action_required' && detailData.open_change_request) {
        setCurrentStep(SECTION_TO_STEP[detailData.open_change_request.section] || step);
      } else {
        setCurrentStep(step);
      }
      setCompletedSteps(new Set(Array.from({ length: step - 1 }, (_, i) => i + 1)));
    } catch (err) {
      console.error(err);
      setLoadError('This onboarding link is invalid or has expired. Please contact the person who sent it to you for a new link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refreshDocuments = async () => {
    if (!token) return;
    setDocuments(await api.listDocumentsByToken(token));
  };

  const persistStep = async (step: number) => {
    if (!token) return;
    const values = methods.getValues();
    if (step === 1) {
      await api.patchIdentityByToken(token, {
        name: values.step1.name, vendor_type: values.step1.vendor_type,
        email: values.step1.email, phone: values.step1.phone,
      });
      await api.patchProfileByToken(token, {
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
      await api.patchKYCByToken(token, { ...kycRest, incorporation_date: kycRest.incorporation_date || null });
    } else if (step === 3) {
      const bankPayload = { ...values.step3 };
      if (!bankPayload.account_number) delete (bankPayload as Partial<typeof bankPayload>).account_number;
      await api.patchBankDetailByToken(token, bankPayload);
      if (values.step3.account_number) setHasSavedBankAccount(true);
    } else if (step === 4) {
      await api.patchProcurementDetailByToken(token, values.step4);
    }
  };

  const validateStep = (step: number): boolean => {
    const values = methods.getValues();
    if (step === 1) {
      const result = vendorDetailsSchema.safeParse(values.step1);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step1.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step1.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 2) {
      const result = kycComplianceSchema.safeParse({ ...values.step2, vendor_type: values.step1.vendor_type });
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step2.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step2.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 3) {
      const result = bankDetailsSchema.safeParse(values.step3);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step3.${issue.path.join('.')}` as never, { message: issue.message }));
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
        result.error.issues.forEach((issue) => methods.setError(`step4.${issue.path.join('.')}` as never, { message: issue.message }));
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
      if (currentStep <= 4) await persistStep(currentStep);
      if (token) await api.patchIdentityByToken(token, { last_saved_step: Math.min(currentStep + 1, 6) });
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
    if (!token) return;
    setIsSaving(true);
    try {
      if (currentStep <= 4) {
        methods.clearErrors();
        await persistStep(currentStep);
      }
      await api.patchIdentityByToken(token, { last_saved_step: currentStep });
      toast.success('Draft saved. You can close this page and come back using the same link.');
      const refreshed = await api.getRequestByToken(token);
      setDetail(refreshed);
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

    const totalSections = 5;
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

  const handleSubmit = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const updated = await api.submitByToken(token);
      setDetail(updated);
      toast.success('Thank you! Your information has been submitted for approval.');
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Submission failed - please review the missing items.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto py-16 text-center text-gray-500">Loading...</div>;
  }

  if (loadError || !detail) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-lg font-semibold text-gray-900 mb-2">Link not available</p>
        <p className="text-sm text-gray-600">{loadError}</p>
      </div>
    );
  }

  const errorSteps = detail.status === 'action_required' && detail.open_change_request
    ? new Set([SECTION_TO_STEP[detail.open_change_request.section]])
    : undefined;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <PortalHeader detail={detail} />

      {detail.status === 'action_required' && detail.open_change_request && (
        <ActionRequiredBanner changeRequest={detail.open_change_request} />
      )}

      {UNDER_REVIEW_STATUSES.has(detail.status) && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <Clock className="w-10 h-10 text-blue-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Your information is under review</h2>
          <p className="text-sm text-gray-600">
            Thank you for completing your vendor onboarding. Our team is reviewing your submission
            ({detail.current_stage}) and will contact you if anything else is needed.
          </p>
        </div>
      )}

      {detail.status === 'approved' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">You're approved!</h2>
          <p className="text-sm text-gray-600">
            Your vendor onboarding has been fully approved. Thank you for completing the process.
          </p>
        </div>
      )}

      {EDITABLE_STATUSES.has(detail.status) && choices && (
        <FormProvider {...methods}>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <VendorStepper
              steps={STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              errorSteps={errorSteps}
              onStepClick={handleStepClick}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            {currentStep === 1 && <Step1VendorDetails vendorTypeOptions={choices.vendor_types} />}
            {currentStep === 2 && <Step2KycCompliance />}
            {currentStep === 3 && <Step3BankDetails existingAccountNumberMasked={savedAccountNumberMasked} />}
            {currentStep === 4 && <Step4BusinessProcurement currencyOptions={choices.currencies} />}
            {currentStep === 5 && (
              <Step5Documents
                documents={documents}
                onUpload={async (category, file) => {
                  if (!token) return;
                  await api.uploadDocumentByToken(token, category, file);
                  await refreshDocuments();
                }}
                onDelete={async (docId) => {
                  if (!token) return;
                  await api.deleteDocumentByToken(token, docId);
                  await refreshDocuments();
                }}
                onDownload={async (docId) => {
                  if (!token) return;
                  const { download_url } = await api.downloadDocumentByToken(token, docId);
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
              {currentStep === 6 && completionPercent === 100 && (
                <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={isSubmitting}>
                  {detail.status === 'action_required' ? 'Resubmit' : 'Submit'}
                </Button>
              )}
            </div>
          </div>
        </FormProvider>
      )}
    </div>
  );
};

export default VendorPortalPage;
