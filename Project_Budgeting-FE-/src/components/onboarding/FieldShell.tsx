import React from 'react';
import { ERROR_TEXT_CLASS, HINT_TEXT_CLASS, LABEL_CLASS } from './fieldStyles';

interface FieldShellProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + error/hint, with the same spacing as InputField. */
export const FieldShell: React.FC<FieldShellProps> = ({ label, htmlFor, required, optional, error, hint, className = '', children }) => (
  <div className={`w-full mb-5 ${className}`}>
    {label && (
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
        {required && <span className="text-red-500"> *</span>}
        {optional && <span className="ml-1 normal-case font-normal tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>}
      </label>
    )}
    {children}
    {error ? (
      <p id={htmlFor ? `${htmlFor}-error` : undefined} className={ERROR_TEXT_CLASS} role="alert">{error}</p>
    ) : hint ? (
      <div className={HINT_TEXT_CLASS}>{hint}</div>
    ) : null}
  </div>
);
