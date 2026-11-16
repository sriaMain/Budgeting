/** Small building blocks shared by the Project Details panels (Overview, Budget, Financials, Reports). */
import React from 'react';

export const panelLink = 'text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400';

export const Card: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{title}</h3>
            {action}
        </div>
        {children}
    </section>
);

export const Line: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
        <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'} ${tone ?? ''}`}>{value}</dd>
    </div>
);

export type BarTone = 'green' | 'amber' | 'risk' | 'blue' | 'violet';
const BAR_COLOUR: Record<BarTone, string> = {
    green: 'bg-green-600', amber: 'bg-amber-500', risk: 'bg-red-600', blue: 'bg-blue-600', violet: 'bg-violet-600',
};

export const Bar: React.FC<{ percent: number | null; tone: BarTone; label: string; className?: string }> = ({ percent, tone, label, className = 'mt-2' }) => {
    const width = Math.min(100, Math.max(0, percent ?? 0));
    return (
        <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}
            className={`${className} h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800`}>
            <div className={`h-full rounded-full ${BAR_COLOUR[tone]}`} style={{ width: `${width}%` }} />
        </div>
    );
};

export const Skeleton: React.FC<{ h: string }> = ({ h }) => <div className={`${h} animate-pulse rounded bg-gray-100 dark:bg-gray-800`} />;

/** A failed request: say so (never show it as "nothing here") and offer a retry. */
export const LoadError: React.FC<{ what: string; onRetry: () => void }> = ({ what, onRetry }) => (
    <div role="alert" className="text-[13px] text-gray-600 dark:text-gray-400">
        Couldn’t load {what}. The server or database didn’t respond in time.{' '}
        <button type="button" className={panelLink} onClick={onRetry}>Try again</button>
    </div>
);

/** A labelled figure tile (Budget / Reports headline numbers). */
export const Figure: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone }) => (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums text-gray-900 dark:text-white ${tone ?? ''}`}>{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
);
