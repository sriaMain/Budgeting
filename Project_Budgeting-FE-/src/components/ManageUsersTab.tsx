import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, ArrowLeft, Loader2, User as UserIcon,
  ChevronDown, Building2
} from 'lucide-react';
import { ReusableTable } from '../components/ReusableTable';
import { FormRow } from '../components/FormRow';
import type { Column } from '../components/ReusableTable';
import axiosInstance from '../utils/axiosInstance';
import type { Role, Module, User, UserDisplay } from '../types';
import { Toast } from './Toast';
import { parseApiErrors } from '../utils/parseApiErrors';

const ManageUsersTab: React.FC = () => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [users, setUsers] = useState<UserDisplay[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]); // New State for Modules
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  // We use a specific state for the form to handle UI logic (like selectedRoleId as a string)
  const initialFormState = {
    id: '',
    first_name: '',
    last_name: '',
    email: '',
    position: '',
    module: '', // This will now store the Module ID as a string for the dropdown
    charges_per_hour: '', // Input string, convert to number on save
    selectedRoleId: '', // We use this for the single dropdown, mapped to roles[] on save
    languages: [] as string[],
    is_active: true,
    profile_picture: null as string | null, // Cloudinary image URL from backend
    profile_image_file: null as File | null // New field for the actual file object
  };

  const [formData, setFormData] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [errors, setErrors] = useState<{ general?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Fetch Data ---
  useEffect(() => {
    fetchData();
  }, []);

  // Clear errors when switching to list view
  useEffect(() => {
    if (view === 'list') {
      setErrors({});
    }
  }, [view]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch Roles, Users, and Modules in parallel
      const [rolesRes, usersRes, modulesRes] = await Promise.all([
        axiosInstance.get('/roles/roles/'),
        axiosInstance.get('/accounts/users/'), // Assuming /users/ endpoint based on /roles/roles/
        axiosInstance.get('/product-services/') // Endpoint for modules
      ]);

      setRoles(rolesRes.data);
      setUsers(usersRes.data);
      setModules(modulesRes.data);

      console.log("Roles fetched:", rolesRes.data);
      console.log("Users fetched:", usersRes.data);
      console.log("Modules fetched:", modulesRes.data);

    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Handlers ---
  const handleEdit = (user: UserDisplay) => {
    // Extract the first role ID for the single dropdown if roles exist
    let currentRoleId = '';
    if (user.roles && user.roles.length > 0) {
      const firstRole = user.roles[0];
      // Check if it's an object or ID (API consistency check)
      if (typeof firstRole === 'object' && 'id' in firstRole) {
        currentRoleId = String(firstRole.id);
      } else {
        currentRoleId = String(firstRole);
      }
    }

    // Determine Module ID for the dropdown
    // If user.module is a string (name), find the ID. If it's already an ID, use it.
    let currentModuleId = '';
    if (user.module) {
      // Try to find by name match first if it's a string
      const foundModuleByName = modules.find(m => m.product_service_name === user.module);
      if (foundModuleByName) {
        currentModuleId = String(foundModuleByName.id);
      } else {
        // Assume it might be an ID
        currentModuleId = String(user.module);
      }
    }

    setFormData({
      id: String(user.id),
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      position: user.position || '',
      module: currentModuleId,
      charges_per_hour: user.charges_per_hour ? String(user.charges_per_hour) : '',
      selectedRoleId: currentRoleId,
      languages: Array.isArray(user.languages) ? user.languages : [],
      is_active: user.is_active,
      profile_picture: user.profile_picture,
      profile_image_file: null // Reset file on edit start
    });
    setErrors({});
    setView('form');
  };

  const handleDelete = async (user: UserDisplay) => {
    if (window.confirm(`Are you sure you want to delete ${user.first_name}?`)) {
      try {
        await axiosInstance.delete(`/users/${user.id}/`);
        setUsers(prev => prev.filter(u => u.id !== user.id));
      } catch (error) {
        console.error("Failed to delete user", error);
      }
    }
  };

  const handleLanguageChange = (lang: string) => {
    setFormData(prev => {
      // Ensure languages is always an array
      const currentLangs = Array.isArray(prev.languages) ? prev.languages : [];
      const langs = currentLangs.includes(lang)
        ? currentLangs.filter(l => l !== lang)
        : [...currentLangs, lang];
      return { ...prev, languages: langs };
    });
    setErrors({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Create FormData object for multipart/form-data request
      const formDataToSend = new FormData();

      // Append standard fields
      formDataToSend.append('first_name', formData.first_name);
      formDataToSend.append('last_name', formData.last_name);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('position', formData.position);

      // Append Module ID
      // If formData.module is set (contains the ID string), append it.
      if (formData.module) {
        formDataToSend.append('module', formData.module);
      }

      if (formData.charges_per_hour) {
        formDataToSend.append('charges_per_hour', formData.charges_per_hour);
      }
      formDataToSend.append('is_active', String(formData.is_active));

      // Append Roles (Backend expects array of IDs)
      if (formData.selectedRoleId) {
        // Depending on backend, often repeated keys 'roles' or 'roles[]' works best
        // Using 'roles' based on typical DRF list handling in FormData
        formDataToSend.append('roles', formData.selectedRoleId);
      }

      // Append Languages as JSON string so backend accepts a JSON array
      const langsToSend = Array.isArray(formData.languages) ? formData.languages : [];
      if (langsToSend.length > 0) {
        formDataToSend.append('languages', JSON.stringify(langsToSend));
      } else {
        // ensure empty array is sent if none selected
        formDataToSend.append('languages', JSON.stringify([]));
      }

      // Append File if it exists
      // Note: We use the key 'profile_url' based on your interface, 
      // but usually file upload fields might be named 'image', 'avatar', or 'profile_image'.
      // If 'profile_url' fails, check the backend expectation for the file field name.
      if (formData.profile_image_file) {
        formDataToSend.append('profile_picture', formData.profile_image_file);
      }

      // Headers for multipart form data are automatically set by browser/axios when passing FormData
      // but sometimes we need to ensure the Content-Type header isn't forced to application/json by an interceptor.

      if (formData.id) {
        await axiosInstance.put(`/accounts/users/${formData.id}/`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await axiosInstance.post('/accounts/users/create/', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      await fetchData(); // Refresh list

      // Show toast and navigate back after delay
      setIsNavigating(true);
      setToastMessage(formData.id ? "User updated successfully!" : "User created successfully!");
      setShowToast(true);
      setTimeout(() => {
        setView('list');
        setFormData(initialFormState);
        setErrors({});
        setIsNavigating(false);
      }, 1800);

    } catch (error) {
      const apiErrors = parseApiErrors(error);
      setErrors(apiErrors);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview URL
      const url = URL.createObjectURL(file);
      // Store both the preview URL and the actual File object
      setFormData(prev => ({
        ...prev,
        profile_picture: url,
        profile_image_file: file
      }));
      setErrors({});
    }
  };

  // --- Table Configuration ---
  const columns: Column<UserDisplay>[] = [
    {
      header: 'Name',
      accessor: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0">
            {user.profile_picture ? (
              <img
                src={user.profile_picture}
                alt={`${user.first_name} ${user.last_name}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.textContent = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`;
                  }
                }}
              />
            ) : (
              `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
            )}
          </div>
          <span className="font-medium text-gray-900">{user.first_name} {user.last_name}</span>
        </div>
      )
    },
    { header: 'Email', accessor: 'email' },
    { header: 'Position', accessor: 'position' },
    {
      header: 'Role',
      accessor: (user) => {
        // Display Role Name. Assumes GET /users returns nested role objects or we can map them.
        // If the API returns full objects in roles[]:
        if (user.roles && user.roles.length > 0) {
          const firstRole = user.roles[0];
          if (typeof firstRole === 'object' && 'role_name' in firstRole) {
            return firstRole.role_name;
          }
          // If it returns just IDs, we try to find it in our roles list
          else if (typeof firstRole === 'number') {
            const found = roles.find(r => r.id === firstRole);
            return found ? found.role_name : `Role #${firstRole}`;
          }
        }
        return <span className="text-gray-400 italic">No Role</span>;
      }
    },
    {
      header: 'Status',
      accessor: (user) => (
        <span className={`px-2 py-1 text-xs rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
  ];

  // --- Render ---
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

      {view === 'list' ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800">Manage Users</h2>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative flex-grow md:flex-grow-0">
                <input
                  type="text"
                  placeholder="Search users..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full md:w-64"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              </div>
              <button
                onClick={() => { setFormData(initialFormState); setErrors({}); setView('form'); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold shadow-sm transition-all whitespace-nowrap"
              >
                <Plus size={18} /> Create User
              </button>
            </div>
          </div>

          {/* Table */}
          <ReusableTable
            data={users}
            columns={columns}
            keyField="id"
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        // --- Form View ---
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
          {/* Blur overlay when navigating */}
          {isNavigating && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto rounded-xl" />
          )}

          {/* Form Header */}
          <div className="px-8 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-gray-900 text-lg">Users and groups</span>
              <span className="text-gray-400 text-lg">›</span>
              <span className="text-gray-500">{formData.id ? 'Edit User' : 'New User'}</span>
            </div>
            <button onClick={() => { setErrors({}); setView('list'); }} className="text-gray-400 hover:text-gray-600">
              <ArrowLeft size={20} />
            </button>
          </div>

          {errors.general && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
              </svg>
              {errors.general}
            </div>
          )}

          <div className="flex flex-col lg:flex-row min-h-[600px]">
            {/* Sidebar (Left Panel) */}
            <div className="w-full lg:w-64 bg-white border-r border-gray-100 p-4 flex flex-col gap-2">
              <button className="flex items-center gap-3 px-4 py-3 bg-gray-50 text-gray-900 font-semibold rounded-lg border-l-4 border-blue-600 shadow-sm">
                <UserIcon size={18} />
                Profile
              </button>
              <div className="ml-11 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                SRIA INFOTECH
              </div>

              <button className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 font-medium rounded-lg transition-colors">
                <Building2 size={18} />
                Company data and logo
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-8 bg-white">
              <form onSubmit={handleSave}>
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
                        onChange={(e) => { setFormData({ ...formData, first_name: e.target.value }); setErrors({}); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder-gray-300"
                        placeholder="First Name"
                      />
                    </FormRow>

                    {/* Last Name */}
                    <FormRow label="Last Name" required>
                      <input
                        required
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => { setFormData({ ...formData, last_name: e.target.value }); setErrors({}); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder-gray-300"
                        placeholder="Last Name"
                      />
                    </FormRow>

                    {/* Email */}
                    <FormRow label="E-mail" required>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErrors({}); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder-gray-300"
                        placeholder="E-mail"
                      />
                    </FormRow>

                    {/* Position */}
                    <FormRow label="Position" required>
                      <input
                        required
                        type="text"
                        value={formData.position}
                        onChange={(e) => { setFormData({ ...formData, position: e.target.value }); setErrors({}); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder-gray-300"
                        placeholder="Position"
                      />
                    </FormRow>

                    {/* Role Dropdown */}
                    <FormRow label="Role" required>
                      <div className="relative">
                        <select
                          required
                          value={formData.selectedRoleId}
                          onChange={(e) => { setFormData({ ...formData, selectedRoleId: e.target.value }); setErrors({}); }}
                          className={`w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white cursor-pointer appearance-none ${!formData.selectedRoleId ? 'text-gray-400' : 'text-gray-900'}`}
                        >
                          <option value="" disabled>Select Role</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.role_name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                    </FormRow>

                    {/* Module Dropdown */}
                    <FormRow label="Module" required>
                      <div className="relative">
                        <select
                          required
                          value={formData.module}
                          onChange={(e) => { setFormData({ ...formData, module: e.target.value }); setErrors({}); }}
                          className={`w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white cursor-pointer appearance-none ${!formData.module ? 'text-gray-400' : 'text-gray-900'}`}
                        >
                          <option value="" disabled>Select Module</option>
                          {modules.map((mod) => (
                            <option key={mod.id} value={mod.id}>
                              {mod.product_service_name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                    </FormRow>

                    {/* Charges */}
                    <FormRow label="Charges per hr" required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                        <input
                          required
                          type="number"
                          min="0"
                          max="100000"
                          step="0.01"
                          value={formData.charges_per_hour}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Limit to 100 crores (1,00,00,0)
                            if (value === '' || parseFloat(value) <= 100000) {
                              setFormData({ ...formData, charges_per_hour: value });
                            }
                            setErrors({});
                          }}
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder-gray-300"
                          placeholder="0.00"
                        />
                      </div>
                    </FormRow>

                    {/* Categories Dropdown (Accordion Placeholder) */}
                    <div className="pt-2">
                      <button type="button" className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-800 transition-colors">
                        Categories <ChevronDown size={16} />
                      </button>
                    </div>

                    {/* Active Checkbox */}
                    <FormRow label="Active">
                      <div className="flex items-center gap-3">
                        <input
                          id="is_active"
                          type="checkbox"
                          checked={!!formData.is_active}
                          onChange={(e) => { setFormData({ ...formData, is_active: e.target.checked }); setErrors({}); }}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is_active" className="text-sm text-gray-600">User is active</label>
                      </div>
                    </FormRow>

                    {/* Language Checkboxes */}
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="text-sm font-bold text-gray-700">User tags</div>
                      <div className="sm:col-span-2">
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
                            <UserIcon size={40} />
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

                {/* Footer Save Button */}
                <div className="mt-12 flex justify-center pb-8">
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
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};

export default ManageUsersTab;