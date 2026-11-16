/**
 * Project Details -> Overview: the project at a glance. Project-to-date money from the same
 * financial summary as the KPI cards; with a date range set, a "selected period" panel from
 * GET /financial-summary/?date_from&date_to (each record by its own date).
 */
import React from 'react';
import { useApiData } from '../../hooks/useApiData';
import { PeriodSummaryCard } from './PeriodSummaryCard';
import { Bar, Card, Line, LoadError, Skeleton, panelLink as link } from './panelParts';
import { num } from '../../utils/projectFinance';
import type { ProjectFinancialSummary } from '../../types/financials.types';
import { formatDate as toDMY } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import { pct, percentText, type ProjectMoney, usedTone } from '../../utils/projectFinance';
import { MILESTONE_STATUS_LABEL } from '../../utils/statusStyles';

interface MilestoneLite { id: number; name: string; status: string; planned_end_date: string | null; is_active?: boolean }

interface Props {
    projectId: string;
    isFixed: boolean;
    /** Internal project: cost breakdown and budget allocation instead of billing and profit. */
    isInternal?: boolean;
    currency: string;
    money: ProjectMoney | null;
    summary: ProjectFinancialSummary | null;
    moneyLoading: boolean;
    moneyError: boolean;
    onRetryMoney: () => void;
    dateFrom: string;
    dateTo: string;
    tasks: { total: number; open: number; overdue: number; done: number; loading: boolean; error: boolean };
    onRetryTasks: () => void;
    onGoTo: (tab: 'Milestones' | 'Invoices' | 'Tasks' | 'Financials' | 'Budget') => void;
}

export const ProjectOverviewPanel: React.FC<Props> = ({ projectId, isFixed, isInternal = false, currency, money, summary, moneyLoading, moneyError, onRetryMoney, dateFrom, dateTo, tasks, onRetryTasks, onGoTo }) => {
    const fmt = (v: number) => formatMoney(v, currency);
    const hasDates = !!(dateFrom || dateTo);
    const milestonesReq = useApiData<MilestoneLite[]>(isFixed ? `/projects/${projectId}/milestones/` : null, {}, 'Failed to load milestones');
    const moneyPlaceholder = moneyError ? <LoadError what="the project figures" onRetry={onRetryMoney} /> : <Skeleton h="h-28" />;
    const milestones = (milestonesReq.data ?? []).filter((m) => m.is_active !== false);
    const today = new Date().toISOString().slice(0, 10);
    const counts = milestones.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});
    const overdueMilestones = milestones.filter((m) => m.planned_end_date && m.planned_end_date < today && !['completed', 'cancelled'].includes(m.status));
    const nextDue = milestones
        .filter((m) => m.planned_end_date && m.planned_end_date >= today && !['completed', 'cancelled'].includes(m.status))
        .sort((a, b) => (a.planned_end_date! < b.planned_end_date! ? -1 : 1))[0];

    const m = money;
    const invoicedPct = m ? pct(m.invoiced, m.plannedBilling) : null;
    const s = summary && summary.engagement_type === 'fixed' ? summary : null;
    const breakdown = s?.cost_breakdown;
    const allocated = num(s?.allocated_to_milestones);
    const approved = num(s?.approved_budget);
    const progress = s?.milestone_progress;

    return (
        <div className="space-y-4">
            {hasDates && (
                <PeriodSummaryCard projectId={projectId} currency={currency} dateFrom={dateFrom} dateTo={dateTo} isInternal={isInternal}
                    action={isInternal
                        ? <button type="button" className={link} onClick={() => onGoTo('Budget')}>Budget →</button>
                        : <button type="button" className={link} onClick={() => onGoTo('Financials')}>Financials →</button>} />
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card title={isInternal ? 'Approved Budget vs Actual Cost' : 'Budget vs Actual Cost'}>
                    {moneyLoading || !m ? moneyPlaceholder : (
                        <>
                            <dl>
                                <Line label={isInternal ? 'Approved budget' : 'Budget'} value={fmt(m.budget)} strong />
                                <Line label="Resources" value={fmt(m.resourceCost)} />
                                <Line label="Expenses & vendor bills" value={fmt(m.otherCost)} />
                                <Line label="Actual cost" value={fmt(m.actualCost)} strong />
                                <Line label="Remaining" value={fmt(m.remainingBudget)} strong tone={m.remainingBudget < 0 ? 'text-red-600 dark:text-red-400' : ''} />
                            </dl>
                            <Bar percent={m.usedPercent} tone={usedTone(m.usedPercent)} label="Budget used" />
                            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{percentText(m.usedPercent)} of budget used</p>
                        </>
                    )}
                </Card>

                {isInternal ? (
                    <>
                        <Card title="Cost Breakdown" action={<button type="button" className={link} onClick={() => onGoTo('Budget')}>Budget →</button>}>
                            {moneyLoading || !m || !s ? moneyPlaceholder : (
                                <dl>
                                    <Line label="Employees" value={fmt(num(breakdown?.employee_cost))} />
                                    <Line label="Freelancers" value={fmt(num(breakdown?.freelancer_cost))} />
                                    <Line label="Vendors / external" value={fmt(num(breakdown?.vendor_resource_cost))} />
                                    <Line label="Expenses" value={fmt(num(s.expenses_amount))} />
                                    <Line label="Vendor bills (paid)" value={fmt(num(s.bills_amount))} />
                                    <Line label="Actual cost" value={fmt(m.actualCost)} strong />
                                </dl>
                            )}
                        </Card>
                        <Card title="Budget Allocation" action={<button type="button" className={link} onClick={() => onGoTo('Budget')}>Budget →</button>}>
                            {moneyLoading || !m || !s ? moneyPlaceholder : (
                                <>
                                    <dl>
                                        <Line label="Allocated to milestones" value={fmt(allocated)} strong />
                                        <Line label="Not allocated" value={fmt(num(s.unallocated_budget))} tone={num(s.unallocated_budget) < 0 ? 'text-red-600 dark:text-red-400' : ''} />
                                        <Line label="Milestones completed" value={progress ? `${progress.completed} of ${progress.total}` : '—'} />
                                        <Line label="Average milestone progress" value={progress?.average_progress != null ? `${progress.average_progress}%` : '—'} />
                                    </dl>
                                    <Bar percent={pct(allocated, approved)} tone="violet" label="Approved budget allocated to milestones" />
                                    <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{percentText(pct(allocated, approved))} of the approved budget allocated</p>
                                </>
                            )}
                        </Card>
                    </>
                ) : (<>
                <Card title="Billing & Collections" action={<button type="button" className={link} onClick={() => onGoTo('Invoices')}>Invoices →</button>}>
                    {moneyLoading || !m ? moneyPlaceholder : (
                        <>
                            <dl>
                                <Line label={isFixed ? 'Contract value (excl. tax)' : 'Planned billing so far'} value={fmt(m.plannedBilling)} strong />
                                <Line label="Invoiced (incl. tax)" value={fmt(m.invoiced)} />
                                <Line label="Received" value={fmt(m.received)} />
                                <Line label="Outstanding" value={fmt(m.outstanding)} strong tone={m.outstanding > 0 ? 'text-amber-700 dark:text-amber-400' : ''} />
                            </dl>
                            <Bar percent={m.collectedPercent} tone="blue" label="Invoiced amount collected" />
                            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                                {percentText(m.collectedPercent)} of invoiced collected{invoicedPct != null ? ` · ${percentText(invoicedPct)} of planned billing invoiced` : ''}
                            </p>
                        </>
                    )}
                </Card>

                <Card title="Profitability">
                    {moneyLoading || !m ? moneyPlaceholder : (
                        <dl>
                            <Line label={isFixed ? 'Invoiced' : 'Revenue (excl. tax)'} value={fmt(isFixed ? m.invoiced : Number((summary as { revenue?: number })?.revenue ?? 0))} />
                            <Line label="Actual cost" value={fmt(m.actualCost)} />
                            <Line label={isFixed ? 'Gross margin' : 'Net profit'} value={fmt(m.margin)} strong tone={m.margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'} />
                            <Line label="Margin" value={percentText(m.marginPercent, 1)} />
                            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                {isFixed ? 'Invoiced amount minus actual cost; shown once something is invoiced.' : 'Billed revenue minus all costs for the months so far.'}
                            </p>
                        </dl>
                    )}
                </Card>
                </>)}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {isFixed ? (
                    <Card title="Milestones" action={<button type="button" className={link} onClick={() => onGoTo('Milestones')}>Milestones →</button>}>
                        {milestonesReq.loading && !milestonesReq.data ? <Skeleton h="h-16" /> : milestonesReq.error ? (
                            <LoadError what="milestones" onRetry={milestonesReq.reload} />
                        ) : milestones.length === 0 ? (
                            <p className="text-[13px] text-gray-500 dark:text-gray-400">No milestones yet.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(MILESTONE_STATUS_LABEL).map(([value, label]) => (
                                        <span key={value} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-[12px] dark:border-gray-700">
                                            <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{counts[value] ?? 0}</span>
                                            <span className="text-gray-500 dark:text-gray-400">{label}</span>
                                        </span>
                                    ))}
                                </div>
                                <dl className="mt-2">
                                    <Line label="Next due" value={nextDue ? `${nextDue.name} · ${toDMY(nextDue.planned_end_date)}` : '—'} />
                                    <Line label="Past due, not completed" value={overdueMilestones.length} tone={overdueMilestones.length ? 'text-red-600 dark:text-red-400 font-semibold' : ''} />
                                </dl>
                            </>
                        )}
                    </Card>
                ) : (
                    <Card title="Monthly billing" action={<button type="button" className={link} onClick={() => onGoTo('Financials')}>Financials →</button>}>
                        {summary && summary.engagement_type === 'time_and_material' ? (
                            <dl>
                                <Line label="Months so far" value={summary.months} />
                                <Line label="Months invoiced" value={summary.months_invoiced} />
                                <Line label="Months paid" value={summary.months_paid} />
                                <Line label="Monthly billing" value={fmt(Number(summary.monthly_revenue) || 0)} />
                            </dl>
                        ) : moneyError ? <LoadError what="the monthly billing figures" onRetry={onRetryMoney} /> : <Skeleton h="h-16" />}
                    </Card>
                )}

                <Card title="Tasks (from the Help Desk)" action={<button type="button" className={link} onClick={() => onGoTo('Tasks')}>Tasks →</button>}>
                    {tasks.loading ? <Skeleton h="h-16" /> : tasks.error ? (
                        <div role="alert" className="text-[13px] text-gray-600 dark:text-gray-400">
                            The Help Desk server couldn’t be reached.{' '}
                            <button type="button" className={link} onClick={onRetryTasks}>Try again</button>
                        </div>
                    ) : (
                        <dl>
                            <Line label="All tasks" value={tasks.total} />
                            <Line label="Open" value={tasks.open} />
                            <Line label="Overdue" value={tasks.overdue} tone={tasks.overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''} />
                            <Line label="Completed" value={tasks.done} />
                        </dl>
                    )}
                </Card>
            </div>
        </div>
    );
};
