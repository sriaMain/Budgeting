import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useCountries } from '../../hooks/useCountries';
import { findCountry, type CountrySummary } from '../../services/countries';
import { digitsOnly, joinE164, splitE164, validatePhone } from '../../utils/countryRules';
import { FieldShell } from './FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from './fieldStyles';

interface PhoneInputProps {
  /** Stored value - E.164 ("+919876543210"). A legacy bare national number is read against `defaultCountry`. */
  value: string;
  onChange: (e164: string) => void;
  /** The form's country (name or ISO code): picks the dialing code for a new number. */
  defaultCountry?: string;
  label?: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
}

/**
 * International phone field: searchable dialing-code picker (keyed by country, so +1 US and
 * +1 CA stay distinct) + national number. Emits E.164. The dialing code follows the form's
 * country automatically while the number is empty; once a number is typed, a country change
 * only offers to switch the code - it never silently rewrites the number.
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  value, onChange, defaultCountry, label, required, error, hint, disabled, id, className, placeholder,
}) => {
  const autoId = useId();
  const controlId = id || `phone-${autoId}`;
  const { countries } = useCountries();
  const defaultCode = useMemo(() => findCountry(countries, defaultCountry)?.code || '', [countries, defaultCountry]);

  const [dialCountry, setDialCountryState] = useState('');
  const [national, setNationalState] = useState('');
  const [touched, setTouched] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<CountrySummary | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const lastDefault = useRef('');
  // Both effects below run in the same commit on first load; the ref lets the second see what
  // the first just parsed (state updates are not visible until the next render).
  const current = useRef({ dial: '', national: '' });
  const setDialCountry = (dial: string) => {
    current.current.dial = dial;
    setDialCountryState(dial);
  };
  const setNational = (nat: string) => {
    current.current.national = nat;
    setNationalState(nat);
  };

  // Adopt the stored value (initial load / external reset) - but not our own echo.
  useEffect(() => {
    if (!countries.length || value === lastEmitted.current) return;
    const parts = splitE164(value || '', countries, current.current.dial || defaultCode);
    if (parts) {
      setDialCountry(parts.country);
      setNational(parts.national);
    } else {
      setNational(digitsOnly(value || ''));
      setDialCountry(current.current.dial || defaultCode || 'IN');
    }
    lastEmitted.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, countries]);

  // Follow the form's country.
  useEffect(() => {
    if (!defaultCode || defaultCode === lastDefault.current) return;
    const first = !lastDefault.current;
    lastDefault.current = defaultCode;
    const { dial: currentDial, national: currentNational } = current.current;
    if (!currentDial || currentDial === defaultCode || !currentNational) {
      setDialCountry(defaultCode);
      setPendingSwitch(null);
    } else if (!first) {
      setPendingSwitch(countries.find((c) => c.code === defaultCode) ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCode]);

  const dial = countries.find((c) => c.code === dialCountry);

  const emit = (country: CountrySummary | undefined, nat: string) => {
    const e164 = country ? joinE164(country.dial_code, nat) : digitsOnly(nat);
    lastEmitted.current = e164;
    onChange(e164);
  };

  const localError = touched && !error ? validatePhone(national, dial, false) : '';

  return (
    <FieldShell
      label={label}
      htmlFor={controlId}
      required={required}
      error={error || localError}
      hint={hint ?? (dial?.phone_lengths?.length ? `${dial.name}: ${dial.dial_code} followed by ${lengthText(dial.phone_lengths)} digits` : undefined)}
      className={className}
    >
      <div className="flex gap-2">
        <DialCodePicker
          countries={countries}
          value={dial}
          disabled={disabled}
          invalid={!!(error || localError)}
          onPick={(c) => {
            setDialCountry(c.code);
            setPendingSwitch(null);
            emit(c, national);
          }}
        />
        <input
          id={controlId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={national}
          placeholder={placeholder || (dial?.code === 'IN' ? '98765 43210' : 'Phone number')}
          aria-invalid={!!(error || localError)}
          aria-describedby={error || localError ? `${controlId}-error` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            // Pasting a full international number ("+44 20 7946 0958") switches the code too.
            if (raw.trim().startsWith('+')) {
              const parts = splitE164(raw, countries, dialCountry);
              if (parts) {
                const c = countries.find((x) => x.code === parts.country);
                setDialCountry(parts.country);
                setNational(parts.national);
                emit(c, parts.national);
                return;
              }
            }
            const nat = digitsOnly(raw).slice(0, 15);
            setNational(nat);
            emit(dial, nat);
          }}
          onBlur={() => setTouched(true)}
          className={`${INPUT_CLASS} ${error || localError ? INPUT_ERROR_CLASS : ''} flex-1 min-w-0`}
        />
      </div>
      {pendingSwitch && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
          <span>The country changed to {pendingSwitch.name}. Use {pendingSwitch.dial_code} for this number?</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setDialCountry(pendingSwitch.code);
              emit(pendingSwitch, national);
              setPendingSwitch(null);
            }}
          >
            Switch to {pendingSwitch.dial_code}
          </button>
          <button type="button" className="underline" onClick={() => setPendingSwitch(null)}>
            Keep {dial?.dial_code}
          </button>
        </div>
      )}
    </FieldShell>
  );
};

const lengthText = (lengths: number[]) =>
  lengths.length === 1 ? String(lengths[0]) : `${Math.min(...lengths)}–${Math.max(...lengths)}`;

const DialCodePicker: React.FC<{
  countries: CountrySummary[];
  value: CountrySummary | undefined;
  onPick: (c: CountrySummary) => void;
  disabled?: boolean;
  invalid?: boolean;
}> = ({ countries, value, onPick, disabled, invalid }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withCode = countries.filter((c) => c.dial_code);
    if (!q) return withCode;
    const qd = q.replace(/\D/g, '');
    return withCode.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || (qd && c.dial_code.replace(/\D/g, '').startsWith(qd)));
  }, [countries, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (c: CountrySummary) => {
    onPick(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-28 shrink-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-label={value ? `Dialing code ${value.dial_code} (${value.name})` : 'Dialing code'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${INPUT_CLASS} ${invalid ? INPUT_ERROR_CLASS : ''} !px-3 flex items-center justify-between gap-1`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {value?.flag && <span aria-hidden className="leading-none">{value.flag}</span>}
          <span className="text-sm">{value?.dial_code || '+'}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) pick(options[active]); }
                else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
              }}
              placeholder="Country or +code"
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {options.map((c, i) => (
              <li
                key={c.code}
                role="option"
                aria-selected={value?.code === c.code}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${i === active ? 'bg-blue-50 dark:bg-violet-500/15' : ''}`}
              >
                <span aria-hidden className="w-5">{c.flag}</span>
                <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{c.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{c.dial_code}</span>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
