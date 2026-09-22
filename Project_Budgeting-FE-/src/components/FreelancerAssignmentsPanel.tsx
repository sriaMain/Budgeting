/**
 * Freelancers assigned to this project (Section 19) - reuses the same
 * freelancer_onboarding assignment records/endpoint already powering a
 * freelancer's own "Projects" tab (just filtered by project instead of by
 * freelancer), and the same Budget Lines creation endpoint the Budget tab's
 * "Add Budget Line" form already posts to, so nothing new is duplicated -
 * this is a project-scoped view onto data/flows that already exist.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ReusableTable, type Column } from './ReusableTable';
import { Modal } from './Modal';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { InputField } from './InputField';
import { Button } from './Button';
import * as freelancerApi from '../services/freelancerOnboarding';
import axiosInstance from '../utils/axiosInstance';
import type { FreelancerProjectAssignment } from '../types/freelancerOnboarding.types';

interface Props {
    projectId: string;
}

export const FreelancerAssignmentsPanel: React.FC<Props> = ({ projectId }) => {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState<FreelancerProjectAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const [budgetTarget, setBudgetTarget] = useState<FreelancerProjectAssignment | null>(null);
    const [glAccountOptions, setGlAccountOptions] = useState<SearchableSelectOption[]>([]);
    const [glAccount, setGlAccount] = useState<SearchableSelectOption | null>(null);
    const [budgetDescription, setBudgetDescription] = useState('');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [isSavingBudget, setIsSavingBudget] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const list = await freelancerApi.listAssignments({ project: Number(projectId) });
            setAssignments(list);
        } catch {
            toast.error('Failed to load assigned freelancers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

    const openAddToBudget = async (assignment: FreelancerProjectAssignment) => {
        setBudgetTarget(assignment);
        setGlAccount(null);
        setBudgetDescription(`Freelancer Cost - ${assignment.freelancer_name}`);
        setBudgetAmount(assignment.planned_freelancer_cost != null ? String(assignment.planned_freelancer_cost) : '');
        try {
            const res = await axiosInstance.get<{ id: number; code: string; name: string; account_type?: string }[]>(
                '/gl-accounts/?active_only=true'
            );
            setGlAccountOptions((res.data || []).map((acc) => ({
                id: acc.id, label: `${acc.code} - ${acc.name}`, sublabel: acc.account_type,
            })));
        } catch {
            toast.error('Failed to load GL accounts');
        }
    };

    const handleSaveBudgetLine = async () => {
        if (!glAccount) {
            toast.error('Select a GL Account');
            return;
        }
        if (!budgetAmount || parseFloat(budgetAmount) <= 0) {
            toast.error('Enter a planned amount');
            return;
        }
        setIsSavingBudget(true);
        try {
            // Same endpoint/payload shape BudgetLinesPanel's own "Add Budget
            // Line" form posts to - this is a shortcut into that existing
            // flow, not a separate budgeting mechanism.
            await axiosInstance.post(`/projects/${projectId}/budget/lines/`, {
                description: budgetDescription.trim(),
                gl_account: glAccount.id,
                planned_amount: parseFloat(budgetAmount),
            });
            toast.success('Added to project budget');
            setBudgetTarget(null);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'Failed to add budget line');
        } finally {
            setIsSavingBudget(false);
        }
    };

    const columns: Column<FreelancerProjectAssignment>[] = [
        {
            header: 'Freelancer',
            accessor: (a) => (
                <button
                    type="button"
                    onClick={() => navigate(`/freelancers/${a.freelancer}`)}
                    className="text-blue-600 hover:underline font-medium dark:text-blue-400"
                >
                    {a.freelancer_name}
                </button>
            ),
        },
        { header: 'Role', accessor: (a) => a.role || '-' },
        {
            header: 'Cost Rate',
            accessor: (a) => a.cost_rate_snapshot
                ? `${a.currency_snapshot} ${a.cost_rate_snapshot}${a.pricing_model_snapshot ? `/${a.pricing_model_snapshot}` : ''}`
                : '-',
        },
        { header: 'Allocation', accessor: (a) => `${a.allocation_percent}%` },
        { header: 'Status', accessor: (a) => a.status },
        {
            header: 'Actions',
            accessor: (a) => (
                <button
                    type="button"
                    onClick={() => openAddToBudget(a)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    Add to Budget
                </button>
            ),
        },
    ];

    if (!loading && assignments.length === 0) return null;

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 dark:text-gray-300">
                Freelancers
            </h3>
            <ReusableTable
                data={assignments}
                columns={columns}
                keyField="id"
                isLoading={loading}
                emptyMessage="No freelancers assigned to this project."
            />

            <Modal
                isOpen={!!budgetTarget}
                onClose={() => setBudgetTarget(null)}
                title="Add to Budget"
                footer={(
                    <>
                        <Button variant="secondary" className="!w-auto px-6" onClick={() => setBudgetTarget(null)}>Cancel</Button>
                        <Button className="!w-auto px-6" onClick={handleSaveBudgetLine} isLoading={isSavingBudget}>Add Budget Line</Button>
                    </>
                )}
            >
                <div className="space-y-4">
                    <InputField label="Description" value={budgetDescription} onChange={(e) => setBudgetDescription(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">GL Account *</label>
                        <SearchableSelect
                            options={glAccountOptions}
                            value={glAccount}
                            onChange={setGlAccount}
                            placeholder="Search GL account..."
                        />
                    </div>
                    <InputField
                        label="Planned Amount"
                        type="number" min={0}
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Pre-filled from Cost Rate x Planned Units - adjust if needed, then confirm the GL Account.
                        This creates a normal project budget line, editable later in Budget → GL Accounts.
                    </p>
                </div>
            </Modal>
        </div>
    );
};
