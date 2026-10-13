/** Pure helpers (no network) for matching stored country values against the country list. */

export interface CountryLike {
  code: string;
  alpha3: string;
  name: string;
}

const ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.a.': 'US', 'united states of america': 'US', america: 'US', uk: 'GB', 'u.k.': 'GB',
  'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', uae: 'AE', 'u.a.e.': 'AE',
  'south korea': 'KR', korea: 'KR', russia: 'RU', vietnam: 'VN', turkey: 'TR', 'czech republic': 'CZ',
  holland: 'NL', 'ivory coast': 'CI', bharat: 'IN', taiwan: 'TW', iran: 'IR', laos: 'LA', syria: 'SY',
  tanzania: 'TZ', bolivia: 'BO', venezuela: 'VE', moldova: 'MD', brunei: 'BN', macau: 'MO', vatican: 'VA',
};

/** Resolves a stored country value (name, ISO code or common alias) to its list entry. */
export function findCountry<T extends CountryLike>(countries: T[], value: string | null | undefined): T | undefined {
  const v = (value || '').trim().toLowerCase();
  if (!v) return undefined;
  const code = ALIASES[v];
  return countries.find((c) => (code ? c.code === code : c.name.toLowerCase() === v || c.code.toLowerCase() === v || c.alpha3.toLowerCase() === v));
}
