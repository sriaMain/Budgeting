import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';

interface AssignRoleModalProps {
    projectId: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const AssignRoleModal: React.FC<AssignRoleModalProps> = ({ projectId, onClose, onSuccess }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedRoleId, setSelectedRoleId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch users (assuming an endpoint exists, else we use service users)
                const usersResp = await axiosInstance.get('/services/users/');
                setUsers(usersResp.data);

                // Fetch global roles
                const rolesResp = await axiosInstance.get('/roles/roles/');
                setRoles(rolesResp.data);
            } catch (error) {
                console.error('Failed to load data:', error);
                toast.error('Failed to load users or roles');
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedUserId || !selectedRoleId) {
            toast.error('Please select both a user and a role.');
            return;
        }

        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/roles/`, {
                user_id: selectedUserId,
                role_id: selectedRoleId
            });
            toast.success('Role assigned successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Failed to assign role:', error);
            if (error.response && error.response.data && error.response.data.error) {
                toast.error(error.response.data.error);
            } else {
                toast.error('Failed to assign role');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">Assign Project Role</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            Select User <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">-- Choose User --</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.username} ({u.email || 'No email'})</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            Select Role <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={selectedRoleId}
                            onChange={(e) => setSelectedRoleId(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">-- Choose Role --</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>{r.role_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Assigning...' : 'Assign Role'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
