import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, id, ...props }) => {
  const checkboxId = id || label.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <div className="flex items-center">
      <input
        id={checkboxId}
        type="checkbox"
        className="w-4 h-4 text-brand-800 border-gray-300 rounded focus:ring-brand-800 cursor-pointer"
        {...props}
      />
      <label
        htmlFor={checkboxId}
        className="ml-2 block text-sm text-gray-600 cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
  );
};