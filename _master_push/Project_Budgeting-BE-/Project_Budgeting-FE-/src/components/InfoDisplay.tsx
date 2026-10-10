/**
 * InfoDisplay Component
 * Reusable component for displaying label-value pairs in forms and detail views
 */

import React from 'react';

interface InfoDisplayProps {
    label: string;
    value: string | React.ReactNode;
    className?: string;
    valueClassName?: string;
}

export const InfoDisplay: React.FC<InfoDisplayProps> = ({
    label,
    value,
    className = '',
    valueClassName = ''
}) => {
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <label className="text-lg font-medium text-gray-600 dark:text-gray-400">
                {label}:
            </label>
            <div className={`text-base text-gray-900 dark:text-gray-100 ${valueClassName}`}>
                {value}
            </div>
        </div>
    );
};
