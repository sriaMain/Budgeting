/**
 * SearchableSelect
 * Lightweight styled combobox used where a plain <select> isn't enough
 * (e.g. picking a person from a list that also needs a source/type badge).
 * No external dropdown library is used anywhere in this project, so this
 * matches the existing "Client"/"Price list" field styling by hand.
 *
 * Opt-in extras (existing callers are unaffected): `size` for the 40px / 36px
 * dense-form heights, `invalid` for an error border, `id` / `ariaLabel` so a
 * <label htmlFor> can name it, and `portal` to float the list over its
 * surroundings - needed inside scrolling containers such as a table, which
 * would otherwise clip it.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
    id?: string;
    ariaLabel?: string;
    invalid?: boolean;
    size?: 'default' | 'md' | 'sm';
    portal?: boolean;
}

const TRIGGER_SIZE = {
    default: 'px-4 py-2.5 rounded-lg',
    md: 'h-10 px-3 text-sm rounded-md',
    sm: 'h-9 px-2.5 text-sm rounded-md',
};

const MENU_MAX_HEIGHT = 280; // search box + list (max-h-56)

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    emptyMessage = 'No options found',
    id,
    ariaLabel,
    invalid = false,
    size = 'default',
    portal = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = () => {
        setIsOpen(false);
        setQuery('');
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setIsOpen(false);
            setQuery('');
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Portal mode: pin the list to the trigger (below it, or above when there's no room) and
    // follow it while anything scrolls.
    useLayoutEffect(() => {
        if (!portal || !isOpen) return;
        const place = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const below = window.innerHeight - rect.bottom;
            const openUp = below < MENU_MAX_HEIGHT && rect.top > below;
            setMenuStyle({
                position: 'fixed',
                left: rect.left,
                width: Math.max(rect.width, 240),
                ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [portal, isOpen]);

    const filteredOptions = query
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(query.toLowerCase()) ||
            opt.sublabel?.toLowerCase().includes(query.toLowerCase())
        )
        : options;

    const handleSelect = (option: SearchableSelectOption) => {
        onChange(option);
        close();
        triggerRef.current?.focus();
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const option = filteredOptions[activeIndex];
            if (option) handleSelect(option);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
            triggerRef.current?.focus();
        } else if (e.key === 'Tab') {
            close();
        }
    };

    const triggerBorder = invalid
        ? 'border-red-500 focus:ring-red-500 dark:border-red-500'
        : size === 'default'
            ? 'border-gray-300 focus:ring-blue-600 dark:border-gray-700 dark:focus:ring-violet-500'
            : 'border-gray-300 focus:border-teal-600 focus:ring-teal-600 dark:border-gray-700 dark:focus:ring-violet-500';
    const focusRing = size === 'default' ? 'focus:ring-2' : 'focus:ring-1';
    const listboxId = id ? `${id}-listbox` : undefined;

    const menu = isOpen && (
        <div
            ref={menuRef}
            style={portal ? menuStyle : undefined}
            className={`${portal ? 'z-50' : 'absolute z-20 mt-1 w-full'} bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40`}
        >
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search..."
                    aria-label="Search options"
                    aria-controls={listboxId}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                />
            </div>
            <ul id={listboxId} role="listbox" className="max-h-56 overflow-y-auto py-1">
                {filteredOptions.length === 0 ? (
                    <li className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500">{emptyMessage}</li>
                ) : (
                    filteredOptions.map((option, index) => (
                        <li key={`${option.id}-${option.sublabel ?? ''}`} role="option" aria-selected={value?.id === option.id}>
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => handleSelect(option)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`w-full text-left px-4 py-2 flex items-baseline gap-2 ${size === 'default' ? '' : 'text-sm'} ${index === activeIndex ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <span className="text-gray-900 truncate dark:text-gray-100">{option.label}</span>
                                {option.sublabel && (
                                    <span className="text-xs text-gray-500 shrink-0 dark:text-gray-400">— {option.sublabel}</span>
                                )}
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                disabled={disabled}
                onClick={() => { setIsOpen((prev) => !prev); setActiveIndex(0); }}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                className={`w-full ${TRIGGER_SIZE[size]} bg-white border text-left focus:outline-none ${focusRing} ${triggerBorder} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2 dark:bg-gray-800`}
            >
                {value ? (
                    <span className="flex items-baseline gap-2 truncate">
                        <span className="text-gray-900 truncate dark:text-gray-100">{value.label}</span>
                        {value.sublabel && (
                            <span className="text-xs text-gray-500 shrink-0 dark:text-gray-400">— {value.sublabel}</span>
                        )}
                    </span>
                ) : (
                    <span className="text-gray-400 truncate dark:text-gray-500">{placeholder}</span>
                )}
                <svg
                    className={`${size === 'default' ? 'w-5 h-5' : 'w-4 h-4'} text-gray-400 shrink-0 transition-transform dark:text-gray-500 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {portal && menu ? createPortal(menu, document.body) : menu}
        </div>
    );
};
