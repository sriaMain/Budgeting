/**
 * Project Details -> Overview: the project at a glance. Project-to-date money from the same
 * financial summary as the KPI cards; with a date range set, a "selected period" panel from
 * GET /financial-summary/?date_from&date_to (each record by its own date).
 */
import React from 'react';
import { useApiData } from '../../hooks/useApiData';
import { PeriodSummaryCard } from './PeriodSummaryCard';
import type { ProjectFinancialSummary } from '../../types/financials.types';
import { formatDate as toDMY } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import { pct, percentText, type ProjectMoney, usedTone } from '../../utils/projectFinance';
import { MILESTONE_STATUS_LABEL } from '../../utils/statusStyles';

interface MilestoneLite { id: number; name: string; status: string; planned_end_date: string | null; is_active?: boolean }

interface Props {
    projectId: string;
    isFixed: boolean;
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
    onGoTo: (tab: 'Milestones' | 'Invoices' | 'Tasks' | 'Financials') => void;
}

const Card: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{title}</h3>
            {action}
        </div>
        {children}
    </section>
);

const Line: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
        <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'} ${tone ?? ''}`}>{value}</dd>
    </div>
);

const Bar: React.FC<{ percent: number | null; tone: 'green' | 'amber' | 'risk' | 'blue'; label: string }> = ({ percent, tone, label }) => (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, percent ?? 0)))}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-full rounded-full ${tone === 'green' ? 'bg-green-600' : tone === 'amber' ? 'bg-amber-500' : tone === 'risk' ? 'bg-red-600' : 'bg-blue-600'}`}
            style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
    </div>
);

const link = 'text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400';

const Skeleton: React.FC<{ h: string }> = ({ h }) => <div className={`${h} animate-pulse rounded bg-gray-100 dark:bg-gray-800`} />;

/** A failed request: say so (never show it as "nothing here") and offer a retry. */
const LoadError: React.FC<{ what: string; onRetry: () => void }> = ({ what, onRetry }) => (
    <div role="alert" className="text-[13px] text-gray-600 dark:text-gray-400">
        Couldn’t load {what}. The server or database didn’t respond in time.{' '}
        <button type="button" className={link} onClick={onRetry}>Try again</button>
    </div>
);

export const ProjectOverviewPanel: React.FC<Props> = ({ projectId, isFixed, currency, money, summary, moneyLoading, moneyError, onRetryMoney, dateFrom, dateTo, tasks, onRetryTasks, onGoTo }) => {
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

    return (
        <div className="space-y-4">
            {hasDates && (
                <PeriodSummaryCard projectId={projectId} currency={currency} dateFrom={dateFrom} dateTo={dateTo}
                    action={<button type="button" className={link} onClick={() => onGoTo('Financials')}>Financials →</button>} />
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card title="Budget vs Actual Cost">
                    {moneyLoading || !m ? moneyPlaceholder : (
                        <>
                            <dl>
                                <Line label="Budget" value={fmt(m.budget)} strong />
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
