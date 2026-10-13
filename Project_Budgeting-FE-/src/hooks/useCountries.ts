import { useEffect, useState } from 'react';
import { fetchCountries, fetchCountryConfig, findCountry, type CountryConfig, type CountrySummary } from '../services/countries';

/** Every ISO country (cached for the page's lifetime). */
export function useCountries(): { countries: CountrySummary[]; loading: boolean; error: boolean } {
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCountries()
      .then((rows) => alive && setCountries(rows))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { countries, loading, error };
}

/**
 * Full rules for one country (address, phone, tax, bank, currency). `value` may be a stored
 * country name, an ISO code or blank. Returns null until loaded / for an unknown country.
 */
export function useCountryConfig(value: string | null | undefined): { config: CountryConfig | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; config: CountryConfig | null }>({ key: '', config: null });
  const key = (value || '').trim();

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchCountryConfig(key)
      .then((config) => alive && setState({ key, config }))
      .catch(() => alive && setState({ key, config: null }));
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key) return { config: null, loading: false };
  return { config: state.key === key ? state.config : null, loading: state.key !== key };
}

export { findCountry };
