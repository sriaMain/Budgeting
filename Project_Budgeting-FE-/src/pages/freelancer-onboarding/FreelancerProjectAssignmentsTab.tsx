import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import { ReusableTable, type Column } from '../../components/ReusableTable';
import { Modal } from '../../components/Modal';
import axiosInstance from '../../utils/axiosInstance';
import * as api from '../../services/freelancerOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type {
    FreelancerProjectAssignment, FreelancerProjectAssignmentPayload, FreelancerRateCard,
    CapacityCheckResult, AssignmentStatus,
} from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
    hoursPerWeek: number | null;
    assignmentStatuses: { value: string; label: string }[];
}

interface ProjectOption { value: string; label: string }

const EMPTY = (freelancerId: number): FreelancerProjectAssignmentPayload => ({
    freelancer: freelancerId,
    project: 0,
    role: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    estimated_hours: '',
    allocated_hours: '',
    status: 'planned' as AssignmentStatus,
});

export const FreelancerProjectAssignmentsTab: React.FC<Props> = ({ freelancerId, hoursPerWeek, assignmentStatuses }) => {
    const [assignments, setAssignments] = useState<FreelancerProjectAssignment[]>([]);
    const [rateCards, setRateCards] = useState<FreelancerRateCard[]>([]);
    const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [values, setValues] = useState<FreelancerProjectAssignmentPayload>(EMPTY(freelancerId));
    const [isSaving, setIsSaving] = useState(false);
    const [capacityWarning, setCapacityWarning] = useState<CapacityCheckResult | null>(null);
    const [checkingCapacity, setCheckingCapacity] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [list, cards] = await Promise.all([
                api.listAssignments({ freelancer: freelancerId }),
                api.listRateCards(freelancerId),
            ]);
            setAssignments(list);
            setRateCards(cards);
        } catch {
            toast.error('Failed to load project assignments');
        } finally {
            setLoading(false);
        }
    };

    const loadProjects = async () => {
        try {
            const res = await axiosInstance.get('/projects/');
            const groups: { project_details: { project_no: number; project_name: string }[] }[] = res.data?.Projects || [];
            const options = groups.flatMap((g) => g.project_details).map((p) => ({
                value: String(p.project_no), label: p.project_name,
            }));
            setProjectOptions(options);
        } catch {
            toast.error('Failed to load projects');
        }
    };

    useEffect(() => { load(); loadProjects(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freelancerId]);

    const openAdd = () => { setValues(EMPTY(freelancerId)); setCapacityWarning(null); setIsModalOpen(true); };

    const set = <K extends keyof FreelancerProjectAssignmentPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setValues((v) => ({ ...v, [field]: e.target.value as never }));
    };

    const runCapacityCheck = async (next: FreelancerProjectAssignmentPayload) => {
        if (!next.start_date || !next.allocated_hours) { setCapacityWarning(null); return; }
        setCheckingCapacity(true);
        try {
            const result = await api.checkFreelancerCapacity(freelancerId, {
                start_date: next.start_date,
                end_date: next.end_date || undefined,
                allocated_hours: next.allocated_hours,
            });
            setCapacityWarning(result.is_over_allocated ? result : null);
        } catch {
            // Non-blocking - a failed pre-flight check shouldn't stop the admin from proceeding.
        } finally {
            setCheckingCapacity(false);
        }
    };

    const handleFieldChange = <K extends keyof FreelancerProjectAssignmentPayload>(field: K) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const next = { ...values, [field]: e.target.value as never };
        setValues(next);
        if (field === 'start_date' || field === 'end_date' || field === 'allocated_hours') {
            runCapacityCheck(next);
        }
    };

    const handleSave = async () => {
        if (!values.project) {
            toast.error('Select a project');
            return;
        }
        setIsSaving(true);
        try {
            // DRF rejects "" for optional FK/date/number fields (it's not
            // treated as "omitted" the way it is for CharFields) - strip
            // blanks instead of sending them.
            const payload: FreelancerProjectAssignmentPayload = { ...values, project: Number(values.project) };
            if (!payload.rate_card) delete payload.rate_card;
            if (!payload.end_date) delete payload.end_date;
            if (!payload.estimated_hours && payload.estimated_hours !== 0) delete payload.estimated_hours;

            const created = await api.createAssignment(payload);
            toast.success('Freelancer assigned to project');
            if (created.capacity_warning) {
                toast(
                    `Heads up: freelancer is over allocated by ${created.capacity_warning.over_allocated_by} hrs/week`,
                    { icon: '⚠️' },
                );
            }
            setIsModalOpen(false);
            load();
        } catch (err) {
            const errors = parseApiErrors(err);
            toast.error(errors.general || 'Failed to create assignment');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (assignment: FreelancerProjectAssignment) => {
        if (!window.confirm(`Remove this assignment from ${assignment.project_name}?`)) return;
        try {
            await api.deleteAssignment(assignment.id);
            toast.success('Assignment removed');
            load();
        } catch {
            toast.error('Failed to remove assignment');
        }
    };

    const columns: Column<FreelancerProjectAssignment>[] = [
        { header: 'Project', accessor: 'project_name' },
        { header: 'Role', accessor: (a) => a.role || '-' },
        { header: 'Dates', accessor: (a) => `${a.start_date} - ${a.end_date || 'ongoing'}` },
        { header: 'Allocated Hrs', accessor: 'allocated_hours' },
        { header: 'Cost Rate', accessor: (a) => a.cost_rate_snapshot ? `${a.currency_snapshot} ${a.cost_rate_snapshot}` : '-' },
        { header: 'Billing Rate', accessor: (a) => a.billing_rate_snapshot ? `${a.currency_snapshot} ${a.billing_rate_snapshot}` : '-' },
        { header: 'Status', accessor: (a) => assignmentStatuses.find((s) => s.value === a.status)?.label || a.status },
    ];

    return (
        <div className="space-y-4">
            {hoursPerWeek != null && (
                <p className="text-sm text-gray-500">Freelancer capacity: {hoursPerWeek} hrs/week</p>
            )}
            <div className="flex justify-end">
                <Button className="!w-auto px-6" onClick={openAdd}>Assign to Project</Button>
            </div>
            <ReusableTable
                data={assignments}
                columns={columns}
                keyField="id"
                isLoading={loading}
                onDelete={handleDelete}
                emptyMessage="No project assignments yet."
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Assign to Project"
                size="lg"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSave} isLoading={isSaving}>Assign</Button>
                    </>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <SelectField
                        label="Project" placeholder="Select project" options={projectOptions}
                        value={String(values.project || '')} onChange={set('project')}
                    />
                    <InputField label="Role" placeholder="e.g. React Developer" value={values.role} onChange={set('role')} />
                    <InputField label="Start Date" type="date" value={values.start_date} onChange={handleFieldChange('start_date')} />
                    <InputField label="End Date" type="date" value={values.end_date ?? ''} onChange={handleFieldChange('end_date')} />
                    <InputField label="Estimated Hours" type="number" min={0} value={values.estimated_hours ?? ''} onChange={set('estimated_hours')} />
                    <InputField label="Allocated Hours" type="number" min={0} value={values.allocated_hours} onChange={handleFieldChange('allocated_hours')} />
                    <SelectField
                        label="Rate Card (optional - defaults to current active rate)"
                        placeholder="Use current active rate" options={rateCards.map((c) => ({
                            value: String(c.id), label: `${c.pricing_model} - ${c.currency} ${c.billing_rate}`,
                        }))}
                        value={values.rate_card ? String(values.rate_card) : ''}
                        onChange={set('rate_card')}
                    />
                    <SelectField label="Status" options={assignmentStatuses} value={values.status ?? 'planned'} onChange={set('status')} />
                </div>

                {checkingCapacity && <p className="text-xs text-gray-400">Checking capacity...</p>}
                {capacityWarning && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <span>
                            Freelancer is over allocated by <strong>{capacityWarning.over_allocated_by} hrs/week</strong> in
                            this period ({capacityWarning.total_allocated_hours_per_week} / {capacityWarning.capacity_hours_per_week} hrs/week).
                            You can still proceed if this is intentional.
                        </span>
                    </div>
                )}
            </Modal>
        </div>
    );
};
