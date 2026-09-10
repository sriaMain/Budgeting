import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/Button';
import { DocumentList } from '../../components/DocumentList';
import { SkillsInput } from '../../components/SkillsInput';
import { Tabs, type TabItem } from '../../components/Tabs';
import { VendorStepper, type StepConfig } from '../vendor-onboarding/components/VendorStepper';
import { FreelancerRateCardsTab } from './FreelancerRateCardsTab';
import { FreelancerContractsTab } from './FreelancerContractsTab';
import { FreelancerProjectAssignmentsTab } from './FreelancerProjectAssignmentsTab';
import { FreelancerTasksTab } from './FreelancerTasksTab';
import { FreelancerBankDetailTab } from './FreelancerBankDetailTab';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { FreelancerChoices, FreelancerManualPayload, FreelancerDocument } from '../../types/freelancerOnboarding.types';
import type { FormErrors } from '../../types';

const DOCUMENT_SLOTS = [
    { key: 'resume', label: 'Resume', required: false },
    { key: 'pan', label: 'PAN Card', required: true },
    { key: 'other', label: 'Other Document', required: false },
];

const EMPTY: FreelancerManualPayload = {
    full_name: '', email: '', phone: '', location: '',
    professional_title: '', skills: '', years_of_experience: null, portfolio_url: '', linkedin_url: '',
    availability: '', preferred_start_date: '', available_until: '',
    hours_per_day: '', hours_per_week: '', notice_period_days: '', timezone: '',
    payment_method: '', currency: 'INR', rate: '',
};

const CREATE_STEPS: StepConfig[] = [
    { index: 1, label: 'Basic Details' },
    { index: 2, label: 'Professional Details' },
    { index: 3, label: 'Availability' },
    { index: 4, label: 'Bank & KYC' },
    { index: 5, label: 'Documents' },
];

const PROFILE_TABS: TabItem[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'availability', label: 'Availability' },
    { key: 'bank', label: 'Bank & KYC' },
    { key: 'rates', label: 'Rate Cards' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'projects', label: 'Projects' },
    { key: 'tasks', label: 'Tasks & Time' },
    { key: 'documents', label: 'Documents' },
];

export function FreelancerFormContent() {
    const navigate = useNavigate();
    const { freelancerId } = useParams<{ freelancerId: string }>();
    const [searchParams] = useSearchParams();
    const isCreate = !freelancerId;

    const [id, setId] = useState<number | null>(freelancerId ? Number(freelancerId) : null);
    const [status, setStatus] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(isCreate || searchParams.get('edit') === '1');
    const [values, setValues] = useState<FreelancerManualPayload>(EMPTY);
    const [choices, setChoices] = useState<FreelancerChoices | null>(null);
    const [documents, setDocuments] = useState<FreelancerDocument[]>([]);
    const [errors, setErrors] = useState<FormErrors>({});
    const [loading, setLoading] = useState(!isCreate);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');

    // Captured once on mount and never re-derived - a plain "Add Freelancer"
    // creates the record partway through step 1, so `id` stops being null
    // long before the wizard is done, but the UI must stay in wizard mode
    // (not jump to the tabbed management view) until the user hits Submit.
    const [wizardMode] = useState(isCreate);
    const [wizardStep, setWizardStep] = useState(1);
    const [wizardCompletedSteps, setWizardCompletedSteps] = useState<Set<number>>(new Set());

    useEffect(() => {
        api.getChoices().then(setChoices).catch(() => { });
    }, []);

    const loadFreelancer = async (freelancerPk: number) => {
        setLoading(true);
        try {
            const data = await api.getFreelancer(freelancerPk);
            setStatus(data.status);
            setValues({
                full_name: data.full_name, email: data.email, phone: data.phone, location: data.location,
                professional_title: data.professional_title, skills: data.skills,
                years_of_experience: data.years_of_experience, portfolio_url: data.portfolio_url, linkedin_url: data.linkedin_url,
                availability: data.availability, preferred_start_date: data.preferred_start_date || '',
                available_until: data.available_until || '',
                hours_per_day: data.hours_per_day ?? '', hours_per_week: data.hours_per_week ?? '',
                notice_period_days: data.notice_period_days ?? '', timezone: data.timezone || '',
                payment_method: data.payment_method, currency: data.currency, rate: data.rate ?? '',
            });
            const docs = await api.listDocuments(freelancerPk);
            setDocuments(docs);
        } catch {
            toast.error('Failed to load freelancer');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) loadFreelancer(id);
    }, [id]);

    const set = <K extends keyof FreelancerManualPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setValues((v) => ({ ...v, [field]: e.target.value }));
    };

    const sanitizePayload = (source: FreelancerManualPayload): FreelancerManualPayload => {
        // DRF's IntegerField/DateField (unlike DecimalField/CharField) reject
        // "" outright instead of treating it as "not provided" - strip these
        // before sending or clearing them errors out the whole save.
        const payload: FreelancerManualPayload = { ...source };
        (['years_of_experience', 'notice_period_days', 'preferred_start_date', 'available_until'] as const).forEach((key) => {
            if (payload[key] === '') delete payload[key];
        });
        return payload;
    };

    const handleSave = async () => {
        setIsSaving(true);
        setErrors({});
        try {
            const payload = sanitizePayload(values);
            if (id) {
                await api.updateFreelancer(id, payload);
                toast.success('Freelancer updated');
                setIsEditing(false);
                loadFreelancer(id);
            } else {
                const created = await api.addFreelancerManually(payload);
                toast.success('Freelancer saved');
                setId(created.id);
                setStatus(created.status);
                navigate(`/freelancers/${created.id}`, { replace: true });
            }
        } catch (err) {
            const parsed = parseApiErrors(err);
            setErrors(parsed);
            toast.error(parsed.general || 'Failed to save freelancer');
        } finally {
            setIsSaving(false);
        }
    };

    // Persists whatever's filled in so far (create on the way out of step 1,
    // PATCH on every step after that - same "always send the whole flat
    // object" approach as handleSave, since Freelancer has no per-step
    // sub-resources the way Vendor does) then advances the wizard step.
    const persistWizardStep = async (): Promise<boolean> => {
        setErrors({});
        if (wizardStep === 1 && (!values.full_name || !values.email)) {
            setErrors({
                full_name: !values.full_name ? 'Full name is required' : '',
                email: !values.email ? 'Email is required' : '',
            });
            toast.error('Full name and email are required');
            return false;
        }
        if (wizardStep === 3 && !values.timezone) {
            setErrors({ timezone: 'Time zone is required' });
            toast.error('Time zone is required');
            return false;
        }
        setIsSaving(true);
        try {
            const payload = sanitizePayload(values);
            if (id) {
                await api.updateFreelancer(id, payload);
            } else {
                const created = await api.addFreelancerManually(payload);
                setId(created.id);
                setStatus(created.status);
            }
            return true;
        } catch (err) {
            const parsed = parseApiErrors(err);
            setErrors(parsed);
            toast.error(parsed.general || 'Failed to save this step');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleWizardNext = async () => {
        const ok = await persistWizardStep();
        if (ok) {
            setWizardCompletedSteps((prev) => new Set(prev).add(wizardStep));
            setWizardStep((s) => Math.min(s + 1, CREATE_STEPS.length));
        }
    };

    const handleWizardBack = () => setWizardStep((s) => Math.max(s - 1, 1));

    const handleWizardStepClick = (step: number) => {
        if (wizardCompletedSteps.has(step) || step === wizardStep) setWizardStep(step);
    };

    const handleWizardSubmit = async () => {
        const ok = await persistWizardStep();
        if (ok && id) {
            toast.success('Freelancer created');
            navigate('/freelancers', { replace: true });
        }
    };

    if (loading) {
        return <div className="text-center p-12 text-gray-500">Loading freelancer...</div>;
    }

    if (wizardMode) {
        return (
            <div className="space-y-6 animate-fade-in-down">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate('/freelancers')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm"
                    >
                        <ArrowLeft size={18} /> Back to Freelancers
                    </button>
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Add Freelancer</h2>

                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <VendorStepper
                        steps={CREATE_STEPS}
                        currentStep={wizardStep}
                        completedSteps={wizardCompletedSteps}
                        onStepClick={handleWizardStepClick}
                    />
                </div>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-8">
                    {wizardStep === 1 && (
                        <section>
                            <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                <InputField label="Full Name *" placeholder="Enter full name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} />
                                <InputField label="Email *" type="email" placeholder="Enter email" value={values.email} onChange={set('email')} error={errors.email} />
                                <InputField label="Phone Number" value={values.phone} onChange={set('phone')} />
                                <InputField label="Location" value={values.location} onChange={set('location')} />
                            </div>
                        </section>
                    )}

                    {wizardStep === 2 && (
                        <section>
                            <h3 className="text-base font-semibold text-gray-900 mb-3">Professional Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                <InputField label="Professional Title / Role" value={values.professional_title} onChange={set('professional_title')} />
                                <InputField label="Years of Experience" type="number" min={0} value={values.years_of_experience ?? ''} onChange={set('years_of_experience')} />
                                <InputField label="Portfolio / Website" value={values.portfolio_url} onChange={set('portfolio_url')} />
                                <InputField label="LinkedIn Profile" value={values.linkedin_url} onChange={set('linkedin_url')} />
                            </div>
                            <SkillsInput
                                label="Skills"
                                value={values.skills ?? ''}
                                onChange={(skills) => setValues((v) => ({ ...v, skills }))}
                            />
                        </section>
                    )}

                    {wizardStep === 3 && (
                        <section>
                            <h3 className="text-base font-semibold text-gray-900 mb-3">Availability &amp; Capacity</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                <SelectField
                                    label="Availability" placeholder="Select availability"
                                    options={choices?.availabilities || []} value={values.availability} onChange={set('availability')}
                                />
                                <InputField label="Preferred Start Date" type="date" value={values.preferred_start_date || ''} onChange={set('preferred_start_date')} />
                                <InputField label="Available Until" type="date" value={values.available_until || ''} onChange={set('available_until')} />
                                <InputField label="Time Zone *" placeholder="e.g. Asia/Kolkata" value={values.timezone || ''} onChange={set('timezone')} error={errors.timezone} />
                                <InputField label="Hours Per Day" type="number" min={0} value={values.hours_per_day ?? ''} onChange={set('hours_per_day')} />
                                <InputField label="Hours Per Week (Max Capacity)" type="number" min={0} value={values.hours_per_week ?? ''} onChange={set('hours_per_week')} />
                                <InputField label="Notice Period (days)" type="number" min={0} value={values.notice_period_days ?? ''} onChange={set('notice_period_days')} />
                            </div>
                        </section>
                    )}

                    {wizardStep === 4 && (
                        id ? (
                            <FreelancerBankDetailTab
                                freelancerId={id}
                                paymentMethods={choices?.bank_payment_methods || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Complete Basic Details first to add bank/KYC details.</p>
                        )
                    )}

                    {wizardStep === 5 && (
                        id ? (
                            <DocumentList
                                slots={DOCUMENT_SLOTS}
                                documents={documents}
                                onUpload={async (category, file) => {
                                    await api.uploadDocument(id, category, file);
                                    setDocuments(await api.listDocuments(id));
                                }}
                                onDelete={async (docId) => {
                                    await api.deleteDocument(id, docId);
                                    setDocuments(await api.listDocuments(id));
                                }}
                                onDownload={async (docId) => {
                                    const { download_url } = await api.downloadDocument(id, docId);
                                    window.open(download_url, '_blank');
                                }}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Complete Basic Details first to attach documents.</p>
                        )
                    )}
                </div>

                <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    {wizardStep > 1 ? (
                        <Button variant="secondary" className="!w-auto px-6" onClick={handleWizardBack}>Back</Button>
                    ) : <div />}
                    <div className="flex items-center gap-3">
                        {wizardStep < CREATE_STEPS.length && (
                            <Button className="!w-auto px-6" onClick={handleWizardNext} isLoading={isSaving}>Next</Button>
                        )}
                        {wizardStep === CREATE_STEPS.length && (
                            <Button className="!w-auto px-6" onClick={handleWizardSubmit} isLoading={isSaving}>Submit</Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const readOnly = !isEditing;

    return (
        <div className="space-y-6 animate-fade-in-down">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/freelancers')}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm"
                >
                    <ArrowLeft size={18} /> Back to Freelancers
                </button>
                {status && <StatusBadge status={status} />}
            </div>

            <div className="flex items-center justify-between">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                    {isCreate ? 'Add Freelancer' : values.full_name || 'Freelancer'}
                </h2>
                {!isCreate && readOnly && (
                    <Button className="!w-auto px-6" onClick={() => setIsEditing(true)}>Edit</Button>
                )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <Tabs tabs={PROFILE_TABS} active={activeTab} onChange={setActiveTab} className="px-6" />

                <div className="p-6 space-y-8">
                    {activeTab === 'profile' && (
                        <>
                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                    <InputField label="Full Name *" placeholder="Enter full name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} disabled={readOnly} />
                                    <InputField label="Email *" type="email" placeholder="Enter email" value={values.email} onChange={set('email')} error={errors.email} disabled={readOnly} />
                                    <InputField label="Phone Number" value={values.phone} onChange={set('phone')} disabled={readOnly} />
                                    <InputField label="Location" value={values.location} onChange={set('location')} disabled={readOnly} />
                                </div>
                            </section>

                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3">Professional Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                    <InputField label="Professional Title / Role" value={values.professional_title} onChange={set('professional_title')} disabled={readOnly} />
                                    <InputField label="Years of Experience" type="number" min={0} value={values.years_of_experience ?? ''} onChange={set('years_of_experience')} disabled={readOnly} />
                                    <InputField label="Portfolio / Website" value={values.portfolio_url} onChange={set('portfolio_url')} disabled={readOnly} />
                                    <InputField label="LinkedIn Profile" value={values.linkedin_url} onChange={set('linkedin_url')} disabled={readOnly} />
                                </div>
                                <SkillsInput
                                    label="Skills"
                                    value={values.skills ?? ''}
                                    onChange={(skills) => setValues((v) => ({ ...v, skills }))}
                                    disabled={readOnly}
                                />
                            </section>
                        </>
                    )}

                    {activeTab === 'availability' && (
                        <section>
                            <h3 className="text-base font-semibold text-gray-900 mb-3">Availability &amp; Capacity</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                <SelectField
                                    label="Availability"
                                    placeholder="Select availability"
                                    options={choices?.availabilities || []}
                                    value={values.availability}
                                    onChange={set('availability')}
                                    disabled={readOnly}
                                />
                                <InputField label="Preferred Start Date" type="date" value={values.preferred_start_date || ''} onChange={set('preferred_start_date')} disabled={readOnly} />
                                <InputField label="Available Until" type="date" value={values.available_until || ''} onChange={set('available_until')} disabled={readOnly} />
                                <InputField label="Time Zone" placeholder="e.g. Asia/Kolkata" value={values.timezone || ''} onChange={set('timezone')} disabled={readOnly} />
                                <InputField label="Hours Per Day" type="number" min={0} value={values.hours_per_day ?? ''} onChange={set('hours_per_day')} disabled={readOnly} />
                                <InputField
                                    label="Hours Per Week (Max Capacity)" type="number" min={0}
                                    value={values.hours_per_week ?? ''} onChange={set('hours_per_week')} disabled={readOnly}
                                />
                                <InputField label="Notice Period (days)" type="number" min={0} value={values.notice_period_days ?? ''} onChange={set('notice_period_days')} disabled={readOnly} />
                            </div>
                        </section>
                    )}

                    {activeTab === 'bank' && (
                        id ? (
                            <FreelancerBankDetailTab
                                freelancerId={id}
                                paymentMethods={choices?.bank_payment_methods || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to add bank/KYC details.</p>
                        )
                    )}

                    {activeTab === 'rates' && (
                        id ? (
                            <FreelancerRateCardsTab
                                freelancerId={id}
                                pricingModels={choices?.pricing_models || []}
                                currencies={choices?.currencies || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to add rate cards.</p>
                        )
                    )}

                    {activeTab === 'contracts' && (
                        id ? (
                            <FreelancerContractsTab
                                freelancerId={id}
                                contractTypes={choices?.contract_types || []}
                                contractStatuses={choices?.contract_statuses || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to add contracts.</p>
                        )
                    )}

                    {activeTab === 'projects' && (
                        id ? (
                            <FreelancerProjectAssignmentsTab
                                freelancerId={id}
                                hoursPerWeek={values.hours_per_week ? Number(values.hours_per_week) : null}
                                assignmentStatuses={choices?.assignment_statuses || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to assign projects.</p>
                        )
                    )}

                    {activeTab === 'tasks' && (
                        id ? (
                            <FreelancerTasksTab
                                freelancerId={id}
                                taskAssignmentStatuses={choices?.task_assignment_statuses || []}
                                timeEntryStatuses={choices?.time_entry_statuses || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to assign tasks.</p>
                        )
                    )}

                    {activeTab === 'documents' && (
                        id ? (
                            <DocumentList
                                slots={DOCUMENT_SLOTS}
                                documents={documents}
                                disabled={readOnly}
                                onUpload={async (category, file) => {
                                    await api.uploadDocument(id, category, file);
                                    setDocuments(await api.listDocuments(id));
                                }}
                                onDelete={async (docId) => {
                                    await api.deleteDocument(id, docId);
                                    setDocuments(await api.listDocuments(id));
                                }}
                                onDownload={async (docId) => {
                                    const { download_url } = await api.downloadDocument(id, docId);
                                    window.open(download_url, '_blank');
                                }}
                            />
                        ) : (
                            <p className="text-sm text-gray-500">Save the freelancer first to attach documents.</p>
                        )
                    )}
                </div>
            </div>

            {isEditing && ['profile', 'availability'].includes(activeTab) && (
                <div className="flex justify-center">
                    <Button className="!w-auto px-8" onClick={handleSave} isLoading={isSaving}>
                        Save Freelancer
                    </Button>
                </div>
            )}
        </div>
    );
}

const FreelancerFormPage: React.FC = () => {
    const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

    return (
        <Layout userRole={userRole} currentPage="freelancers" onNavigate={() => { }}>
            <FreelancerFormContent />
        </Layout>
    );
};

export default FreelancerFormPage;
