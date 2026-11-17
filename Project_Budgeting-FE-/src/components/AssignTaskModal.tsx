import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";
import { SearchableSelect, type SearchableSelectOption } from "./SearchableSelect";
import { type TaskResource, assignmentPayload, fetchTaskResources } from "../utils/taskResources";

interface Task {
    id: string;
    title: string;
    assignee?: string;
    project?: number;
    /** The task's milestone: its Resources-tab people are the ones listed. */
    milestone?: number | null;
    milestoneName?: string | null;
}

interface AssignTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssignmentSuccess: (taskId: string, userId: number) => void;
    task: Task | null;
}

const STATUS_NOTE: Record<string, string> = { completed: 'assignment ended', on_hold: 'on hold' };

/** Assign (or reassign) a task to someone staffed in the Resources tab - on the task's milestone,
 * or anywhere on the project when the task has no milestone. Callers mount this only while open. */
export function AssignTaskModal({ isOpen, onClose, onAssignmentSuccess, task }: AssignTaskModalProps) {
    const [resources, setResources] = useState<TaskResource[]>([]);
    const [isLoading, setIsLoading] = useState(!!task?.project);
    const [loadError, setLoadError] = useState('');
    const [selected, setSelected] = useState<TaskResource | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState('');

    const projectId = task?.project;
    const milestoneId = task?.milestone ?? null;
    useEffect(() => {
        if (!isOpen || !projectId) return;
        let cancelled = false;
        fetchTaskResources(projectId, milestoneId)
            .then((rows) => { if (!cancelled) setResources(rows); })
            .catch(() => { if (!cancelled) setLoadError("Couldn't load the project's resources."); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, projectId, milestoneId]);

    const options: SearchableSelectOption[] = resources.map((r) => ({
        id: r.key,
        label: r.name,
        sublabel: [r.role, r.kind === 'freelancer' ? 'Freelancer' : 'Employee', STATUS_NOTE[r.status]].filter(Boolean).join(' · '),
    }));
    const selectedOption = selected ? options.find((o) => o.id === selected.key) ?? null : null;
    const scope = milestoneId ? `milestone "${task?.milestoneName || 'of this task'}"` : 'this project';

    const handleAssign = async () => {
        if (!task?.id) return;
        if (!selected) {
            setError('Select a resource to assign');
            return;
        }
        setIsAssigning(true);
        setError('');
        try {
            await axiosInstance.patch(`tasks/${task.id}/`, assignmentPayload(selected));
            toast.success(`Assigned to ${selected.name}`);
            onAssignmentSuccess(task.id, selected.id);
            onClose();
        } catch (err: unknown) {
            const data = (err as { response?: { data?: { error?: string; errors?: Record<string, unknown> } } })?.response?.data;
            const fieldError = data?.errors ? Object.values(data.errors).flat()[0] : undefined;
            const message = data?.error || (typeof fieldError === 'string' ? fieldError : '') || 'Failed to assign task';
            setError(message);
            toast.error(message);
        } finally {
            setIsAssigning(false);
        }
    };

    const handleClose = () => {
        if (!isAssigning) onClose();
    };

    if (!isOpen || !task) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all dark:bg-black/50" onClick={handleClose} />
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="assign-task-title"
                    className="relative bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all dark:bg-gray-900 dark:shadow-black/40"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl dark:bg-gray-900 dark:border-gray-800">
                        <h4 id="assign-task-title" className="text-lg font-bold text-gray-900 dark:text-white">Assign Task</h4>
                        <button
                            onClick={handleClose}
                            disabled={isAssigning}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
                            aria-label="Close"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6">
                        <div className="mb-6 p-3 bg-blue-50 border border-blue-100 rounded-lg dark:bg-blue-500/10 dark:border-blue-500/20">
                            <p className="text-xs text-blue-600 font-medium mb-1 dark:text-blue-400">Task</p>
                            <p className="text-sm text-gray-900 font-semibold dark:text-gray-100">{task.title}</p>
                            {task.milestoneName && (
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Milestone: {task.milestoneName}</p>
                            )}
                            {task.assignee && (
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Currently assigned to {task.assignee}</p>
                            )}
                        </div>

                        {(loadError || !projectId) && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                                {loadError || 'This task has no project, so there are no resources to assign.'}
                            </div>
                        )}

                        <div>
                            <label htmlFor="assign-resource" className="block text-sm font-semibold text-gray-900 mb-2 dark:text-white">
                                <span className="text-red-500 mr-1">*</span>Assign to
                            </label>
                            <SearchableSelect
                                id="assign-resource"
                                options={options}
                                value={selectedOption}
                                onChange={(opt) => {
                                    setSelected(opt ? resources.find((r) => r.key === opt.id) ?? null : null);
                                    setError('');
                                }}
                                placeholder={isLoading ? 'Loading resources...' : resources.length === 0 ? `No resources on ${scope}` : 'Search resource'}
                                emptyMessage="No resources match"
                                disabled={isLoading || resources.length === 0}
                                invalid={!!error}
                                size="md"
                            />
                            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                            {!isLoading && !loadError && projectId && (
                                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                                    {resources.length === 0
                                        ? `Add people to ${scope} in the Resources tab first.`
                                        : `Resources on ${scope} (Resources tab).`}
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-6 mt-6 border-t dark:border-gray-800">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isAssigning}
                                className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAssign}
                                disabled={isAssigning || !selected}
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
