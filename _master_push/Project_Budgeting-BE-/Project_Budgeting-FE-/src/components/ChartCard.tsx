import React from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  loading = false,
  isEmpty = false,
  emptyMessage = 'No data yet',
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 dark:bg-gray-900 dark:border-gray-800 ${className}`}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">{subtitle}</p>}
      </div>

      {loading ? (
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse dark:bg-gray-800" />
      ) : isEmpty ? (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  );
};
