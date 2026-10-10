/**
 * Shared look for form drawers (Add Resource, Add Expense, Add Bill, ...): compact labels and
 * inputs, a footer with an optional summary line on the left and Cancel / primary on the right.
 * Use with the generic <Drawer /> so every add/edit form in the project screens matches.
 */

import React from 'react';

export const drawerInputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800/60';
export const drawerLabelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
export const drawerErrorBorder = 'border-red-400 dark:border-red-500';

export const FieldError: React.FC<{ message?: string }> = ({ message }) =>
    message ? <p className="text-xs text-red-600 dark:text-red-400 mt-1">{message}</p> : null;

export const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{children}</p>
);

/** Highlighted block for the money fields of a form. */
export const DrawerSection: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">{children}</div>
);

/** Segmented choice (e.g. Resource Type, Category group). */
export function SegmentedChoice<T extends string>({ options, value, onChange, disabled }: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
}) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(o.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border disabled:cursor-not-allowed ${value === o.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** Drawer footer: summary on the left, Cancel + primary action on the right. */
export const DrawerFormFooter: React.FC<{
    summary?: React.ReactNode;
    onCancel: () => void;
    onSubmit: () => void;
    submitLabel: string;
    busyLabel?: string;
    isBusy?: boolean;
    submitDisabled?: boolean;
}> = ({ summary, onCancel, onSubmit, submitLabel, busyLabel = 'Saving...', isBusy, submitDisabled }) => (
    <div className="flex items-center justify-between gap-3 w-full">
        <div className="text-xs text-gray-500 dark:text-gray-400 min-w-0">{summary}</div>
        <div className="flex gap-2 flex-shrink-0">
            <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onSubmit}
                disabled={isBusy || submitDisabled}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isBusy ? busyLabel : submitLabel}
            </button>
        </div>
    </div>
);
