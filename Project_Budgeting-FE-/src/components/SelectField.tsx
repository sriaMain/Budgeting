import React, { forwardRef } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full mb-5">
        {label && (
          <label htmlFor={selectId} className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">
            {label.endsWith('*') ? (
              <>{label.slice(0, -1).trimEnd()} <span className="text-red-500">*</span></>
            ) : label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full px-4 py-3.5
            bg-input-bg dark:bg-gray-800
            text-gray-900 dark:text-gray-100
            rounded-lg
            shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none
            focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500
            transition-all duration-200 ease-in-out
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/40' : ''}
            ${className}
          `}
          aria-invalid={!!error}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';
