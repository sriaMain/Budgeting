import type { CountryConfig, CountrySummary } from '../../services/countries';
import { findCountry } from '../../services/countries';
import { addressErrors, EMPTY_ADDRESS, type AddressErrors, type AddressValue } from '../../components/onboarding/addressForm';
import { applicableBankFields, bankErrors, EMPTY_BANK_VALUE, type BankErrors, type BankFormValue } from '../../components/onboarding/bankForm';
import { EMAIL_REGEX, normalizeBankValue, validatePhoneValue, validateTaxId } from '../../utils/countryRules';
import { effectiveDocStatus } from '../../utils/documentStatus';
import {
  BILLING_CURRENCIES,
  computeJurisdiction,
  type BankingVerificationStatus,
  type BillingFrequency,
  type Client,
  type ClientCurrency,
  type ClientDocument,
  type ClientDocumentSlot,
  type ClientType,
  type DocumentSlotStatus,
  type InvoiceRequirements,
  type PaymentTerms,
  type WizardStepKey,
} from './clientTypes';

/**
 * The onboarding wizard's single form state (every step edits part of it), its payload / diff
 * for PATCH, client-side validation per step (mirrors client/onboarding.py) and the mapping of
 * API field errors back to the step that shows the field.
 */

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Same as core.countries.GSTIN_REGEX (13th character 1-9 or A-Z). */
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface ClientFormState {
  company_name: string;
  client_type: ClientType;
  country: string;
  currency: ClientCurrency | '';
  contact_person: string;
  email: string;
  /** E.164 */
  phone: string;
  tags: number[];

  pan: string;
  gstin: string;
  registration_no: string;
  tax_id: string;
  authorised_signatory_name: string;
  authorised_signatory_role: string;

  address: AddressValue;
  bank: BankFormValue;
  banking_verification_status: BankingVerificationStatus;

  payment_terms: PaymentTerms;
  custom_payment_terms: string;
  withholding_tax_applicable: boolean;
  withholding_tax_percentage: string;
  invoice_requirements: InvoiceRequirements;
  po_required: boolean;
  billing_frequency: BillingFrequency;
  billing_contact: string;
  billing_email: string;
  commercial_remarks: string;
}

export type FieldErrors = Record<string, string>;

const phoneOf = (client?: Client) => {
  if (!client) return '';
  if (client.phone) return client.phone;
  if (client.country_code && client.mobile_number) return `${client.country_code}${client.mobile_number}`;
  return client.mobile_number || '';
};

export function buildClientForm(client?: Client): ClientFormState {
  return {
    company_name: client?.company_name ?? '',
    client_type: client?.client_type ?? 'company',
    country: client?.country ?? '',
    currency: client?.currency ?? 'INR',
    contact_person: client?.contact_person ?? '',
    email: client?.email ?? '',
    phone: phoneOf(client),
    tags: (client?.tags ?? []).map((t) => t.id),

    pan: client?.pan ?? '',
    gstin: client?.gstin ?? '',
    registration_no: client?.registration_no ?? '',
    tax_id: client?.tax_id ?? '',
    authorised_signatory_name: client?.authorised_signatory_name ?? '',
    authorised_signatory_role: client?.authorised_signatory_role ?? '',

    address: {
      ...EMPTY_ADDRESS,
      line1: client?.address1 ?? '',
      line2: client?.address2 ?? '',
      city: client?.city ?? '',
      state: client?.state ?? '',
      postal_code: client?.postal_code ?? '',
    },
    bank: {
      ...EMPTY_BANK_VALUE,
      bank_country: client?.bank_country ?? '',
      account_holder_name: client?.bank_account_holder_name ?? '',
      bank_name: client?.bank_name ?? '',
      ifsc_code: client?.bank_ifsc_code ?? '',
      routing_code: client?.bank_routing_code ?? '',
      swift_code: client?.bank_swift_code ?? '',
      iban: client?.bank_iban ?? '',
      branch_name: client?.bank_branch ?? '',
      bank_address: client?.bank_address ?? '',
      account_type: client?.bank_account_type ?? '',
    },
    banking_verification_status: client?.banking_verification_status ?? 'not_verified',

    payment_terms: client?.payment_terms ?? 'net_30',
    custom_payment_terms: client?.custom_payment_terms ?? '',
    withholding_tax_applicable: client?.withholding_tax_applicable ?? false,
    withholding_tax_percentage: client?.withholding_tax_percentage != null ? String(client.withholding_tax_percentage) : '',
    invoice_requirements: client?.invoice_requirements ?? 'standard',
    po_required: client?.po_required ?? false,
    billing_frequency: client?.billing_frequency ?? 'monthly',
    billing_contact: client?.billing_contact ?? '',
    billing_email: client?.billing_email ?? '',
    commercial_remarks: client?.commercial_remarks ?? '',
  };
}

export const isIndianCountry = (country: string) => computeJurisdiction(country) === 'Indian';

/** The bank's country for rules and the picker (the client's country when left blank). */
export const effectiveBankCountry = (form: Pick<ClientFormState, 'bank' | 'country'>) => form.bank.bank_country.trim() || form.country.trim();

/** API payload for the whole form. Identifiers that don't apply to the bank's country are sent
 * blank (only once that country's rules are known); a blank account number keeps the saved one. */
export function clientPayload(form: ClientFormState, bankConfig: CountryConfig | null | undefined): Record<string, unknown> {
  const b = form.bank;
  const applies = bankConfig ? applicableBankFields(bankConfig) : null;
  const pick = (key: 'ifsc_code' | 'routing_code' | 'swift_code' | 'iban' | 'account_type', value: string) =>
    applies && !applies[key] ? '' : value;
  return {
    company_name: form.company_name.trim(),
    client_type: form.client_type,
    country: form.country.trim(),
    currency: form.currency,
    contact_person: form.contact_person.trim(),
    email: form.email.trim(),
    mobile_number: form.phone,
    tags: [...form.tags].sort((a, c) => a - c),

    pan: form.pan.trim().toUpperCase(),
    gstin: form.gstin.trim().toUpperCase(),
    registration_no: form.registration_no.trim(),
    tax_id: form.tax_id.trim(),
    authorised_signatory_name: form.authorised_signatory_name.trim(),
    authorised_signatory_role: form.authorised_signatory_role.trim(),

    address1: form.address.line1.trim(),
    address2: form.address.line2.trim(),
    city: form.address.city.trim(),
    state: form.address.state.trim(),
    postal_code: form.address.postal_code.trim(),

    bank_country: b.bank_country.trim(),
    bank_account_holder_name: b.account_holder_name.trim(),
    bank_name: b.bank_name.trim(),
    bank_branch: b.branch_name.trim(),
    bank_address: b.bank_address.trim(),
    bank_ifsc_code: pick('ifsc_code', normalizeBankValue('ifsc_code', b.ifsc_code)),
    bank_routing_code: pick('routing_code', b.routing_code.trim()),
    bank_swift_code: pick('swift_code', normalizeBankValue('swift_code', b.swift_code)),
    bank_iban: pick('iban', normalizeBankValue('iban', b.iban)),
    bank_account_type: pick('account_type', b.account_type),
    bank_account_number: normalizeBankValue('account_number', b.account_number),
    banking_verification_status: form.banking_verification_status,

    payment_terms: form.payment_terms,
    custom_payment_terms: form.payment_terms === 'custom' ? form.custom_payment_terms.trim() : '',
    withholding_tax_applicable: form.withholding_tax_applicable,
    withholding_tax_percentage: form.withholding_tax_applicable && form.withholding_tax_percentage.trim() ? form.withholding_tax_percentage.trim() : null,
    invoice_requirements: form.invoice_requirements,
    po_required: form.po_required,
    billing_frequency: form.billing_frequency,
    billing_contact: form.billing_contact.trim(),
    billing_email: form.billing_email.trim(),
    commercial_remarks: form.commercial_remarks.trim(),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields that differ from what was last saved (Save draft / Save & next use PATCH). */
export function changedPayload(form: ClientFormState, baseline: ClientFormState, bankConfig: CountryConfig | null | undefined) {
  const next = clientPayload(form, bankConfig);
  const prev = clientPayload(baseline, bankConfig);
  const out: Record<string, unknown> = {};
  Object.entries(next).forEach(([key, value]) => {
    if (key === 'bank_account_number') {
      if (value) {
        out.bank_account_number = value;
        out.confirm_account_number = normalizeBankValue('account_number', form.bank.confirm_account_number);
      }
      return;
    }
    if (!same(value, prev[key])) out[key] = value;
  });
  return out;
}

/** Payload for creating a client: everything the user has filled in (blank / default values omitted). */
export function createPayload(form: ClientFormState, bankConfig: CountryConfig | null | undefined) {
  const out = changedPayload(form, buildClientForm(), bankConfig);
  // Required on create even when they equal the defaults.
  out.company_name = form.company_name.trim();
  out.email = form.email.trim();
  out.mobile_number = form.phone;
  out.country = form.country.trim();
  out.client_type = form.client_type;
  out.currency = form.currency;
  delete out.banking_verification_status;
  return out;
}

export const isFormDirty = (form: ClientFormState, baseline: ClientFormState) =>
  !same({ ...form, bank: { ...form.bank, confirm_account_number: '' } }, { ...baseline, bank: { ...baseline.bank, confirm_account_number: '' } });

/* ------------------------------------------------------------------ */
/* Field -> step                                                       */
/* ------------------------------------------------------------------ */

const FIELD_STEP: Record<string, WizardStepKey> = {
  company_name: 'basic', client_type: 'basic', country: 'basic', currency: 'basic', contact_person: 'basic',
  email: 'basic', mobile_number: 'basic', country_code: 'basic', tags: 'basic',
  pan: 'identity', gstin: 'identity', registration_no: 'identity', tax_id: 'identity',
  authorised_signatory_name: 'identity', authorised_signatory_role: 'identity',
  address1: 'address', address2: 'address', city: 'address', state: 'address', postal_code: 'address',
  confirm_account_number: 'banking', banking_verification_status: 'banking',
  payment_terms: 'commercials', custom_payment_terms: 'commercials', withholding_tax_applicable: 'commercials',
  withholding_tax_percentage: 'commercials', invoice_requirements: 'commercials', po_required: 'commercials',
  billing_frequency: 'commercials', billing_contact: 'commercials', billing_email: 'commercials', commercial_remarks: 'commercials',
  sanctions_screening_status: 'review', beneficial_ownership_status: 'review', tax_residency_status: 'review',
  enhanced_due_diligence_status: 'review', compliance_remarks: 'review', risk_rating: 'review', kyc_status: 'review',
  onboarding_step: 'review',
};

export const WIZARD_STEP_ORDER: WizardStepKey[] = ['basic', 'identity', 'address', 'banking', 'commercials', 'documents', 'review'];

/** The wizard step that shows an API field (or document category). */
export function stepForField(field: string, documentCategories: string[] = []): WizardStepKey | null {
  if (FIELD_STEP[field]) return FIELD_STEP[field];
  if (field.startsWith('bank_')) return 'banking';
  if (documentCategories.includes(field)) return 'documents';
  return null;
}

/** First step (in wizard order) that has an error. */
export function firstStepWithError(errors: FieldErrors, documentCategories: string[] = []): WizardStepKey | null {
  const steps = new Set(Object.keys(errors).map((f) => stepForField(f, documentCategories)).filter(Boolean));
  return WIZARD_STEP_ORDER.find((s) => steps.has(s)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Validation (client-side mirror of the server's rules)               */
/* ------------------------------------------------------------------ */

export interface ValidationContext {
  countries: CountrySummary[];
  countryConfig: CountryConfig | null;
  bankConfig: CountryConfig | null;
  /** A masked account number is already on file. */
  hasSavedAccount: boolean;
  slots: ClientDocumentSlot[];
  documents: ClientDocument[];
}

/** 'draft' rejects only malformed values; 'full' also enforces what submission needs. */
export type ValidationMode = 'draft' | 'full';

export const ADDRESS_FIELD: Record<string, string> = { line1: 'address1', line2: 'address2', city: 'city', state: 'state', postal_code: 'postal_code', country: 'country' };
export const BANK_FIELD: Record<string, string> = {
  bank_country: 'bank_country', account_holder_name: 'bank_account_holder_name', bank_name: 'bank_name',
  account_number: 'bank_account_number', confirm_account_number: 'confirm_account_number', ifsc_code: 'bank_ifsc_code',
  routing_code: 'bank_routing_code', swift_code: 'bank_swift_code', iban: 'bank_iban', branch_name: 'bank_branch',
  bank_address: 'bank_address', account_type: 'bank_account_type',
};

/** API field errors -> AddressFields' own keys. */
export function addressErrorsFrom(errors: FieldErrors): AddressErrors {
  const out: AddressErrors = {};
  Object.entries(ADDRESS_FIELD).forEach(([key, api]) => {
    if (api !== 'country' && errors[api]) out[key as keyof AddressErrors] = errors[api];
  });
  return out;
}

/** API field errors -> BankDetailsFields' own keys. */
export function bankErrorsFrom(errors: FieldErrors): BankErrors {
  const out: BankErrors = {};
  Object.entries(BANK_FIELD).forEach(([key, api]) => {
    if (errors[api]) out[key as keyof BankErrors] = errors[api];
  });
  return out;
}

/** Status of a document slot from the current document list (newest of its own category, else
 * the newest of an alternate category - the backend uses the same rule). */
export function slotDocument(slot: ClientDocumentSlot, documents: ClientDocument[]): ClientDocument | undefined {
  const newest = (docs: ClientDocument[]) => [...docs].sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || '') || b.id - a.id)[0];
  const own = documents.filter((d) => d.category === slot.category);
  if (own.length) return newest(own);
  const alternates = documents.filter((d) => slot.accepts.includes(d.category) && d.category !== slot.category);
  return alternates.length ? newest(alternates) : undefined;
}

export function slotStatus(slot: ClientDocumentSlot, documents: ClientDocument[]): DocumentSlotStatus {
  const doc = slotDocument(slot, documents);
  return doc ? (effectiveDocStatus(doc.status, doc.expiry_date) as DocumentSlotStatus) : 'missing';
}

/** Required (maker) documents that block submission: missing, rejected or expired. */
export function documentProblems(slots: ClientDocumentSlot[], documents: ClientDocument[]): { slot: ClientDocumentSlot; status: DocumentSlotStatus }[] {
  return slots
    .filter((s) => s.required && !s.reviewer_only)
    .map((slot) => ({ slot, status: slotStatus(slot, documents) }))
    .filter(({ status }) => status === 'missing' || status === 'rejected' || status === 'expired');
}

export function validateStep(step: WizardStepKey, form: ClientFormState, ctx: ValidationContext, mode: ValidationMode): FieldErrors {
  const e: FieldErrors = {};
  const full = mode === 'full';
  const individual = form.client_type === 'individual';

  if (step === 'basic') {
    if (full && !form.company_name.trim()) e.company_name = 'Legal name is required';
    if (!form.country.trim()) {
      if (full) e.country = 'Country is required';
    } else if (ctx.countries.length && !findCountry(ctx.countries, form.country)) {
      e.country = 'Select the country from the list';
    }
    if (full && !form.currency) e.currency = 'Select the billing currency';
    const email = form.email.trim();
    if (!email) {
      if (full) e.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(email)) {
      e.email = 'Enter a valid email address';
    }
    const phoneError = validatePhoneValue(form.phone, ctx.countries, form.country, full);
    if (phoneError) e.mobile_number = phoneError;
  }

  if (step === 'identity') {
    if (isIndianCountry(form.country)) {
      const pan = form.pan.trim().toUpperCase();
      const gstin = form.gstin.trim().toUpperCase();
      if (!pan) {
        if (full) e.pan = 'PAN is required';
      } else if (!PAN_REGEX.test(pan)) {
        e.pan = 'Enter a valid PAN (10 characters, e.g. AAAAA9999A)';
      }
      if (gstin) {
        if (!GSTIN_REGEX.test(gstin)) e.gstin = 'Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)';
        else if (pan && PAN_REGEX.test(pan) && gstin.slice(2, 12) !== pan) e.gstin = "The GSTIN doesn't match the PAN (characters 3-12 of a GSTIN are the PAN)";
      }
    } else if (ctx.countryConfig) {
      const taxError = validateTaxId(form.tax_id, ctx.countryConfig, individual ? 'individual' : 'business', full ? undefined : false);
      if (taxError) e.tax_id = taxError;
    }
    if (full && (form.client_type === 'company' || form.client_type === 'government') && !form.registration_no.trim()) {
      e.registration_no = 'Registration number is required';
    }
    if (full && !individual && !form.authorised_signatory_name.trim()) {
      e.authorised_signatory_name = 'Authorised signatory name is required';
    }
  }

  if (step === 'address') {
    const found = addressErrors(form.address, ctx.countryConfig, { required: full });
    Object.entries(found).forEach(([key, message]) => {
      if (message && ADDRESS_FIELD[key]) e[ADDRESS_FIELD[key]] = message;
    });
  }

  if (step === 'banking') {
    const found = bankErrors(form.bank, ctx.bankConfig, { partial: !full, hasSavedAccount: ctx.hasSavedAccount });
    Object.entries(found).forEach(([key, message]) => {
      if (message && BANK_FIELD[key]) e[BANK_FIELD[key]] = message;
    });
    const accountType = form.bank.account_type;
    const types = ctx.bankConfig?.bank.account_types;
    if (accountType && types && !types.some(([value]) => value === accountType)) {
      e.bank_account_type = "Select a valid account type for the bank's country";
    }
    if (form.bank.bank_country && ctx.countries.length && !findCountry(ctx.countries, form.bank.bank_country)) {
      e.bank_country = 'Select the bank country from the list';
    }
  }

  if (step === 'commercials') {
    if (full && !form.billing_contact.trim()) e.billing_contact = 'Billing contact is required';
    const billingEmail = form.billing_email.trim();
    if (!billingEmail) {
      if (full) e.billing_email = 'Billing email is required';
    } else if (!EMAIL_REGEX.test(billingEmail)) {
      e.billing_email = 'Enter a valid email address';
    }
    if (full && form.payment_terms === 'custom' && !form.custom_payment_terms.trim()) {
      e.custom_payment_terms = 'Describe the custom payment terms';
    }
    if (form.withholding_tax_applicable) {
      const raw = form.withholding_tax_percentage.trim();
      const pct = Number(raw);
      if (!raw) {
        if (full) e.withholding_tax_percentage = 'Withholding tax % is required when withholding tax applies';
      } else if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        e.withholding_tax_percentage = 'Enter a percentage between 0 and 100';
      }
    }
  }

  if (step === 'documents' && full) {
    documentProblems(ctx.slots, ctx.documents).forEach(({ slot, status }) => {
      e[slot.category] =
        status === 'missing' ? `${slot.label} is missing` : status === 'rejected' ? `${slot.label} was rejected - upload a corrected document` : `${slot.label} has expired - upload a current document`;
    });
  }

  return e;
}

/** Every step's errors at once (Review & Submit). */
export function validateAll(form: ClientFormState, ctx: ValidationContext, mode: ValidationMode): FieldErrors {
  return WIZARD_STEP_ORDER.reduce<FieldErrors>((acc, step) => ({ ...acc, ...validateStep(step, form, ctx, mode) }), {});
}

export const isBillingCurrency = (code: string): code is ClientCurrency => (BILLING_CURRENCIES as string[]).includes(code);
