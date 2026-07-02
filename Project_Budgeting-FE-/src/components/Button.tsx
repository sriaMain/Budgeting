import React from 'react';
import { LoaderIcon } from './Icons';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  isLoading, 
  variant = 'primary', 
  className = '', 
  disabled,
  ...props 
}) => {
  const baseStyles = "w-full py-3.5 px-6 rounded-lg font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-brand-800 hover:bg-brand-900 text-white focus:ring-brand-800 shadow-md hover:shadow-lg",
    secondary: "bg-transparent text-brand-800 hover:bg-blue-50 focus:ring-brand-800",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <LoaderIcon className="w-5 h-5" />}
      {children}
    </button>
  );
};