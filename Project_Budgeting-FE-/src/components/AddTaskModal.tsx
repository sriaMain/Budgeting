import React, { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Drawer } from "./Drawer";
import { DrawerFormFooter } from "./drawerForm";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { toast } from "react-hot-toast";
import {
    type TaskResource, assignmentPayload, fetchTaskResources, resourceLabel, taskAssigneeKey,
} from "../utils/taskResources";

interface Project {
    project_no: number;
    project_name: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    engagement_type?: string;
}

interface Task {
    id: number;
    title: string;
    assignee_id: number;
    project: number;
    status: string;
}

/** The task fields this form reads: the API task, or Task Management's reduced copy of it. */
interface EditableTask {
    id?: number;
    title?: string;
    description?: string;
    project?: number | null;
    status?: string;
    allocated_hours?: string | number | null;
    start_date?: string | null;
    end_date?: string | null;
    due_date?: string | null;
    milestone?: number | null;
    assigned_to?: number | { id?: number; username?: string } | null;
    assigned_freelancer?: { id?: number; name?: string } | null;
    hrms_employee?: number | null;
    assignee_name?: string | null;
    project_engagement_type?: string | null;
}

interface FormData {
    title: string;
    description: string;
    project: number;
    status: string;
    allocated_hours: string;
    start_date: string;
    end_date: string;
    milestone: number;
}

interface ProjectRow {
    project_no?: number;
    id?: number;
    project_name: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    engagement_type?: string;
}

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskAdded: (task: Task) => void;
    prefilledProjectId?: number;
    prefilledProjectName?: string;
    // Optional: editing an existing task
    editingTask?: EditableTask | null;
    onTaskUpdated?: (task: unknown) => void;
    /** The project's engagement type when known ('fixed' = milestone-based: no hours / timers). */
    engagementType?: string;
}

interface StatusChoice {
    value: string;
    label: string;
}

interface Milestone {
    id: number;
    name: string;
    sequence: number;
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

// Decimal hours <-> HH:MM
const decimalToHHMM = (decimalHours: number | string): string => {
    const decimal = typeof decimalHours === 'string' ? parseFloat(decimalHours) : decimalHours;
    if (isNaN(decimal)) return '00:00';
    const hours = Math.floor(decimal);
    const minutes = Math.round((decimal - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
// Rounded to 2 places: allocated_hours is DecimalField(max_digits=10, decimal_places=2).
const hhmmToDecimal = (hhmmString: string): number => {
    const [hours, minutes] = hhmmString.split(':').map(Number);
    return Math.round((hours + minutes / 60) * 100) / 100;
};

const formFromTask = (task: EditableTask | null | undefined, fallbackProject?: number): FormData => ({
    title: task?.title || '',
    description: task?.description || '',
    project: task?.project || fallbackProject || 0,
    status: task?.status || 'planned',
    allocated_hours: task?.allocated_hours ? decimalToHHMM(task.allocated_hours) : '00:00',
    start_date: task?.start_date || '',
    // Support existing tasks while the API transitions from due_date to end_date.
    end_date: task?.end_date || task?.due_date || '',
    milestone: task?.milestone || 0,
});

const hasAssignee = (task: EditableTask | null | undefined) => !!task && !!(task.assignee_name || taskAssigneeKey(task) || task.hrms_employee);
const assigneeNameOf = (task: EditableTask | null) =>
    task?.assignee_name || task?.assigned_freelancer?.name
    || (typeof task?.assigned_to === 'object' ? task?.assigned_to?.username : undefined) || 'Current assignee';

const inputBase = 'w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500';
const inputTone = (invalid?: string) => invalid ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-gray-300 dark:border-gray-700';

/**
 * Add / edit a task. "Assign to" lists the people staffed in the Resources tab - the selected
 * milestone's resources, or the whole project's when no milestone is picked. Callers mount this
 * only while it's open, so the form starts from the props each time.
 */
export function AddTaskModal({
    isOpen,
    onClose,
    onTaskAdded,
    prefilledProjectId,
    prefilledProjectName,
    editingTask,
    onTaskUpdated,
    engagementType
}: AddTaskModalProps) {
    const [formData, setFormData] = useState(() => formFromTask(editingTask, prefilledProjectId));
    // The task being edited, as the API returns it (Task Management passes a reduced copy).
    const [original, setOriginal] = useState<EditableTask | null>(editingTask || null);
    // 'current' = leave the existing assignee; '' = nobody; else a TaskResource key.
    const [selectedKey, setSelectedKey] = useState<string>(() => (hasAssignee(editingTask) ? 'current' : ''));
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(!(prefilledProjectId && prefilledProjectName));
    const [milestoneState, setMilestoneState] = useState<{ project: number; list: Milestone[] } | null>(null);
    const [resourceState, setResourceState] = useState<{ key: string; list: TaskResource[]; failed: boolean } | null>(null);
    const [statusChoices, setStatusChoices] = useState<StatusChoice[]>(DEFAULT_STATUS_OPTIONS);
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string | undefined>>({});

    // Project search/dropdown (only when the project isn't prefilled). null = show the selected project's name.
    const [projectSearch, setProjectSearch] = useState<string | null>(null);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);
    const projectDropdownRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const isProjectReadOnly = !!prefilledProjectId && !!prefilledProjectName;
    const selectedProject = projects.find(p => p.project_no === formData.project) || null;
    // Milestone-based (Fixed Budget / internal) projects don't track time on tasks: no
    // allocated hours, timers or consumed time. Time & Material tasks keep them.
    const projectEngagement = engagementType
        || selectedProject?.engagement_type
        || (original && original.project === formData.project ? original.project_engagement_type : undefined);
    const timeTracked = projectEngagement !== 'fixed';

    const clearError = (...keys: string[]) => setErrors(prev => {
        const next = { ...prev };
        keys.forEach(k => { delete next[k]; });
        return next;
    });

    // Editing from a reduced copy (Task Management): load the full task and prefill from it.
    useEffect(() => {
        if (!isOpen || !editingTask?.id || 'description' in editingTask) return;
        let cancelled = false;
        axiosInstance.get(`tasks/${editingTask.id}/`)
            .then(res => {
                if (cancelled || !res.data) return;
                setOriginal(res.data);
                setFormData(formFromTask(res.data, prefilledProjectId));
                setSelectedKey(hasAssignee(res.data) ? 'current' : '');
            })
            .catch(() => { if (!cancelled) toast.error('Failed to load the full task details'); });
        return () => { cancelled = true; };
    }, [isOpen, editingTask, prefilledProjectId]);

    // Status choices and (when the project isn't prefilled) the project list.
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        axiosInstance.get('task-status-choices/')
            .then(response => {
                // Backend returns { status_choices: ['planned', 'in_progress', ...] }
                const raw = Array.isArray(response.data) ? response.data : response.data?.status_choices;
                if (!cancelled && Array.isArray(raw) && raw.length > 0) {
                    setStatusChoices(raw.map((c: string | StatusChoice) => (typeof c === 'string' ? { value: c, label: statusLabel(c) } : c)));
                }
            })
            .catch(() => { /* keep the default status options */ })
            .finally(() => { if (!cancelled) setIsLoadingStatus(false); });
        if (!isProjectReadOnly) {
            axiosInstance.get('projects/')
                .then(response => {
                    if (cancelled) return;
                    const all: Project[] = [];
                    // Nested: response.data.Projects[] (per company) -> project_details[]
                    if (Array.isArray(response.data?.Projects)) {
                        response.data.Projects.forEach((company: { project_details?: ProjectRow[] }) => {
                            (company.project_details || []).forEach((project) => all.push({
                                project_no: (project.project_no || project.id) as number,
                                project_name: project.project_name,
                                status: project.status,
                                start_date: project.start_date,
                                end_date: project.end_date,
                                engagement_type: project.engagement_type,
                            }));
                        });
                    } else if (Array.isArray(response.data)) {
                        all.push(...response.data);
                    }
                    setProjects(all);
                })
                .catch(() => { if (!cancelled) setProjects([]); })
                .finally(() => { if (!cancelled) setIsLoadingProjects(false); });
        }
        return () => { cancelled = true; };
    }, [isOpen, isProjectReadOnly]);

    // Milestones of the selected project, for the optional Milestone picker
    useEffect(() => {
        if (!isOpen || !formData.project) return;
        let cancelled = false;
        const project = formData.project;
        axiosInstance.get(`/projects/${project}/milestones/`)
            .then(res => { if (!cancelled) setMilestoneState({ project, list: Array.isArray(res.data) ? res.data : [] }); })
            .catch(() => { if (!cancelled) setMilestoneState({ project, list: [] }); });
        return () => { cancelled = true; };
    }, [isOpen, formData.project]);
    const milestones = milestoneState?.project === formData.project ? milestoneState.list : [];
    const selectedMilestoneName = milestones.find(m => m.id === formData.milestone)?.name;

    // Assign to: the Resources tab's people on the selected milestone (or the whole project).
    const resourcesFor = `${formData.project}:${formData.milestone || 'any'}`;
    useEffect(() => {
        if (!isOpen || !formData.project) return;
        let cancelled = false;
        fetchTaskResources(formData.project, formData.milestone || null)
            .then(list => { if (!cancelled) setResourceState({ key: resourcesFor, list, failed: false }); })
            .catch(() => { if (!cancelled) setResourceState({ key: resourcesFor, list: [], failed: true }); });
        return () => { cancelled = true; };
    }, [isOpen, formData.project, formData.milestone, resourcesFor]);
    const resourcesReady = resourceState?.key === resourcesFor;
    const isLoadingResources = !!formData.project && !resourcesReady;
    const resources = resourcesReady ? resourceState.list : [];
    const resourcesFailed = resourcesReady && resourceState.failed;

    // Editing: the current assignee stays selectable while the task keeps its project and milestone.
    const originalKey = taskAssigneeKey(original);
    const showCurrent = !!original && hasAssignee(original)
        && formData.project === original.project && (formData.milestone || 0) === (original.milestone || 0);
    const resourceOptions = resources.filter(r => !(showCurrent && r.key === originalKey));
    const effectiveKey = selectedKey === 'current'
        ? (showCurrent ? 'current' : '')
        : resources.some(r => r.key === selectedKey) ? selectedKey : '';
    const selectedResource = resources.find(r => r.key === effectiveKey) || null;

    // Close the project dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
                setShowProjectDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const projectQuery = (projectSearch ?? '').toLowerCase();
    const filteredProjects = projects.filter(project =>
        project.project_name?.toLowerCase().includes(projectQuery) ||
        project.project_no?.toString().includes(projectQuery)
    );

    const handleProjectSelect = (project: Project) => {
        setFormData(prev => ({
            ...prev,
            project: project.project_no,
            milestone: prev.project === project.project_no ? prev.milestone : 0,
        }));
        setProjectSearch(null);
        setShowProjectDropdown(false);
        clearError('project');
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.title?.trim()) {
            newErrors.title = 'Task title is required';
        } else if (formData.title.trim().length < 3) {
            newErrors.title = 'Task title must be at least 3 characters';
        }
        if (!formData.description.trim()) {
            newErrors.description = 'Description is required';
        }
        if (!formData.project) {
            newErrors.project = 'Project is required';
        }
        if (!formData.start_date) {
            newErrors.start_date = 'Start date is required';
        }
        if (!formData.end_date) {
            newErrors.end_date = 'End date is required';
        } else if (formData.start_date && formData.end_date < formData.start_date) {
            newErrors.end_date = 'End date cannot be before the start date';
        }
        // HH:MM, hours not capped (up to 8 digits fits the backend DecimalField) - T&M only.
        if (timeTracked) {
            const timePattern = /^([0-9]{1,8}):([0-5][0-9])$/;
            if (!formData.allocated_hours) {
                newErrors.allocated_hours = 'Allocated hours is required';
            } else if (!timePattern.test(formData.allocated_hours)) {
                newErrors.allocated_hours = 'Please enter time in HH:MM format (e.g., 05:30)';
            } else if (hhmmToDecimal(formData.allocated_hours) <= 0) {
                newErrors.allocated_hours = 'Allocated hours must be greater than 00:00';
            }
        }

        setErrors(newErrors);
        const firstError = Object.values(newErrors)[0];
        if (firstError) {
            // Field errors can be scrolled out of view in the drawer - surface them
            toast.error(firstError);
            formRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return !firstError;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setIsSaving(true);

        const assignment = effectiveKey === 'current'
            ? {} // unchanged
            : selectedResource
                ? assignmentPayload(selectedResource)
                : editingTask ? assignmentPayload(null) : {};
        const payload = {
            title: formData.title.trim(),
            description: formData.description.trim(),
            ...(timeTracked && { allocated_hours: hhmmToDecimal(formData.allocated_hours) }),
            ...(formData.status && { status: formData.status }),
            ...assignment,
            project: formData.project,
            milestone: formData.milestone || null,
            start_date: formData.start_date,
            end_date: formData.end_date,
        };

        try {
            if (editingTask && editingTask.id) {
                const response = await axiosInstance.patch(`tasks/${editingTask.id}/`, payload);
                if (response.status === 200 || response.status === 204) {
                    onTaskUpdated?.(response.data.task || response.data || payload);
                    toast.success('Task updated successfully!');
                    setTimeout(() => onClose(), 300);
                }
            } else {
                const response = await axiosInstance.post('tasks/', payload);
                if (response.status === 200 || response.status === 201) {
                    onTaskAdded(response.data.task || response.data);
                    toast.success('Task added successfully!');
                    setTimeout(() => onClose(), 500);
                }
            }
        } catch (error: unknown) {
            // Serializer errors come back as { errors: {...} }
            const nested = (error as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
            const apiErrors = parseApiErrors(nested && typeof nested === 'object' ? { response: { data: nested } } : error);
            setErrors(apiErrors);
            const assignError = apiErrors.assigned_to || apiErrors.freelancer || apiErrors.hrms_employee;
            toast.error(assignError || apiErrors.general || (editingTask ? 'Failed to update task' : 'Failed to add task'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (!isSaving) onClose();
    };

    if (!isOpen) return null;

    const assignError = errors.assigned_to || errors.freelancer || errors.hrms_employee;
    const scopeText = formData.milestone ? `milestone "${selectedMilestoneName ?? 'selected'}"` : 'this project';
    const assignPlaceholder = !formData.project
        ? 'Select a project first'
        : isLoadingResources
            ? 'Loading resources...'
            : resourceOptions.length === 0 && !showCurrent
                ? `No resources on ${formData.milestone ? 'this milestone' : 'this project'}`
                : 'Unassigned';

    return (
        <Drawer
            isOpen={isOpen}
            onClose={handleClose}
            title={editingTask ? 'Edit Task' : 'Add Task'}
            subtitle={editingTask ? 'Update the task details' : prefilledProjectName ? `New task in ${prefilledProjectName}` : 'Create a task and assign it'}
            size="md"
            footer={(
                <DrawerFormFooter
                    onCancel={handleClose}
                    onSubmit={() => formRef.current?.requestSubmit()}
                    submitLabel={editingTask ? 'Update Task' : 'Add Task'}
                    busyLabel={editingTask ? 'Updating...' : 'Adding...'}
                    isBusy={isSaving}
                />
            )}
        >
            <div>
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
                        <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span className="text-red-500 mr-1">*</span>Task Title
                        </label>
                        <input
                            id="task-title"
                            type="text"
                            value={formData.title}
                            onChange={(e) => { setFormData({ ...formData, title: e.target.value }); clearError('title'); }}
                            className={`${inputBase} ${inputTone(errors.title)}`}
                            placeholder="Enter task title"
                        />
                        {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span className="text-red-500 mr-1">*</span>Description
                        </label>
                        <textarea
                            id="task-description"
                            rows={4}
                            value={formData.description}
                            onChange={(e) => { setFormData({ ...formData, description: e.target.value }); clearError('description'); }}
                            aria-invalid={!!errors.description || undefined}
                            className={`${inputBase} ${inputTone(errors.description)}`}
                            placeholder="What needs to be done, details, links…"
                        />
                        {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
                    </div>

                    {/* Project - Prefilled (read-only) or Searchable Dropdown */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project</label>
                        {isProjectReadOnly ? (
                            <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 dark:text-gray-300 font-medium dark:bg-gray-800 dark:border-gray-700">
                                {prefilledProjectName}
                            </div>
                        ) : (
                            <div className="relative" ref={projectDropdownRef}>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={projectSearch ?? selectedProject?.project_name ?? ''}
                                        onChange={(e) => setProjectSearch(e.target.value)}
                                        onFocus={() => setShowProjectDropdown(true)}
                                        className={`${inputBase} pr-10 ${inputTone(errors.project)}`}
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
                        {errors.project && <p className="text-xs text-red-600 mt-1">{errors.project}</p>}
                    </div>

                    {/* Milestone (Optional) - picks whose resources can be assigned */}
                    {milestones.length > 0 && (
                        <div className="space-y-2">
                            <label htmlFor="task-milestone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Milestone</label>
                            <div className="relative">
                                <select
                                    id="task-milestone"
                                    value={formData.milestone || ''}
                                    onChange={(e) => { setFormData({ ...formData, milestone: Number(e.target.value) || 0 }); clearError('milestone', 'assigned_to', 'freelancer', 'hrms_employee'); }}
                                    className={`${inputBase} appearance-none bg-white ${inputTone(errors.milestone)}`}
                                >
                                    <option value="">No milestone</option>
                                    {milestones.map(m => (
                                        <option key={m.id} value={m.id}>{m.sequence}. {m.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                            </div>
                            {errors.milestone && <p className="text-xs text-red-600 mt-1">{errors.milestone}</p>}
                            {timeTracked && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Allocated hours on this task (x the assignee's cost rate) are costed into the milestone's actual cost.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Assign to: the Resources tab's people on this milestone / project */}
                    <div className="space-y-2">
                        <label htmlFor="task-assignee" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assign to</label>
                        <div className="relative">
                            <select
                                id="task-assignee"
                                value={effectiveKey}
                                onChange={(e) => { setSelectedKey(e.target.value); clearError('assigned_to', 'freelancer', 'hrms_employee'); }}
                                disabled={!formData.project || isLoadingResources}
                                aria-invalid={!!assignError || undefined}
                                className={`${inputBase} appearance-none bg-white disabled:opacity-60 ${inputTone(assignError)}`}
                            >
                                <option value="">{assignPlaceholder}</option>
                                {showCurrent && (
                                    <option value="current">{assigneeNameOf(original)} (current)</option>
                                )}
                                {resourceOptions.map(r => (
                                    <option key={r.key} value={r.key}>{resourceLabel(r)}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                        </div>
                        {assignError && <p className="text-xs text-red-600 mt-1">{assignError}</p>}
                        {formData.project && resourcesReady && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {resourcesFailed
                                    ? "Couldn't load the resources - close and try again."
                                    : resources.length === 0
                                        ? `No resources on ${scopeText} yet - add them in the Resources tab first.`
                                        : formData.milestone
                                            ? `Resources on ${scopeText} (Resources tab).`
                                            : milestones.length > 0
                                                ? 'All resources on this project - pick a milestone to see only its resources.'
                                                : 'Resources on this project (Resources tab).'}
                            </p>
                        )}
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label htmlFor="task-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <div className="relative">
                            <select
                                id="task-status"
                                value={formData.status}
                                onChange={(e) => { setFormData({ ...formData, status: e.target.value }); clearError('status'); }}
                                className={`${inputBase} appearance-none bg-white ${inputTone(errors.status)}`}
                                disabled={isLoadingStatus}
                            >
                                <option value="" disabled>Select Status</option>
                                {statusChoices.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                        </div>
                        {errors.status && <p className="text-xs text-red-600 mt-1">{errors.status}</p>}
                    </div>

                    {/* Start and End Dates (required) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="task-start-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                <span className="text-red-500 mr-1">*</span>Start Date
                            </label>
                            <input id="task-start-date" type="date" max={formData.end_date || undefined} value={formData.start_date}
                                onChange={(e) => { setFormData({ ...formData, start_date: e.target.value }); clearError('start_date'); }}
                                aria-invalid={!!errors.start_date || undefined}
                                className={`${inputBase} ${inputTone(errors.start_date)}`} />
                            {errors.start_date && <p className="text-xs text-red-600 mt-1">{errors.start_date}</p>}
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="task-end-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                <span className="text-red-500 mr-1">*</span>End Date
                            </label>
                            <input id="task-end-date" type="date" min={formData.start_date || undefined} value={formData.end_date}
                                onChange={(e) => { setFormData({ ...formData, end_date: e.target.value }); clearError('end_date'); }}
                                aria-invalid={!!errors.end_date || undefined}
                                className={`${inputBase} ${inputTone(errors.end_date)}`} />
                            {errors.end_date && <p className="text-xs text-red-600 mt-1">{errors.end_date}</p>}
                        </div>
                    </div>

                    {/* Allocated Hours - Time & Material projects only */}
                    {timeTracked && (
                        <div className="space-y-2">
                            <label htmlFor="task-hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                <span className="text-red-500 mr-1">*</span>Allocated Hours
                            </label>
                            <input
                                id="task-hours"
                                type="text"
                                value={formData.allocated_hours}
                                onChange={(e) => { setFormData({ ...formData, allocated_hours: e.target.value }); clearError('allocated_hours'); }}
                                className={`${inputBase} font-mono ${inputTone(errors.allocated_hours)}`}
                                placeholder="HH:MM (e.g., 08:30 or 120:00)"
                                pattern="[0-9]{1,8}:[0-5][0-9]"
                            />
                            {errors.allocated_hours && <p className="text-xs text-red-600 mt-1">{errors.allocated_hours}</p>}
                        </div>
                    )}
                </form>
            </div>
        </Drawer>
    );
}
