import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`} role="alert">
    <div className="w-12 h-12 rounded-full bg-risk-50 text-risk-600 flex items-center justify-center mb-4 dark:bg-red-500/10 dark:text-red-400">
      <AlertTriangle size={22} />
    </div>
    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Something went wrong</h3>
    <p className="mt-1 text-sm text-gray-500 max-w-sm dark:text-gray-400">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors dark:text-teal-600 dark:bg-teal-600/10 dark:hover:bg-teal-600/20"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    )}
  </div>
);
