import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown, UploadCloud } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { toast } from "react-hot-toast";

interface User {
    id: number;
    name: string;
    username?: string;
    email: string;
    role?: string;
}

interface Project {
    project_no: number;
    project_name: string;
    status?: string;
    start_date?: string;
    end_date?: string;
}

interface Task {
    id: number;
    title: string;
    assignee_id: number;
    project: number;
    status: string;

}

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskAdded: (task: Task) => void;
    prefilledProjectId?: number;
    prefilledProjectName?: string;
    // Optional: editing an existing task
    editingTask?: any | null;
    onTaskUpdated?: (task: any) => void;
}

interface StatusChoice {
    value: string;
    label: string;
}

const DEFAULT_STATUS_OPTIONS = [
    { value: 'planned', label: 'planned' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Needs Attention', label: 'Needs Attention' },
];

export function AddTaskModal({
    isOpen,
    onClose,
    onTaskAdded,
    prefilledProjectId,
    prefilledProjectName,
    editingTask,
    onTaskUpdated
}: AddTaskModalProps) {
    // Helper function to convert decimal hours to HH:MM format
    const decimalToHHMM = (decimalHours: number | string): string => {
        const decimal = typeof decimalHours === 'string' ? parseFloat(decimalHours) : decimalHours;
        if (isNaN(decimal)) return '00:00';
        const hours = Math.floor(decimal);
        const minutes = Math.round((decimal - hours) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    // Helper function to convert HH:MM format to decimal hours
    const hhmmToDecimal = (hhmmString: string): number => {
        const [hours, minutes] = hhmmString.split(':').map(Number);
        return hours + (minutes / 60);
    };

    const [formData, setFormData] = useState({
        title: '',
        assignee_id: 0,
        project: prefilledProjectId || 0,
        status: '',
        allocated_hours: '00:00', // Changed to HH:MM format
        due_date: '' // Optional due date

    });

    const [users, setUsers] = useState<User[]>([]);
    // services/users selector like AssignTaskModal
    const [servicesData, setServicesData] = useState<any[]>([]);
    const [services, setServices] = useState<{ name: string; users: User[] }[]>([]);
    const [serviceUsers, setServiceUsers] = useState<User[]>([]);
    const [selectedService, setSelectedService] = useState<string>('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [statusChoices, setStatusChoices] = useState<StatusChoice[]>(DEFAULT_STATUS_OPTIONS);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<{
        general?: string;
        title?: string;
        assignee_id?: string;
        project?: string;
        status?: string;
        allocated_hours?: string;
    }>({});

    // Assignee search/dropdown state
    const [assigneeSearch, setAssigneeSearch] = useState('');
    const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
    const [selectedAssignee, setSelectedAssignee] = useState<User | null>(null);
    const assigneeDropdownRef = useRef<HTMLDivElement>(null);

    // Project search/dropdown state
    const [projectSearch, setProjectSearch] = useState('');
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const projectDropdownRef = useRef<HTMLDivElement>(null);

    const isProjectReadOnly = !!prefilledProjectId && !!prefilledProjectName;

    // Fetch users and projects on mount
    useEffect(() => {
        if (isOpen) {
            fetchUsers();
            fetchServicesAndUsers();
            fetchStatusChoices();
            // Always fetch projects to populate the dropdown
            fetchProjects();

            // Reset form
            setFormData({
                title: '',
                assignee_id: 0,
                project: prefilledProjectId || 0,
                status: '',
                allocated_hours: '00:00',
                due_date: ''
            });
            setAssigneeSearch('');
            setProjectSearch('');
            setSelectedAssignee(null);
            setSelectedProject(null);
            setSelectedService('');
            setSelectedUserId(null);
            setErrors({});

            // If editing, prefill form
            if (editingTask) {
                setFormData(prev => ({
                    ...prev,
                    title: editingTask.title || prev.title,
                    allocated_hours: editingTask.allocated_hours ? decimalToHHMM(editingTask.allocated_hours) : prev.allocated_hours,
                    status: editingTask.status || prev.status,
                    project: editingTask.project || prev.project,
                    assignee_id: editingTask.assigned_to?.id || prev.assignee_id || 0,
                    due_date: editingTask.due_date || prev.due_date,
                }));

                // Project prefilling is now handled by a separate useEffect 
                // to ensure projects are loaded first.

                // prefill assignment service/user if assigned
                if (editingTask.assigned_to?.id) {
                    setSelectedUserId(editingTask.assigned_to.id);
                }
            }

        }
    }, [isOpen, prefilledProjectId, isProjectReadOnly, editingTask]);
    // Handle project prefilling reactively when projects are loaded
    useEffect(() => {
        if (isOpen && editingTask && editingTask.project && projects.length > 0 && !selectedProject) {
            const proj = projects.find(p => p.project_no === editingTask.project);
            if (proj) {
                setSelectedProject(proj);
                setProjectSearch(proj.project_name);
                setFormData(prev => ({ ...prev, project: proj.project_no }));
            }
        }
    }, [isOpen, editingTask, projects, selectedProject]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
                setShowAssigneeDropdown(false);
            }
            if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
                setShowProjectDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const response = await axiosInstance.get('accounts/users/');
            if (response.status === 200) {
                setUsers(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            // Try alternative endpoint if first fails
            try {
                const response = await axiosInstance.get('accounts/users/');
                if (response.status === 200) {
                    setUsers(response.data);
                }
            } catch (err) {
                console.error('Failed to fetch users from alternative endpoint:', err);
            }
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const fetchServicesAndUsers = async () => {
        try {
            const response = await axiosInstance.get('services/users/');
            if (response.status === 200) {
                const data = response.data;
                setServicesData(data);
                const transformed = data.map((item: any) => ({ name: item.product_services, users: item.users }));
                setServices(transformed);
                if (editingTask && editingTask.assigned_to) {
                    const found = transformed.find((s: any) => s.users.some((u: any) => u.id === editingTask.assigned_to.id));
                    if (found) {
                        setSelectedService(found.name);
                        setServiceUsers(found.users);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch services/users:', error);
        }
    };

    const fetchProjects = async () => {
        setIsLoadingProjects(true);
        try {
            const response = await axiosInstance.get('projects/');
            if (response.status === 200) {
                // Handle nested structure: response.data.Projects contains companies with project_details
                if (response.data && response.data.Projects && Array.isArray(response.data.Projects)) {
                    const allProjects: Project[] = [];
                    response.data.Projects.forEach((company: any) => {
                        if (company.project_details && Array.isArray(company.project_details)) {
                            company.project_details.forEach((project: any) => {
                                allProjects.push({
                                    project_no: project.project_no || project.id,
                                    project_name: project.project_name,
                                    status: project.status,
                                    start_date: project.start_date,
                                    end_date: project.end_date
                                });
                            });
                        }
                    });
                    setProjects(allProjects);
                } else if (Array.isArray(response.data)) {
                    // Fallback: if response is already a flat array
                    setProjects(response.data);
                } else {
                    console.warn('Unexpected projects response structure:', response.data);
                    setProjects([]);
                }
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            setProjects([]);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    const fetchStatusChoices = async () => {
        setIsLoadingStatus(true);
        try {
            const response = await axiosInstance.get('task-status-choices/');
            if (response.status === 200 && response.data.length > 0) {
                setStatusChoices(response.data);
                // Set first status as default if form status is empty
                if (!formData.status) {
                    setFormData(prev => ({ ...prev, status: response.data[0].value }));
                }
            }
        } catch (error) {
            console.error('Failed to fetch status choices:', error);
            // Keep default status options if API fails
        } finally {
            setIsLoadingStatus(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.name?.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
        user.username?.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
        user.email?.toLowerCase().includes(assigneeSearch.toLowerCase())
    );

    const filteredProjects = Array.isArray(projects) ? projects.filter(project =>
        project.project_name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
        project.project_no?.toString().includes(projectSearch)
    ) : [];

    const handleAssigneeSelect = (user: User) => {
        setSelectedAssignee(user);
        setFormData(prev => ({ ...prev, assignee_id: user.id }));
        setAssigneeSearch(user.name || user.username || user.email);
        setShowAssigneeDropdown(false);
        setErrors(prev => ({ ...prev, assignee_id: '' }));
        setSelectedUserId(user.id);
    };

    const handleProjectSelect = (project: Project) => {
        console.log('Project selected:', project); // Debug log
        setSelectedProject(project);
        setFormData(prev => ({ ...prev, project: project.project_no }));
        setProjectSearch(project.project_name);
        setShowProjectDropdown(false);
        setErrors(prev => ({ ...prev, project: '' }));
        console.log('Updated formData.project to:', project.project_no); // Debug log
    };

    const validateForm = () => {
        const newErrors: any = {};

        if (!formData.title?.trim()) {
            newErrors.title = 'Task title is required';
        } else if (formData.title.trim().length < 3) {
            newErrors.title = 'Task title must be at least 3 characters';
        }

        // Validate HH:MM format for allocated hours
        const timePattern = /^([0-9]{1,2}):([0-5][0-9])$/;
        if (!formData.allocated_hours) {
            newErrors.allocated_hours = 'Allocated hours is required';
        } else if (!timePattern.test(formData.allocated_hours)) {
            newErrors.allocated_hours = 'Please enter time in HH:MM format (e.g., 05:30)';
        } else {
            const decimalHours = hhmmToDecimal(formData.allocated_hours);
            if (decimalHours <= 0) {
                newErrors.allocated_hours = 'Allocated hours must be greater than 00:00';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSaving(true);

        const payload = {
            title: formData.title.trim(),
            allocated_hours: hhmmToDecimal(formData.allocated_hours),
            ...(formData.status && { status: formData.status }),
            // prefer selectedUserId (from service->user selector) over freeform assignee_id
            ...(selectedUserId && { assigned_to: selectedUserId }),
            ...(formData.assignee_id && !selectedUserId && formData.assignee_id !== 0 && { assignee_id: formData.assignee_id }),
            ...(formData.project && formData.project !== 0 && { project: formData.project }),
            ...(formData.due_date && { due_date: formData.due_date })
        };

        console.log('Form submission payload:', payload); // Debug log
        console.log('Current formData:', formData); // Debug log

        try {
            // If editing, perform update
            if (editingTask && editingTask.id) {
                const response = await axiosInstance.patch(`tasks/${editingTask.id}/`, payload);
                if (response.status === 200 || response.status === 204) {
                    const updated = response.data.task || response.data || payload;
                    onTaskUpdated && onTaskUpdated(updated);
                    toast.success('Task updated successfully!');
                    setTimeout(() => onClose(), 300);
                }
            } else {
                const response = await axiosInstance.post('tasks/', payload);

                if (response.status === 200 || response.status === 201) {
                    const createdTask = response.data.task || response.data;
                    onTaskAdded(createdTask);
                    toast.success('Task added successfully!');

                    setTimeout(() => {
                        onClose();
                    }, 500);
                }
            }
        } catch (error) {
            const apiErrors = parseApiErrors(error);
            setErrors(apiErrors);
            toast.error(apiErrors.general || 'Failed to add task');
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

    if (!isOpen) return null;

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
                    className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl transform transition-all"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
                        <h4 className="text-lg font-bold text-gray-900">{editingTask ? 'Edit Task' : 'Add Task'}</h4>
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
                    <div className="p-6 max-h-[80vh] overflow-y-auto">
                        {errors.general && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                                </svg>
                                {errors.general}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Task Title */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>Task Title
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => {
                                        setFormData({ ...formData, title: e.target.value });
                                        setErrors(prev => ({ ...prev, title: '' }));
                                    }}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${errors.title ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter task title"
                                />
                                {errors.title && (
                                    <p className="text-xs text-red-600 mt-1">{errors.title}</p>
                                )}
                            </div>

                            {/* Assignee selector: service type -> user */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Assign to</label>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Select Type</label>
                                        <div className="relative">
                                            <select
                                                value={selectedService || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setSelectedService(value);
                                                    const svc = services.find(s => s.name === value);
                                                    setServiceUsers(svc ? svc.users : []);
                                                    setSelectedUserId(null);
                                                    setErrors(prev => ({ ...prev, assignee_id: '' }));
                                                }}
                                                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white ${errors.assignee_id ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                disabled={services.length === 0}
                                            >
                                                <option value="">{services.length === 0 ? (isLoadingUsers ? 'Loading...' : 'No types') : 'Select type'}</option>
                                                {services.map(s => (
                                                    <option key={s.name} value={s.name}>{s.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700">Select User</label>
                                        <div className="relative">
                                            <select
                                                value={selectedUserId || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value ? Number(e.target.value) : null;
                                                    setSelectedUserId(value);
                                                    setErrors(prev => ({ ...prev, assignee_id: '' }));
                                                }}
                                                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white ${errors.assignee_id ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                disabled={!selectedService}
                                            >
                                                <option value="">{!selectedService ? 'Select type first' : serviceUsers.length === 0 ? 'No users available' : 'Select user'}</option>
                                                {serviceUsers.map(user => (
                                                    <option key={user.id} value={user.id}>{user.username || user.name || user.email}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                        {errors.assignee_id && (
                                            <p className="text-xs text-red-600 mt-1">{errors.assignee_id}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Project - Prefilled (read-only) or Searchable Dropdown */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Project
                                </label>
                                {isProjectReadOnly ? (
                                    <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium">
                                        {prefilledProjectName}
                                    </div>
                                ) : (
                                    <div className="relative" ref={projectDropdownRef}>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={projectSearch}
                                                onChange={(e) => setProjectSearch(e.target.value)}
                                                onFocus={() => setShowProjectDropdown(true)}
                                                className={`w-full px-3 py-2.5 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${errors.project ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                    }`}
                                                placeholder={isLoadingProjects ? "Loading projects..." : "Search project..."}
                                                disabled={isLoadingProjects}
                                            />
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>

                                        {showProjectDropdown && !isLoadingProjects && filteredProjects.length > 0 && (
                                            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                                {filteredProjects.map(project => (
                                                    <div
                                                        key={project.project_no}
                                                        onClick={() => handleProjectSelect(project)}
                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
                                                    >
                                                        <p className="text-sm font-medium text-gray-900">{project.project_name}</p>
                                                        <p className="text-xs text-gray-500">#{project.project_no}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {errors.project && (
                                    <p className="text-xs text-red-600 mt-1">{errors.project}</p>
                                )}
                            </div>

                            {/* Status (Optional) */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Status
                                </label>
                                <div className="relative">
                                    <select
                                        value={formData.status}
                                        onChange={(e) => {
                                            setFormData({ ...formData, status: e.target.value });
                                            setErrors(prev => ({ ...prev, status: '' }));
                                        }}
                                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white ${errors.status ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                            }`}
                                        disabled={isLoadingStatus}
                                    >
                                        <option value="" disabled>Select Status</option>
                                        {statusChoices.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                                {errors.status && (
                                    <p className="text-xs text-red-600 mt-1">{errors.status}</p>
                                )}
                            </div>

                            {/* Due Date (Optional) */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Due Date (Optional)
                                </label>
                                <input
                                    type="date"
                                    value={formData.due_date}
                                    onChange={(e) => {
                                        setFormData({ ...formData, due_date: e.target.value });
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                                />
                            </div>

                            {/* Allocated Hours */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    <span className="text-red-500 mr-1">*</span>Allocated Hours
                                </label>
                                <input
                                    type="text"
                                    value={formData.allocated_hours}
                                    onChange={(e) => {
                                        setFormData({ ...formData, allocated_hours: e.target.value });
                                        setErrors(prev => ({ ...prev, allocated_hours: '' }));
                                    }}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono ${errors.allocated_hours ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                        }`}
                                    placeholder="HH:MM (e.g., 08:30)"
                                    pattern="[0-9]{1,2}:[0-5][0-9]"
                                />
                                {errors.allocated_hours && (
                                    <p className="text-xs text-red-600 mt-1">{errors.allocated_hours}</p>
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
                                    disabled={isSaving || isLoadingUsers || isLoadingProjects}
                                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <UploadCloud className="w-4 h-4" />
                                    {isSaving ? (editingTask ? 'Updating...' : 'Adding...') : (editingTask ? 'Update Task' : 'Add Task')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
