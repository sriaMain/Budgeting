import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { AssignRoleModal } from './AssignRoleModal';

interface ManageProjectRolesProps {
    projectId: string;
    userRole: string;
}

export const ManageProjectRoles: React.FC<ManageProjectRolesProps> = ({ projectId, userRole }) => {
    const [projectRoles, setProjectRoles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

    const fetchProjectRoles = async () => {
        try {
            setIsLoading(true);
            const response = await axiosInstance.get(`/projects/${projectId}/roles/`);
            setProjectRoles(response.data || []);
        } catch (error) {
            console.error('Error fetching project roles:', error);
            toast.error('Failed to load project roles');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) {
            fetchProjectRoles();
        }
    }, [projectId]);

    const handleRemoveRole = async (roleAssignmentId: number) => {
        if (!window.confirm('Are you sure you want to remove this role assignment?')) return;
        
        try {
            await axiosInstance.delete(`/projects/${projectId}/roles/${roleAssignmentId}/`);
            toast.success('Role assignment removed');
            fetchProjectRoles();
        } catch (error) {
            console.error('Failed to remove role:', error);
            toast.error('Failed to remove role assignment');
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                <p className="text-sm text-gray-500">Loading team roles...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mt-4">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">Project Team & Roles</h3>
                {userRole !== 'user' && (
                    <button
                        onClick={() => setIsAssignModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Assign Role
                    </button>
                )}
            </div>

            {projectRoles.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-500">No team members assigned to this project yet.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/50">
                                <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase">User</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Role</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Assigned By</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Date</th>
                                {userRole !== 'user' && (
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase text-right">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {projectRoles.map((pr) => (
                                <tr key={pr.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-4 px-4 font-medium text-gray-900">{pr.username}</td>
                                    <td className="py-4 px-4">
                                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                            {pr.role_name}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-gray-600 text-sm">{pr.assigned_by_name || '-'}</td>
                                    <td className="py-4 px-4 text-gray-600 text-sm">
                                        {new Date(pr.assigned_at).toLocaleDateString()}
                                    </td>
                                    {userRole !== 'user' && (
                                        <td className="py-4 px-4 text-right">
                                            <button
                                                onClick={() => handleRemoveRole(pr.id)}
                                                className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                title="Remove Assignment"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isAssignModalOpen && (
                <AssignRoleModal
                    projectId={projectId}
                    onClose={() => setIsAssignModalOpen(false)}
                    onSuccess={() => {
                        setIsAssignModalOpen(false);
                        fetchProjectRoles();
                    }}
                />
            )}
        </div>
    );
};
