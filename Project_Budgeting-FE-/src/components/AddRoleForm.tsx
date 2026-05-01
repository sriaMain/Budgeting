
import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, ArrowRight, ArrowLeft, Save, Plus, Loader2 } from 'lucide-react';
import  type { Permission, Role } from '../types';
import axiosInstance from '../utils/axiosInstance';
import { Toast } from './Toast';
import { parseApiErrors } from '../utils/parseApiErrors';

// Fallback Data only used if API fails entirely
const FALLBACK_PERMISSIONS: Permission[] = [
  { id: 1, code: "user.create", label: "Create User", category: "User Management" },
  { id: 2, code: "user.view", label: "View Users", category: "User Management" },
  { id: 3, code: "user.update", label: "Update User", category: "User Management" },
  { id: 4, code: "user.delete", label: "Delete User", category: "User Management" },
  { id: 5, code: "roles.create", label: "Create Role", category: "Role Management" },
  { id: 6, code: "roles.view", label: "View Role", category: "Role Management" },
  { id: 7, code: "roles.update", label: "Update Role", category: "Role Management" },
  { id: 8, code: "roles.delete", label: "Delete Role", category: "Role Management" },
  { id: 9, code: "rbac.permissions.view", label: "View Permission Catalog", category: "RBAC Core" },
];

interface AddRoleFormProps {
  onCancel: () => void;
  onSuccess: () => void;
  role?: Role | null;
}

const AddRoleForm: React.FC<AddRoleFormProps> = ({ onCancel, onSuccess, role = null }) => {
  const [roleName, setRoleName] = useState<string>(role?.role_name ?? '');
  const [isActive, setIsActive] = useState<boolean>(!!role?.is_active);
  
  // Data State
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);
  
  // Permission Lists State
  const [chosenPermissions, setChosenPermissions] = useState<Permission[]>([]);
  
  // Selection State (highlighted items pending move)
  const [leftSelectedIds, setLeftSelectedIds] = useState<Set<number>>(new Set());
  const [rightSelectedIds, setRightSelectedIds] = useState<Set<number>>(new Set());
  
  // UI State
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [errors, setErrors] = useState<{ roleName?: string; permissions?: string; general?: string }>({});

  // Fetch Permissions from Roles API
  useEffect(() => {
    const fetchPermissionsFromRoles = async () => {
      setIsLoadingPermissions(true);
      try {
        // Try fetching permissions directly (expected shape: array of Permission)
        const resp = await axiosInstance.get('/roles/permissions/');

        if (resp.status === 200 && Array.isArray(resp.data)) {
          const maybePerms = resp.data as any[];

          // Detect if this is a direct permissions list (has 'code'/'label')
          if (maybePerms.length > 0 && (maybePerms[0].code || maybePerms[0].label)) {
            const perms = maybePerms as Permission[];
            setAllPermissions(perms);
            const categories = new Set(perms.map(p => p.category));
            setExpandedCategories(categories);
            setIsLoadingPermissions(false);
            return;
          }

          // Otherwise, it might be a list of roles with embedded permissions; fall through
          const rolesData: Role[] = resp.data as unknown as Role[];

          // Extract unique permissions from all roles
          const uniquePermsMap = new Map<number, Permission>();
          rolesData.forEach(r => {
            if (r.permissions && Array.isArray(r.permissions)) {
              r.permissions.forEach(p => {
                if (!uniquePermsMap.has(p.id)) uniquePermsMap.set(p.id, p);
              });
            }
          });

          const derivedPermissions = Array.from(uniquePermsMap.values());
          if (derivedPermissions.length > 0) {
            setAllPermissions(derivedPermissions);
            const categories = new Set(derivedPermissions.map(p => p.category));
            setExpandedCategories(categories);
            setIsLoadingPermissions(false);
            return;
          }
        }

        // If direct permissions endpoint didn't return useful data, try fetching roles and extracting permissions
        const rolesResp = await axiosInstance.get('/roles/roles');
        if (rolesResp.status === 200 && Array.isArray(rolesResp.data)) {
          const rolesData: Role[] = rolesResp.data;
          const uniquePermsMap = new Map<number, Permission>();
          rolesData.forEach(role => {
            if (role.permissions && Array.isArray(role.permissions)) {
              role.permissions.forEach(p => {
                if (!uniquePermsMap.has(p.id)) uniquePermsMap.set(p.id, p);
              });
            }
          });

          const derivedPermissions = Array.from(uniquePermsMap.values());
          setAllPermissions(derivedPermissions);
          const categories = new Set(derivedPermissions.map(p => p.category));
          setExpandedCategories(categories);
        } else {
          throw new Error('Failed to fetch permissions or roles');
        }
      } catch (error) {
        console.warn("Using fallback permissions data due to API error:", error);
        setAllPermissions(FALLBACK_PERMISSIONS);
        const categories = new Set(FALLBACK_PERMISSIONS.map(p => p.category));
        setExpandedCategories(categories);
      } finally {
        setIsLoadingPermissions(false);
      }
    };

    fetchPermissionsFromRoles();
  }, []);

  // If editing an existing role, initialize form fields
  useEffect(() => {
    if (role) {
      setRoleName(role.role_name || '');
      setIsActive(!!role.is_active);
      setChosenPermissions(role.permissions ?? []);
      // Ensure selections cleared
      setLeftSelectedIds(new Set());
      setRightSelectedIds(new Set());
    }
  }, [role]);

  // Derived: Available Permissions (All minus Chosen)
  const availablePermissions = useMemo(() => {
    const chosenIds = new Set(chosenPermissions.map(p => p.id));
    return allPermissions.filter(p => !chosenIds.has(p.id));
  }, [allPermissions, chosenPermissions]);

  // Derived: Filtered Lists based on Search
  const filteredAvailable = useMemo(() => {
    if (!leftSearch) return availablePermissions;
    return availablePermissions.filter(p => 
      p.label.toLowerCase().includes(leftSearch.toLowerCase()) || 
      p.category.toLowerCase().includes(leftSearch.toLowerCase())
    );
  }, [availablePermissions, leftSearch]);

  const filteredChosen = useMemo(() => {
    if (!rightSearch) return chosenPermissions;
    return chosenPermissions.filter(p => 
      p.label.toLowerCase().includes(rightSearch.toLowerCase())
    );
  }, [chosenPermissions, rightSearch]);

  // Group Available Permissions by Category
  const groupedAvailable = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    filteredAvailable.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [filteredAvailable]);

  // Handlers
  const toggleCategory = (category: string) => {
    const next = new Set(expandedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setExpandedCategories(next);
  };

  const toggleLeftSelection = (id: number) => {
    const next = new Set(leftSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLeftSelectedIds(next);
  };

  const toggleRightSelection = (id: number) => {
    const next = new Set(rightSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRightSelectedIds(next);
  };

  const handleMoveRight = () => {
    const toMove = filteredAvailable.filter(p => leftSelectedIds.has(p.id));
    setChosenPermissions([...chosenPermissions, ...toMove]);
    setLeftSelectedIds(new Set()); // Clear selection
    if (errors.permissions) setErrors(prev => ({ ...prev, permissions: undefined }));
  };

  const handleMoveLeft = () => {
    const toKeep = chosenPermissions.filter(p => !rightSelectedIds.has(p.id));
    setChosenPermissions(toKeep);
    setRightSelectedIds(new Set()); // Clear selection
  };

  const handleSelectAllLeft = () => {
    const allIds = new Set(filteredAvailable.map(p => p.id));
    setLeftSelectedIds(allIds);
  };

  const handleSelectAllRight = () => {
      const allIds = new Set(filteredChosen.map(p => p.id));
      setRightSelectedIds(allIds);
  }

  const handleSubmit = async (addAnother: boolean = false) => {
    const newErrors: { roleName?: string; permissions?: string } = {};
    
    if (!roleName.trim()) {
      newErrors.roleName = "Role name is required";
    }
    
    if (chosenPermissions.length === 0) {
      newErrors.permissions = "At least one permission must be selected";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setIsSubmitting(true);

    try {
        const payload = {
          role_name: roleName,
          is_active: isActive,
          permissions: chosenPermissions.map(p => p.id)
        };

        let response;
        if (role && role.id) {
          // Update existing role
          response = await axiosInstance.put(`/roles/roles/${role.id}/`, payload);
          if (response.status < 200 || response.status >= 300) {
            throw new Error('Failed to update role');
          }
        } else {
          // Create new role
          response = await axiosInstance.post('/roles/roles/', payload);
          if (response.status !== 200 && response.status !== 201 && response.status !== 404) {
            throw new Error('Failed to create role');
          }
        }
        

        if (addAnother) {
            setRoleName('');
            setIsActive(false);
            setChosenPermissions([]);
            setLeftSelectedIds(new Set());
            setRightSelectedIds(new Set());
            
            // Show toast for add another
            setToastMessage(role ? 'Role updated successfully!' : 'Role created successfully!');
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        } else {
            // Show toast and navigate after delay
            setIsNavigating(true);
            setToastMessage(role ? 'Role updated successfully!' : 'Role created successfully!');
            setShowToast(true);
            setTimeout(() => {
                onSuccess();
            }, 1800);
        }
    } catch (error: any) {
      console.error("Failed to save role", error);
      const apiErrors = parseApiErrors(error);
      
   setErrors(apiErrors)
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 animate-fade-in-down w-full max-w-full relative">
      {/* Blur overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto rounded-xl" />
      )}
      
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{role ? 'Edit Role' : 'Add Role'}</h2>
        
        {/* General Error Alert */}
        {errors.general && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
            <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
            </svg>
            {errors.general}
          </div>
        )}
      </div>

      <div className="space-y-8">
        {/* Top Row: Name and Active Status */}
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="w-full md:w-96 space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Role Name</label>
                <input 
                    type="text"
                    value={roleName}
                    onChange={(e) => {
                      setRoleName(e.target.value);
                      if (errors.roleName) setErrors(prev => ({ ...prev, roleName: undefined }));
                    }}
                    placeholder="Enter Role Name"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                      errors.roleName ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.roleName && (
                  <p className="text-sm text-red-600 mt-1">{errors.roleName}</p>
                )}
            </div>
            <div className="flex items-center pt-8">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                        <input 
                            type="checkbox" 
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="sr-only"
                        />
                        <div className={`w-6 h-6 border-2 rounded-md transition-colors flex items-center justify-center ${isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {isActive && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                    </div>
                    <span className="text-gray-700 font-medium">Is active</span>
                </label>
            </div>
        </div>

        {/* Permissions Error Message */}
        {errors.permissions && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
            </svg>
            <p className="text-sm text-red-600 font-medium">{errors.permissions}</p>
          </div>
        )}

        {/* Dual List Transfer - Responsive Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-center h-auto min-h-[500px]">
            
            {/* Left Column: Available Permissions */}
            <div className="h-[500px] flex flex-col border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm relative">
                {isLoadingPermissions && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                )}
                
                <div className="p-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex justify-between items-center shrink-0">
                    <span>Available Permissions</span>
                    <span className="text-xs font-normal text-gray-500">{filteredAvailable.length} items</span>
                </div>
                <div className="p-2 border-b border-gray-200 shrink-0">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Filter" 
                            value={leftSearch}
                            onChange={(e) => setLeftSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {!isLoadingPermissions && Object.keys(groupedAvailable).length === 0 && (
                         <p className="text-gray-400 text-sm text-center py-4">No permissions found</p>
                    )}
                    
                    {Object.entries(groupedAvailable).map(([category, items]) => (
                        <div key={category} className="border border-gray-100 rounded-md overflow-hidden">
                            <button 
                                onClick={() => toggleCategory(category)}
                                className="w-full flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                            >
                                <span className="font-semibold text-sm text-gray-800">{category}</span>
                                {expandedCategories.has(category) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
                            </button>
                            
                            {expandedCategories.has(category) && (
                                <div className="p-1 space-y-0.5">
                                    {items.map(perm => (
                                        <div 
                                            key={perm.id}
                                            onClick={() => toggleLeftSelection(perm.id)}
                                            className={`
                                                cursor-pointer px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between
                                                ${leftSelectedIds.has(perm.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}
                                            `}
                                        >
                                            {perm.code}
                                            {leftSelectedIds.has(perm.id) && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="p-2 bg-gray-50 border-t border-gray-200 text-center shrink-0">
                    <button onClick={handleSelectAllLeft} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 mx-auto">
                        Choose all <ArrowRight size={12} />
                    </button>
                </div>
            </div>

            {/* Middle Column: Actions */}
            <div className="flex md:flex-col gap-3 justify-center py-2 md:py-0">
                <button 
                    onClick={handleMoveRight}
                    disabled={leftSelectedIds.size === 0}
                    className="p-3 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:hover:bg-gray-100 disabled:cursor-not-allowed transition-all shadow-sm border border-gray-200 rotate-90 md:rotate-0"
                >
                    <ArrowRight size={20} />
                </button>
                <button 
                    onClick={handleMoveLeft}
                    disabled={rightSelectedIds.size === 0}
                    className="p-3 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:hover:bg-gray-100 disabled:cursor-not-allowed transition-all shadow-sm border border-gray-200 rotate-90 md:rotate-0"
                >
                    <ArrowLeft size={20} />
                </button>
            </div>

            {/* Right Column: Chosen Permissions */}
            <div className="h-[500px] flex flex-col border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="p-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex justify-between items-center shrink-0">
                    <span>Chosen Permissions</span>
                    <span className="text-xs font-normal text-gray-500">{filteredChosen.length} items</span>
                </div>
                <div className="p-2 border-b border-gray-200 shrink-0">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Filter" 
                            value={rightSearch}
                            onChange={(e) => setRightSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredChosen.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                            <p>No permissions selected</p>
                        </div>
                    )}
                    {filteredChosen.map(perm => (
                         <div 
                            key={perm.id}
                            onClick={() => toggleRightSelection(perm.id)}
                            className={`
                                cursor-pointer px-3 py-2 text-sm rounded-md transition-colors
                                ${rightSelectedIds.has(perm.id) ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}
                            `}
                        >
                            {perm.code}
                        </div>
                    ))}
                </div>
                 <div className="p-2 bg-gray-50 border-t border-gray-200 text-center shrink-0">
                    <button onClick={handleSelectAllRight} className="text-xs font-semibold text-gray-600 hover:text-red-600 flex items-center justify-center gap-1 mx-auto">
                        <ArrowLeft size={12} /> Remove all
                    </button>
                </div>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-4 pt-4 border-t border-gray-100">
             <button
                onClick={onCancel}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
            >
                Cancel
            </button>
            <button
                onClick={() => handleSubmit(false)}
                className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait flex items-center gap-2"
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Saving...' : 'Save'}
            </button>
            {!role && (
              <button
                onClick={() => handleSubmit(true)}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait flex items-center gap-2"
                disabled={isSubmitting}
              >
                <Plus size={18} /> Save and Add Another
              </button>
            )}
        </div>
      </div>
      
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

export default AddRoleForm;
