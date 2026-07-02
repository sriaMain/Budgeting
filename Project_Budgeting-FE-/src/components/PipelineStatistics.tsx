/**
 * Pipeline Statistics Component
 * Displays key metrics at the top of the pipeline view
 */

import React from 'react';
import type { PipelineStats } from '../types/pipeline.types';

interface PipelineStatsProps {
  stats: PipelineStats;
}

export const PipelineStatistics: React.FC<PipelineStatsProps> = ({ stats }) => {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Quotes */}
        <div className="text-center p-4 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
          <div className="text-sm text-gray-500 mb-1">Total</div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total_quotes}</div>
          <div className="text-xs text-gray-400 mt-1">quotes</div>
        </div>

        {/* Average Quote */}
        <div className="text-center p-4 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
          <div className="text-sm text-gray-500 mb-1">Average Quote</div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">
            {formatCurrency(stats.average_quote)}
          </div>
          <div className="text-xs text-gray-400 mt-1">INR</div>
        </div>

        {/* Sum */}
        <div className="text-center p-4 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
          <div className="text-sm text-gray-500 mb-1">Sum</div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">
            {formatCurrency(stats.total_sum)}
          </div>
          <div className="text-xs text-gray-400 mt-1">INR</div>
        </div>

        {/* Margin */}
        <div className="text-center p-4 sm:p-0 bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none">
          <div className="text-sm text-gray-500 mb-1">Margin</div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">
            {formatCurrency(stats.total_margin)}
          </div>
          <div className="text-xs text-gray-400 mt-1">INR</div>
        </div>
      </div>
    </div>
  );
};
