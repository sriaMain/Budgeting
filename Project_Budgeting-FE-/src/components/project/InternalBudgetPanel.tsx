/**
 * Internal project -> Budget: the Approved Internal Budget, how much of it is allocated to
 * milestones, and where the money has gone (per milestone and per cost type). All figures come
 * from GET /projects/<id>/financial-summary/ (Project/views.py _internal_summary), the same numbers
 * as the KPI cards and the Milestones tab.
 */
import React from 'react';
import type { FixedFinancialSummary } from '../../types/financials.types';
import { formatMoney } from '../../utils/format';
import { pct, percentText, usedTone } from '../../utils/projectFinance';
import { MILESTONE_STATUS_LABEL } from '../../utils/statusStyles';
import { Bar, Card, Figure, LoadError, Skeleton, panelLink } from './panelParts';
import { num } from '../../utils/projectFinance';

interface Props {
    summary: FixedFinancialSummary | null;
    loading: boolean;
    error: boolean;
    onRetry: () => void;
    currency: string;
    canEdit: boolean;
    onEditBudget: () => void;
    onGoTo: (tab: 'Milestones') => void;
}

const red = 'text-red-600 dark:text-red-400';

export const InternalBudgetPanel: React.FC<Props> = ({ summary: s, loading, error, onRetry, currency, canEdit, onEditBudget, onGoTo }) => {
    const fmt = (v: number) => formatMoney(v, currency);
    if (!s) return error ? <LoadError what="the budget" onRetry={onRetry} /> : loading ? <Skeleton h="h-64" /> : null;

    const approved = num(s.approved_budget ?? s.budget);
    const actual = num(s.actual_cost);
    const allocated = num(s.allocated_to_milestones);
    const unallocated = num(s.unallocated_budget);
    const remaining = num(s.remaining_budget);
    const used = pct(actual, approved);
    const rows = s.milestones ?? [];
    const milestoneActual = rows.reduce((t, r) => t + num(r.actual_cost), 0);
    const projectLevel = Math.max(0, actual - milestoneActual);
    const b = s.cost_breakdown;
    const categories: [string, number][] = [
        ['Employees', num(b?.employee_cost)],
        ['Freelancers', num(b?.freelancer_cost)],
        ['Vendors / external', num(b?.vendor_resource_cost)],
        ['Expenses', num(s.expenses_amount)],
        ['Vendor bills (paid)', num(s.bills_amount)],
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
                <Figure label="Approved Internal Budget" value={fmt(approved)}
                    hint={canEdit ? <button type="button" className={panelLink} onClick={onEditBudget}>Change approved budget</button> : 'Set when the project was created'} />
                <Figure label="Allocated to Milestones" value={fmt(allocated)} hint={`${percentText(pct(allocated, approved))} of approved`} />
                <Figure label="Not Allocated" value={fmt(unallocated)} tone={unallocated < 0 ? red : ''}
                    hint={unallocated < 0 ? 'Milestones exceed the approved budget' : 'Free for new milestones'} />
                <Figure label="Actual Cost" value={fmt(actual)} hint={`${percentText(used)} of approved used`} />
                <Figure label="Remaining Budget" value={fmt(remaining)} tone={remaining < 0 ? red : ''}
                    hint={remaining < 0 ? `Over budget by ${fmt(-remaining)}` : 'Approved − actual cost'} />
            </div>

            <Card title="Budget used">
                <Bar percent={used} tone={usedTone(used)} label="Approved budget used" className="mt-0" />
                <p className="mt-1.5 text-[12px] text-gray-500 dark:text-gray-400">
                    {fmt(actual)} of {fmt(approved)} · {percentText(used, 1)} used{remaining < 0 ? ' · over budget' : ''}
                </p>
            </Card>

            <Card title="Milestone budgets" action={<button type="button" className={panelLink} onClick={() => onGoTo('Milestones')}>Milestones →</button>}>
                {rows.length === 0 ? (
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">No milestones yet - add them on the Milestones tab and give each a share of the approved budget.</p>
                ) : (
                    <div className="-mx-4 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-[13px]">
                            <thead>
                                <tr className="border-y border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400">
                                    <th scope="col" className="px-4 py-2 font-medium">Milestone</th>
                                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                                    <th scope="col" className="px-4 py-2 text-right font-medium">Allocated</th>
                                    <th scope="col" className="px-4 py-2 text-right font-medium">Actual Cost</th>
                                    <th scope="col" className="px-4 py-2 text-right font-medium">Remaining</th>
                                    <th scope="col" className="w-40 px-4 py-2 font-medium">Used</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const p = r.used_percent == null ? null : num(r.used_percent);
                                    return (
                                        <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{r.name}</td>
                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{MILESTONE_STATUS_LABEL[r.status] ?? r.status_display}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{fmt(num(r.budget))}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{fmt(num(r.actual_cost))}</td>
                                            <td className={`px-4 py-2 text-right tabular-nums ${num(r.remaining_budget) < 0 ? red : ''}`}>{fmt(num(r.remaining_budget))}</td>
                                            <td className="px-4 py-2">
                                                <Bar percent={p} tone={usedTone(p)} label={`${r.name}: budget used`} className="mt-0" />
                                                <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{percentText(p)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {projectLevel > 0 && (
                                    <tr className="border-b border-gray-100 dark:border-gray-800">
                                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">Project level (no milestone)</td>
                                        <td className="px-4 py-2 text-gray-500">—</td>
                                        <td className="px-4 py-2 text-right text-gray-500">—</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{fmt(projectLevel)}</td>
                                        <td className="px-4 py-2 text-right text-gray-500">—</td>
                                        <td className="px-4 py-2" />
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 font-semibold dark:bg-gray-800/40">
                                    <td className="px-4 py-2" colSpan={2}>Total</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{fmt(allocated)}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{fmt(actual)}</td>
                                    <td className={`px-4 py-2 text-right tabular-nums ${remaining < 0 ? red : ''}`}>{fmt(remaining)}</td>
                                    <td className="px-4 py-2 text-[11px] font-normal text-gray-500 dark:text-gray-400">vs approved</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Card>

            <Card title="Spent by category">
                <ul className="space-y-2.5">
                    {categories.map(([label, amount]) => {
                        const share = pct(amount, actual);
                        return (
                            <li key={label}>
                                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                                    <span className="text-gray-600 dark:text-gray-300">{label}</span>
                                    <span className="tabular-nums text-gray-900 dark:text-white">{fmt(amount)} <span className="text-[11px] text-gray-500">{percentText(share)}</span></span>
                                </div>
                                <Bar percent={share} tone="blue" label={`${label}: share of actual cost`} className="mt-1" />
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                    Actual cost = resources + expenses + paid vendor bills. Employee and freelancer expense entries are counted once, as resources.
                </p>
            </Card>
        </div>
    );
};
