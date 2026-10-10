/**
 * ProjectCostEntriesPanel
 * The project's Expenses tab: regular expenses and vendor bills in one
 * table, read from /projects/<id>/cost-entries/ (the existing Expense and
 * VendorBill records - nothing is duplicated). Actual Cost is never entered
 * or summed here; the Financials tab computes it on the backend, counting a
 * bill-linked expense only once (via its bill).
 *
 * Time & Material projects are costed by month, so they track each entry's
 * month (project start date to end date) instead of GL Account / Milestone.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { ReusableTable, type Column } from './ReusableTable';
import { StatusBadge } from './StatusBadge';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { AddExpenseModal } from './AddExpenseModal';
import { CreateBillModal } from './CreateBillModal';
import { BillDrawer } from './BillDrawer';
import { ExpenseDrawer } from './ExpenseDrawer';
import type { CostEntry } from '../types/financials.types';
import { Drawer } from './Drawer';
import { drawerInputClass, drawerLabelClass, FieldHint, DrawerFormFooter } from './drawerForm';
import { projectMonths, monthForDate } from '../utils/projectMonths';

interface ProjectCostEntriesPanelProps {
    projectId: string;
    currency?: string;
    engagementType?: 'fixed' | 'time_and_material';
    /** Project dates (YYYY-MM-DD) - give a T&M project its months. */
    projectStart?: string | null;
    projectEnd?: string | null;
}

const ALL = '';

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
    paid: { label: 'Paid', variant: 'success' },
    partially_paid: { label: 'Partially Paid', variant: 'warning' },
    unpaid: { label: 'Unpaid', variant: 'neutral' },
};

const selectClass = 'px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

export const ProjectCostEntriesPanel: React.FC<ProjectCostEntriesPanelProps> = ({ projectId, currency = 'INR', engagementType = 'fixed', projectStart, projectEnd }) => {
    const isTM = engagementType === 'time_and_material';
    const months = useMemo(() => (isTM ? projectMonths(projectStart, projectEnd) : []), [isTM, projectStart, projectEnd]);
    const entryMonth = (e: CostEntry) => monthForDate(months, e.date);
    const [entries, setEntries] = useState<CostEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState(ALL);
    const [glFilter, setGlFilter] = useState(ALL);
    const [milestoneFilter, setMilestoneFilter] = useState(ALL);
    const [monthFilter, setMonthFilter] = useState(ALL);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
    const [isAddBillOpen, setIsAddBillOpen] = useState(false);

    // Bill / expense details open in a drawer on this page
    const [openBillId, setOpenBillId] = useState<number | null>(null);
    const [openExpenseId, setOpenExpenseId] = useState<number | null>(null);
    const openEntry = (e: CostEntry) => (e.type === 'bill' ? setOpenBillId(e.id) : setOpenExpenseId(e.id));

    // Tag an existing bill with GL Account / Milestone
    const [tagBill, setTagBill] = useState<CostEntry | null>(null);
    const [tagGl, setTagGl] = useState<SearchableSelectOption | null>(null);
    const [tagMilestone, setTagMilestone] = useState<string>('');
    const [glOptions, setGlOptions] = useState<SearchableSelectOption[]>([]);
    const [milestones, setMilestones] = useState<{ id: number; name: string }[]>([]);
    const [isSavingTags, setIsSavingTags] = useState(false);

    const fetchEntries = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        try {
            const res = await axiosInstance.get<{ entries: CostEntry[] }>(`/projects/${projectId}/cost-entries/`);
            setEntries(res.data.entries || []);
        } catch (error) {
            console.error('Error fetching expenses and bills:', error);
            toast.error('Failed to load expenses');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const openTagModal = async (entry: CostEntry) => {
        setTagBill(entry);
        setTagGl(entry.gl_account ? { id: entry.gl_account, label: entry.gl_account_label || '' } : null);
        setTagMilestone(entry.milestone ? String(entry.milestone) : '');
        try {
            const [gl, ms] = await Promise.all([
                axiosInstance.get<{ id: number; code: string; name: string; account_type?: string }[]>('/gl-accounts/?active_only=true'),
                axiosInstance.get<{ id: number; name: string }[]>(`/projects/${projectId}/milestones/`),
            ]);
            setGlOptions((gl.data || []).map((a) => ({ id: a.id, label: `${a.code} - ${a.name}`, sublabel: a.account_type })));
            setMilestones(ms.data || []);
        } catch (error) {
            console.error('Error loading GL accounts / milestones:', error);
        }
    };

    const saveTags = async () => {
        if (!tagBill) return;
        setIsSavingTags(true);
        try {
            await axiosInstance.patch(`/vendor-bills/${tagBill.id}/tags/`, {
                gl_account_id: tagGl ? tagGl.id : null,
                milestone_id: tagMilestone || null,
            });
            toast.success('Bill updated');
            setTagBill(null);
            fetchEntries();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Failed to update bill');
        } finally {
            setIsSavingTags(false);
        }
    };

    // Filter option lists come from the entries themselves, so they only
    // offer values that actually exist on this project.
    const glFilterOptions = useMemo(() => {
        const map = new Map<number, string>();
        entries.forEach((e) => { if (e.gl_account) map.set(e.gl_account, e.gl_account_label || `#${e.gl_account}`); });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [entries]);

    const milestoneFilterOptions = useMemo(() => {
        const map = new Map<number, string>();
        entries.forEach((e) => { if (e.milestone) map.set(e.milestone, e.milestone_name || `#${e.milestone}`); });
        return Array.from(map.entries());
    }, [entries]);

    const visibleEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = entries.filter((e) => {
            if (typeFilter && e.type !== typeFilter) return false;
            if (glFilter && String(e.gl_account ?? '') !== glFilter) return false;
            if (milestoneFilter && String(e.milestone ?? '') !== milestoneFilter) return false;
            if (monthFilter && monthForDate(months, e.date)?.value !== monthFilter) return false;
            if (dateFrom && e.date < dateFrom) return false;
            if (dateTo && e.date > dateTo) return false;
            if (!q) return true;
            return [e.ref_no, e.description, e.payee, e.gl_account_label, e.milestone_name, e.category]
                .some((v) => v?.toLowerCase().includes(q));
        });
        return rows.sort((a, b) => {
            const cmp = a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [entries, search, typeFilter, glFilter, milestoneFilter, monthFilter, months, dateFrom, dateTo, sortDirection]);

    const hasFilters = !!(search || typeFilter || glFilter || milestoneFilter || monthFilter || dateFrom || dateTo);
    const clearFilters = () => {
        setSearch(''); setTypeFilter(ALL); setGlFilter(ALL); setMilestoneFilter(ALL); setMonthFilter(ALL); setDateFrom(''); setDateTo('');
    };

    const money = (v: number) =>
        `${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const columns: Column<CostEntry>[] = [
        {
            header: 'Date',
            accessor: (e) => <span className="whitespace-nowrap">{fmtDate(e.date)}</span>,
            sortable: true,
            sortKey: 'date',
        },
        {
            header: 'Description',
            accessor: (e) => (
                <div className="min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white">{e.description || '-'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {e.ref_no}
                        {e.linked_bill_no && <> · Counted via bill {e.linked_bill_no}</>}
                        {e.linked_expense_no && <> · Linked expense {e.linked_expense_no}</>}
                    </p>
                </div>
            ),
        },
        {
            header: 'Type',
            accessor: (e) => (
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${e.type === 'bill'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                >
                    {e.type === 'bill' ? 'Bill' : 'Expense'}
                </span>
            ),
        },
        { header: 'Vendor / Payee', accessor: (e) => e.payee || '-' },
        ...(isTM
            ? [{ header: 'Month', accessor: (e: CostEntry) => <span className="whitespace-nowrap">{entryMonth(e)?.label || '-'}</span> }]
            : [
                { header: 'GL Account', accessor: (e: CostEntry) => e.gl_account_label || '-' },
                { header: 'Milestone', accessor: (e: CostEntry) => e.milestone_name || '-' },
            ]),
        {
            header: 'Amount',
            className: 'text-right',
            accessor: (e) => (
                <span className="font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{money(e.amount)}</span>
            ),
        },
        {
            header: 'Status',
            accessor: (e) => {
                const meta = STATUS_META[e.status] || STATUS_META.unpaid;
                return <StatusBadge status={e.status} variant={meta.variant} label={meta.label} />;
            },
        },
        {
            header: 'Actions',
            className: 'text-right',
            accessor: (e) => (
                <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => openEntry(e)}
                        className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                    >
                        View
                    </button>
                    {e.type === 'bill' && !isTM && (
                        <button
                            type="button"
                            onClick={() => openTagModal(e)}
                            className="px-2 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            GL / Milestone
                        </button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Expenses &amp; Bills</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setIsAddBillOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Bill
                    </button>
                    <button
                        onClick={() => setIsAddExpenseOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Expense
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-2">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search expenses & bills..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
                    />
                </div>
                <label className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                    From
                    <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
                </label>
                <label className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                    To
                    <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
                </label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectClass} aria-label="Type">
                    <option value={ALL}>All types</option>
                    <option value="expense">Expenses</option>
                    <option value="bill">Bills</option>
                </select>
                {isTM ? (
                    <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectClass} aria-label="Month">
                        <option value={ALL}>All months</option>
                        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                ) : (
                    <>
                        <select value={glFilter} onChange={(e) => setGlFilter(e.target.value)} className={selectClass} aria-label="GL Account">
                            <option value={ALL}>All GL Accounts</option>
                            {glFilterOptions.map(([id, label]) => <option key={id} value={String(id)}>{label}</option>)}
                        </select>
                        <select value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)} className={selectClass} aria-label="Milestone">
                            <option value={ALL}>All Milestones</option>
                            {milestoneFilterOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
                        </select>
                    </>
                )}
                {hasFilters && (
                    <button type="button" onClick={clearFilters} className="px-2 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        Clear
                    </button>
                )}
            </div>

            <ReusableTable<CostEntry>
                data={visibleEntries}
                columns={columns}
                keyField="key"
                isLoading={isLoading}
                sortKey="date"
                sortDirection={sortDirection}
                onSortChange={(_key, dir) => setSortDirection(dir)}
                onRowClick={openEntry}
                emptyMessage={hasFilters ? 'No expenses or bills match these filters' : 'No expenses or bills for this project yet'}
            />
            {isTM && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Each charge counts in its month's actual cost: an expense by its date, a bill by the date it is paid.
                </p>
            )}

            <AddExpenseModal
                isOpen={isAddExpenseOpen}
                onClose={() => setIsAddExpenseOpen(false)}
                projectId={projectId}
                months={isTM ? months : undefined}
                onExpenseAdded={fetchEntries}
            />
            <CreateBillModal
                isOpen={isAddBillOpen}
                onClose={() => setIsAddBillOpen(false)}
                projectId={projectId}
                currency={currency}
                months={isTM ? months : undefined}
                onBillCreated={fetchEntries}
            />

            <BillDrawer billId={openBillId} onClose={() => setOpenBillId(null)} onChanged={fetchEntries} />
            <ExpenseDrawer expenseId={openExpenseId} onClose={() => setOpenExpenseId(null)} onChanged={fetchEntries} />

            <Drawer
                isOpen={!!tagBill}
                onClose={() => setTagBill(null)}
                title={tagBill ? `Bill ${tagBill.ref_no}` : 'Bill'}
                subtitle="GL Account and Milestone for this bill"
                size="md"
                footer={(
                    <DrawerFormFooter
                        summary={tagBill ? <>Paid so far: <span className="font-semibold text-gray-800 dark:text-gray-200">{money(tagBill.paid_amount)}</span></> : null}
                        onCancel={() => setTagBill(null)}
                        onSubmit={saveTags}
                        submitLabel="Save"
                        isBusy={isSavingTags}
                    />
                )}
            >
                <fieldset disabled={isSavingTags} className="space-y-4">
                    <div>
                        <label className={drawerLabelClass}>GL Account</label>
                        <SearchableSelect options={glOptions} value={tagGl} onChange={setTagGl} placeholder="Search account..." />
                        <FieldHint>The paid amount counts toward the matching budget line.</FieldHint>
                    </div>
                    <div>
                        <label className={drawerLabelClass}>Milestone</label>
                        <select value={tagMilestone} onChange={(e) => setTagMilestone(e.target.value)} className={drawerInputClass}>
                            <option value="">No milestone</option>
                            {milestones.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                        </select>
                        <FieldHint>The paid amount counts in this milestone's Actual Cost.</FieldHint>
                    </div>
                </fieldset>
            </Drawer>
        </div>
    );
};

export default ProjectCostEntriesPanel;
