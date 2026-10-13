import type { CountryConfig } from '../../services/countries';
import { normalizeBankValue, validateBankValues } from '../../utils/countryRules';

/** Values, validation and payload for <BankDetailsFields /> (kept out of the component file). */

export interface BankFormValue {
  bank_country: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  confirm_account_number: string;
  ifsc_code: string;
  routing_code: string;
  swift_code: string;
  iban: string;
  branch_name: string;
  bank_address: string;
  account_type: string;
}

export const EMPTY_BANK_VALUE: BankFormValue = {
  bank_country: '', account_holder_name: '', bank_name: '', account_number: '', confirm_account_number: '',
  ifsc_code: '', routing_code: '', swift_code: '', iban: '', branch_name: '', bank_address: '', account_type: '',
};

export type BankErrors = Partial<Record<keyof BankFormValue, string>>;

/** Which identifier fields apply to a bank country (others are hidden and must be sent blank). */
export function applicableBankFields(config: CountryConfig | null | undefined) {
  const bank = config?.bank;
  return {
    ifsc_code: bank?.routing?.field === 'ifsc_code',
    routing_code: bank?.routing?.field === 'routing_code',
    account_number: !!bank?.account_number || !bank,
    swift_code: bank ? bank.swift !== 'hidden' : true,
    iban: bank ? bank.iban !== 'hidden' : true,
    account_type: !!bank?.account_types?.length,
    branch_name: true,
  };
}

/** Errors for the whole block (submit) or only malformed values (draft). */
export function bankErrors(value: BankFormValue, config: CountryConfig | null | undefined, opts: { partial?: boolean; hasSavedAccount?: boolean; requireCountry?: boolean } = {}): BankErrors {
  const errors: BankErrors = { ...validateBankValues(value, config, opts) };
  if (opts.requireCountry && !opts.partial && !value.bank_country.trim()) errors.bank_country = 'Bank country is required';
  return errors;
}

/** The values to persist: identifiers that don't apply to the bank's country are blanked. */
export function bankPayload(value: BankFormValue, config: CountryConfig | null | undefined) {
  const applies = applicableBankFields(config);
  return {
    bank_country: value.bank_country.trim(),
    account_holder_name: value.account_holder_name.trim(),
    bank_name: value.bank_name.trim(),
    branch_name: value.branch_name.trim(),
    bank_address: value.bank_address.trim(),
    ifsc_code: applies.ifsc_code ? normalizeBankValue('ifsc_code', value.ifsc_code) : '',
    routing_code: applies.routing_code ? value.routing_code.trim() : '',
    swift_code: applies.swift_code ? normalizeBankValue('swift_code', value.swift_code) : '',
    iban: applies.iban ? normalizeBankValue('iban', value.iban) : '',
    account_type: applies.account_type ? value.account_type : '',
    // Blank = keep the number on file (it is write-only and never returned in full).
    account_number: normalizeBankValue('account_number', value.account_number),
  };
}

