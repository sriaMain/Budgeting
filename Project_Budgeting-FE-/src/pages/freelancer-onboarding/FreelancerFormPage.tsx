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
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { FreelancerChoices, FreelancerManualPayload, FreelancerDocument } from '../../types/freelancerOnboarding.types';
import type { FormErrors } from '../../types';

const DOCUMENT_SLOTS = [
    { key: 'resume', label: 'Resume', required: false },
    { key: 'other', label: 'Other Document', required: false },
];

const EMPTY: FreelancerManualPayload = {
    full_name: '', email: '', phone: '', location: '',
    professional_title: '', skills: '', years_of_experience: null, portfolio_url: '', linkedin_url: '',
    availability: '', preferred_start_date: '',
    payment_method: '', currency: 'INR', rate: '',
};

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

    const handleSave = async () => {
        setIsSaving(true);
        setErrors({});
        try {
            if (id) {
                await api.updateFreelancer(id, values);
                toast.success('Freelancer updated');
                setIsEditing(false);
                loadFreelancer(id);
            } else {
                const created = await api.addFreelancerManually(values);
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

    if (loading) {
        return <div className="text-center p-12 text-gray-500">Loading freelancer...</div>;
    }

    const readOnly = !isEditing;

    return (
        <div className="space-y-6 animate-fade-in-down max-w-3xl">
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

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-8">
                {/* Basic Details */}
                <section>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <InputField label="Full Name *" placeholder="Enter full name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} disabled={readOnly} />
                        <InputField label="Email *" type="email" placeholder="Enter email" value={values.email} onChange={set('email')} error={errors.email} disabled={readOnly} />
                        <InputField label="Phone Number" value={values.phone} onChange={set('phone')} disabled={readOnly} />
                        <InputField label="Location" value={values.location} onChange={set('location')} disabled={readOnly} />
                    </div>
                </section>

                {/* Professional Details */}
                <section>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Professional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <InputField label="Professional Title / Role" value={values.professional_title} onChange={set('professional_title')} disabled={readOnly} />
                        <InputField label="Years of Experience" type="number" min={0} value={values.years_of_experience ?? ''} onChange={set('years_of_experience')} disabled={readOnly} />
                        <InputField label="Portfolio / Website" value={values.portfolio_url} onChange={set('portfolio_url')} disabled={readOnly} />
                        <InputField label="LinkedIn Profile" value={values.linkedin_url} onChange={set('linkedin_url')} disabled={readOnly} />
                    </div>
                    <div className="mt-1">
                        <label className="block text-base font-medium text-gray-900 mb-2">Skills</label>
                        <textarea
                            value={values.skills}
                            onChange={(e) => setValues((v) => ({ ...v, skills: e.target.value }))}
                            disabled={readOnly}
                            rows={2}
                            placeholder="e.g. React, Django, UI Design"
                            className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all disabled:opacity-50"
                        />
                    </div>
                </section>

                {/* Availability */}
                <section>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Availability</h3>
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
                    </div>
                </section>

                {/* Payment Details */}
                <section>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                        <InputField label="Payment Method" placeholder="e.g. Bank Transfer" value={values.payment_method} onChange={set('payment_method')} disabled={readOnly} />
                        <SelectField
                            label="Currency"
                            options={choices?.currencies || []}
                            value={values.currency}
                            onChange={set('currency')}
                            disabled={readOnly}
                        />
                        <InputField label="Rate" type="number" min={0} value={values.rate ?? ''} onChange={set('rate')} disabled={readOnly} />
                    </div>
                </section>

                {/* Documents */}
                <section>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Documents</h3>
                    {id ? (
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
                    )}
                </section>
            </div>

            {isEditing && (
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
