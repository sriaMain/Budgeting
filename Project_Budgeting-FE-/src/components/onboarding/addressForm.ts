import type { CountryConfig } from '../../services/countries';
import { validatePostalCode } from '../../utils/countryRules';

/** Values and validation for <AddressFields /> (kept out of the component file). */

export interface AddressValue {
  line1: string;
  line2: string;
  city: string;
  district?: string;
  state: string;
  postal_code: string;
  landmark?: string;
}

export type AddressErrors = Partial<Record<keyof AddressValue | 'country', string>>;

export const EMPTY_ADDRESS: AddressValue = { line1: '', line2: '', city: '', district: '', state: '', postal_code: '', landmark: '' };

/** Required fields (when `required`) + the country's postal-code format. */
export function addressErrors(
  value: AddressValue,
  config: CountryConfig | null | undefined,
  opts: { required?: boolean; country?: string } = {}
): AddressErrors {
  const e: AddressErrors = {};
  if (opts.required) {
    if (opts.country !== undefined && !opts.country.trim()) e.country = 'Country is required';
    if (!value.line1.trim()) e.line1 = 'Address line 1 is required';
    if (!value.city.trim()) e.city = 'City is required';
  }
  const p = validatePostalCode(value.postal_code, config, opts.required ? undefined : false);
  if (p) e.postal_code = p;
  return e;
}
