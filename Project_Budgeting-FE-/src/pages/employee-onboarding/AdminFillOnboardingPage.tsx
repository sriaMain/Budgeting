import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { VendorStepper, type StepConfig } from '../vendor-onboarding/components/VendorStepper';
import { Step1PersonalDetails } from './steps/Step1PersonalDetails';
import { Step2Address } from './steps/Step2Address';
import { AdminStep3EmploymentDetails } from './steps/AdminStep3EmploymentDetails';
import { Step4StatutoryDetails } from './steps/Step4StatutoryDetails';
import { Step5BankDetails } from './steps/Step5BankDetails';
import { Step6EmergencyContact } from './steps/Step6EmergencyContact';
import { Step7Documents } from './steps/Step7Documents';
import { AdminStep8Review } from './steps/AdminStep8Review';
import { EMPTY_FORM_VALUES, type EmployeeOnboardingFormValues } from '../../schemas/employeeOnboarding.schemas';
import type { EmployeeOnboardingChoices, EmployeeOnboardingDetail, EmployeeDocument } from '../../types/employeeOnboarding.types';
import * as api from '../../services/employeeOnboarding';
import axiosInstance from '../../utils/axiosInstance';
import { useAppSelector } from '../../hooks/useAppSelector';
import { parseApiErrors } from '../../utils/parseApiErrors';

const TOTAL_STEPS = 8;

const STEPS: StepConfig[] = [
  { index: 1, label: 'Personal Details' },
  { index: 2, label: 'Address' },
  { index: 3, label: 'Employment Details' },
  { index: 4, label: 'Statutory Details' },
  { index: 5, label: 'Bank Details' },
  { index: 6, label: 'Emergency Contact' },
  { index: 7, label: 'Documents' },
  { index: 8, label: 'Review' },
];

export interface AdminOnboardingFormValues extends EmployeeOnboardingFormValues {
  step3: {
    employee_code: string;
    department: string;
    designation: string;
    reporting_manager: string;
    joining_date: string;
    employment_type: string;
    work_location: string;
    pf_applicable: boolean;
  };
}

const EMPTY_ADMIN_FORM_VALUES: AdminOnboardingFormValues = {
  ...EMPTY_FORM_VALUES,
  step3: {
    employee_code: '', department: '', designation: '', reporting_manager: '',
    joining_date: '', employment_type: '', work_location: '', pf_applicable: false,
  },
};

interface ManagerOption {
  id: number | string;
  first_name?: string;
  last_name?: string;
}

function detailToFormValues(detail: EmployeeOnboardingDetail): AdminOnboardingFormValues {
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
    step3: {
      employee_code: detail.employee_code || '', department: detail.department || '', designation: detail.designation || '',
      reporting_manager: detail.reporting_manager ? String(detail.reporting_manager.id) : '',
      joining_date: detail.joining_date || '', employment_type: detail.employment_type || '',
      work_location: detail.work_location || '', pf_applicable: detail.pf_applicable,
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

const AdminFillOnboardingPage: React.FC = () => {
  const { accountId: accountIdParam } = useParams<{ accountId: string }>();
  const accountId = Number(accountIdParam);
  const navigate = useNavigate();
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  const [choices, setChoices] = useState<EmployeeOnboardingChoices | null>(null);
  const [detail, setDetail] = useState<EmployeeOnboardingDetail | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const methods = useForm<AdminOnboardingFormValues>({
    defaultValues: EMPTY_ADMIN_FORM_VALUES,
    shouldUnregister: false,
  });

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [choicesData, detailData, docs, usersRes] = await Promise.all([
        api.getChoices(),
        api.getEmployeeOnboarding(accountId),
        api.listDocuments(accountId),
        axiosInstance.get('/accounts/users/'),
      ]);
      setChoices(choicesData);
      setDetail(detailData);
      setDocuments(docs);
      setManagerOptions(usersRes.data || []);
      methods.reset(detailToFormValues(detailData));
    } catch (err) {
      console.error(err);
      const errors = parseApiErrors(err);
      setLoadError(errors.general || 'This employee onboarding request could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const refreshDocuments = async () => {
    setDocuments(await api.listDocuments(accountId));
  };

  const persistStep = async (step: number) => {
    const values = methods.getValues();
    try {
      if (step === 1) {
        await api.patchPersonal(accountId, {
          middle_name: values.step1.middle_name, personal_email: values.step1.personal_email,
          alternate_email: values.step1.alternate_email, mobile_number: values.step1.mobile_number,
          alternate_mobile: values.step1.alternate_mobile, date_of_birth: values.step1.date_of_birth || null,
          gender: values.step1.gender, marital_status: values.step1.marital_status,
          blood_group: values.step1.blood_group, nationality: values.step1.nationality,
        });
      } else if (step === 2) {
        await api.patchAddress(accountId, values.step2);
      } else if (step === 3) {
        const updated = await api.patchEmploymentDetails(accountId, {
          employee_code: values.step3.employee_code,
          department: values.step3.department,
          designation: values.step3.designation,
          reporting_manager: values.step3.reporting_manager ? Number(values.step3.reporting_manager) : null,
          joining_date: values.step3.joining_date || null,
          employment_type: values.step3.employment_type,
          work_location: values.step3.work_location,
          pf_applicable: values.step3.pf_applicable,
        });
        setDetail(updated);
      } else if (step === 4) {
        const { pf_applicable: _pf, ...statutoryRest } = values.step4;
        void _pf;
        await api.patchStatutory(accountId, statutoryRest);
      } else if (step === 5) {
        const bankPayload = { ...values.step5 };
        if (!bankPayload.account_number) delete (bankPayload as Partial<typeof bankPayload>).account_number;
        await api.patchBankDetail(accountId, bankPayload);
      } else if (step === 6) {
        await api.patchEmergencyContact(accountId, values.step6);
      }
      return true;
    } catch (err) {
      const errors = parseApiErrors(err);
      toast.error(errors.general || 'Failed to save this step');
      return false;
    }
  };

  const isPersistableStep = (step: number) => [1, 2, 3, 4, 5, 6].includes(step);

  const handleNext = async () => {
    setIsSaving(true);
    try {
      if (isPersistableStep(currentStep)) {
        const ok = await persistStep(currentStep);
        if (!ok) return;
      }
      setCompletedSteps((prev) => new Set(prev).add(currentStep));
      setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const handleStepClick = (step: number) => {
    if (completedSteps.has(step) || step === currentStep || step < currentStep) setCurrentStep(step);
  };

  const handleSaveAndExit = async () => {
    setIsSaving(true);
    try {
      if (isPersistableStep(currentStep)) {
        const ok = await persistStep(currentStep);
        if (!ok) return;
      }
      toast.success('Saved. You can continue filling this in anytime from Manage Users.');
      navigate('/administration');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto py-16 text-center text-gray-500">Loading...</div>;
  }

  if (loadError || !detail || !choices) {
    return (
      <Layout userRole={userRole} currentPage="administration" onNavigate={() => {}}>
        <div className="max-w-lg mx-auto py-16 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">Not available</p>
          <p className="text-sm text-gray-600">{loadError}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole={userRole} currentPage="administration" onNavigate={() => {}}>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Employee Onboarding - Filling on their behalf</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{detail.account.display_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{detail.account.email}</p>
            </div>
            <StatusBadge status={detail.status} />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            An onboarding invite with a secure link has already been sent to this employee. Anything you fill in
            here is saved immediately - they'll see it pre-filled and can complete/submit the rest themselves.
          </p>
        </div>

        <FormProvider {...methods}>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <VendorStepper
              steps={STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            {currentStep === 1 && (
              <Step1PersonalDetails
                genderOptions={choices.genders}
                identityReadOnly={{ firstName: detail.account.first_name, lastName: detail.account.last_name }}
              />
            )}
            {currentStep === 2 && <Step2Address />}
            {currentStep === 3 && (
              <AdminStep3EmploymentDetails
                employmentTypeOptions={choices.employment_types}
                managerOptions={managerOptions}
                currentAccountId={accountId}
              />
            )}
            {currentStep === 4 && <Step4StatutoryDetails pfApplicable={detail.pf_applicable} />}
            {currentStep === 5 && <Step5BankDetails existingAccountNumberMasked={detail.bank_detail?.account_number_masked} />}
            {currentStep === 6 && <Step6EmergencyContact />}
            {currentStep === 7 && (
              <Step7Documents
                documents={documents}
                onUpload={async (category, file) => {
                  await api.uploadDocument(accountId, category, file);
                  await refreshDocuments();
                }}
                onDelete={async (docId) => {
                  await api.deleteDocument(accountId, docId);
                  await refreshDocuments();
                }}
                onDownload={async (docId) => {
                  const { download_url } = await api.downloadDocument(accountId, docId);
                  window.open(download_url, '_blank');
                }}
              />
            )}
            {currentStep === 8 && (
              <AdminStep8Review detail={detail} documents={documents} onEditStep={setCurrentStep} />
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
              <Button variant="secondary" className="!w-auto px-6" onClick={handleSaveAndExit} isLoading={isSaving}>
                Save &amp; Exit
              </Button>
              {currentStep < TOTAL_STEPS ? (
                <Button className="!w-auto px-6" onClick={handleNext} isLoading={isSaving}>
                  Next
                </Button>
              ) : (
                <Button className="!w-auto px-6" onClick={() => navigate('/administration')}>
                  Finish
                </Button>
              )}
            </div>
          </div>
        </FormProvider>
      </div>
    </Layout>
  );
};

export default AdminFillOnboardingPage;
