import type { CountryConfig, CountrySummary } from '../services/countries';
import { findCountry } from './countryMatch';

/**
 * Client-side mirror of core/countries.py validation, driven by the country config the
 * backend serves - so the form flags problems inline and the backend still has the final
 * say. Every validator returns an error message or '' (valid / not applicable).
 */

const test = (regex: string, value: string) => {
  if (!regex) return true;
  try {
    return new RegExp(regex).test(value);
  } catch {
    return true; // a pattern the browser can't compile must never block a legitimate value
  }
};

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

export interface PhoneParts {
  /** ISO code of the dialing country (keeps +1 US vs +1 CA apart). */
  country: string;
  dialCode: string;
  national: string;
}

export const digitsOnly = (v: string) => (v || '').replace(/\D/g, '');

/** "+919876543210" -> {country:'IN', dialCode:'+91', national:'9876543210'} using the longest matching dial code. */
export function splitE164(value: string, countries: CountrySummary[], preferredCountry?: string): PhoneParts | null {
  const raw = (value || '').trim();
  if (!raw.startsWith('+')) return null;
  const digits = digitsOnly(raw);
  const preferred = countries.find((c) => c.code === preferredCountry);
  if (preferred?.dial_code && digits.startsWith(digitsOnly(preferred.dial_code))) {
    return { country: preferred.code, dialCode: preferred.dial_code, national: digits.slice(digitsOnly(preferred.dial_code).length) };
  }
  const match = countries
    .filter((c) => c.dial_code && digits.startsWith(digitsOnly(c.dial_code)))
    .sort((a, b) => digitsOnly(b.dial_code).length - digitsOnly(a.dial_code).length ||
      // shared codes (+1, +7, +44): prefer the "main" country
      Number(['US', 'RU', 'GB'].includes(b.code)) - Number(['US', 'RU', 'GB'].includes(a.code)))[0];
  if (!match) return null;
  return { country: match.code, dialCode: match.dial_code, national: digits.slice(digitsOnly(match.dial_code).length) };
}

export const joinE164 = (dialCode: string, national: string) => {
  const n = digitsOnly(national).replace(/^0+/, ''); // trunk prefix "0" is not dialled internationally
  return n ? `+${digitsOnly(dialCode)}${n}` : '';
};

export function validatePhone(
  national: string,
  country: Pick<CountrySummary, 'name' | 'code' | 'dial_code' | 'phone_lengths'> | null | undefined,
  required = false
): string {
  const n = digitsOnly(national).replace(/^0+/, '');
  if (!n) return required ? 'Phone number is required' : '';
  if (!country) return n.length < 4 || n.length > 14 ? 'Enter a valid phone number' : '';
  const lengths = country.phone_lengths || [];
  if (lengths.length && !lengths.includes(n.length)) {
    const expected = lengths.length === 1 ? `${lengths[0]}` : `${Math.min(...lengths)}-${Math.max(...lengths)}`;
    return `Enter a valid ${country.name} number (${expected} digits after ${country.dial_code})`;
  }
  if (country.code === 'IN' && n.length === 10 && !/^[6-9]/.test(n)) return 'Indian mobile numbers start with 6, 7, 8 or 9';
  return '';
}

/** Validates a stored E.164 value ("+919876543210"); a bare national number is checked against
 * `defaultCountry` (a country name or ISO code). */
export function validatePhoneValue(value: string, countries: CountrySummary[], defaultCountry?: string, required = false): string {
  const v = (value || '').trim();
  if (!v) return required ? 'Phone number is required' : '';
  if (!countries.length) return '';
  const fallback = findCountry(countries, defaultCountry);
  const parts = splitE164(v, countries, fallback?.code);
  if (parts) return validatePhone(parts.national, countries.find((c) => c.code === parts.country), required);
  return validatePhone(v, fallback, required);
}

/* ------------------------------------------------------------------ */
/* Address                                                             */
/* ------------------------------------------------------------------ */

export function validatePostalCode(value: string, config: CountryConfig | null | undefined, required?: boolean): string {
  const v = (value || '').trim();
  if (!config) return '';
  const postal = config.address.postal;
  if (!postal.has_postal_code) return '';
  if (!v) return (required ?? postal.required) ? `${postal.label} is required` : '';
  if (!test(postal.regex, v)) return `Enter a valid ${postal.label} for ${config.name}${postal.example ? ` (e.g. ${postal.example})` : ''}`;
  return '';
}

/* ------------------------------------------------------------------ */
/* Tax                                                                 */
/* ------------------------------------------------------------------ */

export function validateTaxId(value: string, config: CountryConfig | null | undefined, entity: 'business' | 'individual', required?: boolean): string {
  const v = (value || '').trim().toUpperCase();
  if (!config) return '';
  const rule = config.tax[entity];
  if (!v) return (required ?? rule.required) ? `${rule.label} is required` : '';
  if (!test(rule.regex, v)) return `Enter a valid ${rule.label}${rule.example ? ` (e.g. ${rule.example})` : ''}`;
  if (config.code === 'AU' && rule.label.startsWith('ABN') && digitsOnly(v).length === 11 && !abnIsValid(v)) {
    return 'This ABN fails its checksum - please re-check the number';
  }
  return '';
}

export function abnIsValid(value: string): boolean {
  const d = digitsOnly(value).split('').map(Number);
  if (d.length !== 11) return false;
  d[0] -= 1;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return d.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

/* ------------------------------------------------------------------ */
/* Bank                                                                */
/* ------------------------------------------------------------------ */

export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const SWIFT_REGEX = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function abaChecksumOk(value: string): boolean {
  const d = digitsOnly(value).split('').map(Number);
  if (d.length !== 9) return false;
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

export function ibanIsValid(value: string, expectedLength?: number | null): boolean {
  const iban = (value || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
  if (expectedLength && iban.length !== expectedLength) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of n) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export const normalizeBankValue = (field: string, value: string) => {
  const v = (value || '').trim();
  if (field === 'ifsc_code' || field === 'swift_code') return v.toUpperCase().replace(/\s/g, '');
  if (field === 'iban') return v.replace(/\s/g, '').toUpperCase();
  if (field === 'account_number') return v.replace(/[\s-]/g, '');
  return v;
};

export interface BankValues {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  confirm_account_number: string;
  ifsc_code: string;
  routing_code: string;
  swift_code: string;
  iban: string;
}

/**
 * Same rules as core.countries.validate_bank_details. `partial` (drafts) only rejects malformed
 * values; `hasSavedAccount` means a masked account number is already on file, so a blank
 * account number keeps it.
 */
export function validateBankValues(
  values: Partial<BankValues>,
  config: CountryConfig | null | undefined,
  opts: { partial?: boolean; hasSavedAccount?: boolean } = {}
): Partial<Record<keyof BankValues, string>> {
  const errors: Partial<Record<keyof BankValues, string>> = {};
  if (!config) return errors;
  const { partial = false, hasSavedAccount = false } = opts;
  const bank = config.bank;
  const name = config.name;

  if (bank.routing) {
    const key = bank.routing.field;
    const v = normalizeBankValue(key, values[key] || '');
    if (v) {
      if (!test(bank.routing.regex, v)) errors[key] = `Enter a valid ${bank.routing.label}${bank.routing.example ? ` (e.g. ${bank.routing.example})` : ''}`;
      else if (bank.routing.checksum === 'aba' && !abaChecksumOk(v)) errors[key] = 'This routing number fails the ABA checksum - please re-check it';
    } else if (bank.routing.required && !partial) errors[key] = `${bank.routing.label} is required`;
  }

  const acct = normalizeBankValue('account_number', values.account_number || '');
  if (bank.account_number && acct && !test(bank.account_number.regex, acct)) {
    errors.account_number = `Enter a valid account number for ${name}${bank.account_number.help ? ` - ${bank.account_number.help}` : ''}`;
  }
  if (acct && values.confirm_account_number && normalizeBankValue('account_number', values.confirm_account_number) !== acct) {
    errors.confirm_account_number = 'Account numbers do not match';
  }

  const iban = normalizeBankValue('iban', values.iban || '');
  if (iban) {
    if (!ibanIsValid(iban)) errors.iban = 'Enter a valid IBAN (the check digits don\'t match)';
    else if (bank.iban !== 'hidden' && iban.slice(0, 2) !== config.code) errors.iban = `This IBAN is not from ${name}`;
    else if (bank.iban_length && iban.length !== bank.iban_length) errors.iban = `${name} IBANs are ${bank.iban_length} characters`;
  } else if (bank.iban === 'required' && !partial) errors.iban = 'IBAN is required for bank accounts in this country';

  const swift = normalizeBankValue('swift_code', values.swift_code || '');
  if (swift) {
    if (!SWIFT_REGEX.test(swift)) errors.swift_code = 'Enter a valid SWIFT / BIC (8 or 11 characters)';
    else if (swift.slice(4, 6) !== config.code) errors.swift_code = `This SWIFT / BIC is not from ${name}`;
  } else if (bank.swift === 'required' && !partial) errors.swift_code = 'SWIFT / BIC is required for this country';

  if (!partial) {
    if (!(values.account_holder_name || '').trim()) errors.account_holder_name = 'Account holder name is required';
    if (!(values.bank_name || '').trim()) errors.bank_name = 'Bank name is required';
    if (bank.account_number && !acct && !hasSavedAccount) errors.account_number = 'Account number is required';
    if (bank.account_number && acct && !normalizeBankValue('account_number', values.confirm_account_number || '')) {
      errors.confirm_account_number = 'Re-enter the account number to confirm it';
    }
  }
  const holder = (values.account_holder_name || '').trim();
  if (holder && !/^[^\d@#$%^*_=+<>{}[\]|\\]{2,}$/.test(holder)) {
    errors.account_holder_name = 'Enter the name exactly as it appears on the bank account (letters only)';
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const formatMoneySymbol = (config: CountryConfig | null | undefined) =>
  config?.currency.code ? `${config.currency.code} ${config.currency.symbol !== config.currency.code ? config.currency.symbol : ''}`.trim() : '';
