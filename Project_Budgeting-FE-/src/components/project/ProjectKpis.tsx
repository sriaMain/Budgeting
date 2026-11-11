/**
 * The six Project Details KPI cards. Money comes from the backend financial summary (the same
 * figures as Overview and Financials), hours from the project budget, overdue tasks from the
 * helpdesk. Project-to-date: the filter toolbar never changes these.
 */
import React from 'react';
import { AlertTriangle, Clock, Hourglass, PiggyBank, Receipt, Wallet } from 'lucide-react';
import { MetricCard } from '../StatCard';
import { formatMoney } from '../../utils/format';
import { percentText, type ProjectMoney, usedTone } from '../../utils/projectFinance';

interface Props {
    money: ProjectMoney | null;
    moneyLoading: boolean;
    moneyError: boolean;
    currency: string;
    hours: { total: number; consumed: number; remaining: number; overrun: number };
    tasks: { loading: boolean; error: boolean; overdue: number; open: number };
}

const hm = (hours: number) => {
    const minutes = Math.max(0, Math.round(hours * 60));
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export const ProjectKpis: React.FC<Props> = ({ money, moneyLoading, moneyError, currency, hours, tasks }) => {
    const m = money;
    const fmt = (v: number) => formatMoney(v, currency);
    const unavailable = moneyError ? 'Couldn’t load figures' : undefined;
    const usedPct = m?.usedPercent ?? null;
    const hoursPct = hours.total > 0 ? ((hours.consumed) / hours.total) * 100 : null;
    const over = m ? m.remainingBudget < 0 : false;

    return (
        <section aria-label="Project KPIs" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard
                compact
                label="Total Budget"
                icon={<Wallet size={16} />}
                loading={moneyLoading}
                value={m ? fmt(m.budget) : '—'}
                caption={unavailable ?? (m && m.budget > 0 ? `Planned billing ${fmt(m.plannedBilling)}` : 'No budget set')}
            />
            <MetricCard
                compact
                label="Actual Cost"
                icon={<Receipt size={16} />}
                iconTone={usedTone(usedPct) === 'risk' ? 'risk' : usedTone(usedPct) === 'amber' ? 'amber' : 'blue'}
                loading={moneyLoading}
                value={m ? fmt(m.actualCost) : '—'}
                caption={unavailable ?? (m ? (usedPct == null ? 'No budget to compare' : `${percentText(usedPct)} of budget used`) : undefined)}
                progress={m && usedPct != null ? { percent: usedPct, tone: usedTone(usedPct), label: 'Budget consumed' } : undefined}
            />
            <MetricCard
                compact
                label="Remaining Budget"
                icon={<PiggyBank size={16} />}
                iconTone={over ? 'risk' : 'blue'}
                loading={moneyLoading}
                value={m ? fmt(m.remainingBudget) : '—'}
                caption={unavailable ?? (m
                    ? over
                        ? <span className="font-medium text-red-600 dark:text-red-400">Over budget by {fmt(-m.remainingBudget)}</span>
                        : m.budget > 0 ? `${percentText(m.budget > 0 ? (m.remainingBudget / m.budget) * 100 : null)} left` : '—'
                    : undefined)}
            />
            <MetricCard
                compact
                label="Billable Hours"
                icon={<Clock size={16} />}
                value={hm(hours.total)}
                caption={hours.total > 0 ? `${hm(hours.consumed)} consumed · ${percentText(hoursPct)}` : 'No billable hours set'}
                progress={hoursPct != null ? { percent: hoursPct, tone: usedTone(hoursPct), label: 'Billable hours consumed' } : undefined}
            />
            <MetricCard
                compact
                label="Remaining Hours"
                icon={<Hourglass size={16} />}
                iconTone={hours.overrun > 0 ? 'risk' : 'blue'}
                value={hm(hours.remaining)}
                caption={hours.overrun > 0
                    ? <span className="font-medium text-red-600 dark:text-red-400">Over by {hm(hours.overrun)}</span>
                    : hours.total > 0 ? `${percentText((hours.remaining / hours.total) * 100)} left` : '—'}
            />
            <MetricCard
                compact
                label="Overdue Tasks"
                icon={<AlertTriangle size={16} />}
                iconTone={tasks.overdue > 0 ? 'risk' : 'blue'}
                loading={tasks.loading}
                value={tasks.error ? '—' : tasks.overdue.toLocaleString('en-IN')}
                caption={tasks.error ? 'Helpdesk unavailable' : tasks.overdue > 0
                    ? <span className="font-medium text-red-600 dark:text-red-400">of {tasks.open} open {tasks.open === 1 ? 'task' : 'tasks'}</span>
                    : tasks.open > 0 ? `Nothing overdue · ${tasks.open} open` : 'No open tasks'}
            />
        </section>
    );
};
