/**
 * BudgetLinesPanel
 * GL-Account-tagged budget lines for a project's budget (Project Budgeting
 * module). Each line ties a Description + Planned Amount to a GL Account
 * pulled from the same Chart-of-Accounts table (core.GLAccount) used
 * elsewhere in the app (Project / Quote GL Account fields) via a searchable
 * dropdown -- never free text -- so Project Budget -> Budget Line -> GL
 * Account -> Accounting Transactions stays one structure instead of a
 * separate budgeting-only master list.
 *
 * Supports filtering/grouping by GL Account so Finance/PM can answer:
 *   - How much was budgeted for each GL Account?
 *   - How much is the total planned budget?
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { SearchableSelect } from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';

interface GLAccountOption {
    id: number;
    code: string;
    name: string;
    account_type: string;
    is_active: boolean;
}

interface BudgetLine {
    id: number;
    description: string;
    gl_account: number;
    gl_account_code: string;
    gl_account_name: string;
    gl_account_type: string;
    gl_account_is_active: boolean;
    planned_amount: string | number;
    actual_amount?: string | number;
    variance?: string | number;
}

interface BudgetLinesPanelProps {
    projectId: string;
    currency?: string;
}

interface LineFormErrors {
    description?: string;
    glAccount?: string;
    plannedAmount?: string;
}

interface GLAccountFormErrors {
    code?: string;
    name?: string;
    accountType?: string;
}

const ALL_GL_ACCOUNTS_OPTION: SearchableSelectOption = { id: 'all', label: 'All GL Accounts' };

// Same choices as core.GLAccount.ACCOUNT_TYPE_CHOICES on the backend.
const GL_ACCOUNT_TYPE_CHOICES = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'asset', label: 'Asset' },
    { value: 'liability', label: 'Liability' },
    { value: 'equity', label: 'Equity' },
];

const num = (v: string | number | undefined | null): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const formatAccountType = (type?: string): string | undefined => {
    if (!type) return undefined;
    return type.charAt(0).toUpperCase() + type.slice(1);
};

// Description, GL Account and Planned Amount are the only required fields
// on a budget line -- kept in one place so Add and Edit validate the same way.
const validateLine = (
    description: string,
    glAccount: SearchableSelectOption | null,
    plannedAmount: string
): LineFormErrors => {
    const errors: LineFormErrors = {};

    if (!description.trim()) {
        errors.description = 'Description is required.';
    }
    if (!glAccount) {
        errors.glAccount = 'GL Account is required.';
    }

    const amountNum = parseFloat(plannedAmount);
    if (!plannedAmount.trim() || Number.isNaN(amountNum)) {
        errors.plannedAmount = 'Planned amount is required.';
    } else if (amountNum <= 0) {
        errors.plannedAmount = 'Planned amount must be greater than 0.';
    }

    return errors;
};

const extractServerErrors = (data: any): LineFormErrors => ({
    description: data?.description?.[0],
    glAccount: data?.gl_account?.[0],
    plannedAmount: data?.planned_amount?.[0],
});

export const BudgetLinesPanel: React.FC<BudgetLinesPanelProps> = ({ projectId, currency = 'INR' }) => {
    const [lines, setLines] = useState<BudgetLine[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [glAccounts, setGlAccounts] = useState<GLAccountOption[]>([]);

    // Add-line form
    const [description, setDescription] = useState('');
    const [newGlAccount, setNewGlAccount] = useState<SearchableSelectOption | null>(null);
    const [plannedAmount, setPlannedAmount] = useState('');
    const [addErrors, setAddErrors] = useState<LineFormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Inline edit state (one row at a time)
    const [editingLineId, setEditingLineId] = useState<number | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editGlAccount, setEditGlAccount] = useState<SearchableSelectOption | null>(null);
    const [editPlannedAmount, setEditPlannedAmount] = useState('');
    const [editErrors, setEditErrors] = useState<LineFormErrors>({});
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Filter / group controls
    const [filterGlAccount, setFilterGlAccount] = useState<SearchableSelectOption>(ALL_GL_ACCOUNTS_OPTION);
    const [groupByGl, setGroupByGl] = useState(false);

    // "+ Add new GL Account" quick-create modal -- still writes into the same
    // core.GLAccount Chart-of-Accounts table (via the existing /gl-accounts/
    // endpoint), it just gives Finance/PM a way to add an account from here
    // instead of needing Django admin when the Chart of Accounts is empty.
    const [isGlAccountModalOpen, setIsGlAccountModalOpen] = useState(false);
    const [newAccountCode, setNewAccountCode] = useState('');
    const [newAccountName, setNewAccountName] = useState('');
    const [newAccountType, setNewAccountType] = useState('');
    const [newAccountErrors, setNewAccountErrors] = useState<GLAccountFormErrors>({});
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);

    const fetchLines = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<BudgetLine[]>(`/projects/${projectId}/budget/lines/`);
            setLines(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch budget lines:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    const fetchGlAccounts = useCallback(async () => {
        try {
            const res = await axiosInstance.get<GLAccountOption[]>('/gl-accounts/?active_only=true');
            setGlAccounts(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch GL accounts:', error);
        }
    }, []);

    useEffect(() => {
        fetchLines();
        fetchGlAccounts();
    }, [fetchLines, fetchGlAccounts]);

    // Real GL Accounts only -- used for Add/Edit, where a value MUST come
    // from the accounting Chart of Accounts (no free text allowed).
    const glAccountOptions: SearchableSelectOption[] = useMemo(
        () => glAccounts.map((a) => ({
            id: a.id,
            label: `${a.code} - ${a.name}`,
            sublabel: formatAccountType(a.account_type),
        })),
        [glAccounts]
    );

    // Filter dropdown additionally offers "All GL Accounts".
    const filterOptions: SearchableSelectOption[] = useMemo(
        () => [ALL_GL_ACCOUNTS_OPTION, ...glAccountOptions],
        [glAccountOptions]
    );

    const openGlAccountModal = () => {
        setNewAccountCode('');
        setNewAccountName('');
        setNewAccountType('');
        setNewAccountErrors({});
        setIsGlAccountModalOpen(true);
    };

    const handleCreateGlAccount = async () => {
        const errors: GLAccountFormErrors = {};
        if (!newAccountCode.trim()) errors.code = 'Account code is required.';
        if (!newAccountName.trim()) errors.name = 'Account name is required.';
        if (!newAccountType) errors.accountType = 'Account type is required.';
        setNewAccountErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsCreatingAccount(true);
        try {
            const res = await axiosInstance.post('/gl-accounts/', {
                code: newAccountCode.trim(),
                name: newAccountName.trim(),
                account_type: newAccountType,
                is_active: true,
            });
            toast.success('GL Account created');
            await fetchGlAccounts();

            const created = res.data;
            const option: SearchableSelectOption = {
                id: created.id,
                label: `${created.code} - ${created.name}`,
                sublabel: formatAccountType(created.account_type),
            };
            // Drop the new account straight into whichever field was open.
            if (editingLineId !== null) {
                setEditGlAccount(option);
            } else {
                setNewGlAccount(option);
            }
            setIsGlAccountModalOpen(false);
        } catch (error: any) {
            const data = error?.response?.data;
            setNewAccountErrors({
                code: data?.code?.[0],
                name: data?.name?.[0],
                accountType: data?.account_type?.[0],
            });
            toast.error(data?.detail || 'Failed to create GL Account');
        } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleAddLine = async () => {
        const errors = validateLine(description, newGlAccount, plannedAmount);
        setAddErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            await axiosInstance.post(`/projects/${projectId}/budget/lines/`, {
                description: description.trim(),
                gl_account: newGlAccount!.id,
                planned_amount: parseFloat(plannedAmount),
            });
            toast.success('Budget line added');
            setDescription('');
            setNewGlAccount(null);
            setPlannedAmount('');
            setAddErrors({});
            fetchLines();
        } catch (error: any) {
            const data = error?.response?.data;
            setAddErrors(extractServerErrors(data));
            toast.error(data?.detail || 'Failed to add budget line');
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEdit = (line: BudgetLine) => {
        setEditingLineId(line.id);
        setEditDescription(line.description);
        setEditGlAccount({
            id: line.gl_account,
            label: `${line.gl_account_code} - ${line.gl_account_name}`,
            sublabel: formatAccountType(line.gl_account_type),
        });
        setEditPlannedAmount(String(num(line.planned_amount)));
        setEditErrors({});
    };

    const cancelEdit = () => {
        setEditingLineId(null);
        setEditErrors({});
    };

    const handleSaveEdit = async (lineId: number) => {
        const errors = validateLine(editDescription, editGlAccount, editPlannedAmount);
        setEditErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsSavingEdit(true);
        try {
            await axiosInstance.patch(`/projects/${projectId}/budget/lines/${lineId}/`, {
                description: editDescription.trim(),
                gl_account: editGlAccount!.id,
                planned_amount: parseFloat(editPlannedAmount),
            });
            toast.success('Budget line updated');
            setEditingLineId(null);
            fetchLines();
        } catch (error: any) {
            const data = error?.response?.data;
            setEditErrors(extractServerErrors(data));
            toast.error(data?.detail || 'Failed to update budget line');
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleDeleteLine = async (lineId: number) => {
        if (!window.confirm('Remove this budget line?')) return;
        try {
            await axiosInstance.delete(`/projects/${projectId}/budget/lines/${lineId}/`);
            toast.success('Budget line removed');
            if (editingLineId === lineId) cancelEdit();
            setLines((prev) => prev.filter((l) => l.id !== lineId));
        } catch (error) {
            console.error('Failed to remove budget line:', error);
            toast.error('Failed to remove budget line');
        }
    };

    const isAllSelected = filterGlAccount.id === 'all';
    const filteredLines = isAllSelected
        ? lines
        : lines.filter((l) => String(l.gl_account) === String(filterGlAccount.id));

    // Individual lines nested under their GL Account (with a Planned Amount
    // subtotal), for the grouped view.
    const groupedSections = useMemo(() => {
        const map = new Map<number, { code: string; name: string; lines: BudgetLine[]; total: number }>();
        filteredLines.forEach((l) => {
            const existing = map.get(l.gl_account) || {
                code: l.gl_account_code,
                name: l.gl_account_name,
                lines: [] as BudgetLine[],
                total: 0,
            };
            existing.lines.push(l);
            existing.total += num(l.planned_amount);
            map.set(l.gl_account, existing);
        });
        return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [filteredLines]);

    // Grand total lives in the table footer -- derived straight from the
    // filtered lines so it always matches what's on screen.
    const grandTotal = filteredLines.reduce((sum, l) => sum + num(l.planned_amount), 0);

    // Actuals come from the backend's BudgetLine.actual_amount (expenses +
    // paid bills under the line's GL Account), so they exist per GL Account,
    // not per line - every line on the same account reports the same figure.
    // A line shows its own Actual/Variance only when it's the sole line on
    // its GL Account; shared accounts show theirs on the grouped subtotal row.
    const showActuals = true;
    const glKey = (l: { gl_account_code: string; gl_account_name: string }) => `${l.gl_account_code} - ${l.gl_account_name}`;
    const actualByGl = useMemo(
        () => new Map(lines.map((l) => [glKey(l), num(l.actual_amount)])),
        [lines]
    );
    const actualForGl = (key: string) => actualByGl.get(key) ?? 0;
    const linesPerGl = useMemo(() => {
        const counts = new Map<number, number>();
        lines.forEach((l) => counts.set(l.gl_account, (counts.get(l.gl_account) || 0) + 1));
        return counts;
    }, [lines]);
    const totalActual = Array.from(new Set(filteredLines.map(glKey)))
        .reduce((sum, key) => sum + actualForGl(key), 0);

    const formatAmount = (v: string | number) =>
        `${num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const varianceClass = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400');

    // Shared cell paddings: flush with the section edges, like the other
    // Financials tables.
    const TH = 'px-3 py-2 first:pl-0 last:pr-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
    const TD = 'px-3 py-2.5 first:pl-0 last:pr-0';
    const MONEY = 'text-right tabular-nums whitespace-nowrap';

    const renderActualCells = (line: BudgetLine, inGroup: boolean) => {
        if (!showActuals) return null;
        if (inGroup) {
            return (<><td className={TD} /><td className={TD} /></>);
        }
        const shared = (linesPerGl.get(line.gl_account) || 0) > 1;
        if (shared) {
            const hint = 'Actuals are tracked per GL Account - turn on "Group by GL Account" to compare';
            return (
                <>
                    <td className={`${TD} ${MONEY} text-gray-400 dark:text-gray-500`} title={hint}>—</td>
                    <td className={`${TD} ${MONEY} text-gray-400 dark:text-gray-500`} title={hint}>—</td>
                </>
            );
        }
        const actual = actualForGl(glKey(line));
        const variance = num(line.planned_amount) - actual;
        return (
            <>
                <td className={`${TD} ${MONEY} text-gray-700 dark:text-gray-300`}>{formatAmount(actual)}</td>
                <td className={`${TD} ${MONEY} font-medium ${varianceClass(variance)}`}>{formatAmount(variance)}</td>
            </>
        );
    };

    const renderLineRow = (line: BudgetLine, showGlAccountColumn: boolean) => {
        if (editingLineId === line.id) {
            return (
                <tr key={line.id} className="border-b border-gray-100 dark:border-gray-800 bg-blue-50/40 dark:bg-blue-500/5">
                    <td className={`${TD} align-top`}>
                        <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        {editErrors.description && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{editErrors.description}</p>
                        )}
                    </td>
                    {showGlAccountColumn && (
                        <td className={`${TD} align-top`}>
                            <SearchableSelect
                                options={glAccountOptions}
                                value={editGlAccount}
                                onChange={setEditGlAccount}
                                placeholder="Search account..."
                                emptyMessage="No GL Accounts yet"
                            />
                            {editErrors.glAccount && (
                                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{editErrors.glAccount}</p>
                            )}
                            <button
                                type="button"
                                onClick={openGlAccountModal}
                                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1"
                            >
                                + Add new GL Account
                            </button>
                        </td>
                    )}
                    <td className={`${TD} align-top text-right`}>
                        <input
                            type="number"
                            value={editPlannedAmount}
                            onChange={(e) => setEditPlannedAmount(e.target.value)}
                            step="0.01"
                            min="0"
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-white text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        {editErrors.plannedAmount && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 text-left">{editErrors.plannedAmount}</p>
                        )}
                    </td>
                    {showActuals && (<><td className={TD} /><td className={TD} /></>)}
                    <td className={`${TD} align-top`}>
                        <div className="flex items-center justify-end gap-1 pt-1">
                            <button
                                type="button"
                                onClick={() => handleSaveEdit(line.id)}
                                disabled={isSavingEdit}
                                className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50"
                            >
                                {isSavingEdit ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={isSavingEdit}
                                className="px-2 py-1 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </td>
                </tr>
            );
        }

        return (
            <tr key={line.id} className="border-b border-gray-100 dark:border-gray-800/70 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className={`${TD} text-gray-900 dark:text-white`}>
                    <span className={showGlAccountColumn ? '' : 'pl-4 block'}>{line.description}</span>
                </td>
                {showGlAccountColumn && (
                    <td className={`${TD} text-gray-600 dark:text-gray-400 truncate`} title={glKey(line)}>{glKey(line)}</td>
                )}
                <td className={`${TD} ${MONEY} font-medium text-gray-900 dark:text-white`}>{formatAmount(line.planned_amount)}</td>
                {renderActualCells(line, !showGlAccountColumn)}
                <td className={TD}>
                    <div className="flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={() => startEdit(line)}
                            className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                        >
                            Edit
                        </button>
                        <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">|</span>
                        <button
                            type="button"
                            onClick={() => handleDeleteLine(line.id)}
                            className="px-2 py-1 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <section>
            {/* Heading + controls on one row */}
            <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 mb-3">
                <div className="mr-auto">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">Project Budget Lines</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                        {filteredLines.length} {filteredLines.length === 1 ? 'line' : 'lines'} · Planned {formatAmount(grandTotal)}
                    </p>
                </div>
                <div className="w-full sm:w-56">
                    <SearchableSelect
                        options={filterOptions}
                        value={filterGlAccount}
                        onChange={(opt) => setFilterGlAccount(opt || ALL_GL_ACCOUNTS_OPTION)}
                        placeholder="Filter by GL Account..."
                    />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap py-2">
                    <input
                        type="checkbox"
                        checked={groupByGl}
                        onChange={(e) => setGroupByGl(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-700"
                    />
                    Group by GL Account
                </label>
                <button
                    type="button"
                    onClick={() => setIsAddOpen((open) => !open)}
                    aria-expanded={isAddOpen}
                    className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${isAddOpen
                        ? 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                    {isAddOpen ? 'Close' : '+ Add Budget Line'}
                </button>
            </div>

            {/* Add Budget Line -- compact single-row form, collapsed by default */}
            {isAddOpen && (
                <div className="mb-3 px-3 py-3 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        <div className="md:col-span-4">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Employee Cost"
                                className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${addErrors.description ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {addErrors.description && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{addErrors.description}</p>
                            )}
                        </div>
                        <div className="md:col-span-4">
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">GL Account</label>
                                <button
                                    type="button"
                                    onClick={openGlAccountModal}
                                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    + New GL Account
                                </button>
                            </div>
                            <SearchableSelect
                                options={glAccountOptions}
                                value={newGlAccount}
                                onChange={setNewGlAccount}
                                placeholder="Search account..."
                                emptyMessage="No GL Accounts yet"
                            />
                            {addErrors.glAccount && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{addErrors.glAccount}</p>
                            )}
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Planned Amount</label>
                            <input
                                type="number"
                                value={plannedAmount}
                                onChange={(e) => setPlannedAmount(e.target.value)}
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-right tabular-nums text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${addErrors.plannedAmount ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                            />
                            {addErrors.plannedAmount && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{addErrors.plannedAmount}</p>
                            )}
                        </div>
                        <div className="md:col-span-2 md:pt-[22px]">
                            <button
                                type="button"
                                onClick={handleAddLine}
                                disabled={isSubmitting}
                                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Adding...' : 'Add Line'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lines table -- totals live in the footer, no separate summary block */}
            <div className="overflow-x-auto">
                {isLoading ? (
                    <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Loading budget lines...</p>
                ) : filteredLines.length === 0 ? (
                    <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
                        No budget lines yet. Use “+ Add Budget Line” to create one.
                    </p>
                ) : (
                    <table className={`w-full text-sm table-fixed ${showActuals ? 'min-w-[760px]' : 'min-w-[560px]'}`}>
                        <colgroup>
                            <col />
                            {!groupByGl && <col className="w-[26%]" />}
                            <col className="w-40" />
                            {showActuals && <col className="w-36" />}
                            {showActuals && <col className="w-36" />}
                            <col className="w-36" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800">
                                <th className={`${TH} text-left`}>Description</th>
                                {!groupByGl && <th className={`${TH} text-left`}>GL Account</th>}
                                <th className={`${TH} text-right`}>Planned Amount</th>
                                {showActuals && <th className={`${TH} text-right`}>Actual</th>}
                                {showActuals && <th className={`${TH} text-right`}>Variance</th>}
                                <th className={`${TH} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        {groupByGl ? (
                            groupedSections.map((section) => {
                                const key = `${section.code} - ${section.name}`;
                                const actual = actualForGl(key);
                                const variance = section.total - actual;
                                return (
                                    <tbody key={section.code}>
                                        <tr className="border-b border-gray-100 dark:border-gray-800/70">
                                            <td className={`${TD} pt-4 text-xs font-semibold text-gray-800 dark:text-gray-200`}>{key}</td>
                                            <td className={`${TD} pt-4 ${MONEY} text-xs font-semibold text-gray-800 dark:text-gray-200`}>{formatAmount(section.total)}</td>
                                            {showActuals && <td className={`${TD} pt-4 ${MONEY} text-xs font-semibold text-gray-700 dark:text-gray-300`}>{formatAmount(actual)}</td>}
                                            {showActuals && <td className={`${TD} pt-4 ${MONEY} text-xs font-semibold ${varianceClass(variance)}`}>{formatAmount(variance)}</td>}
                                            <td className={TD} />
                                        </tr>
                                        {section.lines.map((line) => renderLineRow(line, false))}
                                    </tbody>
                                );
                            })
                        ) : (
                            <tbody>
                                {filteredLines.map((line) => renderLineRow(line, true))}
                            </tbody>
                        )}
                        <tfoot>
                            <tr className="border-t-2 border-gray-300 dark:border-gray-700">
                                <td colSpan={groupByGl ? 1 : 2} className={`${TD} font-semibold text-gray-900 dark:text-white`}>Total Planned</td>
                                <td className={`${TD} ${MONEY} font-bold text-gray-900 dark:text-white`}>{formatAmount(grandTotal)}</td>
                                {showActuals && <td className={`${TD} ${MONEY} font-semibold text-gray-900 dark:text-white`}>{formatAmount(totalActual)}</td>}
                                {showActuals && <td className={`${TD} ${MONEY} font-bold ${varianceClass(grandTotal - totalActual)}`}>{formatAmount(grandTotal - totalActual)}</td>}
                                <td className={TD} />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* Add new GL Account -- writes into the same core.GLAccount
                Chart-of-Accounts table used everywhere else in the app. */}
            {isGlAccountModalOpen && (
                <div
                    className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setIsGlAccountModalOpen(false)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-base font-semibold text-gray-900 dark:text-white mb-3">Add new GL Account</p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Code</label>
                                <input
                                    type="text"
                                    value={newAccountCode}
                                    onChange={(e) => setNewAccountCode(e.target.value)}
                                    placeholder="e.g. 5000"
                                    className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${newAccountErrors.code ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                                />
                                {newAccountErrors.code && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{newAccountErrors.code}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Name</label>
                                <input
                                    type="text"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                    placeholder="e.g. Employee Expense"
                                    className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${newAccountErrors.name ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                                />
                                {newAccountErrors.name && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{newAccountErrors.name}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Type</label>
                                <select
                                    value={newAccountType}
                                    onChange={(e) => setNewAccountType(e.target.value)}
                                    className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${newAccountErrors.accountType ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                                >
                                    <option value="">Select type</option>
                                    {GL_ACCOUNT_TYPE_CHOICES.map((choice) => (
                                        <option key={choice.value} value={choice.value}>{choice.label}</option>
                                    ))}
                                </select>
                                {newAccountErrors.accountType && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{newAccountErrors.accountType}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setIsGlAccountModalOpen(false)}
                                disabled={isCreatingAccount}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateGlAccount}
                                disabled={isCreatingAccount}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isCreatingAccount ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default BudgetLinesPanel;
