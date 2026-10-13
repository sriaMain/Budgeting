import publicAxiosInstance from '../utils/publicAxiosInstance';
export { findCountry } from '../utils/countryMatch';

/**
 * Country rules + IFSC / postal-code lookups, served by the backend (core/countries.py,
 * core/lookups.py). Public endpoints, so the same client works in the admin app and the
 * token-only vendor / freelancer portals. Results are cached for the page's lifetime.
 */

export interface CountrySummary {
  code: string;
  alpha3: string;
  name: string;
  flag: string;
  dial_code: string;
  /** Possible national-number lengths (digits after the dialing code). */
  phone_lengths: number[];
  currency_code: string;
  currency_symbol: string;
}

export interface FieldRule {
  label: string;
  regex: string;
  example: string;
  required: boolean;
  help: string;
}

export interface RoutingRule extends FieldRule {
  /** Stored attribute: India keeps `ifsc_code`, every other country `routing_code`. */
  field: 'ifsc_code' | 'routing_code';
  lookup: 'ifsc' | null;
  checksum?: 'aba';
}

export type Presence = 'required' | 'optional' | 'hidden';

export interface CountryConfig extends CountrySummary {
  phone: { dial_code: string; lengths: number[]; example: string };
  currency: { code: string; symbol: string; billing_supported: boolean };
  address: {
    state_label: string;
    postal: { has_postal_code: boolean; label: string; regex: string; example: string; required: boolean; lookup: boolean };
  };
  tax: { business: FieldRule; individual: FieldRule; secondary: FieldRule | null };
  bank: {
    routing: RoutingRule | null;
    account_number: { label: string; regex: string; example: string; help: string } | null;
    account_types: [string, string][] | null;
    swift: Presence;
    iban: Presence;
    branch: boolean;
    iban_length: number | null;
  };
  is_india: boolean;
}

export interface LookupResult<T> {
  found: boolean;
  data: T;
  message: string;
  /** The provider failed (timeout, outage) - keep manual entry. */
  unavailable: boolean;
}

export interface IfscDetails {
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
  bank_address: string;
  city: string;
  district: string;
  state: string;
  micr: string;
  swift_code: string;
  full_address: string;
  source: string;
}

export interface PostalDetails {
  city: string;
  district: string;
  state: string;
  state_code?: string;
  country: string;
  postal_code?: string;
  localities: string[];
  source: string;
}

let countriesPromise: Promise<CountrySummary[]> | null = null;
const configCache = new Map<string, Promise<CountryConfig | null>>();

export function fetchCountries(): Promise<CountrySummary[]> {
  if (!countriesPromise) {
    countriesPromise = publicAxiosInstance
      .get<CountrySummary[]>('/countries/')
      .then((r) => r.data)
      .catch((err) => {
        countriesPromise = null; // allow a retry on the next render
        throw err;
      });
  }
  return countriesPromise;
}

export function fetchCountryConfig(codeOrName: string): Promise<CountryConfig | null> {
  const key = (codeOrName || '').trim().toUpperCase();
  if (!key) return Promise.resolve(null);
  if (!configCache.has(key)) {
    configCache.set(
      key,
      publicAxiosInstance
        .get<CountryConfig>(`/countries/${encodeURIComponent(codeOrName.trim())}/`)
        .then((r) => r.data)
        .catch((err) => {
          configCache.delete(key);
          if (err?.response?.status === 404) return null;
          throw err;
        })
    );
  }
  return configCache.get(key)!;
}

const unavailable = <T,>(message: string): LookupResult<T> => ({ found: false, data: {} as T, message, unavailable: true });

export async function lookupIfsc(code: string): Promise<LookupResult<IfscDetails>> {
  try {
    const { data } = await publicAxiosInstance.get<LookupResult<IfscDetails>>(`/lookups/ifsc/${encodeURIComponent(code.trim())}/`);
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    return unavailable(status === 429
      ? 'Too many lookups - wait a minute or enter the bank details manually.'
      : 'Bank lookup is unavailable right now - enter the bank details manually.');
  }
}

export async function lookupPostalCode(country: string, code: string): Promise<LookupResult<PostalDetails>> {
  try {
    const { data } = await publicAxiosInstance.get<LookupResult<PostalDetails>>('/lookups/postal-code/', {
      params: { country, code: code.trim() },
      timeout: 20000,
    });
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    return unavailable(status === 429
      ? 'Too many lookups - wait a minute or enter the address manually.'
      : 'Address lookup is unavailable right now - enter the address manually.');
  }
}
