
import React from 'react';
import { Check } from 'lucide-react';

interface PasswordRequirementsProps {
  password: string;
}

interface Requirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

const requirements: Requirement[] = [
  { id: 'length', label: 'Password must be between 8 to 32 characters', test: (p) => p.length >= 8 && p.length <= 32 },
  { id: 'upper', label: 'Must contain an uppercase character', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'Must contain a number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'Must contain one special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password }) => {
  return (
    <div className="space-y-3 py-2">
      {requirements.map((req) => {
        const isValid = req.test(password);
        return (
          <div 
            key={req.id} 
            className={`
              flex items-center space-x-3 text-sm transition-all duration-300 ease-out
              ${isValid ? 'text-gray-800' : 'text-gray-400'}
            `}
          >
            <div className={`
              flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 border
              ${isValid 
                ? 'bg-blue-600 border-blue-600 text-white scale-100' 
                : 'bg-transparent border-gray-300 text-transparent scale-95'
              }
            `}>
              <Check size={12} strokeWidth={3.5} />
            </div>
            <span className="leading-tight">{req.label}</span>
          </div>
        );
      })}
    </div>
  );
};
