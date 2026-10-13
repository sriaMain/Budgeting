import React, { useEffect, useRef, useState } from 'react';
import { Building2, Eye, Loader2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCountryConfig } from '../../hooks/useCountries';
import { lookupIfsc, type IfscDetails } from '../../services/countries';
import { IFSC_REGEX, normalizeBankValue, validateBankValues } from '../../utils/countryRules';
import { applicableBankFields, type BankErrors, type BankFormValue } from './bankForm';
import { CountrySelect } from './CountrySelect';
import { FieldShell } from './FieldShell';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from './fieldStyles';

interface BankDetailsFieldsProps {
  idPrefix: string;
  value: BankFormValue;
  onChange: (patch: Partial<BankFormValue>) => void;
  errors?: BankErrors;
  disabled?: boolean;
  /** Masked number already on file (e.g. "XXXXXX4821"); a blank account number keeps it. */
  maskedAccountNumber?: string;
  /** Optional "reveal" for reviewers with permission; resolves to the full number or null. */
  onRevealAccountNumber?: () => Promise<string | null>;
  /** Show the bank-country picker (default true). */
  showBankCountry?: boolean;
  /** Reviewer-set verification status of the account ('not_verified', 'verified', ...). */
  verificationStatus?: string;
  /** Called with the IFSC lookup result (e.g. to fill bank city / state fields elsewhere). */
  onIfscResolved?: (details: IfscDetails) => void;
}

type IfscState =
  | { kind: 'idle' }
  | { kind: 'loading'; code: string }
  | { kind: 'found'; code: string; details: IfscDetails }
  | { kind: 'miss'; code: string; message: string; unavailable: boolean };

const VERIFICATION_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  verified: { label: 'Verified by reviewer', tone: 'ok' },
  rejected: { label: 'Rejected by reviewer', tone: 'bad' },
  under_review: { label: 'Under review', tone: 'warn' },
  documents_uploaded: { label: 'Proof uploaded - awaiting review', tone: 'warn' },
  pending: { label: 'Pending verification', tone: 'neutral' },
  not_verified: { label: 'Not verified', tone: 'neutral' },
  on_hold: { label: 'On hold', tone: 'warn' },
};

const same = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

export const BankDetailsFields: React.FC<BankDetailsFieldsProps> = ({
  idPrefix, value, onChange, errors = {}, disabled, maskedAccountNumber, onRevealAccountNumber, showBankCountry = true,
  verificationStatus, onIfscResolved,
}) => {
  const { config } = useCountryConfig(value.bank_country);
  const bank = config?.bank;
  const applies = applicableBankFields(config);
  const [rawIfsc, setIfsc] = useState<IfscState>({ kind: 'idle' });
  const [conflict, setConflict] = useState<Partial<BankFormValue> | null>(null);
  const [clearedNotice, setClearedNotice] = useState<{ previous: Partial<BankFormValue>; message: string } | null>(null);
  const [replacingAccount, setReplacingAccount] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof BankFormValue, boolean>>>({});
  const requestId = useRef(0);
  const lastIfsc = useRef('');
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  // A lookup result only applies to the IFSC currently in the field.
  const ifsc: IfscState = rawIfsc.kind !== 'idle' && rawIfsc.code === normalizeBankValue('ifsc_code', value.ifsc_code) ? rawIfsc : { kind: 'idle' };

  const showAccountInputs = !maskedAccountNumber || replacingAccount || !!value.account_number;
  const localErrors = validateBankValues(value, config, { partial: true });
  const errorFor = (k: keyof BankFormValue) => errors[k] || (touched[k] ? localErrors[k as keyof typeof localErrors] : undefined);
  const touch = (k: keyof BankFormValue) => () => setTouched((t) => ({ ...t, [k]: true }));

  const runIfscLookup = async (code: string, force = false) => {
    const normalized = normalizeBankValue('ifsc_code', code);
    if (!IFSC_REGEX.test(normalized)) return;
    if (!force && normalized === lastIfsc.current) return;
    lastIfsc.current = normalized;
    const id = ++requestId.current;
    setIfsc({ kind: 'loading', code: normalized });
    setConflict(null);
    const result = await lookupIfsc(normalized);
    if (id !== requestId.current) return;
    if (!result.found) {
      setIfsc({ kind: 'miss', code: normalized, message: result.message, unavailable: result.unavailable });
      return;
    }
    const d = result.data;
    const found: Partial<BankFormValue> = { bank_name: d.bank_name, branch_name: d.branch_name, bank_address: d.full_address || d.bank_address };
    const current = valueRef.current;
    const fill: Partial<BankFormValue> = {};
    const replace: Partial<BankFormValue> = {};
    (Object.keys(found) as (keyof BankFormValue)[]).forEach((k) => {
      const next = found[k];
      if (!next) return;
      if (!current[k]?.trim()) fill[k] = next;
      else if (!same(current[k], next)) replace[k] = next;
    });
    if (Object.keys(fill).length) onChange(fill);
    if (Object.keys(replace).length) setConflict(replace);
    setIfsc({ kind: 'found', code: normalized, details: d });
    onIfscResolved?.(d);
  };

  // Auto-lookup when a complete IFSC has been typed.
  useEffect(() => {
    if (!applies.ifsc_code) return;
    const code = normalizeBankValue('ifsc_code', value.ifsc_code);
    if (!IFSC_REGEX.test(code)) return;
    const t = window.setTimeout(() => void runIfscLookup(code), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.ifsc_code, applies.ifsc_code]);

  const changeCountry = (name: string) => {
    // Identifiers that don't exist in the new country are cleared - with an undo, never silently.
    const previous: Partial<BankFormValue> = { bank_country: value.bank_country };
    const cleared: string[] = [];
    const patch: Partial<BankFormValue> = { bank_country: name };
    const labels: Partial<Record<keyof BankFormValue, string>> = {
      ifsc_code: 'IFSC code', routing_code: 'routing / bank code', iban: 'IBAN', swift_code: 'SWIFT / BIC', account_type: 'account type',
    };
    (Object.keys(labels) as (keyof BankFormValue)[]).forEach((k) => {
      if (value[k]) {
        previous[k] = value[k];
        patch[k] = '';
        cleared.push(labels[k]!);
      }
    });
    onChange(patch);
    setIfsc({ kind: 'idle' });
    setConflict(null);
    lastIfsc.current = '';
    setClearedNotice(cleared.length && value.bank_country ? { previous, message: `Cleared the ${cleared.join(', ')} - these identifiers are specific to ${value.bank_country}.` } : null);
  };

  const text = (key: keyof BankFormValue, label: string, opts: { required?: boolean; placeholder?: string; hint?: React.ReactNode; upper?: boolean; maxLength?: number; autoComplete?: string; className?: string } = {}) => (
    <FieldShell label={label} htmlFor={`${idPrefix}-${key}`} required={opts.required} error={errorFor(key)} hint={opts.hint} className={opts.className}>
      <input
        id={`${idPrefix}-${key}`}
        value={value[key]}
        disabled={disabled}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete ?? 'off'}
        onChange={(e) => onChange({ [key]: opts.upper ? e.target.value.toUpperCase() : e.target.value })}
        onBlur={touch(key)}
        aria-invalid={!!errorFor(key)}
        className={`${INPUT_CLASS} ${errorFor(key) ? INPUT_ERROR_CLASS : ''}`}
      />
    </FieldShell>
  );

  const verification = verificationStatus ? VERIFICATION_LABELS[verificationStatus] ?? { label: verificationStatus.replace(/_/g, ' '), tone: 'neutral' as const } : null;

  return (
    <div className="space-y-1">
      {clearedNotice && (
        <div className="mb-4 text-xs rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300 flex flex-wrap gap-2 items-center">
          <span>{clearedNotice.message}</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              onChange(clearedNotice.previous);
              setClearedNotice(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        {showBankCountry && (
          <CountrySelect
            id={`${idPrefix}-bank_country`}
            label="Bank country"
            required
            value={value.bank_country}
            onChange={(name) => changeCountry(name)}
            error={errors.bank_country}
            disabled={disabled}
            showCurrency
            hint={config ? `Account currency: ${config.currency.code}${config.currency.symbol && config.currency.symbol !== config.currency.code ? ` (${config.currency.symbol})` : ''}` : undefined}
          />
        )}
        {text('account_holder_name', 'Account holder name', {
          required: true,
          placeholder: 'Exactly as on the bank account',
          hint: 'Must match the bank\'s records. It is checked by a reviewer - not verified automatically.',
          autoComplete: 'name',
        })}

        {applies.ifsc_code && bank?.routing && (
          <FieldShell
            label={bank.routing.label}
            htmlFor={`${idPrefix}-ifsc_code`}
            required
            error={errorFor('ifsc_code')}
            hint={ifsc.kind === 'idle' ? bank.routing.help : undefined}
          >
            <div className="relative">
              <input
                id={`${idPrefix}-ifsc_code`}
                value={value.ifsc_code}
                disabled={disabled}
                maxLength={11}
                autoComplete="off"
                placeholder={bank.routing.example}
                onChange={(e) => onChange({ ifsc_code: e.target.value.toUpperCase().replace(/\s/g, '') })}
                onBlur={touch('ifsc_code')}
                aria-invalid={!!errorFor('ifsc_code')}
                className={`${INPUT_CLASS} ${errorFor('ifsc_code') ? INPUT_ERROR_CLASS : ''} pr-11 uppercase`}
              />
              <button
                type="button"
                disabled={disabled || !IFSC_REGEX.test(normalizeBankValue('ifsc_code', value.ifsc_code)) || ifsc.kind === 'loading'}
                onClick={() => void runIfscLookup(value.ifsc_code, true)}
                aria-label="Look up IFSC"
                title="Look up IFSC"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-500 hover:bg-gray-200/60 disabled:opacity-40 dark:hover:bg-gray-700"
              >
                {ifsc.kind === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {ifsc.kind === 'found' && (
              <p className="mt-1.5 text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
                <Building2 className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>{ifsc.details.bank_name} · {ifsc.details.branch_name}{ifsc.details.city ? `, ${ifsc.details.city}` : ''} <span className="text-gray-400">· {ifsc.details.source}</span></span>
              </p>
            )}
            {ifsc.kind === 'loading' && <p className="mt-1.5 text-xs text-gray-500">Looking up IFSC…</p>}
            {ifsc.kind === 'miss' && (
              <p className={`mt-1.5 text-xs ${ifsc.unavailable ? 'text-gray-500 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400'}`}>{ifsc.message}</p>
            )}
          </FieldShell>
        )}

        {applies.routing_code && bank?.routing &&
          text('routing_code', bank.routing.label, { required: bank.routing.required, placeholder: bank.routing.example, hint: bank.routing.help })}

        {text('bank_name', 'Bank name', { required: true, autoComplete: 'off' })}
        {text('branch_name', 'Branch', { placeholder: applies.ifsc_code ? 'Filled from the IFSC' : 'Branch name (if applicable)' })}
        {text('bank_address', 'Bank / branch address', { className: 'md:col-span-2' })}

        {conflict && (
          <div className="md:col-span-2 -mt-2 mb-5 text-xs rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
            <p>
              The IFSC directory lists{' '}
              {Object.entries(conflict).map(([k, v], i) => (
                <span key={k}>{i > 0 && '; '}{k.replace(/_/g, ' ')}: <strong>{v}</strong></span>
              ))}
              . This differs from what you entered.
            </p>
            <div className="mt-1.5 flex gap-3">
              <button type="button" className="font-semibold underline" onClick={() => { onChange(conflict); setConflict(null); }}>Use directory details</button>
              <button type="button" className="underline" onClick={() => setConflict(null)}>Keep mine</button>
            </div>
          </div>
        )}

        {applies.account_number && (
          showAccountInputs ? (
            <>
              <FieldShell
                label={bank?.account_number?.label || 'Account number'}
                htmlFor={`${idPrefix}-account_number`}
                required={!maskedAccountNumber}
                error={errorFor('account_number')}
                hint={maskedAccountNumber ? `On file: ${maskedAccountNumber}. Leave blank to keep it.` : bank?.account_number?.help}
              >
                <input
                  id={`${idPrefix}-account_number`}
                  value={value.account_number}
                  disabled={disabled}
                  inputMode={config?.code === 'IN' || config?.code === 'US' ? 'numeric' : 'text'}
                  autoComplete="off"
                  onChange={(e) => onChange({ account_number: e.target.value.replace(/\s/g, '') })}
                  onBlur={touch('account_number')}
                  aria-invalid={!!errorFor('account_number')}
                  className={`${INPUT_CLASS} ${errorFor('account_number') ? INPUT_ERROR_CLASS : ''}`}
                />
              </FieldShell>
              <FieldShell label="Confirm account number" htmlFor={`${idPrefix}-confirm_account_number`} required={!!value.account_number} error={errorFor('confirm_account_number')}>
                <input
                  id={`${idPrefix}-confirm_account_number`}
                  value={value.confirm_account_number}
                  disabled={disabled || !value.account_number}
                  autoComplete="off"
                  onChange={(e) => onChange({ confirm_account_number: e.target.value.replace(/\s/g, '') })}
                  onBlur={touch('confirm_account_number')}
                  aria-invalid={!!errorFor('confirm_account_number')}
                  className={`${INPUT_CLASS} ${errorFor('confirm_account_number') ? INPUT_ERROR_CLASS : ''}`}
                />
              </FieldShell>
            </>
          ) : (
            <FieldShell label={bank?.account_number?.label || 'Account number'} className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-gray-700">
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{revealed ?? maskedAccountNumber}</span>
                {onRevealAccountNumber && !revealed && (
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline dark:text-violet-400 inline-flex items-center gap-1"
                    onClick={async () => setRevealed(await onRevealAccountNumber())}
                  >
                    <Eye className="w-3.5 h-3.5" /> Reveal
                  </button>
                )}
                {!disabled && (
                  <button type="button" className="text-xs text-blue-600 hover:underline dark:text-violet-400" onClick={() => setReplacingAccount(true)}>
                    Replace account number
                  </button>
                )}
              </div>
            </FieldShell>
          )
        )}

        {applies.account_type && bank?.account_types && (
          <FieldShell label="Account type" htmlFor={`${idPrefix}-account_type`} error={errorFor('account_type')}>
            <select
              id={`${idPrefix}-account_type`}
              value={value.account_type}
              disabled={disabled}
              onChange={(e) => onChange({ account_type: e.target.value })}
              className={`${INPUT_CLASS} ${errorFor('account_type') ? INPUT_ERROR_CLASS : ''}`}
            >
              <option value="">Select</option>
              {bank.account_types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldShell>
        )}

        {applies.swift_code &&
          text('swift_code', 'SWIFT / BIC', {
            required: bank?.swift === 'required',
            upper: true,
            maxLength: 11,
            placeholder: 'e.g. DEUTDEFF',
            hint: bank?.swift === 'optional' ? 'Only needed for international transfers.' : '8 or 11 characters.',
          })}
        {applies.iban &&
          text('iban', 'IBAN', {
            required: bank?.iban === 'required',
            upper: true,
            maxLength: 42,
            placeholder: config?.code ? `${config.code}…` : '',
            hint: bank?.iban_length ? `${bank.iban_length} characters for ${config?.name}.` : undefined,
          })}
      </div>

      {verification && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          {verification.tone === 'ok' ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldAlert className={`w-4 h-4 ${verification.tone === 'bad' ? 'text-red-500' : 'text-amber-500'}`} />}
          <span>Bank account: <strong className="font-semibold">{verification.label}</strong></span>
          {verification.tone !== 'ok' && <span className="text-gray-400">· Details are only marked verified after a reviewer checks the bank proof.</span>}
        </div>
      )}
    </div>
  );
};
