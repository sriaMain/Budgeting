import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { toast } from "react-hot-toast";

interface User {
    id: number;
    username: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    role?: string;
    position?: string;
}

interface ServiceWithUsers {
    product_services: string;
    users: User[];
}

interface Service {
    name: string;
    users: User[];
}

interface Task {
    id: string;
    title: string;
    assignee?: string;
    project?: number;
}

interface AssignTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssignmentSuccess: (taskId: string, userId: number) => void;
    task: Task | null;
}

export function AssignTaskModal({
    isOpen,
    onClose,
    onAssignmentSuccess,
    task
}: AssignTaskModalProps) {
    const [servicesData, setServicesData] = useState<ServiceWithUsers[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedService, setSelectedService] = useState<string>('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);

    const [errors, setErrors] = useState<{
        general?: string;
        service?: string;
        user?: string;
    }>({});

    // Fetch services and users on modal open
    useEffect(() => {
        if (isOpen) {
            fetchServicesAndUsers();
            // Reset state
            setSelectedService('');
            setSelectedUserId(null);
            setUsers([]);
            setErrors({});
        }
    }, [isOpen]);

    // Update users when service is selected
    useEffect(() => {
        if (selectedService) {
            const service = services.find(s => s.name === selectedService);
            if (service) {
                setUsers(service.users);
                setSelectedUserId(null);
                if (service.users.length === 0) {
                    setErrors(prev => ({ ...prev, user: 'No users found for this service' }));
                } else {
                    setErrors(prev => ({ ...prev, user: '' }));
                }
            }
        } else {
            setUsers([]);
            setSelectedUserId(null);
        }
    }, [selectedService, services]);

    const fetchServicesAndUsers = async () => {
        setIsLoadingServices(true);
        console.log('Fetching services and users from: api/services/users/');
        try {
            const response = await axiosInstance.get('services/users/');
            console.log('Services and users response:', response);

            if (response.status === 200) {
                console.log('Services and users data:', response.data);
                const data: ServiceWithUsers[] = response.data;
                setServicesData(data);

                // Transform data to services array
                const transformedServices: Service[] = data.map(item => ({
                    name: item.product_services,
                    users: item.users
                }));

                setServices(transformedServices);

                if (transformedServices.length === 0) {
                    toast.error('No services available');
                }
            }
        } catch (error: any) {
            console.error('Failed to fetch services and users:', error);
            console.error('Error response:', error.response);
            console.error('Error status:', error.response?.status);
            console.error('Error data:', error.response?.data);

            // Show specific error message
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to load services and users';
            toast.error(errorMsg);
            setErrors(prev => ({ ...prev, general: errorMsg }));
        } finally {
            setIsLoadingServices(false);
        }
    };

    const handleAssign = async () => {
        // Validation
        if (!selectedService) {
            setErrors({ service: 'Please select a service type' });
            return;
        }
        if (!selectedUserId) {
            setErrors({ user: 'Please select a user to assign' });
            return;
        }
        if (!task?.id) {
            setErrors({ general: 'Invalid task selected' });
            return;
        }

        setIsAssigning(true);
        setErrors({});

        try {
            // Update task with new assignee
            const response = await axiosInstance.put(`tasks/${task.id}/`, {
                assigned_to: selectedUserId
            });

            if (response.status === 200 || response.status === 204) {
                toast.success('Task assigned successfully!');
                onAssignmentSuccess(task.id, selectedUserId);
                setTimeout(() => {
                    onClose();
                }, 300);
            }
        } catch (error) {
            console.error('Failed to assign task:', error);
            const apiErrors = parseApiErrors(error);
            setErrors(apiErrors);
            toast.error(apiErrors.general || 'Failed to assign task');
        } finally {
            setIsAssigning(false);
        }
    };

    const handleClose = () => {
        if (!isAssigning) {
            setErrors({});
            onClose();
        }
    };

    if (!isOpen || !task) return null;

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
                    className="relative bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
                        <h4 className="text-lg font-bold text-gray-900">Assign Task</h4>
                        <button
                            onClick={handleClose}
                            disabled={isAssigning}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                            aria-label="Close modal"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {/* Task Info */}
                        <div className="mb-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <p className="text-xs text-blue-600 font-medium mb-1">Task</p>
                            <p className="text-sm text-gray-900 font-semibold">{task.title}</p>
                        </div>

                        {errors.general && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                                </svg>
                                {errors.general}
                            </div>
                        )}

                        <div className="space-y-5">
                            {/* Assign To Label */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-4">
                                    Assign to
                                </label>

                                {/* Service Type Selector */}
                                <div className="space-y-2 mb-4">
                                    <label className="block text-xs font-medium text-gray-700">
                                        <span className="text-red-500 mr-1">*</span>Select Type
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedService || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setSelectedService(value);
                                                setSelectedUserId(null);
                                                setErrors(prev => ({ ...prev, service: '', user: '' }));
                                            }}
                                            className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white ${errors.service ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                }`}
                                            disabled={isLoadingServices}
                                        >
                                            <option value="">
                                                {isLoadingServices ? 'Loading services...' : 'Select service type'}
                                            </option>
                                            {services.map((service, index) => (
                                                <option key={`${service.name}-${index}`} value={service.name}>
                                                    {service.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                    {errors.service && (
                                        <p className="text-xs text-red-600 mt-1">{errors.service}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                        <span className="text-red-500 mr-1">*</span>Select User
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedUserId || ''}
                                            onChange={(e) => {
                                                const value = e.target.value ? Number(e.target.value) : null;
                                                setSelectedUserId(value);
                                                setErrors(prev => ({ ...prev, user: '' }));
                                            }}
                                            className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white ${errors.user ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                }`}
                                            disabled={!selectedService}
                                        >
                                            <option value="">
                                                {!selectedService
                                                    ? 'Select service type first'
                                                    : users.length === 0
                                                        ? 'No users available'
                                                        : 'Select user'}
                                            </option>
                                            {users.map(user => (
                                                <option key={user.id} value={user.id}>
                                                    {user.first_name || user.last_name
                                                        ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                                                        : user.username} {user.username && (user.first_name || user.last_name) ? `(${user.username})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                    {errors.user && (
                                        <p className="text-xs text-red-600 mt-1">{errors.user}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 pt-6 mt-6 border-t">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isAssigning}
                                className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAssign}
                                disabled={isAssigning || !selectedService || !selectedUserId}
                                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAssigning ? 'Assigning...' : 'Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
