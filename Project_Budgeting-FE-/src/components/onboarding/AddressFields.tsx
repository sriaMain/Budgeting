import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useCountryConfig } from '../../hooks/useCountries';
import { lookupPostalCode, type PostalDetails } from '../../services/countries';
import { validatePostalCode } from '../../utils/countryRules';
import type { AddressErrors, AddressValue } from './addressForm';
import { CountrySelect } from './CountrySelect';
import { FieldShell } from './FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from './fieldStyles';

interface AddressFieldsProps {
  idPrefix: string;
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  /** Stored country name - drives labels, postal format and the lookup provider. */
  country: string;
  /** When given, a country picker is rendered as part of the address. */
  onCountryChange?: (name: string) => void;
  errors?: AddressErrors;
  disabled?: boolean;
  /** Line 1 + city (+ postal code where the country uses one) required. */
  required?: boolean;
  showDistrict?: boolean;
  showLandmark?: boolean;
  line1Label?: string;
}

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading'; country: string }
  | { kind: 'found'; country: string; data: PostalDetails; summary: string; conflict: Partial<AddressValue> | null }
  | { kind: 'miss'; country: string; message: string; unavailable: boolean };

const same = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/**
 * Country-aware address block. A valid postal code triggers a lookup (India Post, postcodes.io
 * or Zippopotam via the backend) that fills only EMPTY city / district / state fields; values
 * the user already typed are replaced only after they confirm. A failed or empty lookup leaves
 * every field editable and untouched.
 */
export const AddressFields: React.FC<AddressFieldsProps> = ({
  idPrefix, value, onChange, country, onCountryChange, errors = {}, disabled, required, showDistrict, showLandmark, line1Label,
}) => {
  const { config } = useCountryConfig(country);
  const postal = config?.address.postal;
  const [rawLookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [postalTouched, setPostalTouched] = useState(false);
  const requestId = useRef(0);
  const lastLooked = useRef('');
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  // A lookup belongs to the country it ran for - switching country hides it.
  const lookup: LookupState = rawLookup.kind !== 'idle' && rawLookup.country === config?.code ? rawLookup : { kind: 'idle' };
  const conflict = lookup.kind === 'found' ? lookup.conflict : null;
  const setConflict = (next: Partial<AddressValue> | null) =>
    setLookup((l) => (l.kind === 'found' ? { ...l, conflict: next } : l));

  const postalError = errors.postal_code || (postalTouched ? validatePostalCode(value.postal_code, config, required ? undefined : false) : '');

  const runLookup = async (code: string, force = false) => {
    if (!config || !postal?.lookup || !code.trim()) return;
    const key = `${config.code}:${code.trim().toUpperCase()}`;
    if (!force && key === lastLooked.current) return;
    lastLooked.current = key;
    const id = ++requestId.current;
    const countryCode = config.code;
    setLookup({ kind: 'loading', country: countryCode });
    const result = await lookupPostalCode(countryCode, code);
    if (id !== requestId.current) return; // a newer lookup superseded this one
    if (!result.found) {
      setLookup({ kind: 'miss', country: countryCode, message: result.message, unavailable: result.unavailable });
      return;
    }
    const d = result.data;
    const found: Partial<AddressValue> = { city: d.city, state: d.state };
    if (showDistrict) found.district = d.district;
    const current = valueRef.current;
    const fill: Partial<AddressValue> = {};
    const replace: Partial<AddressValue> = {};
    (Object.keys(found) as (keyof AddressValue)[]).forEach((k) => {
      const next = found[k];
      if (!next) return;
      if (!current[k]?.trim()) fill[k] = next;
      else if (!same(current[k], next)) replace[k] = next;
    });
    if (Object.keys(fill).length) onChange(fill);
    setLookup({
      kind: 'found',
      country: countryCode,
      data: d,
      summary: [d.city, d.district && d.district !== d.city ? d.district : '', d.state].filter(Boolean).join(', '),
      conflict: Object.keys(replace).length ? replace : null,
    });
  };

  // Auto-lookup once the code is complete and valid for the country.
  useEffect(() => {
    if (!config || !postal?.lookup) return;
    const code = value.postal_code.trim();
    if (!code || validatePostalCode(code, config, true)) return;
    const t = window.setTimeout(() => void runLookup(code), 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postal_code, config?.code]);

  const field = (key: keyof AddressValue, label: string, opts: { required?: boolean; placeholder?: string; list?: string; autoComplete?: string } = {}) => (
    <FieldShell label={label} htmlFor={`${idPrefix}-${key}`} required={opts.required} error={errors[key]}>
      <input
        id={`${idPrefix}-${key}`}
        value={value[key] ?? ''}
        disabled={disabled}
        list={opts.list}
        autoComplete={opts.autoComplete}
        placeholder={opts.placeholder}
        onChange={(e) => onChange({ [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        className={`${INPUT_CLASS} ${errors[key] ? INPUT_ERROR_CLASS : ''}`}
      />
    </FieldShell>
  );

  const localities = lookup.kind === 'found' ? lookup.data.localities : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
      {onCountryChange && (
        <div className="md:col-span-2">
          <CountrySelect
            id={`${idPrefix}-country`}
            label="Country"
            required={required}
            value={country}
            onChange={(name) => onCountryChange(name)}
            error={errors.country}
            disabled={disabled}
          />
        </div>
      )}
      <div className="md:col-span-2">
        {field('line1', line1Label || 'Address line 1', { required, placeholder: 'Building, street', autoComplete: 'address-line1' })}
      </div>
      <div className="md:col-span-2">
        {field('line2', 'Address line 2', {
          placeholder: config?.is_india ? 'Area / locality' : 'Apartment, suite, area (optional)',
          list: localities.length ? `${idPrefix}-localities` : undefined,
          autoComplete: 'address-line2',
        })}
        {localities.length > 0 && (
          <datalist id={`${idPrefix}-localities`}>
            {localities.map((l) => <option key={l} value={l} />)}
          </datalist>
        )}
      </div>

      {postal?.has_postal_code !== false ? (
        <FieldShell
          label={postal?.label || 'Postal code'}
          htmlFor={`${idPrefix}-postal_code`}
          required={required && (postal?.required ?? false)}
          error={postalError}
          hint={postal?.example ? `e.g. ${postal.example}${postal.lookup ? ' - city and state are filled in automatically' : ''}` : undefined}
        >
          <div className="relative">
            <input
              id={`${idPrefix}-postal_code`}
              value={value.postal_code}
              disabled={disabled}
              autoComplete="postal-code"
              onChange={(e) => onChange({ postal_code: config?.code === 'IN' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value.slice(0, 12) })}
              onBlur={() => setPostalTouched(true)}
              aria-invalid={!!postalError}
              className={`${INPUT_CLASS} ${postalError ? INPUT_ERROR_CLASS : ''} ${postal?.lookup ? 'pr-11' : ''}`}
            />
            {postal?.lookup && (
              <button
                type="button"
                disabled={disabled || !value.postal_code.trim() || lookup.kind === 'loading'}
                onClick={() => void runLookup(value.postal_code, true)}
                title="Look up this postal code"
                aria-label="Look up this postal code"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-500 hover:bg-gray-200/60 disabled:opacity-40 dark:hover:bg-gray-700"
              >
                {lookup.kind === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            )}
          </div>
        </FieldShell>
      ) : (
        <div className="mb-5 text-xs text-gray-500 dark:text-gray-400 self-end pb-3">
          {config?.name} does not use postal codes.
        </div>
      )}
      {field('city', 'City / Town', { required, autoComplete: 'address-level2' })}
      {showDistrict && field('district', 'District')}
      {field('state', config?.address.state_label || 'State / Province / Region', { autoComplete: 'address-level1' })}
      {showLandmark && field('landmark', 'Landmark')}

      {lookup.kind !== 'idle' && (
        <div className="md:col-span-2 -mt-2 mb-5 space-y-2" aria-live="polite">
          {lookup.kind === 'loading' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up {postal?.label || 'postal code'}…
            </p>
          )}
          {lookup.kind === 'found' && !conflict && (
            <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> {lookup.summary} <span className="text-gray-400">· {lookup.data.source}</span>
            </p>
          )}
          {lookup.kind === 'miss' && (
            <p className={`text-xs ${lookup.unavailable ? 'text-gray-500 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400'}`}>{lookup.message}</p>
          )}
          {conflict && (
            <div className="text-xs rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
              <p>
                This {postal?.label || 'postal code'} points to{' '}
                {Object.entries(conflict).map(([k, v], i) => (
                  <span key={k}>{i > 0 && ', '}<strong>{v}</strong> ({k === 'state' ? (config?.address.state_label || 'state').toLowerCase() : k})</span>
                ))}
                , which differs from what you entered.
              </p>
              <div className="mt-1.5 flex gap-3">
                <button type="button" className="font-semibold underline" onClick={() => { onChange(conflict); setConflict(null); }}>
                  Use the looked-up values
                </button>
                <button type="button" className="underline" onClick={() => setConflict(null)}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
