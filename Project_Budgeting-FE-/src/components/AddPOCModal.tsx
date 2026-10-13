import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";
import { PhoneInput } from "./onboarding/PhoneInput";
import { useCountries } from "../hooks/useCountries";
import { EMAIL_REGEX, validatePhoneValue } from "../utils/countryRules";
import { readClientApiError } from "../services/clientOnboarding";
import { SALUTATIONS, type POC } from "../pages/client-onboarding/clientTypes";

interface AddPOCModalProps {
    companyId: number;
    companyName: string;
    /** The client's country - picks the dialing code for a new number. */
    defaultCountry?: string;
    poc?: POC; // Optional POC for editing
    onSave: (poc: POC) => void;
    onClose: () => void;
}

type PocField = 'salutation' | 'first_name' | 'middle_name' | 'last_name' | 'designation' | 'poc_mobile' | 'poc_email';
type PocErrors = Partial<Record<PocField | 'general', string>>;

const INPUT = 'w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500';
const inputTone = (error?: string) => (error ? 'border-red-500 bg-red-50 dark:bg-red-950/40' : 'border-gray-300 dark:border-gray-700');

/** Add / edit a client's point of contact. The phone is entered with a dialing-code picker and
 * stored in E.164, so existing contacts (any country) can be edited as they are. */
export function AddPOCModal({ companyId, companyName, defaultCountry, poc, onSave, onClose }: AddPOCModalProps) {
    const { countries } = useCountries();
    const isEditing = !!poc;
    const [formData, setFormData] = useState<Record<PocField, string>>({
        salutation: poc?.salutation || '',
        first_name: poc?.first_name || '',
        middle_name: poc?.middle_name || '',
        last_name: poc?.last_name || '',
        designation: poc?.designation || '',
        poc_mobile: poc?.poc_mobile || '',
        poc_email: poc?.poc_email || '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<PocErrors>({});

    const validateField = (name: PocField, value: string): string => {
        switch (name) {
            case 'poc_email':
                if (!value.trim()) return 'Email is required';
                return EMAIL_REGEX.test(value.trim()) ? '' : 'Please enter a valid email address';
            case 'poc_mobile':
                return validatePhoneValue(value, countries, defaultCountry, true);
            case 'salutation':
                return value ? '' : 'Salutation is required';
            case 'first_name':
                return value.trim() ? '' : 'First name is required';
            case 'last_name':
                return value.trim() ? '' : 'Last name is required';
            case 'designation':
                return value.trim() ? '' : 'Designation is required';
            default:
                return '';
        }
    };

    const setValue = (name: PocField, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: undefined, general: undefined }));
    };

    const handleBlur = (name: PocField) => {
        const error = validateField(name, formData[name]);
        if (error) setErrors((prev) => ({ ...prev, [name]: error }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const found: PocErrors = {};
        (Object.keys(formData) as PocField[]).forEach((key) => {
            const error = validateField(key, formData[key]);
            if (error) found[key] = error;
        });
        if (Object.keys(found).length > 0) {
            setErrors(found);
            return;
        }

        setIsSaving(true);
        const payload: Record<string, unknown> = {
            company: companyId,
            salutation: formData.salutation,
            first_name: formData.first_name.trim(),
            middle_name: formData.middle_name.trim(),
            last_name: formData.last_name.trim(),
            designation: formData.designation.trim(),
            poc_email: formData.poc_email.trim(),
        };
        // Phone only when new or changed (E.164 - the server accepts it without a separate code).
        if (!isEditing || formData.poc_mobile !== poc?.poc_mobile) payload.input_mobile = formData.poc_mobile;

        try {
            const response = isEditing
                ? await axiosInstance.patch(`/pocs/${poc.id}/`, payload)
                : await axiosInstance.post('/pocs/', payload);
            const savedPOC: POC = {
                ...response.data,
                company: companyId,
                company_name: companyName,
                poc_mobile: response.data.poc_mobile || formData.poc_mobile,
            };
            toast.success(isEditing ? 'POC updated successfully' : 'POC added successfully');
            onSave(savedPOC);
            onClose();
        } catch (error) {
            const apiError = readClientApiError(error, 'Failed to save POC');
            const fieldErrors: PocErrors = {};
            Object.entries(apiError.fields).forEach(([key, message]) => {
                const field = key === 'input_mobile' || key === 'country_code' ? 'poc_mobile' : key;
                if (field in formData) fieldErrors[field as PocField] = message;
            });
            setErrors({ ...fieldErrors, general: apiError.message });
            toast.error(apiError.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (!isSaving) onClose();
    };

    const label = (text: string, required = true) => (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {required && <span className="text-red-500 mr-1">*</span>}{text}
        </label>
    );
    const errorText = (field: PocField) => errors[field] && <p className="text-xs text-red-600 mt-1 dark:text-red-400">{errors[field]}</p>;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all dark:bg-black/50" onClick={handleClose} />

            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all dark:bg-gray-900 dark:shadow-black/40" onClick={(e) => e.stopPropagation()}>
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl dark:bg-gray-900 dark:border-gray-800">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">{isEditing ? 'Edit POC' : 'Add POC'}</h4>
                        <button onClick={handleClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300" aria-label="Close modal">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6">
                        {errors.general && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                                {errors.general}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                            <div className="space-y-2">
                                {label('Client', false)}
                                <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
                                    {companyName}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    {label('Salutation')}
                                    <select
                                        value={formData.salutation}
                                        onChange={(e) => setValue('salutation', e.target.value)}
                                        onBlur={() => handleBlur('salutation')}
                                        className={`${INPUT} ${inputTone(errors.salutation)}`}
                                    >
                                        <option value="">Select</option>
                                        {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {errorText('salutation')}
                                </div>
                                <div className="space-y-2">
                                    {label('First Name')}
                                    <input value={formData.first_name} onChange={(e) => setValue('first_name', e.target.value)} onBlur={() => handleBlur('first_name')} className={`${INPUT} ${inputTone(errors.first_name)}`} placeholder="First name" />
                                    {errorText('first_name')}
                                </div>
                                <div className="space-y-2">
                                    {label('Middle Name', false)}
                                    <input value={formData.middle_name} onChange={(e) => setValue('middle_name', e.target.value)} className={`${INPUT} ${inputTone()}`} placeholder="Middle name" />
                                </div>
                                <div className="space-y-2">
                                    {label('Last Name')}
                                    <input value={formData.last_name} onChange={(e) => setValue('last_name', e.target.value)} onBlur={() => handleBlur('last_name')} className={`${INPUT} ${inputTone(errors.last_name)}`} placeholder="Last name" />
                                    {errorText('last_name')}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {label('Designation')}
                                <input value={formData.designation} onChange={(e) => setValue('designation', e.target.value)} onBlur={() => handleBlur('designation')} className={`${INPUT} ${inputTone(errors.designation)}`} placeholder="Enter designation" />
                                {errorText('designation')}
                            </div>

                            <div className="space-y-2">
                                {label('Email')}
                                <input type="email" value={formData.poc_email} onChange={(e) => setValue('poc_email', e.target.value)} onBlur={() => handleBlur('poc_email')} className={`${INPUT} ${inputTone(errors.poc_email)}`} placeholder="Enter email address" />
                                {errorText('poc_email')}
                            </div>

                            <PhoneInput
                                id="poc-phone"
                                label="Phone Number"
                                required
                                value={formData.poc_mobile}
                                onChange={(e164) => setValue('poc_mobile', e164)}
                                defaultCountry={defaultCountry}
                                error={errors.poc_mobile}
                            />

                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-800">
                                <button type="button" onClick={handleClose} disabled={isSaving} className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSaving ? 'Saving...' : (isEditing ? 'Update POC' : 'Add POC')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
