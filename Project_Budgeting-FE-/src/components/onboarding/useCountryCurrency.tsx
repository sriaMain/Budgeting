import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { fetchCountryConfig } from '../../services/countries';

interface Options {
  /** The form's currency code. */
  currency: string;
  setCurrency: (code: string) => void;
  /** Currencies the field accepts (e.g. billing currencies). Omit to accept any. */
  allowed?: string[];
}

type Notice =
  | { kind: 'auto'; code: string; symbol: string; country: string }
  | { kind: 'confirm'; code: string; symbol: string; country: string; from: string }
  | { kind: 'unsupported'; code: string; country: string };

/**
 * Keeps a currency field in step with the country. Call `onCountryChange(previous, next)` from
 * the country picker's change handler:
 *  - a blank currency, or the previous country's own currency, follows the new country (with a note);
 *  - a currency the user picked themselves is never overwritten - they're asked instead;
 *  - a country whose currency the field can't take (e.g. not a billing currency) only informs.
 * Loading an existing record never changes its currency.
 */
export function useCountryCurrency({ currency, setCurrency, allowed }: Options): {
  onCountryChange: (previous: string, next: string) => void;
  notice: React.ReactNode;
} {
  const [notice, setNotice] = useState<Notice | null>(null);

  const onCountryChange = (previous: string, next: string) => {
    if (!next) return;
    const current = currency;
    Promise.all([previous ? fetchCountryConfig(previous).catch(() => null) : Promise.resolve(null), fetchCountryConfig(next)])
      .then(([prev, cfg]) => {
        if (!cfg?.currency.code) return;
        const target = cfg.currency.code;
        if (allowed && !allowed.includes(target)) {
          setNotice(current === target ? null : { kind: 'unsupported', code: target, country: cfg.name });
        } else if (current === target) {
          setNotice(null);
        } else if (!current || current === prev?.currency.code) {
          setCurrency(target);
          setNotice({ kind: 'auto', code: target, symbol: cfg.currency.symbol, country: cfg.name });
        } else {
          setNotice({ kind: 'confirm', code: target, symbol: cfg.currency.symbol, country: cfg.name, from: current });
        }
      })
      .catch(() => setNotice(null));
  };

  // A notice is stale once the user changes the currency themselves.
  const visible =
    notice &&
    (notice.kind === 'unsupported' || (notice.kind === 'auto' && currency === notice.code) || (notice.kind === 'confirm' && currency === notice.from))
      ? notice
      : null;

  const symbolText = (n: { code: string; symbol: string }) => (n.symbol && n.symbol !== n.code ? `${n.code} (${n.symbol})` : n.code);

  const node = visible ? (
    <div
      role="status"
      className={`mb-5 -mt-2 flex flex-wrap items-center gap-2 text-xs rounded-md px-3 py-2 border ${
        visible.kind === 'confirm'
          ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'
          : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300'
      }`}
    >
      <Info className="w-3.5 h-3.5 shrink-0" />
      {visible.kind === 'auto' && <span>Currency set to {symbolText(visible)} for {visible.country}.</span>}
      {visible.kind === 'unsupported' && (
        <span>{visible.country} uses {visible.code}, which isn't available here - choose the currency you'll transact in.</span>
      )}
      {visible.kind === 'confirm' && (
        <>
          <span>{visible.country} uses {symbolText(visible)}. Switch the currency from {visible.from}?</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setCurrency(visible.code);
              setNotice(null);
            }}
          >
            Switch to {visible.code}
          </button>
          <button type="button" className="underline" onClick={() => setNotice(null)}>Keep {visible.from}</button>
        </>
      )}
      {visible.kind !== 'confirm' && (
        <button type="button" className="ml-auto underline" onClick={() => setNotice(null)}>OK</button>
      )}
    </div>
  ) : null;

  return { onCountryChange, notice: node };
}
