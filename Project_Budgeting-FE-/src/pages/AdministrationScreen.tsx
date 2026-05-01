import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Search, Plus, Edit3, AlertCircle, RefreshCw, X, ArrowLeft } from 'lucide-react';
import type { Role, Permission } from '../types';
import axiosInstance from '../utils/axiosInstance';
import AddRoleForm from '../components/AddRoleForm';
import ModulesTab from '../components/ModulesTab';
import ManageUsersTab from '../components/ManageUsersTab';

interface AdministrationScreenProps {
  userRole: 'admin' | 'user' | 'manager';
  currentPage: string;
  onNavigate: (page: string) => void;
}

// Helper Component for Handling Permissions Popover
const PermissionsCell: React.FC<{ permissions: Permission[] }> = ({ permissions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const visibleCount = 4;
  const remainingCount = permissions.length - visibleCount;
  const hasMore = remainingCount > 0;

  return (
    <div className="relative" ref={popoverRef}>
      <div className="flex flex-wrap gap-2">
        {permissions.slice(0, visibleCount).map((perm) => (
          <span
            key={perm.id}
            title={perm.category}
            className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700 shadow-sm whitespace-nowrap"
          >
            {perm.label}
          </span>
        ))}

        {hasMore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className={`
              px-3 py-1 rounded-full text-xs font-semibold border transition-all
              ${isOpen
                ? 'bg-gray-800 text-white border-gray-800 ring-2 ring-gray-200'
                : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }
            `}
          >
            {isOpen ? 'Close' : `+${remainingCount} more`}
          </button>
        )}
      </div>

      {/* Popover Container */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-3 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
            <h4 className="font-bold text-sm text-gray-800">All Permissions ({permissions.length})</h4>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-3 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap gap-2">
              {permissions.map((perm) => (
                <span
                  key={`popover-${perm.id}`}
                  className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-white hover:border-blue-300 transition-colors cursor-default"
                >
                  {perm.label}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute -top-2 left-6 w-4 h-4 bg-white border-t border-l border-gray-200 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
};

const AdministrationScreen: React.FC<AdministrationScreenProps> = ({ userRole, currentPage, onNavigate }) => {
  // For manager role, default to 'modules' tab; for admin, default to 'manage-roles'
  const [activeTab, setActiveTab] = useState<'manage-roles' | 'modules' | 'manage-users'>(
    userRole === 'manager' ? 'modules' : 'manage-roles'
  );
  const [currentView, setCurrentView] = useState<'list' | 'add-role'>('list');
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Data States
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Roles
  useEffect(() => {
    if (activeTab === 'manage-roles') {
      fetchRoles();
    }
  }, [activeTab]);

  const fetchRoles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.get('/roles/roles/');

      if (response.status === 200 && Array.isArray(response.data)) {
        setRoles(response.data);
      } else {
        throw new Error('Received invalid data format from server');
      }
    } catch (err: any) {
      console.error("Error fetching roles:", err);

      let errorMessage = "An unexpected error occurred.";

      if (err.response) {
        errorMessage = `Server Error: ${err.response.status} - ${err.response.statusText}`;
      } else if (err.request) {
        errorMessage = "Network Error: Unable to reach the server. Please check your connection.";
      } else {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="animate-fade-in-down">

        {/* Show Add Role Form as Full Screen with Breadcrumbs */}
        {currentView === 'add-role' ? (
          <div>
            <div className="mb-6 flex items-center gap-2 text-sm">
              <button
                onClick={() => setCurrentView('list')}
                className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
              >
                Manage Roles
              </button>
              <span className="text-gray-400">/</span>
              <span className="text-gray-700 font-medium">Add Role</span>
            </div>

            <AddRoleForm
              role={editingRole}
              onCancel={() => { setEditingRole(null); setCurrentView('list'); }}
              onSuccess={() => {
                setEditingRole(null);
                setCurrentView('list');
                fetchRoles();
              }}
            />
          </div>
        ) : (
          <>

            {/* Top Navigation Tabs */}
            <div className="flex flex-wrap gap-4 mb-8">
              {/* Manage Roles - Only for admin */}
              {userRole === 'admin' && (
                <button
                  onClick={() => setActiveTab('manage-roles')}
                  className={`
                      px-6 py-2.5 rounded-lg border-2 font-bold text-lg transition-all
                      ${activeTab === 'manage-roles'
                      ? 'bg-white border-blue-600 text-gray-900 shadow-sm'
                      : 'bg-gray-200 border-transparent text-gray-500 hover:bg-gray-300'
                    }
                  `}
                >
                  Manage Roles
                </button>
              )}
              
              {/* Modules - For both admin and manager */}
              <button
                onClick={() => setActiveTab('modules')}
                className={`
                    px-6 py-2.5 rounded-lg border-2 font-bold text-lg transition-all
                    ${activeTab === 'modules'
                    ? 'bg-white border-blue-600 text-gray-900 shadow-sm'
                    : 'bg-gray-200 border-transparent text-gray-500 hover:bg-gray-300'
                  }
                `}
              >
                Modules
              </button>
              
              {/* Manage Users - Only for admin */}
              {userRole === 'admin' && (
                <button
                  onClick={() => setActiveTab('manage-users')}
                  className={`
                      px-6 py-2.5 rounded-lg border-2 font-bold text-lg transition-all
                      ${activeTab === 'manage-users'
                      ? 'bg-white border-blue-600 text-gray-900 shadow-sm'
                      : 'bg-gray-200 border-transparent text-gray-500 hover:bg-gray-300'
                    }
                  `}
                >
                  Manage Users
                </button>
              )}
            </div>

            {activeTab === 'manage-roles' && (
              <div className="space-y-6">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h2 className="text-3xl font-bold text-gray-900">Manage Roles</h2>

                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-grow md:flex-grow-0">
                      <input
                        type="text"
                        placeholder="Search"
                        className="pl-4 pr-10 py-2 border border-gray-400 rounded-md bg-white w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                    </div>
                    <button
                      onClick={() => { setEditingRole(null); setCurrentView('add-role'); }}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg">
                      Add Role <Plus size={20} />
                    </button>
                  </div>
                </div>

                {/* Content Section: Error, Loading, or Data */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden min-h-[400px]">

                  {error ? (
                    <div className="flex flex-col items-center justify-center h-[400px] p-12 text-center bg-white">
                      <div className="bg-red-50 p-4 rounded-full mb-4 shadow-sm">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Failed to load roles</h3>
                      <p className="text-gray-500 mb-8 max-w-md mx-auto">{error}</p>
                      <button
                        onClick={fetchRoles}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-md hover:shadow-lg active:scale-95"
                      >
                        <RefreshCw size={18} /> Retry Connection
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto min-h-[400px]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-100/80 text-gray-900 font-bold border-b border-gray-300">
                              <th className="py-4 px-6 w-24">ID</th>
                              <th className="py-4 px-6 w-48">Role Name</th>
                              <th className="py-4 px-6">Permissions</th>
                              <th className="py-4 px-6 w-24 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {isLoading ? (
                              Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                  <td className="py-6 px-6"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
                                  <td className="py-6 px-6"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                                  <td className="py-6 px-6">
                                    <div className="flex gap-2">
                                      <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                                      <div className="h-6 bg-gray-200 rounded-full w-24"></div>
                                      <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                                    </div>
                                  </td>
                                  <td className="py-6 px-6"><div className="h-8 w-8 bg-gray-200 rounded-full mx-auto"></div></td>
                                </tr>
                              ))
                            ) : roles.length > 0 ? (
                              roles.map((role) => (
                                <tr key={role.id} className="hover:bg-gray-50 transition-colors group">
                                  <td className="py-6 px-6 font-medium text-gray-500">#{role.id}</td>
                                  <td className="py-6 px-6 align-top">
                                    <div>
                                      <p className="font-bold text-gray-900 text-lg">{role.role_name}</p>
                                      <p className="text-sm text-gray-500 mt-1">
                                        {role.description || (role.is_active ? 'Active Role' : 'Inactive Role')}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-6 px-6 align-top">
                                    <PermissionsCell permissions={role.permissions || []} />
                                  </td>
                                  <td className="py-6 px-6 text-center align-top">
                                    <button
                                      onClick={() => { setEditingRole(role); setCurrentView('add-role'); }}
                                      className="p-2 text-green-600 hover:text-green-800 transition-colors bg-green-50 hover:bg-green-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
                                      aria-label={`Edit role ${role.role_name}`}
                                    >
                                      <Edit3 size={18} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="py-12 text-center text-gray-500">
                                  No roles found. Click "Add Role" to create one.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="md:hidden p-4 space-y-4 bg-white min-h-[400px]">
                        {isLoading ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-4 animate-pulse">
                              <div className="h-6 bg-gray-200 rounded w-32 mb-3"></div>
                              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                              <div className="flex gap-2">
                                <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                                <div className="h-6 bg-gray-200 rounded-full w-24"></div>
                              </div>
                            </div>
                          ))
                        ) : roles.length > 0 ? (
                          roles.map((role) => (
                            <div
                              key={role.id}
                              className="bg-gray-50 rounded-lg border border-gray-200 p-4 shadow-sm"
                            >
                              {/* Card Header */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <h3 className="font-bold text-gray-900 text-lg mb-1">{role.role_name}</h3>
                                  <p className="text-xs text-gray-500">ID: #{role.id}</p>
                                </div>
                                <button
                                  onClick={() => { setEditingRole(role); setCurrentView('add-role'); }}
                                  className="p-2 text-green-600 hover:text-green-800 transition-colors bg-green-50 hover:bg-green-100 rounded-lg shadow-sm"
                                  aria-label={`Edit role ${role.role_name}`}
                                >
                                  <Edit3 size={18} />
                                </button>
                              </div>

                              {/* Description */}
                              {role.description && (
                                <p className="text-sm text-gray-600 mb-3">{role.description}</p>
                              )}

                              {/* Permissions */}
                              <div>
                                <p className="text-xs text-gray-500 mb-2 font-semibold">Permissions ({role.permissions?.length || 0})</p>
                                <div className="flex flex-wrap gap-2">
                                  {role.permissions && role.permissions.length > 0 ? (
                                    role.permissions.slice(0, 6).map((perm) => (
                                      <span
                                        key={perm.id}
                                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700"
                                      >
                                        {perm.label}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">No permissions assigned</span>
                                  )}
                                  {role.permissions && role.permissions.length > 6 && (
                                    <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-600">
                                      +{role.permissions.length - 6} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            No roles found. Click "Add Role" to create one.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Modules Section */}
            {activeTab === 'modules' && (
              <ModulesTab />
            )}

            {/* Manage Users tab */}
            {activeTab === 'manage-users' && (
              <ManageUsersTab />
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default AdministrationScreen;