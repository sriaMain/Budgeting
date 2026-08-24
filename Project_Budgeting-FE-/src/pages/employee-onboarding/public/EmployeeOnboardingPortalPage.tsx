import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../../../components/Button';
import { StatusBadge } from '../../../components/StatusBadge';
import { VendorStepper, type StepConfig } from '../../vendor-onboarding/components/VendorStepper';
import { Step1PersonalDetails } from '../steps/Step1PersonalDetails';
import { Step2Address } from '../steps/Step2Address';
import { Step3EmploymentDetails } from '../steps/Step3EmploymentDetails';
import { Step4StatutoryDetails } from '../steps/Step4StatutoryDetails';
import { Step5BankDetails } from '../steps/Step5BankDetails';
import { Step6EmergencyContact } from '../steps/Step6EmergencyContact';
import { Step7Documents } from '../steps/Step7Documents';
import { Step8ReviewSubmit } from '../steps/Step8ReviewSubmit';
import { EmployeeActionRequiredBanner } from './EmployeeActionRequiredBanner';
import {
  EMPTY_FORM_VALUES, personalDetailsSchema, addressSchema, statutoryDetailsSchema,
  bankDetailsSchema, emergencyContactSchema, computeMissingDocuments,
  type EmployeeOnboardingFormValues,
} from '../../../schemas/employeeOnboarding.schemas';
import { SECTION_TO_STEP } from '../../../types/employeeOnboarding.types';
import type { EmployeePublicChoices, EmployeeDocument } from '../../../types/employeeOnboarding.types';
import type { EmployeePublicDetail } from '../../../types/employeeOnboardingPublic.types';
import * as api from '../../../services/employeeOnboardingPublic';
import { parseApiErrors } from '../../../utils/parseApiErrors';

const TOTAL_STEPS = 8;

const STEPS: StepConfig[] = [
  { index: 1, label: 'Personal Details' },
  { index: 2, label: 'Address' },
  { index: 3, label: 'Employment Details' },
  { index: 4, label: 'Statutory Details' },
  { index: 5, label: 'Bank Details' },
  { index: 6, label: 'Emergency Contact' },
  { index: 7, label: 'Documents' },
  { index: 8, label: 'Review & Submit' },
];

function detailToFormValues(detail: EmployeePublicDetail): EmployeeOnboardingFormValues {
  const p = detail.personal_detail;
  const a = detail.address_detail;
  const s = detail.statutory_detail;
  const b = detail.bank_detail;
  const e = detail.emergency_contact;

  return {
    step1: {
      first_name: detail.account.first_name || '', last_name: detail.account.last_name || '',
      middle_name: p?.middle_name || '', personal_email: p?.personal_email || '', alternate_email: p?.alternate_email || '',
      mobile_number: p?.mobile_number || '', alternate_mobile: p?.alternate_mobile || '',
      date_of_birth: p?.date_of_birth || '', gender: p?.gender || '', marital_status: p?.marital_status || '',
      blood_group: p?.blood_group || '', nationality: p?.nationality || '',
    },
    step2: {
      current_address: a?.current_address || '', city: a?.city || '', state: a?.state || '',
      country: a?.country || '', pin_code: a?.pin_code || '',
    },
    step4: {
      pan: s?.pan || '', aadhaar_number: s?.aadhaar_number || '', uan_number: s?.uan_number || '',
      tan: s?.tan || '', esic_number: s?.esic_number || '', pf_applicable: detail.pf_applicable,
    },
    step5: {
      account_holder_name: b?.account_holder_name || '', bank_name: b?.bank_name || '',
      account_number: b?.account_number || '', ifsc_code: b?.ifsc_code || '',
    },
    step6: {
      contact_name: e?.contact_name || '', contact_number: e?.contact_number || '', relationship: e?.relationship || '',
    },
  };
}

const EDITABLE_STATUSES = new Set(['invited', 'draft', 'action_required']);
const UNDER_REVIEW_STATUSES = new Set(['submitted', 'resubmitted']);

const PortalHeader: React.FC<{ detail: EmployeePublicDetail }> = ({ detail }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Employee Onboarding</p>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{detail.account.display_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Employee ID: {detail.employee_code}</p>
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

const EmployeeOnboardingPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [choices, setChoices] = useState<EmployeePublicChoices | null>(null);
  const [detail, setDetail] = useState<EmployeePublicDetail | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [hasSavedBankAccount, setHasSavedBankAccount] = useState(false);
  const [savedAccountNumberMasked, setSavedAccountNumberMasked] = useState<string | undefined>(undefined);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<EmployeeOnboardingFormValues>({
    defaultValues: EMPTY_FORM_VALUES,
    shouldUnregister: false,
  });

  useEffect(() => {
    const subscription = methods.watch((_value, { name }) => {
      if (name && methods.getFieldState(name as never).error) {
        methods.clearErrors(name as never);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const step = Math.min(Math.max(detailData.last_saved_step || 1, 1), TOTAL_STEPS);
      if (detailData.status === 'action_required' && detailData.open_change_request) {
        setCurrentStep(SECTION_TO_STEP[detailData.open_change_request.section] || step);
      } else {
        setCurrentStep(step);
      }
      setCompletedSteps(new Set(Array.from({ length: step - 1 }, (_, i) => i + 1)));
    } catch (err) {
      console.error(err);
      const errors = parseApiErrors(err);
      setLoadError(errors.general || 'Invalid or unavailable employee onboarding link.');
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
      await api.patchIdentityByToken(token, { first_name: values.step1.first_name, last_name: values.step1.last_name });
      await api.patchPersonalByToken(token, {
        middle_name: values.step1.middle_name, personal_email: values.step1.personal_email,
        alternate_email: values.step1.alternate_email, mobile_number: values.step1.mobile_number,
        alternate_mobile: values.step1.alternate_mobile, date_of_birth: values.step1.date_of_birth,
        gender: values.step1.gender, marital_status: values.step1.marital_status,
        blood_group: values.step1.blood_group, nationality: values.step1.nationality,
      });
    } else if (step === 2) {
      await api.patchAddressByToken(token, values.step2);
    } else if (step === 4) {
      const { pf_applicable: _pf, ...statutoryRest } = values.step4;
      void _pf;
      await api.patchStatutoryByToken(token, statutoryRest);
    } else if (step === 5) {
      const bankPayload = { ...values.step5 };
      if (!bankPayload.account_number) delete (bankPayload as Partial<typeof bankPayload>).account_number;
      await api.patchBankDetailByToken(token, bankPayload);
      if (values.step5.account_number) setHasSavedBankAccount(true);
    } else if (step === 6) {
      await api.patchEmergencyContactByToken(token, values.step6);
    }
  };

  const validateStep = (step: number): boolean => {
    const values = methods.getValues();
    if (step === 1) {
      const result = personalDetailsSchema.safeParse(values.step1);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step1.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step1.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 2) {
      const result = addressSchema.safeParse(values.step2);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step2.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step2.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 4) {
      const result = statutoryDetailsSchema.safeParse(values.step4);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step4.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step4.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    } else if (step === 5) {
      const result = bankDetailsSchema.safeParse(values.step5);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step5.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step5.${result.error.issues[0].path.join('.')}`);
        return false;
      }
      if (!values.step5.account_number && !hasSavedBankAccount) {
        methods.setError('step5.account_number', { message: 'Account number is required' });
        focusFirstInvalidField('step5.account_number');
        return false;
      }
    } else if (step === 6) {
      const result = emergencyContactSchema.safeParse(values.step6);
      if (!result.success) {
        result.error.issues.forEach((issue) => methods.setError(`step6.${issue.path.join('.')}` as never, { message: issue.message }));
        focusFirstInvalidField(`step6.${result.error.issues[0].path.join('.')}`);
        return false;
      }
    }
    return true;
  };

  const isPersistableStep = (step: number) => [1, 2, 4, 5, 6].includes(step);
  const isValidatableStep = (step: number) => [1, 2, 4, 5, 6].includes(step);

  const handleNext = async () => {
    if (isValidatableStep(currentStep) && !validateStep(currentStep)) {
      toast.error('Please fix the highlighted fields before continuing.');
      return;
    }
    setIsSaving(true);
    try {
      if (isPersistableStep(currentStep)) await persistStep(currentStep);
      if (token) await api.patchIdentityByToken(token, { last_saved_step: Math.min(currentStep + 1, TOTAL_STEPS) });
      setCompletedSteps((prev) => new Set(prev).add(currentStep));
      setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
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
      if (isPersistableStep(currentStep)) {
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
    const bankDetailsComplete = bankDetailsSchema.safeParse(values.step5).success
      && (!!values.step5.account_number || hasSavedBankAccount);

    if (!personalDetailsSchema.safeParse(values.step1).success) missing.push('Personal Details (Step 1) is incomplete');
    if (!addressSchema.safeParse(values.step2).success) missing.push('Address (Step 2) is incomplete');
    if (!statutoryDetailsSchema.safeParse(values.step4).success) missing.push('Statutory Details (Step 4) is incomplete');
    if (!bankDetailsComplete) missing.push('Bank Details (Step 5) is incomplete');
    if (!emergencyContactSchema.safeParse(values.step6).success) missing.push('Emergency Contact (Step 6) is incomplete');

    const categoriesPresent = new Set(documents.map((d) => d.category));
    const missingDocs = computeMissingDocuments(categoriesPresent);
    missingDocs.forEach((d) => missing.push(`Missing document: ${d}`));

    const totalSections = 6;
    const passedSections = totalSections - [
      !personalDetailsSchema.safeParse(values.step1).success,
      !addressSchema.safeParse(values.step2).success,
      !statutoryDetailsSchema.safeParse(values.step4).success,
      !bankDetailsComplete,
      !emergencyContactSchema.safeParse(values.step6).success,
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
      toast.success('Employee Onboarding Submitted Successfully');
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
        <EmployeeActionRequiredBanner changeRequest={detail.open_change_request} />
      )}

      {UNDER_REVIEW_STATUSES.has(detail.status) && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <Clock className="w-10 h-10 text-blue-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Employee Onboarding Submitted Successfully</h2>
          <p className="text-sm text-gray-600">
            Your employee information has been successfully submitted and is now under review. Our HR team will
            contact you if anything else is needed.
          </p>
        </div>
      )}

      {detail.status === 'approved' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Employee Onboarding Approved</h2>
          <p className="text-sm text-gray-600">
            Your employee onboarding process is now complete. No further action is required from you at this time.
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
            {currentStep === 1 && <Step1PersonalDetails genderOptions={choices.genders} />}
            {currentStep === 2 && <Step2Address />}
            {currentStep === 3 && <Step3EmploymentDetails detail={detail} />}
            {currentStep === 4 && <Step4StatutoryDetails pfApplicable={detail.pf_applicable} />}
            {currentStep === 5 && <Step5BankDetails existingAccountNumberMasked={savedAccountNumberMasked} />}
            {currentStep === 6 && <Step6EmergencyContact />}
            {currentStep === 7 && (
              <Step7Documents
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
            {currentStep === 8 && (
              <Step8ReviewSubmit
                detail={detail}
                documents={documents}
                completionPercent={completionPercent}
                missingItems={missingItems}
                onEditStep={setCurrentStep}
                existingAccountNumberMasked={savedAccountNumberMasked}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
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
              {currentStep < TOTAL_STEPS && (
                <Button className="!w-auto px-6" onClick={handleNext} isLoading={isSaving}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </FormProvider>
      )}
    </div>
  );
};

export default EmployeeOnboardingPortalPage;
