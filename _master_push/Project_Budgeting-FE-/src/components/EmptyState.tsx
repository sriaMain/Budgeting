import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-4 dark:bg-gray-800 dark:text-gray-500">
      {icon ?? <Inbox size={22} />}
    </div>
    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-500 max-w-sm dark:text-gray-400">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
