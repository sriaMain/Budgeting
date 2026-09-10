import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import { Checkbox } from '../../components/Checkbox';
import { Modal } from '../../components/Modal';
import { ReusableTable, type Column } from '../../components/ReusableTable';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type {
    FreelancerTaskAssignment, FreelancerTaskAssignmentPayload, FreelancerTimeEntry,
    FreelancerTimeEntryPayload, FreelancerProjectAssignment, SimpleTask,
} from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    taskAssignmentStatuses: { value: string; label: string }[];
    timeEntryStatuses: { value: string; label: string }[];
}

const EMPTY_TASK_ASSIGNMENT = (freelancerId: number): FreelancerTaskAssignmentPayload => ({
    freelancer: freelancerId,
    task: 0,
    estimated_hours: '',
    allocated_hours: '',
    status: 'planned',
});

const EMPTY_TIME_ENTRY = (taskAssignmentId: number): FreelancerTimeEntryPayload => ({
    task_assignment: taskAssignmentId,
    date: new Date().toISOString().split('T')[0],
    hours: '',
    is_billable: true,
    description: '',
});

export const FreelancerTasksTab: React.FC<Props> = ({ freelancerId, taskAssignmentStatuses, timeEntryStatuses }) => {
    const [assignments, setAssignments] = useState<FreelancerTaskAssignment[]>([]);
    const [timeEntries, setTimeEntries] = useState<FreelancerTimeEntry[]>([]);
    const [projectAssignments, setProjectAssignments] = useState<FreelancerProjectAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [projectTasks, setProjectTasks] = useState<SimpleTask[]>([]);
    const [taskValues, setTaskValues] = useState<FreelancerTaskAssignmentPayload>(EMPTY_TASK_ASSIGNMENT(freelancerId));
    const [isSavingTask, setIsSavingTask] = useState(false);

    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [timeValues, setTimeValues] = useState<FreelancerTimeEntryPayload>(EMPTY_TIME_ENTRY(0));
    const [isSavingTime, setIsSavingTime] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [taskAssignmentList, entries, projAssignments] = await Promise.all([
                api.listTaskAssignments({ freelancer: freelancerId }),
                api.listTimeEntries({ freelancer: freelancerId }),
                api.listAssignments({ freelancer: freelancerId }),
            ]);
            setAssignments(taskAssignmentList);
            setTimeEntries(entries);
            setProjectAssignments(projAssignments);
        } catch {
            toast.error('Failed to load tasks and time entries');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const openAssignTask = () => {
        setSelectedProjectId('');
        setProjectTasks([]);
        setTaskValues(EMPTY_TASK_ASSIGNMENT(freelancerId));
        setIsTaskModalOpen(true);
    };

    const handleProjectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const projectId = e.target.value;
        setSelectedProjectId(projectId);
        setTaskValues((v) => ({ ...v, task: 0 }));
        if (!projectId) { setProjectTasks([]); return; }
        try {
            setProjectTasks(await api.listTasksForProject(Number(projectId)));
        } catch {
            toast.error('Failed to load tasks for this project');
        }
    };

    const setTaskField = <K extends keyof FreelancerTaskAssignmentPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setTaskValues((v) => ({ ...v, [field]: e.target.value as never }));
    };

    const handleSaveTaskAssignment = async () => {
        if (!taskValues.task) { toast.error('Select a task'); return; }
        setIsSavingTask(true);
        try {
            const payload: FreelancerTaskAssignmentPayload = { ...taskValues, task: Number(taskValues.task) };
            if (!payload.estimated_hours) delete payload.estimated_hours;
            await api.createTaskAssignment(payload);
            toast.success('Freelancer assigned to task');
            setIsTaskModalOpen(false);
            load();
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to assign task');
        } finally {
            setIsSavingTask(false);
        }
    };

    const handleDeleteTaskAssignment = async (assignment: FreelancerTaskAssignment) => {
        if (!window.confirm(`Remove this assignment from task "${assignment.task_title}"?`)) return;
        try {
            await api.deleteTaskAssignment(assignment.id);
            toast.success('Task assignment removed');
            load();
        } catch {
            toast.error('Failed to remove task assignment');
        }
    };

    const openLogTime = (assignment: FreelancerTaskAssignment) => {
        setTimeValues(EMPTY_TIME_ENTRY(assignment.id));
        setIsTimeModalOpen(true);
    };

    const setTimeField = <K extends keyof FreelancerTimeEntryPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setTimeValues((v) => ({ ...v, [field]: value as never }));
    };

    const handleSaveTimeEntry = async () => {
        setIsSavingTime(true);
        try {
            const payload: FreelancerTimeEntryPayload = { ...timeValues };
            if (!payload.hours) delete payload.hours;
            if (!payload.start_time) delete payload.start_time;
            if (!payload.end_time) delete payload.end_time;
            await api.createTimeEntry(payload);
            toast.success('Time entry logged as draft');
            setIsTimeModalOpen(false);
            load();
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to log time entry');
        } finally {
            setIsSavingTime(false);
        }
    };

    const handleDeleteTimeEntry = async (entry: FreelancerTimeEntry) => {
        if (!window.confirm('Delete this time entry?')) return;
        try {
            await api.deleteTimeEntry(entry.id);
            toast.success('Time entry deleted');
            load();
        } catch {
            toast.error('Failed to delete time entry');
        }
    };

    const handleSubmitTimeEntry = async (entry: FreelancerTimeEntry) => {
        try {
            await api.submitTimeEntry(entry.id);
            toast.success('Submitted for approval');
            load();
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'Failed to submit');
        }
    };

    const handleApproveTimeEntry = async (entry: FreelancerTimeEntry) => {
        try {
            await api.approveTimeEntry(entry.id);
            toast.success('Time entry approved');
            load();
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'Failed to approve');
        }
    };

    const handleRejectTimeEntry = async (entry: FreelancerTimeEntry) => {
        const reason = window.prompt('Reason for rejection (optional):') || '';
        try {
            await api.rejectTimeEntry(entry.id, reason);
            toast.success('Time entry rejected');
            load();
        } catch (err) {
            toast.error(parseApiErrors(err).general || 'Failed to reject');
        }
    };

    const taskColumns: Column<FreelancerTaskAssignment>[] = [
        { header: 'Project', accessor: 'project_name' },
        { header: 'Task', accessor: 'task_title' },
        { header: 'Allocated Hrs', accessor: 'allocated_hours' },
        { header: 'Actual Hrs', accessor: 'actual_hours' },
        { header: 'Remaining Hrs', accessor: 'remaining_hours' },
        { header: 'Cost', accessor: (a) => a.cost != null ? a.cost : '-' },
        { header: 'Billing', accessor: (a) => a.billing_amount != null ? a.billing_amount : '-' },
        { header: 'Status', accessor: (a) => taskAssignmentStatuses.find((s) => s.value === a.status)?.label || a.status },
        {
            header: 'Log Time',
            accessor: (a) => (
                <button
                    onClick={() => openLogTime(a)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                    + Log Time
                </button>
            ),
        },
    ];

    const statusBadgeClass: Record<string, string> = {
        draft: 'bg-gray-100 text-gray-600',
        submitted: 'bg-blue-100 text-blue-700',
        approved: 'bg-green-100 text-green-700',
        rejected: 'bg-red-100 text-red-700',
    };

    const timeEntryColumns: Column<FreelancerTimeEntry>[] = [
        { header: 'Task', accessor: 'task_title' },
        { header: 'Date', accessor: 'date' },
        { header: 'Hours', accessor: 'hours' },
        { header: 'Billable', accessor: (e) => (e.is_billable ? 'Yes' : 'No') },
        {
            header: 'Status',
            accessor: (e) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass[e.status] || ''}`}>
                    {timeEntryStatuses.find((s) => s.value === e.status)?.label || e.status}
                </span>
            ),
        },
        {
            header: 'Actions',
            accessor: (e) => (
                <div className="flex gap-2">
                    {e.status === 'draft' && (
                        <button onClick={() => handleSubmitTimeEntry(e)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Submit</button>
                    )}
                    {e.status === 'submitted' && (
                        <>
                            <button onClick={() => handleApproveTimeEntry(e)} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                            <button onClick={() => handleRejectTimeEntry(e)} className="text-red-600 hover:text-red-800 text-xs font-medium">Reject</button>
                        </>
                    )}
                    {e.status !== 'approved' && (
                        <button onClick={() => handleDeleteTimeEntry(e)} className="text-gray-500 hover:text-gray-700 text-xs font-medium">Delete</button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-900">Task Assignments</h3>
                    <Button className="!w-auto px-6" onClick={openAssignTask} disabled={projectAssignments.length === 0}>
                        Assign to Task
                    </Button>
                </div>
                {projectAssignments.length === 0 && (
                    <p className="text-sm text-gray-500 mb-3">Assign this freelancer to a project first (see the Projects tab).</p>
                )}
                <ReusableTable
                    data={assignments}
                    columns={taskColumns}
                    keyField="id"
                    isLoading={loading}
                    onDelete={handleDeleteTaskAssignment}
                    emptyMessage="No task assignments yet."
                />
            </div>

            <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3">Time Entries</h3>
                <ReusableTable
                    data={timeEntries}
                    columns={timeEntryColumns}
                    keyField="id"
                    isLoading={loading}
                    emptyMessage="No time entries yet."
                />
            </div>

            <Modal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                title="Assign to Task"
                size="lg"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsTaskModalOpen(false)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSaveTaskAssignment} isLoading={isSavingTask}>Assign</Button>
                    </>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <SelectField
                        label="Project"
                        placeholder="Select project"
                        options={projectAssignments.map((a) => ({ value: String(a.project), label: a.project_name }))}
                        value={selectedProjectId}
                        onChange={handleProjectChange}
                    />
                    <SelectField
                        label="Task"
                        placeholder="Select task"
                        options={projectTasks.map((t) => ({ value: String(t.id), label: t.title }))}
                        value={taskValues.task ? String(taskValues.task) : ''}
                        onChange={setTaskField('task')}
                        disabled={!selectedProjectId}
                    />
                    <InputField label="Estimated Hours" type="number" min={0} value={taskValues.estimated_hours ?? ''} onChange={setTaskField('estimated_hours')} />
                    <InputField label="Allocated Hours" type="number" min={0} value={taskValues.allocated_hours} onChange={setTaskField('allocated_hours')} />
                    <SelectField label="Status" options={taskAssignmentStatuses} value={taskValues.status ?? 'planned'} onChange={setTaskField('status')} />
                </div>
            </Modal>

            <Modal
                isOpen={isTimeModalOpen}
                onClose={() => setIsTimeModalOpen(false)}
                title="Log Time"
                size="md"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsTimeModalOpen(false)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSaveTimeEntry} isLoading={isSavingTime}>Log Time</Button>
                    </>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <InputField label="Date" type="date" value={timeValues.date} onChange={setTimeField('date')} />
                    <InputField label="Hours" type="number" min={0} step="0.25" value={timeValues.hours ?? ''} onChange={setTimeField('hours')} />
                    <InputField label="Start Time (optional)" type="time" value={timeValues.start_time ?? ''} onChange={setTimeField('start_time')} />
                    <InputField label="End Time (optional)" type="time" value={timeValues.end_time ?? ''} onChange={setTimeField('end_time')} />
                    <InputField label="Break (minutes)" type="number" min={0} value={timeValues.break_minutes ?? ''} onChange={setTimeField('break_minutes')} />
                </div>
                <Checkbox label="Billable" checked={!!timeValues.is_billable} onChange={setTimeField('is_billable')} />
                <div className="mt-4">
                    <label className="block text-base font-medium text-gray-900 mb-2">Description</label>
                    <textarea
                        value={timeValues.description}
                        onChange={setTimeField('description')}
                        rows={3}
                        className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all"
                    />
                </div>
                <p className="text-xs text-gray-400 mt-2">Provide either Hours directly, or both Start/End Time (break will be subtracted).</p>
            </Modal>
        </div>
    );
};
