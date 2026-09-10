/**
 * SearchableSelect
 * Lightweight styled combobox used where a plain <select> isn't enough
 * (e.g. picking a person from a list that also needs a source/type badge).
 * No external dropdown library is used anywhere in this project, so this
 * matches the existing "Client"/"Price list" field styling by hand.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface SearchableSelectOption {
    id: number | string;
    label: string;
    sublabel?: string;
}

interface SearchableSelectProps {
    options: SearchableSelectOption[];
    value: SearchableSelectOption | null;
    onChange: (option: SearchableSelectOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
    emptyMessage?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    emptyMessage = 'No options found',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = query
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(query.toLowerCase()) ||
            opt.sublabel?.toLowerCase().includes(query.toLowerCase())
        )
        : options;

    const handleSelect = (option: SearchableSelectOption) => {
        onChange(option);
        setIsOpen(false);
        setQuery('');
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen((prev) => !prev)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2"
            >
                {value ? (
                    <span className="flex items-baseline gap-2 truncate">
                        <span className="text-gray-900 truncate">{value.label}</span>
                        {value.sublabel && (
                            <span className="text-xs text-gray-500 shrink-0">— {value.sublabel}</span>
                        )}
                    </span>
                ) : (
                    <span className="text-gray-400">{placeholder}</span>
                )}
                <svg
                    className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                        {filteredOptions.length === 0 ? (
                            <li className="px-4 py-2 text-sm text-gray-400">{emptyMessage}</li>
                        ) : (
                            filteredOptions.map((option) => (
                                <li key={`${option.id}-${option.sublabel ?? ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(option)}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-baseline gap-2"
                                    >
                                        <span className="text-gray-900 truncate">{option.label}</span>
                                        {option.sublabel && (
                                            <span className="text-xs text-gray-500 shrink-0">— {option.sublabel}</span>
                                        )}
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
