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

// Values must match Task.STATUS_CHOICES on the backend, or task create/update is rejected.
const DEFAULT_STATUS_OPTIONS = [
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'needs_attention', label: 'Needs Attention' },
];

const statusLabel = (value: string) =>
    value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

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
        // Round to 2 decimal places — allocated_hours is a DecimalField(max_digits=10,
        // decimal_places=2) on the backend, and an unrounded division (e.g. 20/60 =
        // 0.3333333333333333) has far more significant digits than that field allows,
        // which the API rejects with "Ensure that there are no more than 5 digits in total."
        return Math.round((hours + minutes / 60) * 100) / 100;
    };

    const [formData, setFormData] = useState({
        title: '',
        assignee_id: 0,
        project: prefilledProjectId || 0,
        status: '',
        allocated_hours: '00:00', // Changed to HH:MM format
        due_date: '', // Optional due date
        milestone: 0 // Optional milestone (labour cost rolls up to it)

    });

    const [users, setUsers] = useState<User[]>([]);
    // services/users selector like AssignTaskModal
    const [servicesData, setServicesData] = useState<any[]>([]);
    const [services, setServices] = useState<{ name: string; users: User[] }[]>([]);
    const [serviceUsers, setServiceUsers] = useState<User[]>([]);
    const [selectedService, setSelectedService] = useState<string>('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [milestones, setMilestones] = useState<{ id: number; name: string; sequence: number }[]>([]);
    // Assign to an employee (Task.assigned_to) or a freelancer staffed on the selected milestone
    const [assignMode, setAssignMode] = useState<'employee' | 'freelancer'>('employee');
    // staffed = already a resource on the selected milestone (else added to it on save)
    const [freelancers, setFreelancers] = useState<{ id: number; name: string; role?: string; staffed: boolean }[]>([]);
    const [isLoadingFreelancers, setIsLoadingFreelancers] = useState(false);
    const [selectedFreelancerId, setSelectedFreelancerId] = useState<number | null>(null);
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
        freelancer?: string;
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
    const formRef = useRef<HTMLFormElement>(null);

    const isProjectReadOnly = !!prefilledProjectId && !!prefilledProjectName;

    // Milestones of the selected project, for the optional Milestone picker
    useEffect(() => {
        if (!isOpen || !formData.project) {
            setMilestones([]);
            return;
        }
        let cancelled = false;
        axiosInstance.get(`/projects/${formData.project}/milestones/`)
            .then(res => {
                if (!cancelled) setMilestones(Array.isArray(res.data) ? res.data : []);
            })
            .catch(() => {
                if (!cancelled) setMilestones([]);
            });
        return () => { cancelled = true; };
    }, [isOpen, formData.project]);

    // Freelancers for the picker: those staffed on the selected milestone (or on the project
    // when no milestone is picked) in the Resources tab first, then every other onboarded
    // freelancer - picking one of those adds them to the milestone on save (backend).
    useEffect(() => {
        if (!isOpen || assignMode !== 'freelancer' || !formData.project) {
            setFreelancers([]);
            return;
        }
        let cancelled = false;
        setIsLoadingFreelancers(true);
        Promise.all([
            axiosInstance.get(`/projects/${formData.project}/resources/`, {
                params: formData.milestone ? { milestone: formData.milestone } : {},
            }).catch(() => ({ data: [] })),
            axiosInstance.get('/projects/poc-options/').catch(() => ({ data: [] })),
        ])
            .then(([resourcesRes, optionsRes]) => {
                if (cancelled) return;
                const rows = Array.isArray(resourcesRes.data) ? resourcesRes.data : [];
                const staffed = rows
                    .filter((r: any) => r.resource_type === 'freelancer' && r.status !== 'removed' && r.resource_id)
                    .map((r: any) => ({ id: r.resource_id, name: r.resource_name || `Freelancer #${r.resource_id}`, role: r.role, staffed: true }));
                const options = Array.isArray(optionsRes.data) ? optionsRes.data : [];
                const others = options
                    .filter((o: any) => o.type === 'freelancer')
                    .map((o: any) => ({ id: o.id, name: o.name, role: o.subtitle, staffed: false }));
                const list = [...staffed, ...others];
                // One entry per freelancer (staffed entry wins)
                setFreelancers(list.filter((f, i) => list.findIndex(x => x.id === f.id) === i));
            })
            .catch(() => {
                if (!cancelled) setFreelancers([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingFreelancers(false);
            });
        return () => { cancelled = true; };
    }, [isOpen, assignMode, formData.project, formData.milestone]);

    const selectedMilestoneName = milestones.find(m => m.id === formData.milestone)?.name;

    // Drop a picked freelancer who is no longer in the list
    useEffect(() => {
        if (selectedFreelancerId && !isLoadingFreelancers && !freelancers.some(f => f.id === selectedFreelancerId)) {
            setSelectedFreelancerId(null);
        }
    }, [freelancers, isLoadingFreelancers, selectedFreelancerId]);

    // Fetch users and projects on mount
    useEffect(() => {
        if (isOpen) {
            fetchUsers();
            fetchServicesAndUsers();
            fetchStatusChoices();
            // Projects are only needed for the dropdown when the project isn't prefilled
            if (isProjectReadOnly) {
                setIsLoadingProjects(false);
            } else {
                fetchProjects();
            }

            // Reset form
            setFormData({
                title: '',
                assignee_id: 0,
                project: prefilledProjectId || 0,
                status: 'planned',
                allocated_hours: '00:00',
                due_date: '',
                milestone: 0
            });
            setAssigneeSearch('');
            setProjectSearch('');
            setSelectedAssignee(null);
            setSelectedProject(null);
            setSelectedService('');
            setSelectedUserId(null);
            setAssignMode('employee');
            setSelectedFreelancerId(null);
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
                    milestone: editingTask.milestone || 0,
                }));

                // Project prefilling is now handled by a separate useEffect 
                // to ensure projects are loaded first.

                // prefill assignment service/user if assigned
                if (editingTask.assigned_to?.id) {
                    setSelectedUserId(editingTask.assigned_to.id);
                } else if (editingTask.assigned_freelancer?.id) {
                    setAssignMode('freelancer');
                    setSelectedFreelancerId(editingTask.assigned_freelancer.id);
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
            // Backend returns { status_choices: ['planned', 'in_progress', ...] }
            const raw = Array.isArray(response.data) ? response.data : response.data?.status_choices;
            if (response.status === 200 && Array.isArray(raw) && raw.length > 0) {
                const choices: StatusChoice[] = raw.map((c: any) =>
                    typeof c === 'string' ? { value: c, label: statusLabel(c) } : c
                );
                setStatusChoices(choices);
                // Set first status as default if form status is empty
                setFormData(prev => (prev.status ? prev : { ...prev, status: choices[0].value }));
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
        setFormData(prev => ({
            ...prev,
            project: project.project_no,
            milestone: prev.project === project.project_no ? prev.milestone : 0,
        }));
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

        // Validate HH:MM format for allocated hours — hours are not capped at 24/99;
        // up to 8 digits fits the backend DecimalField(max_digits=10, decimal_places=2)
        const timePattern = /^([0-9]{1,8}):([0-5][0-9])$/;
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

        // Backend requires a project
        if (!formData.project) {
            newErrors.project = 'Project is required';
        }

        setErrors(newErrors);
        const firstError = Object.values(newErrors)[0] as string | undefined;
        if (firstError) {
            // Field errors can be scrolled out of view in the modal - surface them
            toast.error(firstError);
            formRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return !firstError;
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
            // An employee (assigned_to) or a freelancer - never both; sending the other as
            // null clears it when switching on an edit.
            ...(assignMode === 'freelancer'
                ? { freelancer: selectedFreelancerId, assigned_to: null }
                : {
                    freelancer: null,
                    // prefer selectedUserId (from service->user selector) over freeform assignee_id
                    ...(selectedUserId && { assigned_to: selectedUserId }),
                    ...(formData.assignee_id && !selectedUserId && formData.assignee_id !== 0 && { assignee_id: formData.assignee_id }),
                }),
            ...(formData.project && formData.project !== 0 && { project: formData.project }),
            milestone: formData.milestone || null,
            // Always send due_date (even when cleared) so removing it on an edit
            // actually clears it server-side instead of being silently dropped.
            due_date: formData.due_date || null
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
        } catch (error: any) {
            // PATCH wraps serializer errors as { errors: {...} }
            const nested = error?.response?.data?.errors;
            const apiErrors = parseApiErrors(nested && typeof nested === 'object' ? { response: { data: nested } } : error);
            setErrors(apiErrors);
            toast.error(apiErrors.freelancer || apiErrors.general || (editingTask ? 'Failed to update task' : 'Failed to add task'));
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
                className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all dark:bg-black/50"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl transform transition-all dark:bg-gray-900 dark:shadow-black/40"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl dark:bg-gray-900 dark:border-gray-800">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">{editingTask ? 'Edit Task' : 'Add Task'}</h4>
                        <button
                            onClick={handleClose}
                            disabled={isSaving}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
                            aria-label="Close modal"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 max-h-[80vh] overflow-y-auto">
                        {errors.general && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                                </svg>
                                {errors.general}
                            </div>
                        )}

                        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
                            {/* Task Title */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <span className="text-red-500 mr-1">*</span>Task Title
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => {
                                        setFormData({ ...formData, title: e.target.value });
                                        setErrors(prev => ({ ...prev, title: '' }));
                                    }}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500 ${errors.title ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'
                                        }`}
                                    placeholder="Enter task title"
                                />
                                {errors.title && (
                                    <p className="text-xs text-red-600 mt-1">{errors.title}</p>
                                )}
                            </div>

                            {/* Project - Prefilled (read-only) or Searchable Dropdown */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Project
                                </label>
                                {isProjectReadOnly ? (
                                    <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 dark:text-gray-300 font-medium dark:bg-gray-800 dark:border-gray-700">
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
                                                className={`w-full px-3 py-2.5 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500 ${errors.project ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'
                                                    }`}
                                                placeholder={isLoadingProjects ? "Loading projects..." : "Search project..."}
                                                disabled={isLoadingProjects}
                                            />
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                                        </div>

                                        {showProjectDropdown && !isLoadingProjects && filteredProjects.length > 0 && (
                                            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40">
                                                {filteredProjects.map(project => (
                                                    <div
                                                        key={project.project_no}
                                                        onClick={() => handleProjectSelect(project)}
                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors dark:hover:bg-blue-500/10"
                                                    >
                                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.project_name}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">#{project.project_no}</p>
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

                            {/* Milestone (Optional) */}
                            {milestones.length > 0 && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Milestone
                                    </label>
                                    <select
                                        value={formData.milestone || ''}
                                        onChange={(e) => setFormData({ ...formData, milestone: Number(e.target.value) || 0 })}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
                                    >
                                        <option value="">No milestone</option>
                                        {milestones.map(m => (
                                            <option key={m.id} value={m.id}>{m.sequence}. {m.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Allocated hours on this task (x the assignee's cost rate) are costed into the milestone's actual cost.
                                    </p>
                                </div>
                            )}

                            {/* Assignee selector: service type -> user */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assign to</label>
                                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 text-xs" role="tablist">
                                        {(['employee', 'freelancer'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="tab"
                                                aria-selected={assignMode === mode}
                                                onClick={() => {
                                                    setAssignMode(mode);
                                                    setErrors(prev => ({ ...prev, assignee_id: '', freelancer: '' }));
                                                }}
                                                className={`px-3 py-1 rounded-md font-medium transition-colors ${assignMode === mode
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                    }`}
                                            >
                                                {mode === 'employee' ? 'Employee' : 'Freelancer'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {assignMode === 'employee' ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Select Type</label>
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
                                                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-violet-500 ${errors.assignee_id ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'}`}
                                                disabled={services.length === 0}
                                            >
                                                <option value="">{services.length === 0 ? (isLoadingUsers ? 'Loading...' : 'No types') : 'Select type'}</option>
                                                {services.map(s => (
                                                    <option key={s.name} value={s.name}>{s.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Select User</label>
                                        <div className="relative">
                                            <select
                                                value={selectedUserId || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value ? Number(e.target.value) : null;
                                                    setSelectedUserId(value);
                                                    setErrors(prev => ({ ...prev, assignee_id: '' }));
                                                }}
                                                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-violet-500 ${errors.assignee_id ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'}`}
                                                disabled={!selectedService}
                                            >
                                                <option value="">{!selectedService ? 'Select type first' : serviceUsers.length === 0 ? 'No users available' : 'Select user'}</option>
                                                {serviceUsers.map(user => (
                                                    <option key={user.id} value={user.id}>{user.username || user.name || user.email}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                                        </div>
                                        {errors.assignee_id && (
                                            <p className="text-xs text-red-600 mt-1">{errors.assignee_id}</p>
                                        )}
                                    </div>
                                </div>
                                ) : (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Select Freelancer</label>
                                    <div className="relative">
                                        <select
                                            value={selectedFreelancerId || ''}
                                            onChange={(e) => {
                                                setSelectedFreelancerId(e.target.value ? Number(e.target.value) : null);
                                                setErrors(prev => ({ ...prev, freelancer: '' }));
                                            }}
                                            className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-violet-500 ${errors.freelancer ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'}`}
                                            disabled={isLoadingFreelancers || freelancers.length === 0}
                                        >
                                            <option value="">
                                                {isLoadingFreelancers ? 'Loading...' : freelancers.length === 0 ? 'No onboarded freelancers found' : 'Select freelancer'}
                                            </option>
                                            {[
                                                { label: selectedMilestoneName ? `On milestone "${selectedMilestoneName}"` : 'On this project', staffed: true },
                                                { label: 'Other freelancers', staffed: false },
                                            ].map(group => {
                                                const items = freelancers.filter(f => f.staffed === group.staffed);
                                                return items.length > 0 && (
                                                    <optgroup key={group.label} label={group.label}>
                                                        {items.map(f => (
                                                            <option key={f.id} value={f.id}>{f.name}{f.role ? ` — ${f.role}` : ''}</option>
                                                        ))}
                                                    </optgroup>
                                                );
                                            })}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {freelancers.find(f => f.id === selectedFreelancerId && !f.staffed)
                                            ? `Will be added to ${selectedMilestoneName ? `milestone "${selectedMilestoneName}"` : 'this project'} in the Resources tab, at their rate-card cost rate.`
                                            : `Freelancers already on ${selectedMilestoneName ? `milestone "${selectedMilestoneName}"` : 'this project'} are listed first.`}
                                    </p>
                                    {errors.freelancer && (
                                        <p className="text-xs text-red-600 mt-1">{errors.freelancer}</p>
                                    )}
                                </div>
                                )}
                            </div>

                            {/* Status (Optional) */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Status
                                </label>
                                <div className="relative">
                                    <select
                                        value={formData.status}
                                        onChange={(e) => {
                                            setFormData({ ...formData, status: e.target.value });
                                            setErrors(prev => ({ ...prev, status: '' }));
                                        }}
                                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-white dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-violet-500 ${errors.status ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'
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
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                                </div>
                                {errors.status && (
                                    <p className="text-xs text-red-600 mt-1">{errors.status}</p>
                                )}
                            </div>

                            {/* Due Date (Optional) */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Due Date (Optional)
                                </label>
                                <input
                                    type="date"
                                    value={formData.due_date}
                                    onChange={(e) => {
                                        setFormData({ ...formData, due_date: e.target.value });
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500"
                                />
                            </div>

                            {/* Allocated Hours */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <span className="text-red-500 mr-1">*</span>Allocated Hours
                                </label>
                                <input
                                    type="text"
                                    value={formData.allocated_hours}
                                    onChange={(e) => {
                                        setFormData({ ...formData, allocated_hours: e.target.value });
                                        setErrors(prev => ({ ...prev, allocated_hours: '' }));
                                    }}
                                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500 ${errors.allocated_hours ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700'
                                        }`}
                                    placeholder="HH:MM (e.g., 08:30 or 120:00)"
                                    pattern="[0-9]{1,8}:[0-5][0-9]"
                                />
                                {errors.allocated_hours && (
                                    <p className="text-xs text-red-600 mt-1">{errors.allocated_hours}</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={isSaving}
                                    className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
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
