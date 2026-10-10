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

    // Individual lines nested under their GL Account, for the grouped view.
    const groupedSections = useMemo(() => {
        const map = new Map<number, { code: string; name: string; lines: BudgetLine[] }>();
        filteredLines.forEach((l) => {
            const existing = map.get(l.gl_account) || {
                code: l.gl_account_code,
                name: l.gl_account_name,
                lines: [] as BudgetLine[],
            };
            existing.lines.push(l);
            map.set(l.gl_account, existing);
        });
        return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [filteredLines]);

    // Planned Amount subtotal per GL Account + grand total -- always shown,
    // and always in sync since it's derived straight from `lines`.
    const totalsByAccount = useMemo(() => {
        const map = new Map<number, { code: string; name: string; total: number }>();
        filteredLines.forEach((l) => {
            const existing = map.get(l.gl_account) || {
                code: l.gl_account_code,
                name: l.gl_account_name,
                total: 0,
            };
            existing.total += num(l.planned_amount);
            map.set(l.gl_account, existing);
        });
        return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [filteredLines]);

    const grandTotal = totalsByAccount.reduce((sum, row) => sum + row.total, 0);

    const renderLineRow = (line: BudgetLine, showGlAccountColumn: boolean) => {
        if (editingLineId === line.id) {
            return (
                <tr key={line.id} className="border-b border-gray-100 dark:border-gray-800 bg-blue-50/40">
                    <td className="px-4 py-2 align-top">
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
                        <td className="px-4 py-2 align-top">
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
                    <td className="px-4 py-2 align-top text-right">
                        <input
                            type="number"
                            value={editPlannedAmount}
                            onChange={(e) => setEditPlannedAmount(e.target.value)}
                            step="0.01"
                            min="0"
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        {editErrors.plannedAmount && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 text-left">{editErrors.plannedAmount}</p>
                        )}
                    </td>
                    <td className="px-4 py-2 align-top text-right whitespace-nowrap">
                        <button
                            type="button"
                            onClick={() => handleSaveEdit(line.id)}
                            disabled={isSavingEdit}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 mr-3"
                        >
                            {isSavingEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isSavingEdit}
                            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </td>
                </tr>
            );
        }

        return (
            <tr key={line.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="px-4 py-2 text-gray-900 dark:text-white">{line.description}</td>
                {showGlAccountColumn && (
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{line.gl_account_code} - {line.gl_account_name}</td>
                )}
                <td className="px-4 py-2 text-right text-gray-900 dark:text-white">{num(line.planned_amount).toLocaleString()} {currency}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                        type="button"
                        onClick={() => startEdit(line)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mr-3"
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDeleteLine(line.id)}
                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                        Delete
                    </button>
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-4">
            {/* Add Budget Line */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Budget Line</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
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
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">GL Account</label>
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
                        <button
                            type="button"
                            onClick={openGlAccountModal}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                        >
                            + Add new GL Account
                        </button>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Planned Amount</label>
                        <input
                            type="number"
                            value={plannedAmount}
                            onChange={(e) => setPlannedAmount(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className={`w-full px-3 py-2 bg-white dark:bg-gray-900 border rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${addErrors.plannedAmount ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'}`}
                        />
                        {addErrors.plannedAmount && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{addErrors.plannedAmount}</p>
                        )}
                    </div>
                </div>
                <div className="flex justify-end mt-3">
                    <button
                        type="button"
                        onClick={handleAddLine}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Adding...' : 'Add Line'}
                    </button>
                </div>
            </div>

            {/* Filter / group by GL Account */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-64">
                    <SearchableSelect
                        options={filterOptions}
                        value={filterGlAccount}
                        onChange={(opt) => setFilterGlAccount(opt || ALL_GL_ACCOUNTS_OPTION)}
                        placeholder="Filter by GL Account..."
                    />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 sm:ml-auto">
                    <input
                        type="checkbox"
                        checked={groupByGl}
                        onChange={(e) => setGroupByGl(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-700"
                    />
                    Group by GL Account
                </label>
            </div>

            {/* Lines list */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto">
                {isLoading ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading budget lines...</p>
                ) : filteredLines.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No budget lines yet. Add one above.</p>
                ) : groupByGl ? (
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {groupedSections.map((section) => (
                            <div key={section.code}>
                                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{section.code} - {section.name}</p>
                                </div>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {section.lines.map((line) => renderLineRow(line, false))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th className="px-4 py-2">Description</th>
                                <th className="px-4 py-2">GL Account</th>
                                <th className="px-4 py-2 text-right">Planned Amount</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLines.map((line) => renderLineRow(line, true))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Total Planned Amount, by GL Account, plus grand total */}
            {totalsByAccount.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Total Planned Amount</p>
                    <div className="space-y-1">
                        {totalsByAccount.map((row) => (
                            <div key={row.code} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                                <span>{row.code} - {row.name}</span>
                                <span>{row.total.toLocaleString()} {currency}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                        <span className="text-base font-bold text-gray-900 dark:text-white">{grandTotal.toLocaleString()} {currency}</span>
                    </div>
                </div>
            )}

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
        </div>
    );
};

export default BudgetLinesPanel;
