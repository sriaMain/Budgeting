/**
 * Pipeline Statistics Component
 * Four KPI cards at the top of the pipeline view. Every value comes from /pipeline-data/'s stats
 * (all quotes, converted to INR by the backend); margin is its expected profit = quote value
 * less the linked project's budget.
 */

import React from 'react';
import type { PipelineStats } from '../types/pipeline.types';
import { formatMoney } from '../utils/format';

interface PipelineStatsProps {
  stats: PipelineStats;
  stageCount: number;
}

interface Kpi {
  label: string;
  value: string;
  exact: string;
  caption: string;
}

export const PipelineStatistics: React.FC<PipelineStatsProps> = ({ stats, stageCount }) => {
  const margin = stats.avg_margin_percentage;
  const kpis: Kpi[] = [
    {
      label: 'Total Quotes',
      value: stats.total_quotes.toLocaleString('en-IN'),
      exact: `${stats.total_quotes} quotes`,
      caption: `across ${stageCount} stages`,
    },
    {
      label: 'Average Quote Value',
      value: formatMoney(stats.average_quote),
      exact: formatMoney(stats.average_quote, 'INR', 2),
      caption: 'INR per quote',
    },
    {
      label: 'Total Quote Value',
      value: formatMoney(stats.total_sum),
      exact: formatMoney(stats.total_sum, 'INR', 2),
      caption: 'INR, incl. tax',
    },
    {
      label: 'Total Margin',
      value: formatMoney(stats.total_margin),
      exact: formatMoney(stats.total_margin, 'INR', 2),
      caption: margin != null ? `INR · ${margin.toLocaleString('en-IN', { maximumFractionDigits: 1 })}% margin` : 'INR',
    },
  ];

  return (
    <section aria-label="Pipeline summary" className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 min-[1024px]:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="@container flex min-h-[104px] min-w-0 flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="text-[13px] font-medium text-gray-500 dark:text-gray-400">{kpi.label}</p>
          {/* Up to the 22/26/28px metric size, but a very long amount (crores) shrinks to fit its
              card instead of being cut off: ~0.6em per character at most. */}
          <p
            title={kpi.exact}
            style={{ fontSize: `min(var(--kpi-size), calc(100cqi / ${kpi.value.length} * 1.6))` }}
            className="truncate font-semibold tabular-nums leading-tight text-gray-900 [--kpi-size:22px] min-[480px]:[--kpi-size:26px] min-[1440px]:[--kpi-size:28px] dark:text-white"
          >
            {kpi.value}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={kpi.caption}>{kpi.caption}</p>
        </div>
      ))}
    </section>
  );
};
