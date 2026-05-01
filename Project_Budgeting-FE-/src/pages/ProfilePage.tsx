import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAppSelector } from '../hooks/useAppSelector';
import { User, Mail, Briefcase, Shield, Loader2, ChevronDown } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { FormRow } from '../components/FormRow';

interface ProfilePageProps {
    userRole: 'admin' | 'user' | 'manager';
    currentPage: string;
    onNavigate: (page: string) => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ userRole, currentPage, onNavigate }) => {
    const username = useAppSelector((state) => state.auth.username);
    const email = useAppSelector((state) => state.auth.email);
    const role = useAppSelector((state) => state.auth.userRole);

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [userId, setUserId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: email || '',
        position: '',
        charges_per_hour: '',
        languages: [] as string[],
        profile_picture: null as string | null,
        profile_image_file: null as File | null
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch user profile data
    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            // Get all users and find the current user by email/username
            const response = await axiosInstance.get('/accounts/users/');
            const users = response.data;

            // Find current user by email
            const currentUser = users.find((user: any) => user.email === email);

            if (currentUser) {
                setUserId(currentUser.id);
                setFormData({
                    first_name: currentUser.first_name || '',
                    last_name: currentUser.last_name || '',
                    email: currentUser.email || '',
                    position: currentUser.position || '',
                    charges_per_hour: currentUser.charges_per_hour ? String(currentUser.charges_per_hour) : '',
                    languages: Array.isArray(currentUser.languages) ? currentUser.languages : [],
                    profile_picture: currentUser.profile_picture,
                    profile_image_file: null
                });
            }
        } catch (error) {
            console.error('Failed to fetch user profile:', error);
            toast.error('Failed to load profile data');
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setFormData(prev => ({
                ...prev,
                profile_picture: url,
                profile_image_file: file
            }));
        }
    };

    const handleLanguageChange = (lang: string) => {
        setFormData(prev => {
            const currentLangs = Array.isArray(prev.languages) ? prev.languages : [];
            const langs = currentLangs.includes(lang)
                ? currentLangs.filter(l => l !== lang)
                : [...currentLangs, lang];
            return { ...prev, languages: langs };
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!userId) {
            toast.error('User ID not found');
            return;
        }

        setIsSaving(true);

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('first_name', formData.first_name);
            formDataToSend.append('last_name', formData.last_name);
            formDataToSend.append('email', formData.email);
            formDataToSend.append('position', formData.position);

            if (formData.charges_per_hour) {
                formDataToSend.append('charges_per_hour', formData.charges_per_hour);
            }

            const langsToSend = Array.isArray(formData.languages) ? formData.languages : [];
            formDataToSend.append('languages', JSON.stringify(langsToSend));

            if (formData.profile_image_file) {
                formDataToSend.append('profile_picture', formData.profile_image_file);
            }

            await axiosInstance.put(`/accounts/users/${userId}/`, formDataToSend, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success('Profile updated successfully!');
            setIsEditing(false);
            fetchUserProfile();
        } catch (error) {
            console.error('Failed to update profile:', error);
            toast.error('Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Edit Profile
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Profile Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center overflow-hidden">
                                {formData.profile_picture ? (
                                    <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={40} className="text-blue-600" />
                                )}
                            </div>
                            <div className="text-white">
                                <h2 className="text-2xl font-bold">{formData.first_name} {formData.last_name}</h2>
                                <p className="text-blue-100">{role || 'Employee'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Profile Form */}
                    {isEditing ? (
                        <form onSubmit={handleSave} className="p-8">
                            <h3 className="text-blue-600 font-bold text-lg mb-6">User details</h3>

                            <div className="flex flex-col lg:flex-row gap-8 items-start">
                                {/* Left Column: Input Fields */}
                                <div className="flex-1 w-full space-y-4 max-w-xl">
                                    {/* First Name */}
                                    <FormRow label="First Name" required>
                                        <input
                                            required
                                            type="text"
                                            value={formData.first_name}
                                            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                            placeholder="First Name"
                                        />
                                    </FormRow>

                                    {/* Last Name */}
                                    <FormRow label="Last Name" required>
                                        <input
                                            required
                                            type="text"
                                            value={formData.last_name}
                                            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                            placeholder="Last Name"
                                        />
                                    </FormRow>

                                    {/* Email */}
                                    <FormRow label="E-mail" required>
                                        <input
                                            required
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                            placeholder="E-mail"
                                        />
                                    </FormRow>

                                    {/* Position */}
                                    <FormRow label="Position" required>
                                        <input
                                            required
                                            type="text"
                                            value={formData.position}
                                            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                            placeholder="Position"
                                        />
                                    </FormRow>

                                    {/* Charges */}
                                    <FormRow label="Charges per hr">
                                        <input
                                            type="number"
                                            value={formData.charges_per_hour}
                                            onChange={(e) => setFormData({ ...formData, charges_per_hour: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </FormRow>

                                    {/* Language Checkboxes */}
                                    <div className="pt-4">
                                        <div className="text-sm font-bold text-gray-700 mb-2">Language</div>
                                        <div className="flex gap-6">
                                            {['English', 'German', 'Spanish'].map((lang) => (
                                                <label key={lang} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.languages.includes(lang.toLowerCase())}
                                                        onChange={() => handleLanguageChange(lang.toLowerCase())}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-gray-600">{lang}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Image Upload */}
                                <div className="w-full lg:w-64 flex flex-col items-center">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-64 h-64 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-blue-400 transition-all group overflow-hidden"
                                    >
                                        {formData.profile_picture ? (
                                            <div className="relative w-full h-full">
                                                <img src={formData.profile_picture} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-white text-sm font-bold">Change Image</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 mb-4">
                                                    <User size={40} />
                                                </div>
                                                <p className="text-xs text-center text-gray-500 font-medium px-4">
                                                    Drag a file or <span className="text-blue-600">browse</span> to upload
                                                </p>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-8 flex gap-4 justify-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditing(false);
                                        fetchUserProfile();
                                    }}
                                    className="px-8 py-2.5 border border-gray-300 text-gray-700 font-bold rounded hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-12 py-2.5 bg-blue-600 text-white font-bold rounded shadow-md hover:bg-blue-700 hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="animate-spin" size={16} /> Saving...
                                        </span>
                                    ) : 'Save'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* View Mode */
                        <div className="p-6 space-y-6">
                            {/* Username */}
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <User size={20} className="text-blue-600" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-gray-500">Name</label>
                                    <p className="text-lg text-gray-900 mt-1">{formData.first_name} {formData.last_name}</p>
                                </div>
                            </div>

                            {/* Email */}
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                                    <Mail size={20} className="text-green-600" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-gray-500">Email</label>
                                    <p className="text-lg text-gray-900 mt-1">{formData.email}</p>
                                </div>
                            </div>

                            {/* Position */}
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                                    <Briefcase size={20} className="text-orange-600" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-gray-500">Position</label>
                                    <p className="text-lg text-gray-900 mt-1">{formData.position || 'N/A'}</p>
                                </div>
                            </div>

                            {/* Role */}
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                                    <Shield size={20} className="text-purple-600" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-gray-500">Role</label>
                                    <p className="text-lg text-gray-900 mt-1 capitalize">{role || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default ProfilePage;
