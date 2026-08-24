import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, ArrowLeft, Loader2, User as UserIcon,
  ChevronDown, Building2, UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ReusableTable } from '../components/ReusableTable';
import { FormRow } from '../components/FormRow';
import { StatusBadge } from './StatusBadge';
import { Modal } from './Modal';
import { Button } from './Button';
import { InputField } from './InputField';
import { SendEmployeeOnboardingModal } from '../pages/employee-onboarding/SendEmployeeOnboardingModal';
import type { Column } from '../components/ReusableTable';
import axiosInstance from '../utils/axiosInstance';
import * as employeeOnboardingApi from '../services/employeeOnboarding';
import type { Role, Module, User, UserDisplay } from '../types';
import type { EmployeeOnboardingChoices, EmployeeOnboardingDetail } from '../types/employeeOnboarding.types';
import { Toast } from './Toast';
import { parseApiErrors } from '../utils/parseApiErrors';
import companyLogo from '../assets/company-logo.png';

const ManageUsersTab: React.FC = () => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [users, setUsers] = useState<UserDisplay[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // Defaults to "active" so a deleted (deactivated) user drops out of view
  // immediately, instead of lingering in the list looking unchanged - it's
  // still recoverable by switching this filter to "Inactive".
  const [statusFilter, setStatusFilter] = useState("active");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // --- Employee Self-Onboarding ---
  const [onboardingByAccount, setOnboardingByAccount] = useState<Record<number, EmployeeOnboardingDetail>>({});
  const [employeeChoices, setEmployeeChoices] = useState<EmployeeOnboardingChoices | null>(null);
  const [inviteModalUser, setInviteModalUser] = useState<UserDisplay | null>(null);

  // --- Quick "just an email" employee invite (replaces the old full Create User form) ---
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const fetchOnboardingData = async () => {
    try {
      const [list, choices] = await Promise.all([
        employeeOnboardingApi.listEmployeeOnboarding(),
        employeeOnboardingApi.getChoices(),
      ]);
      const byAccount: Record<number, EmployeeOnboardingDetail> = {};
      list.forEach((r) => { byAccount[r.account.id] = r; });
      setOnboardingByAccount(byAccount);
      setEmployeeChoices(choices);
    } catch (error) {
      // Non-fatal: if the current role lacks employee_onboarding permissions,
      // Manage Users should still work - onboarding status just won't show.
      console.error('Failed to fetch employee onboarding data', error);
    }
  };

  const filteredUsers = users.filter(u => {
    const searchLower = (searchQuery || "").toLowerCase();
    const matchesSearch = !searchLower || (
      (u.first_name || "").toString().toLowerCase().includes(searchLower) ||
      (u.last_name || "").toString().toLowerCase().includes(searchLower) ||
      (u.email || "").toString().toLowerCase().includes(searchLower) ||
      (u.position || "").toString().toLowerCase().includes(searchLower)
    );
    
    const matchesStatus = statusFilter === "all" ? true : (statusFilter === "active" ? u.is_active : !u.is_active);
    
    let matchesModule = true;
    if (moduleFilter !== "all" && Array.isArray(modules) && modules.length > 0) {
      let currentModuleId = '';
      if (Array.isArray(u.modules) && u.modules.length > 0) {
        currentModuleId = String(u.modules[0]);
      } else if (u.module) {
        const foundModuleByName = modules.find(m => m?.product_service_name === u.module || m?.id === u.module);
        if (foundModuleByName) {
          currentModuleId = String(foundModuleByName.id);
        } else {
          currentModuleId = String(u.module);
        }
      }
      matchesModule = currentModuleId === moduleFilter;
    }

    return matchesSearch && matchesStatus && matchesModule;
  });

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
    profile_image_file: null as File | null, // New field for the actual file object
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
    fetchOnboardingData();
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
    let currentModuleId = '';
    if (user.modules && user.modules.length > 0) {
      currentModuleId = String(user.modules[0]);
    } else if (user.module) {
      // Try to find by name match first if it's a string
      const foundModuleByName = modules.find(m => m.product_service_name === user.module);
      if (foundModuleByName) {
        currentModuleId = String(foundModuleByName.id);
      } else {
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
      profile_image_file: null, // Reset file on edit start
    });
    setErrors({});
    setView('form');
  };

  const handleDelete = async (user: UserDisplay) => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    if (window.confirm(`Are you sure you want to delete user ${fullName}?`)) {
      try {
        await axiosInstance.delete(`/accounts/users/${user.id}/`);
        toast.success('User deleted successfully!');
        // The backend soft-deletes (is_active becomes false) rather than
        // removing the row - reflect that locally right away instead of
        // waiting on a refetch, otherwise the row appears unchanged and it
        // looks like nothing happened.
        setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, is_active: false } : u)));
      } catch (error) {
        console.error("Failed to delete user", error);
        toast.error('Failed to delete user.');
      }
    }
  };

  const handleQuickInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('Email is required.');
      return;
    }

    setIsInviting(true);
    setInviteError('');

    try {
      let accountId: number | null = null;

      try {
        const formDataToSend = new FormData();
        formDataToSend.append('email', email);
        // DRF treats a missing boolean field on a multipart request as an
        // unchecked HTML checkbox (false), not "use the model default" - so
        // this must be sent explicitly or the account is created inactive.
        formDataToSend.append('is_active', 'true');

        // Backend defaults a bare invite (no role given) to the Employee role
        // and auto-generates the Employee ID once the invite is sent below.
        const createRes = await axiosInstance.post('/accounts/users/create/', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        // UserCreateView returns { message, user_id, email, profile_picture } - not { id }.
        accountId = createRes.data?.user_id;
      } catch (createErr: any) {
        const emailError: string = createErr?.response?.data?.errors?.email || '';
        if (!/already exists/i.test(emailError)) throw createErr;

        // The account already exists (e.g. it was invited before) - reuse it
        // instead of dead-ending on a "already exists" error, since sending
        // the invite is clearly what the admin is trying to do here.
        const existing = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (!existing) throw createErr;

        accountId = Number(existing.id);
        if (!existing.is_active) {
          const reactivateData = new FormData();
          reactivateData.append('is_active', 'true');
          await axiosInstance.put(`/accounts/users/${accountId}/`, reactivateData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }

      try {
        await employeeOnboardingApi.sendOnboardingInvite(accountId as number);
        toast.success("Invite sent! The employee will get an email to complete their own onboarding.");
      } catch (sendErr) {
        // The account exists either way - don't lose that fact behind a
        // generic failure. The admin can retry the invite from the
        // Onboarding column.
        console.error("Account ready, but sending the onboarding invite failed", sendErr);
        toast.error("Account ready, but the invite email failed to send. You can resend it from the Onboarding column.");
      }

      setShowInviteModal(false);
      setInviteEmail('');
      await fetchData();
      await fetchOnboardingData();
    } catch (error: any) {
      // UserCreateView returns validation errors as { errors: { field: message } }.
      const backendErrors = error?.response?.data?.errors;
      setInviteError(backendErrors?.email || error?.response?.data?.error || 'Failed to send invite.');
    } finally {
      setIsInviting(false);
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
      if (formData.module) {
        formDataToSend.append('modules', formData.module);
        // Fallback for custom views if they expect module
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

      await axiosInstance.put(`/accounts/users/${formData.id}/`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      await fetchData(); // Refresh list
      await fetchOnboardingData();

      // Show toast and navigate back after delay
      setIsNavigating(true);
      setToastMessage("User updated successfully!");
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
    {
      header: 'Onboarding',
      accessor: (user) => {
        const accountId = Number(user.id);
        const onboarding = onboardingByAccount[accountId];
        if (!onboarding) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setInviteModalUser(user); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <UserPlus size={14} /> Send Onboarding Invite
            </button>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <StatusBadge status={onboarding.status} />
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/employee-onboarding/review/${accountId}`); }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Review
            </button>
          </div>
        );
      },
    },
  ];

  // --- Render ---
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

      {view === 'list' ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800 whitespace-nowrap">Manage Users</h2>
            <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
              {/* Status Filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>

              {/* Module Filter */}
              <div className="relative">
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm max-w-[200px]"
                >
                  <option value="all">All Modules</option>
                  {modules.map((mod) => (
                    <option key={mod.id} value={String(mod.id)}>
                      {mod.product_service_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>

              {/* Search */}
              <div className="relative flex-grow xl:flex-grow-0">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full xl:w-64"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              </div>
              
              <button
                onClick={() => { setInviteEmail(''); setInviteError(''); setShowInviteModal(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold shadow-sm transition-all whitespace-nowrap"
              >
                <Plus size={18} /> Invite Employee
              </button>
            </div>
          </div>

          {/* Table */}
          <ReusableTable
            data={filteredUsers}
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
              <span className="text-gray-500">Edit User</span>
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
                SRIA INFOTECH PVT LTD
              </div>

              <div className="mt-4 flex flex-col items-center text-center p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                <img
                  src={companyLogo}
                  alt="Sria Infotech"
                  className="w-20 h-auto object-contain mb-3 drop-shadow-sm mix-blend-multiply"
                />
                <button className="flex items-center gap-2 text-gray-600 hover:text-blue-600 font-medium text-sm transition-colors">
                  <Building2 size={16} />
                  <span>Company data and logo</span>
                </button>
              </div>
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

      {/* Quick "just an email" employee invite modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => { setShowInviteModal(false); setInviteEmail(''); setInviteError(''); }}
        title="Invite Employee"
        footer={
          <>
            <Button
              variant="secondary"
              className="!w-auto px-6"
              onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteError(''); }}
              disabled={isInviting}
            >
              Cancel
            </Button>
            <Button className="!w-auto px-6" onClick={handleQuickInvite} isLoading={isInviting}>
              Send Invite
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-500 mb-4">
          Enter the employee's email address. An Employee ID is generated automatically and they'll
          receive an email with a secure link to fill in their own details - the same way vendors self-onboard.
        </p>
        <InputField
          label="Employee Email *"
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          error={inviteError}
          placeholder="employee@example.com"
        />
      </Modal>

      {/* Employee Self-Onboarding invite modal */}
      {inviteModalUser && (
        <SendEmployeeOnboardingModal
          isOpen
          onClose={() => setInviteModalUser(null)}
          onSent={() => { setInviteModalUser(null); fetchOnboardingData(); }}
          accountId={Number(inviteModalUser.id)}
          employeeName={`${inviteModalUser.first_name} ${inviteModalUser.last_name}`.trim()}
          employmentTypeOptions={employeeChoices?.employment_types || []}
          managerOptions={users}
        />
      )}
    </div>
  );
};

export default ManageUsersTab;