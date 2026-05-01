import { Eye, EyeOff } from 'lucide-react';
import React, { forwardRef } from 'react';
import { useState } from 'react';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  endIcon?: React.ReactNode;
   togglePassword?: boolean;
   
  onEndIconClick?: () => void;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, endIcon, onEndIconClick,togglePassword,  type = 'text',   className = '', id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
  const isPasswordType = type === 'password';
  const inputType = isPasswordType ? (showPassword ? 'text' : 'password') : type;
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    
    return (
      <div className="w-full mb-5">

          {label && (
        <label
          htmlFor={inputId}
          className="block text-base font-medium text-gray-900 mb-2"
        >
          {label}
        </label>)}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
             type={inputType}
            className={`
              w-full px-4 py-3.5 
              bg-input-bg 
              text-gray-900 
              rounded-lg 
              shadow-[0_2px_5px_rgba(0,0,0,0.03)] 
              placeholder-gray-400 
              focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white 
              transition-all duration-200 ease-in-out
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'ring-2 ring-red-500 bg-red-50' : ''}
              ${endIcon ? 'pr-12' : ''}
              ${className}
            `}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
            {isPasswordType && togglePassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 p-2 rounded-lg transition-colors focus:outline-none focus:bg-gray-100"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
          {endIcon && (
            <button
              type="button"
              onClick={onEndIconClick}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none p-1 rounded-md hover:bg-gray-200/50 transition-colors"
              tabIndex={-1} // Prevent tabbing to this if it's just visibility toggle, usually preferred to keep flow smooth
              aria-label="Toggle visibility"
            >
              {endIcon}
            </button>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1.5 text-sm text-red-600 flex items-center gap-1 animate-fadeIn"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
