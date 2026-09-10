import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { DocumentList } from '../../../components/DocumentList';
import { SkillsInput } from '../../../components/SkillsInput';
import { VendorStepper, type StepConfig } from '../../vendor-onboarding/components/VendorStepper';
import * as api from '../../../services/freelancerOnboardingPublic';
import { parseApiErrors } from '../../../utils/parseApiErrors';
import type { Freelancer, FreelancerDocument, FreelancerManualPayload, FreelancerPublicChoices, FreelancerBankDetailPayload } from '../../../types/freelancerOnboarding.types';

const STEPS: StepConfig[] = [
    { index: 1, label: 'Basic Details' },
    { index: 2, label: 'Professional Details' },
    { index: 3, label: 'Availability' },
    { index: 4, label: 'Bank & KYC' },
    { index: 5, label: 'Documents' },
];

const BANK_PAYMENT_METHODS = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'upi', label: 'UPI' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'wise', label: 'Wise' },
    { value: 'other', label: 'Other' },
];

const EMPTY_BANK_VALUES: FreelancerBankDetailPayload = {
    payment_method: '', payment_terms: '', tax_number: '',
    account_holder_name: '', bank_name: '', account_number: '', ifsc_code: '',
};

const DOCUMENT_SLOTS = [
    { key: 'resume', label: 'Resume', required: false },
    { key: 'pan', label: 'PAN Card', required: true },
    { key: 'other', label: 'Other Document', required: false },
];

function freelancerToValues(f: Freelancer): FreelancerManualPayload {
    return {
        full_name: f.full_name, email: f.email, phone: f.phone, location: f.location,
        professional_title: f.professional_title, skills: f.skills,
        years_of_experience: f.years_of_experience, portfolio_url: f.portfolio_url, linkedin_url: f.linkedin_url,
        availability: f.availability, preferred_start_date: f.preferred_start_date || '',
        available_until: f.available_until || '',
        hours_per_day: f.hours_per_day ?? '', hours_per_week: f.hours_per_week ?? '',
        notice_period_days: f.notice_period_days ?? '', timezone: f.timezone || '',
        payment_method: f.payment_method, currency: f.currency, rate: f.rate ?? '',
    };
}

const FreelancerOnboardingPortalPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();

    const [choices, setChoices] = useState<FreelancerPublicChoices | null>(null);
    const [freelancer, setFreelancer] = useState<Freelancer | null>(null);
    const [documents, setDocuments] = useState<FreelancerDocument[]>([]);
    const [values, setValues] = useState<FreelancerManualPayload | null>(null);
    const [bankValues, setBankValues] = useState<FreelancerBankDetailPayload>(EMPTY_BANK_VALUES);
    const [accountNumberMasked, setAccountNumberMasked] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [choicesData, freelancerData, docs] = await Promise.all([
                api.getPublicChoices(),
                api.getFreelancerByToken(token),
                api.listDocumentsByToken(token),
            ]);
            setChoices(choicesData);
            setFreelancer(freelancerData);
            setDocuments(docs);
            setValues(freelancerToValues(freelancerData));

            const step = Math.min(Math.max(freelancerData.last_saved_step || 1, 1), 5);
            setCurrentStep(step);
            setCompletedSteps(new Set(Array.from({ length: step - 1 }, (_, i) => i + 1)));

            try {
                const bankDetail = await api.getBankDetailByToken(token);
                if (bankDetail) {
                    setBankValues({
                        payment_method: bankDetail.payment_method, payment_terms: bankDetail.payment_terms,
                        tax_number: bankDetail.tax_number,
                        account_holder_name: bankDetail.account_holder_name, bank_name: bankDetail.bank_name,
                        account_number: '', ifsc_code: bankDetail.ifsc_code,
                    });
                    setAccountNumberMasked(bankDetail.account_number_masked || null);
                }
            } catch {
                // Bank detail is optional to preload - don't block the rest of the onboarding page.
            }
        } catch (err) {
            const errors = parseApiErrors(err);
            setLoadError(errors.general || 'Invalid or unavailable freelancer onboarding link.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentStep]);

    const set = <K extends keyof FreelancerManualPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setValues((v) => (v ? { ...v, [field]: e.target.value } : v));
    };

    const setBankField = <K extends keyof FreelancerBankDetailPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setBankValues((v) => ({ ...v, [field]: e.target.value as never }));
    };

    const persist = async (advanceTo?: number) => {
        if (!token || !values) return false;
        setFieldErrors({});
        if (currentStep === 1 && (!values.full_name || !values.email)) {
            setFieldErrors({
                full_name: !values.full_name ? 'Full name is required' : '',
                email: !values.email ? 'Email is required' : '',
            });
            toast.error('Full name and email are required');
            return false;
        }
        setIsSaving(true);
        try {
            if (currentStep === 4) {
                const bankErrors: Record<string, string> = {};
                if (!bankValues.tax_number) bankErrors.tax_number = 'PAN is required';
                if (!bankValues.account_holder_name) bankErrors.account_holder_name = 'Account holder name is required';
                if (!bankValues.bank_name) bankErrors.bank_name = 'Bank name is required';
                if (!bankValues.ifsc_code) bankErrors.ifsc_code = 'IFSC code is required';
                // Account number is only re-required when there's nothing on
                // file yet - once saved it's write-only, so it always reloads
                // blank and a blank resubmission means "keep the existing one".
                if (!bankValues.account_number && !accountNumberMasked) bankErrors.account_number = 'Account number is required';

                if (Object.keys(bankErrors).length > 0) {
                    setFieldErrors(bankErrors);
                    toast.error('Please fill in all mandatory bank/KYC fields');
                    return false;
                }

                const bankPayload: FreelancerBankDetailPayload = { ...bankValues };
                if (!bankPayload.account_number) delete bankPayload.account_number;
                await api.updateBankDetailByToken(token, bankPayload);
                if (advanceTo) {
                    const updated = await api.updateByToken(token, { last_saved_step: advanceTo });
                    setFreelancer(updated);
                }
                return true;
            }
            // DRF's IntegerField/DateField (unlike DecimalField/CharField)
            // reject "" outright instead of treating it as "not provided" -
            // strip these before sending or clearing them errors out the save.
            const payload: Partial<FreelancerManualPayload> & { last_saved_step?: number } = { ...values };
            (['years_of_experience', 'notice_period_days', 'preferred_start_date', 'available_until'] as const).forEach((key) => {
                if (payload[key] === '') delete payload[key];
            });
            if (advanceTo) payload.last_saved_step = advanceTo;
            const updated = await api.updateByToken(token, payload);
            setFreelancer(updated);
            return true;
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to save. Please try again.');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDraft = async () => {
        const ok = await persist();
        if (ok) toast.success('Progress saved');
    };

    const handleNext = async () => {
        const ok = await persist(currentStep + 1);
        if (ok) {
            setCompletedSteps((prev) => new Set(prev).add(currentStep));
            setCurrentStep((s) => Math.min(s + 1, STEPS.length));
        }
    };

    const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

    const handleStepClick = (index: number) => {
        if (completedSteps.has(index) || index === currentStep) setCurrentStep(index);
    };

    const handleSubmit = async () => {
        if (!token) return;
        setIsSubmitting(true);
        try {
            const updated = await api.submitByToken(token);
            setFreelancer(updated);
            toast.success('Thank you! Your onboarding has been submitted.');
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Submission failed - please check your details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="max-w-3xl mx-auto py-16 text-center text-gray-500">Loading...</div>;
    }

    if (loadError || !freelancer || !values) {
        return (
            <div className="max-w-lg mx-auto py-16 text-center">
                <p className="text-lg font-semibold text-gray-900 mb-2">Link not available</p>
                <p className="text-sm text-gray-600">{loadError}</p>
            </div>
        );
    }

    if (freelancer.status === 'completed' || freelancer.status === 'active') {
        return (
            <div className="max-w-2xl mx-auto py-16 px-4">
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                    <h2 className="text-lg font-bold text-gray-900 mb-1">You're all set!</h2>
                    <p className="text-sm text-gray-600">
                        Thank you for completing your freelancer onboarding, {freelancer.full_name}. We'll be in touch.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Freelancer Onboarding</p>
                <h1 className="text-2xl font-bold text-gray-900">{freelancer.full_name || 'Complete your profile'}</h1>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <VendorStepper steps={STEPS} currentStep={currentStep} completedSteps={completedSteps} onStepClick={handleStepClick} />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                {currentStep === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <InputField label="Full Name *" placeholder="Enter your full name" value={values.full_name} onChange={set('full_name')} error={fieldErrors.full_name} />
                        <InputField label="Email *" type="email" placeholder="Enter your email" value={values.email} onChange={set('email')} error={fieldErrors.email} />
                        <InputField label="Phone Number" value={values.phone} onChange={set('phone')} />
                        <InputField label="Location" value={values.location} onChange={set('location')} />
                    </div>
                )}
                {currentStep === 2 && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                            <InputField label="Professional Title / Role" value={values.professional_title} onChange={set('professional_title')} />
                            <InputField label="Years of Experience" type="number" min={0} value={values.years_of_experience ?? ''} onChange={set('years_of_experience')} />
                            <InputField label="Portfolio / Website" value={values.portfolio_url} onChange={set('portfolio_url')} />
                            <InputField label="LinkedIn Profile" value={values.linkedin_url} onChange={set('linkedin_url')} />
                        </div>
                        <SkillsInput
                            label="Skills"
                            value={values.skills ?? ''}
                            onChange={(skills) => setValues((v) => (v ? { ...v, skills } : v))}
                        />
                    </>
                )}
                {currentStep === 3 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <SelectField
                            label="Availability"
                            placeholder="Select availability"
                            options={choices?.availabilities || []}
                            value={values.availability}
                            onChange={set('availability')}
                        />
                        <InputField label="Preferred Start Date" type="date" value={values.preferred_start_date || ''} onChange={set('preferred_start_date')} />
                        <InputField label="Available Until" type="date" value={values.available_until || ''} onChange={set('available_until')} />
                        <InputField label="Time Zone" placeholder="e.g. Asia/Kolkata" value={values.timezone || ''} onChange={set('timezone')} />
                        <InputField label="Hours Per Day" type="number" min={0} value={values.hours_per_day ?? ''} onChange={set('hours_per_day')} />
                        <InputField label="Hours Per Week" type="number" min={0} value={values.hours_per_week ?? ''} onChange={set('hours_per_week')} />
                    </div>
                )}
                {currentStep === 4 && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                            <SelectField
                                label="Payment Method"
                                placeholder="Select method"
                                options={BANK_PAYMENT_METHODS}
                                value={bankValues.payment_method ?? ''}
                                onChange={setBankField('payment_method')}
                            />
                            <InputField label="Payment Terms" placeholder="e.g. Net 15" value={bankValues.payment_terms} onChange={setBankField('payment_terms')} />
                            <InputField label="PAN *" placeholder="e.g. ABCDE1234F" value={bankValues.tax_number} onChange={setBankField('tax_number')} error={fieldErrors.tax_number} />
                            <InputField label="Account Holder Name *" value={bankValues.account_holder_name} onChange={setBankField('account_holder_name')} error={fieldErrors.account_holder_name} />
                            <InputField label="Bank Name *" value={bankValues.bank_name} onChange={setBankField('bank_name')} error={fieldErrors.bank_name} />
                            <InputField
                                label={accountNumberMasked ? `Account Number * (on file: ${accountNumberMasked})` : 'Account Number *'}
                                placeholder="Leave blank to keep the number on file"
                                value={bankValues.account_number}
                                onChange={setBankField('account_number')}
                                error={fieldErrors.account_number}
                            />
                            <InputField label="IFSC Code *" value={bankValues.ifsc_code} onChange={setBankField('ifsc_code')} error={fieldErrors.ifsc_code} />
                        </div>
                    </div>
                )}
                {currentStep === 5 && (
                    <DocumentList
                        slots={DOCUMENT_SLOTS}
                        documents={documents}
                        onUpload={async (category, file) => {
                            if (!token) return;
                            await api.uploadDocumentByToken(token, category, file);
                            setDocuments(await api.listDocumentsByToken(token));
                        }}
                        onDelete={async (docId) => {
                            if (!token) return;
                            await api.deleteDocumentByToken(token, docId);
                            setDocuments(await api.listDocumentsByToken(token));
                        }}
                        onDownload={async (docId) => {
                            if (!token) return;
                            const { download_url } = await api.downloadDocumentByToken(token, docId);
                            window.open(download_url, '_blank');
                        }}
                    />
                )}
            </div>

            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                {currentStep > 1 ? (
                    <Button variant="secondary" className="!w-auto px-6" onClick={handleBack}>Back</Button>
                ) : <div />}
                <div className="flex items-center gap-3">
                    <Button variant="secondary" className="!w-auto px-6" onClick={handleSaveDraft} isLoading={isSaving}>
                        Save & Continue
                    </Button>
                    {currentStep < STEPS.length && (
                        <Button className="!w-auto px-6" onClick={handleNext} isLoading={isSaving}>Next</Button>
                    )}
                    {currentStep === STEPS.length && (
                        <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={isSubmitting}>
                            Submit Onboarding
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FreelancerOnboardingPortalPage;
