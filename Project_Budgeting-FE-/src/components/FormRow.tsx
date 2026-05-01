import React from 'react';

interface FormRowProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormRow: React.FC<FormRowProps> = ({ label, required, children }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
      <label className="text-sm font-bold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="sm:col-span-2">
        {children}
      </div>
    </div>
  );
};
