import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useCountries } from '../../hooks/useCountries';
import { findCountry, type CountrySummary } from '../../services/countries';
import { FieldShell } from './FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from './fieldStyles';

interface CountrySelectProps {
  /** Stored value - the country's display name (legacy names / ISO codes are recognised too). */
  value: string;
  onChange: (name: string, country: CountrySummary | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
  /** Show "+91" next to each country (useful where the choice also sets the phone code). */
  showDialCode?: boolean;
  /** Show the local currency next to each country. */
  showCurrency?: boolean;
  allowClear?: boolean;
  id?: string;
  className?: string;
}

/**
 * Searchable country picker (all ISO 3166 countries from /api/countries/), keyboard
 * accessible: type to filter, arrow keys to move, Enter to pick, Escape to close.
 */
export const CountrySelect: React.FC<CountrySelectProps> = ({
  value, onChange, label, required, error, hint, disabled, placeholder = 'Select country',
  showDialCode = false, showCurrency = false, allowClear = false, id, className,
}) => {
  const autoId = useId();
  const controlId = id || `country-${autoId}`;
  const listId = `${controlId}-list`;
  const { countries, loading, error: loadError } = useCountries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => findCountry(countries, value), [countries, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    const qDigits = q.replace(/\D/g, '');
    return countries.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase() === q ||
      c.alpha3.toLowerCase() === q ||
      c.currency_code.toLowerCase() === q ||
      (qDigits && q.startsWith('+') && c.dial_code.replace(/\D/g, '').startsWith(qDigits))
    ).sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)));
  }, [countries, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (c: CountrySummary | null) => {
    onChange(c ? c.name : '', c);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const display = selected ?? (value ? { name: value, flag: '', dial_code: '', currency_code: '' } : null);

  return (
    <FieldShell label={label} htmlFor={controlId} required={required} error={error || (loadError ? 'Could not load the country list - refresh to try again.' : undefined)} hint={hint} className={className}>
      <div className="relative" ref={containerRef}>
        <button
          id={controlId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={!!error}
          onClick={() => {
            setOpen((o) => !o);
            setActive(Math.max(0, selected ? filtered.findIndex((c) => c.code === selected.code) : 0));
          }}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''} flex items-center justify-between gap-2 text-left`}
        >
          {display ? (
            <span className="flex items-center gap-2 min-w-0">
              {display.flag && <span aria-hidden className="text-base leading-none">{display.flag}</span>}
              <span className="truncate">{display.name}</span>
              {showDialCode && display.dial_code && <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{display.dial_code}</span>}
              {showCurrency && display.currency_code && <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{display.currency_code}</span>}
              {!selected && countries.length > 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">not a recognised country</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">{loading ? 'Loading countries…' : placeholder}</span>
          )}
          <span className="flex items-center gap-1 shrink-0">
            {allowClear && value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear country"
                onClick={(e) => {
                  e.stopPropagation();
                  pick(null);
                }}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full min-w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700 dark:shadow-black/40">
            <div className="p-2 border-b border-gray-100 dark:border-gray-700 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search country, code, currency or +dial code"
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].code}` : undefined}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500"
              />
            </div>
            <ul id={listId} ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500">No matching country</li>
              ) : (
                filtered.map((c, i) => (
                  <li
                    key={c.code}
                    id={`${listId}-${c.code}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected?.code === c.code}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                      i === active ? 'bg-blue-50 dark:bg-violet-500/15' : ''
                    } ${selected?.code === c.code ? 'font-semibold' : ''}`}
                  >
                    <span aria-hidden className="text-base leading-none w-5">{c.flag}</span>
                    <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{c.name}</span>
                    {showDialCode && <span className="text-xs text-gray-500 dark:text-gray-400">{c.dial_code}</span>}
                    {showCurrency && c.currency_code && <span className="text-xs text-gray-500 dark:text-gray-400 w-9 text-right">{c.currency_code}</span>}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
};
