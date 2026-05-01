import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { POC } from "../pages/ClientListPage";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { toast } from "react-hot-toast";

interface AddPOCModalProps {
    companyId: number;
    companyName: string;
    poc?: POC; // Optional POC for editing
    onSave: (poc: POC) => void;
    onClose: () => void;
}

export function AddPOCModal({ companyId, companyName, poc, onSave, onClose }: AddPOCModalProps) {
    const [formData, setFormData] = useState({
        poc_name: poc?.poc_name || '',
        designation: poc?.designation || '',
        poc_mobile: poc?.poc_mobile || '',
        poc_email: poc?.poc_email || ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<{ general?: string; poc_name?: string; designation?: string; poc_mobile?: string; poc_email?: string }>({});
    const [touched, setTouched] = useState({
        poc_name: false,
        designation: false,
        poc_mobile: false,
        poc_email: false
    });

    const isEditing = !!poc;

    // Update form data when poc prop changes
    useEffect(() => {
        if (poc) {
            setFormData({
                poc_name: poc.poc_name,
                designation: poc.designation,
                poc_mobile: poc.poc_mobile,
                poc_email: poc.poc_email
            });
        } else {
            // Reset form when opening for new POC
            setFormData({
                poc_name: '',
                designation: '',
                poc_mobile: '',
                poc_email: ''
            });
            setTouched({
                poc_name: false,
                designation: false,
                poc_mobile: false,
                poc_email: false
            });
            setErrors({});
        }
    }, [poc]);

    const validateField = (name: string, value: string) => {
        switch (name) {
            case 'poc_email':
                if (!value) return 'Email is required';
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) return 'Please enter a valid email address';
                return '';
            case 'poc_mobile':
                if (!value) return 'Phone number is required';
                const digitsOnly = value.replace(/[^0-9]/g, '');
                if (digitsOnly.length !== 10) return 'Phone number must be exactly 10 digits';
                return '';
            case 'poc_name':
                if (!value.trim()) return 'POC name is required';
                return '';
            case 'designation':
                if (!value.trim()) return 'Designation is required';
                return '';
            default:
                return '';
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        // For phone number, only allow exactly 10 digits
        if (name === 'poc_mobile') {
            const digitsOnly = value.replace(/[^0-9]/g, '');
            // Restrict to maximum 10 digits
            if (digitsOnly.length <= 10) {
                setFormData({ ...formData, [name]: digitsOnly });
            }
        } else {
            setFormData({ ...formData, [name]: value });
        }

        // Clear error when user starts typing
        setErrors(prev => ({ ...prev, [name]: '', general: '' }));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setTouched(prev => ({ ...prev, [name]: true }));

        const error = validateField(name, value);
        if (error) {
            setErrors(prev => ({ ...prev, [name]: error }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Mark all fields as touched
        setTouched({
            poc_name: true,
            designation: true,
            poc_mobile: true,
            poc_email: true
        });

        // Validate all fields
        const newErrors: any = {};
        Object.keys(formData).forEach(key => {
            const error = validateField(key, formData[key as keyof typeof formData]);
            if (error) newErrors[key] = error;
        });

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSaving(true);
        const payload = {
            ...formData,
            company: companyId,
            company_name: companyName
        };

        try {
            let response;
            if (isEditing) {
                // Update existing POC
                response = await axiosInstance.put(`pocs/${poc.id}/`, payload);
            } else {
                // Create new POC
                response = await axiosInstance.post("pocs/", payload);
            }

            if (response.status === 200 || response.status === 201) {
                const savedPOC: POC = {
                    ...formData,
                    company: companyId,
                    company_name: companyName,
                    id: isEditing ? poc.id : (response.data.id || response.data.poc_id || Math.floor(Math.random() * 1000) + 1)
                };

                toast.success(isEditing ? 'POC updated successfully' : 'POC added successfully');
                onSave(savedPOC);

                // Close modal after a short delay to show toast
                setTimeout(() => {
                    onClose();
                }, 500);
            }
        } catch (error) {
            const apiErrors = parseApiErrors(error);
            setErrors(apiErrors);
            toast.error(apiErrors.general || 'Failed to save POC');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (!isSaving) {
            setErrors({});
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
                        <h4 className="text-lg font-bold text-gray-900">
                            {isEditing ? 'Edit POC' : 'Add POC'}
                        </h4>
                        <button
                            onClick={handleClose}
                            disabled={isSaving}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                            aria-label="Close modal"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {errors.general && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                                </svg>
                                {errors.general}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Read-only Company Name */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Client
                                </label>
                                <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium">
                                    {companyName}
                                </div>
                            </div>

                            {/* POC Name */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>POC Name
                                </label>
                                <input
                                    required
                                    type="text"
                                    name="poc_name"
                                    value={formData.poc_name}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${touched.poc_name && errors.poc_name ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter POC name"
                                />
                                {touched.poc_name && errors.poc_name && (
                                    <p className="text-xs text-red-600 mt-1">{errors.poc_name}</p>
                                )}
                            </div>

                            {/* Designation */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>Designation
                                </label>
                                <input
                                    required
                                    type="text"
                                    name="designation"
                                    value={formData.designation}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${touched.designation && errors.designation ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter designation"
                                />
                                {touched.designation && errors.designation && (
                                    <p className="text-xs text-red-600 mt-1">{errors.designation}</p>
                                )}
                            </div>

                            {/* Email */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>Email
                                </label>
                                <input
                                    required
                                    type="email"
                                    name="poc_email"
                                    value={formData.poc_email}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${touched.poc_email && errors.poc_email ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter email address"
                                />
                                {touched.poc_email && errors.poc_email && (
                                    <p className="text-xs text-red-600 mt-1">{errors.poc_email}</p>
                                )}
                            </div>

                            {/* Phone Number */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>Phone Number
                                </label>
                                <input
                                    required
                                    type="tel"
                                    name="poc_mobile"
                                    value={formData.poc_mobile}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    maxLength={10}
                                    pattern="[0-9]{10}"
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${touched.poc_mobile && errors.poc_mobile ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter 10-digit phone number"
                                />
                                {touched.poc_mobile && errors.poc_mobile && (
                                    <p className="text-xs text-red-600 mt-1">{errors.poc_mobile}</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={isSaving}
                                    className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
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
