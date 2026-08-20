import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange, className = '' }) => (
  <div className={`border-b border-gray-200 overflow-x-auto ${className}`}>
    <div className="flex gap-1 min-w-max">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            active === tab.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-semibold ${
                active === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  </div>
);
