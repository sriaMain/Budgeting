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
import { FreelancerRateCardsTab } from './FreelancerRateCardsTab';
import { FreelancerContractsTab } from './FreelancerContractsTab';
import { FreelancerProjectAssignmentsTab } from './FreelancerProjectAssignmentsTab';
import { FreelancerTasksTab } from './FreelancerTasksTab';
import { FreelancerBankDetailTab } from './FreelancerBankDetailTab';
import { FreelancerEquipmentTab } from './FreelancerEquipmentTab';
import { FreelancerActivityTab } from './FreelancerActivityTab';
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
    full_name: '', email: '', phone: '', alternate_phone: '', date_of_birth: '', gender: '',
    location: '',
    permanent_address_line1: '', permanent_address_line2: '', permanent_city: '',
    permanent_state: '', permanent_country: '', permanent_pincode: '',
    temp_same_as_permanent: false, temp_address_line1: '', temp_address_line2: '',
    temp_city: '', temp_state: '', temp_country: '', temp_pincode: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
    professional_title: '', skills: '', years_of_experience: null, portfolio_url: '', linkedin_url: '',
    availability: '', preferred_start_date: '', available_until: '',
    hours_per_day: '', hours_per_week: '', notice_period_days: '', timezone: '',
    payment_method: '', currency: 'INR', rate: '',
    notes: '', internal_remarks: '',
};

const PROFILE_TABS: TabItem[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'address', label: 'Address' },
    { key: 'availability', label: 'Availability' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'bank', label: 'Bank & KYC' },
    { key: 'rates', label: 'Rate Cards' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'projects', label: 'Projects' },
    { key: 'tasks', label: 'Tasks & Time' },
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity' },
];

export function FreelancerFormContent() {
    const navigate = useNavigate();
    const { freelancerId } = useParams<{ freelancerId: string }>();
    const [searchParams] = useSearchParams();
    const isCreate = !freelancerId;

    const [id, setId] = useState<number | null>(freelancerId ? Number(freelancerId) : null);
    const [status, setStatus] = useState<string | null>(null);
    const [freelancerCode, setFreelancerCode] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(isCreate || searchParams.get('edit') === '1');
    const [values, setValues] = useState<FreelancerManualPayload>(EMPTY);
    const [choices, setChoices] = useState<FreelancerChoices | null>(null);
    const [documents, setDocuments] = useState<FreelancerDocument[]>([]);
    const [errors, setErrors] = useState<FormErrors>({});
    const [loading, setLoading] = useState(!isCreate);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');

    // Captured once on mount and never re-derived - once the freelancer is
    // created partway through the flow, `isCreate` (driven by the URL) flips
    // to false, but "Finish" still needs to know whether this session started
    // as a fresh add (so it can land on the profile view) or an edit of an
    // existing record (so it can just drop back to read-only in place).
    const [startedAsCreate] = useState(isCreate);

    useEffect(() => {
        api.getChoices().then(setChoices).catch(() => { });
    }, []);

    const loadFreelancer = async (freelancerPk: number) => {
        setLoading(true);
        try {
            const data = await api.getFreelancer(freelancerPk);
            setStatus(data.status);
            setFreelancerCode(data.freelancer_code);
            setValues({
                full_name: data.full_name, email: data.email, phone: data.phone,
                alternate_phone: data.alternate_phone || '', date_of_birth: data.date_of_birth || '',
                gender: data.gender || '', location: data.location,
                permanent_address_line1: data.permanent_address_line1 || '',
                permanent_address_line2: data.permanent_address_line2 || '',
                permanent_city: data.permanent_city || '', permanent_state: data.permanent_state || '',
                permanent_country: data.permanent_country || '', permanent_pincode: data.permanent_pincode || '',
                temp_same_as_permanent: data.temp_same_as_permanent || false,
                temp_address_line1: data.temp_address_line1 || '', temp_address_line2: data.temp_address_line2 || '',
                temp_city: data.temp_city || '', temp_state: data.temp_state || '',
                temp_country: data.temp_country || '', temp_pincode: data.temp_pincode || '',
                emergency_contact_name: data.emergency_contact_name || '',
                emergency_contact_phone: data.emergency_contact_phone || '',
                emergency_contact_relationship: data.emergency_contact_relationship || '',
                professional_title: data.professional_title, skills: data.skills,
                years_of_experience: data.years_of_experience, portfolio_url: data.portfolio_url, linkedin_url: data.linkedin_url,
                availability: data.availability, preferred_start_date: data.preferred_start_date || '',
                available_until: data.available_until || '',
                hours_per_day: data.hours_per_day ?? '', hours_per_week: data.hours_per_week ?? '',
                notice_period_days: data.notice_period_days ?? '', timezone: data.timezone || '',
                payment_method: data.payment_method, currency: data.currency, rate: data.rate ?? '',
                notes: data.notes || '', internal_remarks: data.internal_remarks || '',
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

    // Copies the permanent address into the temporary address fields once,
    // on check (rather than keeping them live-linked), per Section 4's "do
    // not duplicate data unnecessarily" - each field still holds its own
    // value afterwards, it's just seeded from the permanent address.
    const handleSameAsPermanent = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setValues((v) => ({
            ...v,
            temp_same_as_permanent: checked,
            ...(checked ? {
                temp_address_line1: v.permanent_address_line1,
                temp_address_line2: v.permanent_address_line2,
                temp_city: v.permanent_city,
                temp_state: v.permanent_state,
                temp_country: v.permanent_country,
                temp_pincode: v.permanent_pincode,
            } : {}),
        }));
    };

    const sanitizePayload = (source: FreelancerManualPayload): FreelancerManualPayload => {
        // DRF's IntegerField/DateField (unlike DecimalField/CharField) reject
        // "" outright instead of treating it as "not provided" - strip these
        // before sending or clearing them errors out the whole save.
        const payload: FreelancerManualPayload = { ...source };
        (['years_of_experience', 'notice_period_days', 'preferred_start_date', 'available_until', 'date_of_birth'] as const).forEach((key) => {
            if (payload[key] === '') delete payload[key];
        });
        return payload;
    };

    // Tabs whose fields live on the top-level `values` object and are
    // persisted through this same create-or-update call; every other tab
    // (equipment, bank, rate cards, ...) manages its own save internally
    // once a freelancer id exists, so Next there just moves the tab along.
    const SAVE_ON_NEXT_TABS = ['profile', 'address', 'availability'];
    const currentTabIndex = PROFILE_TABS.findIndex((t) => t.key === activeTab);

    const goToTab = (index: number) => {
        const clamped = Math.max(0, Math.min(index, PROFILE_TABS.length - 1));
        setActiveTab(PROFILE_TABS[clamped].key);
    };

    // Creates the freelancer (first time, wherever id is still null) or
    // PATCHes it (every time after) - same "always send the whole flat
    // object" approach used throughout this form, since Freelancer has no
    // per-tab sub-resources the way Vendor does.
    const persistCoreFields = async (): Promise<boolean> => {
        if (!values.full_name || !values.email) {
            setErrors({
                full_name: !values.full_name ? 'Full name is required' : '',
                email: !values.email ? 'Email is required' : '',
            });
            toast.error('Full name and email are required');
            return false;
        }
        if (activeTab === 'availability' && !values.timezone) {
            setErrors({ timezone: 'Time zone is required' });
            toast.error('Time zone is required');
            return false;
        }
        setErrors({});
        setIsSaving(true);
        try {
            const payload = sanitizePayload(values);
            if (id) {
                await api.updateFreelancer(id, payload);
            } else {
                const created = await api.addFreelancerManually(payload);
                setId(created.id);
                setStatus(created.status);
                setFreelancerCode(created.freelancer_code);
                navigate(`/freelancers/${created.id}?edit=1`, { replace: true });
            }
            return true;
        } catch (err) {
            const parsed = parseApiErrors(err);
            setErrors(parsed);
            toast.error(parsed.general || 'Failed to save');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => goToTab(currentTabIndex - 1);

    const handleNext = async () => {
        if (isEditing && SAVE_ON_NEXT_TABS.includes(activeTab)) {
            const ok = await persistCoreFields();
            if (!ok) return;
        }
        goToTab(currentTabIndex + 1);
    };

    const handleFinish = async () => {
        if (isEditing && SAVE_ON_NEXT_TABS.includes(activeTab)) {
            const ok = await persistCoreFields();
            if (!ok) return;
        }
        setIsEditing(false);
        toast.success(startedAsCreate ? 'Freelancer created' : 'Freelancer updated');
        if (id) loadFreelancer(id);
    };

    if (loading) {
        return <div className="text-center p-12 text-gray-500">Loading freelancer...</div>;
    }

    const readOnly = !isEditing;

    return (
        <div className="space-y-6 animate-fade-in-down">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/freelancers')}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm dark:text-gray-400 dark:hover:text-gray-100"
                >
                    <ArrowLeft size={18} /> Back to Freelancers
                </button>
                {status && <StatusBadge status={status} />}
            </div>

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {isCreate ? 'Add Freelancer' : values.full_name || 'Freelancer'}
                    </h2>
                    {freelancerCode && (
                        <p className="text-sm font-mono text-gray-500 mt-0.5 dark:text-gray-400">{freelancerCode}</p>
                    )}
                </div>
                {!isCreate && readOnly && (
                    <Button className="!w-auto px-6" onClick={() => setIsEditing(true)}>Edit</Button>
                )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
                <Tabs tabs={PROFILE_TABS} active={activeTab} onChange={setActiveTab} className="px-6" />

                <div className="p-6 space-y-8">
                    {activeTab === 'profile' && (
                        <>
                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Basic Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                    <InputField label="Full Name *" placeholder="Enter full name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} disabled={readOnly} />
                                    <InputField label="Email *" type="email" placeholder="Enter email" value={values.email} onChange={set('email')} error={errors.email} disabled={readOnly} />
                                    <InputField label="Phone Number" value={values.phone} onChange={set('phone')} disabled={readOnly} />
                                    <InputField label="Location" value={values.location} onChange={set('location')} disabled={readOnly} />
                                </div>
                            </section>

                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Professional Details</h3>
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

                    {activeTab === 'address' && (
                        <>
                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Permanent Address</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                    <InputField label="Address Line 1" value={values.permanent_address_line1} onChange={set('permanent_address_line1')} disabled={readOnly} />
                                    <InputField label="Address Line 2" value={values.permanent_address_line2} onChange={set('permanent_address_line2')} disabled={readOnly} />
                                    <InputField label="City" value={values.permanent_city} onChange={set('permanent_city')} disabled={readOnly} />
                                    <InputField label="State" value={values.permanent_state} onChange={set('permanent_state')} disabled={readOnly} />
                                    <InputField label="Country" value={values.permanent_country} onChange={set('permanent_country')} disabled={readOnly} />
                                    <InputField label="PIN / ZIP Code" value={values.permanent_pincode} onChange={set('permanent_pincode')} disabled={readOnly} />
                                </div>
                            </section>

                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Temporary Address</h3>
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={!!values.temp_same_as_permanent}
                                            onChange={handleSameAsPermanent}
                                            disabled={readOnly}
                                            className="rounded border-gray-300 text-brand-800 focus:ring-brand-800 dark:border-gray-600 dark:bg-gray-800"
                                        />
                                        Same as Permanent Address
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                    <InputField label="Address Line 1" value={values.temp_address_line1} onChange={set('temp_address_line1')} disabled={readOnly || values.temp_same_as_permanent} />
                                    <InputField label="Address Line 2" value={values.temp_address_line2} onChange={set('temp_address_line2')} disabled={readOnly || values.temp_same_as_permanent} />
                                    <InputField label="City" value={values.temp_city} onChange={set('temp_city')} disabled={readOnly || values.temp_same_as_permanent} />
                                    <InputField label="State" value={values.temp_state} onChange={set('temp_state')} disabled={readOnly || values.temp_same_as_permanent} />
                                    <InputField label="Country" value={values.temp_country} onChange={set('temp_country')} disabled={readOnly || values.temp_same_as_permanent} />
                                    <InputField label="PIN / ZIP Code" value={values.temp_pincode} onChange={set('temp_pincode')} disabled={readOnly || values.temp_same_as_permanent} />
                                </div>
                            </section>

                            <section>
                                <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Emergency Contact</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                                    <InputField label="Name" value={values.emergency_contact_name} onChange={set('emergency_contact_name')} disabled={readOnly} />
                                    <InputField label="Phone" value={values.emergency_contact_phone} onChange={set('emergency_contact_phone')} disabled={readOnly} />
                                    <InputField label="Relationship" value={values.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} disabled={readOnly} />
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === 'availability' && (
                        <section>
                            <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Availability &amp; Capacity</h3>
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

                    {activeTab === 'equipment' && (
                        id ? (
                            <FreelancerEquipmentTab
                                freelancerId={id}
                                ownerships={choices?.equipment_ownerships || []}
                                conditions={choices?.equipment_conditions || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to add equipment details.</p>
                        )
                    )}

                    {activeTab === 'bank' && (
                        id ? (
                            <FreelancerBankDetailTab
                                freelancerId={id}
                                paymentMethods={choices?.bank_payment_methods || []}
                                panVerificationStatuses={choices?.pan_verification_statuses || []}
                            />
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to add bank/KYC details.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to add rate cards.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to add contracts.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to assign projects.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to assign tasks.</p>
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
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to attach documents.</p>
                        )
                    )}

                    {activeTab === 'activity' && (
                        id ? (
                            <FreelancerActivityTab freelancerId={id} />
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Save the freelancer first to see activity.</p>
                        )
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
                {currentTabIndex > 0 ? (
                    <Button variant="secondary" className="!w-auto px-6" onClick={handleBack}>Back</Button>
                ) : <div />}
                {currentTabIndex < PROFILE_TABS.length - 1 ? (
                    <Button className="!w-auto px-6" onClick={handleNext} isLoading={isSaving}>Next</Button>
                ) : isEditing ? (
                    <Button className="!w-auto px-6" onClick={handleFinish} isLoading={isSaving}>Finish</Button>
                ) : <div />}
            </div>
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
