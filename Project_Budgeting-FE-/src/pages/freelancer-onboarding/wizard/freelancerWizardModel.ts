import type { CountryConfig, CountrySummary } from '../../../services/countries';
import { findCountry } from '../../../utils/countryMatch';
import { EMPTY_ADDRESS, addressErrors, type AddressErrors, type AddressValue } from '../../../components/onboarding/addressForm';
import { EMPTY_BANK_VALUE, bankErrors, bankPayload, type BankErrors, type BankFormValue } from '../../../components/onboarding/bankForm';
import { EMAIL_REGEX, normalizeBankValue, validatePhoneValue, validateTaxId } from '../../../utils/countryRules';
import { latestByCategory, summarizeDocuments, todayIso } from '../../../utils/documentStatus';
import type { DocumentSlotConfig } from '../../../components/DocumentList';
import { namePartsFrom } from '../../../utils/personName';
import type {
  BankPaymentMethod, FreelancerAvailability, FreelancerBankDetail, FreelancerBankDetailPayload, FreelancerDetail,
  FreelancerDocument, FreelancerProfilePayload, FreelancerPublic, IdDocumentType, OnboardingIssue, OnboardingStepKey,
  RequiredDocumentSlot,
} from '../../../types/freelancerOnboarding.types';

/**
 * Freelancer onboarding wizard - form state, validation and payloads shared by the
 * secure-link portal and the admin drawer / page (one model, two adapters).
 */

export type WizardMode = 'admin' | 'portal';
export type WizardStepKey = OnboardingStepKey | 'review';
export type FreelancerRecord = FreelancerDetail | FreelancerPublic;

export const WIZARD_STEPS: { key: WizardStepKey; title: string; description: string }[] = [
  { key: 'basic', title: 'Basic Information', description: 'Name, contact details, date of birth and nationality' },
  { key: 'identity', title: 'Identity & KYC', description: 'Country of residence, government ID and tax identification' },
  { key: 'address', title: 'Address', description: 'Permanent and current address, emergency contact' },
  { key: 'banking', title: 'Banking', description: 'How payments are made' },
  { key: 'professional', title: 'Professional', description: 'Role, skills, experience and availability' },
  { key: 'documents', title: 'KYC Documents', description: 'Identity, tax and bank proofs' },
  { key: 'review', title: 'Review & Submit', description: 'Check every section and submit' },
];

export const STEP_TITLES = Object.fromEntries(WIZARD_STEPS.map((s) => [s.key, s.title])) as Record<WizardStepKey, string>;
export const stepIndex = (key: WizardStepKey) => Math.max(0, WIZARD_STEPS.findIndex((s) => s.key === key));
export const stepAt = (index: number): WizardStepKey => WIZARD_STEPS[Math.max(0, Math.min(index, WIZARD_STEPS.length - 1))].key;

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */

export interface FreelancerFormState {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  date_of_birth: string;
  gender: string;
  nationality: string;
  country_of_residence: string;
  id_document_type: string;
  /** Write-only: blank keeps the number on file. */
  id_document_number: string;
  /** PAN / tax ID - write-only: blank keeps the value on file. */
  tax_number: string;
  tax_residency_country: string;
  permanent_country: string;
  permanent: AddressValue;
  temp_same_as_permanent: boolean;
  temp_country: string;
  temp: AddressValue;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  payment_method: string;
  bank: BankFormValue;
  upi_id: string;
  paypal_email: string;
  wise_email: string;
  professional_title: string;
  skills: string;
  years_of_experience: string;
  portfolio_url: string;
  linkedin_url: string;
  availability: string;
  preferred_start_date: string;
  available_until: string;
  hours_per_day: string;
  hours_per_week: string;
  notice_period_days: string;
  timezone: string;
  // Admin only (commercial / internal)
  payment_terms: string;
  currency: string;
  rate: string;
  notes: string;
  internal_remarks: string;
}

export const EMPTY_FORM: FreelancerFormState = {
  first_name: '', middle_name: '', last_name: '', email: '', phone: '', alternate_phone: '', date_of_birth: '',
  gender: '', nationality: '', country_of_residence: '', id_document_type: '', id_document_number: '', tax_number: '',
  tax_residency_country: '', permanent_country: '', permanent: { ...EMPTY_ADDRESS }, temp_same_as_permanent: true,
  temp_country: '', temp: { ...EMPTY_ADDRESS }, emergency_contact_name: '', emergency_contact_phone: '',
  emergency_contact_relationship: '', payment_method: '', bank: { ...EMPTY_BANK_VALUE }, upi_id: '', paypal_email: '',
  wise_email: '', professional_title: '', skills: '', years_of_experience: '', portfolio_url: '', linkedin_url: '',
  availability: '', preferred_start_date: '', available_until: '', hours_per_day: '', hours_per_week: '',
  notice_period_days: '', timezone: '', payment_terms: '', currency: 'INR', rate: '', notes: '', internal_remarks: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

const GENDER_ALIASES: Record<string, string> = {
  male: 'male', m: 'male', man: 'male', female: 'female', f: 'female', woman: 'female',
  non_binary: 'non_binary', nonbinary: 'non_binary', other: 'other', prefer_not_to_say: 'prefer_not_to_say',
};

/** Legacy free-text gender ("Male") -> choice value; unknown text is kept so it isn't silently lost. */
export const normalizeGender = (value: string) => {
  const key = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return GENDER_ALIASES[key] ?? (value || '').trim();
};

export function bankSliceFrom(bank: FreelancerBankDetail | null) {
  return {
    payment_method: bank?.payment_method || '',
    bank: bank
      ? {
          bank_country: bank.bank_country || '', account_holder_name: bank.account_holder_name || '', bank_name: bank.bank_name || '',
          account_number: '', confirm_account_number: '', ifsc_code: bank.ifsc_code || '', routing_code: bank.routing_code || '',
          swift_code: bank.swift_code || '', iban: bank.iban || '', branch_name: bank.branch_name || '',
          bank_address: bank.bank_address || '', account_type: bank.account_type || '',
        }
      : { ...EMPTY_BANK_VALUE },
    upi_id: bank?.upi_id || '',
    paypal_email: bank?.paypal_email || '',
    wise_email: bank?.wise_email || '',
    payment_terms: bank?.payment_terms || '',
    tax_number: '',
  };
}

const isAdminRecord = (rec: FreelancerRecord): rec is FreelancerDetail => 'internal_remarks' in rec;

export function formFromRecord(rec: FreelancerRecord | null, bank: FreelancerBankDetail | null): FreelancerFormState {
  const bankSlice = bankSliceFrom(bank);
  if (!rec) return { ...EMPTY_FORM, ...bankSlice };
  const parts = namePartsFrom(rec, rec.full_name);
  const admin = isAdminRecord(rec) ? rec : null;
  const address = (prefix: 'permanent' | 'temp'): AddressValue => ({
    ...EMPTY_ADDRESS,
    line1: str(rec[`${prefix}_address_line1`]),
    line2: str(rec[`${prefix}_address_line2`]),
    city: str(rec[`${prefix}_city`]),
    state: str(rec[`${prefix}_state`]),
    postal_code: str(rec[`${prefix}_pincode`]),
  });
  const tempStarted = !!(rec.temp_address_line1 || rec.temp_city || rec.temp_pincode);
  return {
    ...EMPTY_FORM,
    ...bankSlice,
    ...parts,
    email: rec.email || '',
    phone: rec.phone || '',
    alternate_phone: rec.alternate_phone || '',
    date_of_birth: rec.date_of_birth || '',
    gender: normalizeGender(rec.gender),
    nationality: rec.nationality || '',
    country_of_residence: rec.country_of_residence || '',
    id_document_type: rec.id_document_type || '',
    tax_residency_country: rec.tax_residency_country || '',
    permanent_country: rec.permanent_country || '',
    permanent: address('permanent'),
    // A record without a separate current address reads as "same as permanent".
    temp_same_as_permanent: rec.temp_same_as_permanent || !tempStarted,
    temp_country: rec.temp_country || '',
    temp: address('temp'),
    emergency_contact_name: rec.emergency_contact_name || '',
    emergency_contact_phone: rec.emergency_contact_phone || '',
    emergency_contact_relationship: rec.emergency_contact_relationship || '',
    professional_title: rec.professional_title || '',
    skills: rec.skills || '',
    years_of_experience: str(rec.years_of_experience),
    portfolio_url: rec.portfolio_url || '',
    linkedin_url: rec.linkedin_url || '',
    availability: rec.availability || '',
    preferred_start_date: rec.preferred_start_date || '',
    available_until: rec.available_until || '',
    hours_per_day: str(rec.hours_per_day),
    hours_per_week: str(rec.hours_per_week),
    notice_period_days: str(rec.notice_period_days),
    timezone: rec.timezone || '',
    currency: admin?.currency || 'INR',
    rate: str(admin?.rate),
    notes: admin?.notes || '',
    internal_remarks: admin?.internal_remarks || '',
  };
}

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

const nullable = (v: string) => (v.trim() === '' ? null : v.trim());
const withScheme = (url: string) => {
  const v = url.trim();
  return v && !/^https?:\/\//i.test(v) ? `https://${v}` : v;
};

export function profilePayload(form: FreelancerFormState, mode: WizardMode, lastSavedStep?: number): FreelancerProfilePayload {
  const same = form.temp_same_as_permanent;
  const temp = same ? form.permanent : form.temp;
  const payload: FreelancerProfilePayload = {
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim(),
    last_name: form.last_name.trim(),
    phone: form.phone,
    alternate_phone: form.alternate_phone,
    date_of_birth: nullable(form.date_of_birth),
    gender: form.gender,
    nationality: form.nationality,
    country_of_residence: form.country_of_residence,
    id_document_type: form.id_document_type as IdDocumentType,
    tax_residency_country: form.tax_residency_country,
    permanent_country: form.permanent_country,
    permanent_address_line1: form.permanent.line1.trim(),
    permanent_address_line2: form.permanent.line2.trim(),
    permanent_city: form.permanent.city.trim(),
    permanent_state: form.permanent.state.trim(),
    permanent_pincode: form.permanent.postal_code.trim(),
    temp_same_as_permanent: same,
    temp_country: same ? form.permanent_country : form.temp_country,
    temp_address_line1: temp.line1.trim(),
    temp_address_line2: temp.line2.trim(),
    temp_city: temp.city.trim(),
    temp_state: temp.state.trim(),
    temp_pincode: temp.postal_code.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(),
    emergency_contact_phone: form.emergency_contact_phone,
    emergency_contact_relationship: form.emergency_contact_relationship.trim(),
    professional_title: form.professional_title.trim(),
    skills: form.skills,
    years_of_experience: nullable(form.years_of_experience),
    portfolio_url: withScheme(form.portfolio_url),
    linkedin_url: withScheme(form.linkedin_url),
    availability: form.availability as FreelancerAvailability,
    preferred_start_date: nullable(form.preferred_start_date),
    available_until: nullable(form.available_until),
    hours_per_day: nullable(form.hours_per_day),
    hours_per_week: nullable(form.hours_per_week),
    notice_period_days: nullable(form.notice_period_days),
    timezone: form.timezone.trim(),
  };
  if (form.id_document_number.trim()) payload.id_document_number = form.id_document_number.trim();
  if (lastSavedStep) payload.last_saved_step = lastSavedStep;
  if (mode === 'admin') {
    payload.email = form.email.trim();
    payload.currency = form.currency;
    payload.rate = nullable(form.rate);
    payload.notes = form.notes;
    payload.internal_remarks = form.internal_remarks;
  }
  return payload;
}

/** Only the identifiers of the chosen payment method are sent (bank fields only for a bank transfer). */
export function bankDetailPayload(form: FreelancerFormState, bankConfig: CountryConfig | null, mode: WizardMode): FreelancerBankDetailPayload {
  const payload: FreelancerBankDetailPayload = { payment_method: form.payment_method as BankPaymentMethod | '' };
  if (form.tax_number.trim()) payload.tax_number = form.tax_number.trim();
  if (form.payment_method === 'bank_transfer') {
    // Until the bank country's rules have loaded nothing is blanked - the server applies them too.
    const bank = bankConfig
      ? bankPayload(form.bank, bankConfig)
      : {
          bank_country: form.bank.bank_country.trim(), account_holder_name: form.bank.account_holder_name.trim(),
          bank_name: form.bank.bank_name.trim(), branch_name: form.bank.branch_name.trim(), bank_address: form.bank.bank_address.trim(),
          ifsc_code: normalizeBankValue('ifsc_code', form.bank.ifsc_code), routing_code: form.bank.routing_code.trim(),
          swift_code: normalizeBankValue('swift_code', form.bank.swift_code), iban: normalizeBankValue('iban', form.bank.iban),
          account_type: form.bank.account_type, account_number: normalizeBankValue('account_number', form.bank.account_number),
        };
    Object.assign(payload, bank);
    if (bank.account_number) payload.confirm_account_number = normalizeBankValue('account_number', form.bank.confirm_account_number);
    else delete payload.account_number;
  } else if (form.payment_method === 'upi') {
    payload.upi_id = form.upi_id.trim();
  } else if (form.payment_method === 'paypal') {
    payload.paypal_email = form.paypal_email.trim();
  } else if (form.payment_method === 'wise') {
    payload.wise_email = form.wise_email.trim();
  }
  if (mode === 'admin') payload.payment_terms = form.payment_terms.trim();
  return payload;
}

/** The parts of the form stored on the bank-detail record. */
export const bankSliceOf = (form: FreelancerFormState) => ({
  payment_method: form.payment_method, bank: form.bank, upi_id: form.upi_id, paypal_email: form.paypal_email,
  wise_email: form.wise_email, payment_terms: form.payment_terms, tax_number: form.tax_number,
});

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ */
/* Countries / rules                                                   */
/* ------------------------------------------------------------------ */

export const residenceOf = (form: FreelancerFormState) => form.country_of_residence || form.permanent_country;
/** Tax country: tax residency -> residence -> permanent address (mirrors kyc.kyc_country_code). */
export const kycCountryOf = (form: FreelancerFormState) => form.tax_residency_country || residenceOf(form);
export const countryCodeOf = (countries: CountrySummary[], name: string) => findCountry(countries, name)?.code || '';

/** India rules (PAN, masked Aadhaar) when the tax country is India or not chosen yet. */
export const usesIndiaRules = (form: FreelancerFormState, countries: CountrySummary[]) => {
  const name = kycCountryOf(form);
  if (!name) return true;
  const code = countryCodeOf(countries, name);
  return code ? code === 'IN' : /^india$/i.test(name.trim());
};

export const isUsPerson = (form: FreelancerFormState, countries: CountrySummary[]) =>
  [form.nationality, residenceOf(form), form.tax_residency_country].some((n) => n && countryCodeOf(countries, n) === 'US');

/* ------------------------------------------------------------------ */
/* Time zones                                                          */
/* ------------------------------------------------------------------ */

/** Single-time-zone countries -> default zone (multi-zone countries are left for the user). */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  IN: 'Asia/Kolkata', GB: 'Europe/London', IE: 'Europe/Dublin', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar',
  KW: 'Asia/Kuwait', OM: 'Asia/Muscat', BH: 'Asia/Bahrain', SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur',
  PH: 'Asia/Manila', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', LK: 'Asia/Colombo', BD: 'Asia/Dhaka',
  PK: 'Asia/Karachi', NP: 'Asia/Kathmandu', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai',
  HK: 'Asia/Hong_Kong', TW: 'Asia/Taipei', IL: 'Asia/Jerusalem', TR: 'Europe/Istanbul', EG: 'Africa/Cairo',
  ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', KE: 'Africa/Nairobi', GH: 'Africa/Accra', DE: 'Europe/Berlin',
  FR: 'Europe/Paris', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', ES: 'Europe/Madrid', IT: 'Europe/Rome',
  PT: 'Europe/Lisbon', CH: 'Europe/Zurich', AT: 'Europe/Vienna', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', RO: 'Europe/Bucharest',
  GR: 'Europe/Athens', HU: 'Europe/Budapest', UA: 'Europe/Kyiv', NZ: 'Pacific/Auckland',
};

export const defaultTimeZone = (countryCode: string) => COUNTRY_TIME_ZONES[countryCode] || '';

export function timeZoneOptions(): string[] {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    return [];
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type FormErrors = Record<string, string>;

export interface ValidationContext {
  mode: WizardMode;
  countries: CountrySummary[];
  /** Config of the tax country (tax ID label / regex). */
  kycConfig: CountryConfig | null;
  permanentConfig: CountryConfig | null;
  tempConfig: CountryConfig | null;
  bankConfig: CountryConfig | null;
  saved: { hasIdNumber: boolean; hasTaxNumber: boolean; hasAccountNumber: boolean };
  slots: DocumentSlotConfig[];
  documents: FreelancerDocument[];
  /** False until the record exists (documents can't be uploaded before that). */
  hasRecord: boolean;
}

const UPI_REGEX = /^[A-Za-z0-9][A-Za-z0-9.\-_]{1,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const ageOn = (dob: string, today: string) => {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

/** Mirrors kyc.clean_id_document_number. */
export function idNumberError(type: string, raw: string, nationalityCode: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (!type) return 'Select the ID document type first';
  if (type === 'aadhaar_masked') {
    const compact = value.replace(/[\s-]/g, '').toUpperCase().replace(/\*/g, 'X');
    if (/^\d{12}$/.test(compact)) return 'For your privacy enter only the last 4 digits of your Aadhaar, e.g. XXXX XXXX 1234';
    return /^(?:X{8})?\d{4}$/.test(compact) ? '' : 'Enter the last 4 digits of your Aadhaar, e.g. XXXX XXXX 1234';
  }
  if (type === 'passport') {
    const compact = value.replace(/[\s-]/g, '').toUpperCase();
    if (nationalityCode === 'IN') return /^[A-Z][0-9]{7}$/.test(compact) ? '' : 'Indian passport numbers are one letter followed by 7 digits (e.g. A1234567)';
    return /^[A-Z0-9]{6,12}$/.test(compact) ? '' : 'Enter a valid passport number (6 to 12 letters and digits)';
  }
  const upper = value.replace(/\s+/g, ' ').toUpperCase();
  if (type === 'driving_licence') return /^[A-Z0-9][A-Z0-9 \-/]{4,24}$/.test(upper) ? '' : 'Enter a valid driving licence number';
  return /^[A-Z0-9][A-Z0-9 \-/]{3,29}$/.test(upper) ? '' : "Enter a valid ID number (letters, digits, spaces, '-' or '/')";
}

/** PAN of an individual for India, otherwise the tax country's individual rule. */
export function taxNumberError(value: string, india: boolean, kycConfig: CountryConfig | null): string {
  const v = value.trim();
  if (!v) return '';
  if (india) {
    const pan = v.replace(/\s+/g, '').toUpperCase();
    if (!PAN_REGEX.test(pan)) return 'Enter a valid PAN (10 characters, e.g. ABCDE1234F)';
    if (pan[3] !== 'P') return "Enter your personal PAN - the 4th character of an individual's PAN is 'P'";
    return '';
  }
  return validateTaxId(v, kycConfig, 'individual', false);
}

export function taxRule(india: boolean, kycConfig: CountryConfig | null) {
  if (india) return { label: 'PAN', example: 'ABCDE1234F', required: true, help: '10-character Permanent Account Number.' };
  const rule = kycConfig?.tax.individual;
  return { label: rule?.label || 'Tax Identification Number', example: rule?.example || '', required: !!rule?.required, help: rule?.help || '' };
}

function validateBasic(form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  const e: FormErrors = {};
  const residence = residenceOf(form) || form.nationality;
  if (!partial) {
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    if (!form.date_of_birth) e.date_of_birth = 'Date of birth is required';
    if (!form.nationality) e.nationality = 'Nationality is required';
  }
  if (!form.email.trim()) {
    if (!partial || ctx.mode === 'admin') e.email = 'Email address is required';
  } else if (!EMAIL_REGEX.test(form.email.trim())) {
    e.email = 'Enter a valid email address';
  }
  const phone = validatePhoneValue(form.phone, ctx.countries, residence, !partial);
  if (phone) e.phone = phone;
  const alternate = validatePhoneValue(form.alternate_phone, ctx.countries, residence, false);
  if (alternate) e.alternate_phone = alternate;
  else if (form.alternate_phone && form.alternate_phone === form.phone) e.alternate_phone = 'Use a different number from the primary phone';
  if (form.date_of_birth) {
    const today = todayIso();
    if (form.date_of_birth > today) e.date_of_birth = "Date of birth can't be in the future";
    else if (form.date_of_birth < '1900-01-01') e.date_of_birth = 'Enter a valid date of birth';
    else if (ageOn(form.date_of_birth, today) < 18) e.date_of_birth = 'Freelancers must be at least 18 years old';
  }
  return e;
}

function validateIdentity(form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  const e: FormErrors = {};
  const india = usesIndiaRules(form, ctx.countries);
  const rule = taxRule(india, ctx.kycConfig);
  if (!partial) {
    if (!form.country_of_residence) e.country_of_residence = 'Country of residence is required';
    if (!form.id_document_type) e.id_document_type = 'Select the type of your government photo ID';
    if (!form.id_document_number.trim() && !ctx.saved.hasIdNumber) e.id_document_number = 'ID document number is required';
    if (!form.tax_residency_country) e.tax_residency_country = 'Tax residency country is required';
    if (rule.required && !form.tax_number.trim() && !ctx.saved.hasTaxNumber) e.tax_number = `${rule.label} is required`;
  }
  const idError = idNumberError(form.id_document_type, form.id_document_number, countryCodeOf(ctx.countries, form.nationality));
  if (idError) e.id_document_number = idError;
  const taxError = taxNumberError(form.tax_number, india, ctx.kycConfig);
  if (taxError) e.tax_number = taxError;
  return e;
}

const isIndia = (countries: CountrySummary[], name: string) => countryCodeOf(countries, name) === 'IN';

function addressBlock(e: FormErrors, prefix: 'permanent' | 'temp', found: AddressErrors) {
  (Object.keys(found) as (keyof AddressErrors)[]).forEach((k) => {
    const msg = found[k];
    if (!msg) return;
    e[k === 'country' ? `${prefix}_country` : `${prefix}.${k}`] = msg;
  });
}

function validateAddress(form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  const e: FormErrors = {};
  addressBlock(e, 'permanent', addressErrors(form.permanent, ctx.permanentConfig, { required: !partial, country: form.permanent_country }));
  if (!partial && isIndia(ctx.countries, form.permanent_country) && !form.permanent.state.trim()) e['permanent.state'] = 'State is required';
  if (!form.temp_same_as_permanent) {
    const started = !!(form.temp.line1.trim() || form.temp.city.trim() || form.temp.postal_code.trim());
    addressBlock(e, 'temp', addressErrors(form.temp, ctx.tempConfig, { required: !partial && started, country: started ? form.temp_country : undefined }));
    if (!partial && started && isIndia(ctx.countries, form.temp_country) && !form.temp.state.trim()) e['temp.state'] = 'State is required';
  }
  const phone = validatePhoneValue(form.emergency_contact_phone, ctx.countries, residenceOf(form), false);
  if (phone) e.emergency_contact_phone = phone;
  else if (!partial && form.emergency_contact_name.trim() && !form.emergency_contact_phone) e.emergency_contact_phone = 'Add a phone number for the emergency contact';
  return e;
}

function validateBanking(form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  const e: FormErrors = {};
  const method = form.payment_method;
  if (!method) {
    if (!partial) e.payment_method = 'Choose how you would like to be paid';
  } else if (method === 'bank_transfer') {
    const found: BankErrors = bankErrors(form.bank, ctx.bankConfig, { partial, hasSavedAccount: ctx.saved.hasAccountNumber, requireCountry: true });
    (Object.keys(found) as (keyof BankErrors)[]).forEach((k) => {
      if (found[k]) e[`bank.${k}`] = found[k]!;
    });
  } else if (method === 'upi') {
    if (form.upi_id.trim() && !UPI_REGEX.test(form.upi_id.trim())) e.upi_id = 'Enter a valid UPI ID (e.g. name@okhdfcbank)';
    else if (!partial && !form.upi_id.trim()) e.upi_id = 'UPI ID is required';
  } else if (method === 'paypal' || method === 'wise') {
    const key = method === 'paypal' ? 'paypal_email' : 'wise_email';
    const value = form[key].trim();
    if (value && !EMAIL_REGEX.test(value)) e[key] = 'Enter a valid email address';
    else if (!partial && !value) e[key] = `${method === 'paypal' ? 'PayPal' : 'Wise'} email address is required`;
  }
  return e;
}

const numberError = (value: string, min: number, max: number, message: string, opts: { integer?: boolean; exclusiveMin?: boolean } = {}) => {
  if (value.trim() === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (opts.exclusiveMin && n <= min) || (opts.integer && !Number.isInteger(n))) return message;
  return '';
};

function urlError(value: string) {
  if (!value.trim()) return '';
  try {
    const url = new URL(withScheme(value));
    return url.hostname.includes('.') ? '' : 'Enter a valid web address';
  } catch {
    return 'Enter a valid web address';
  }
}

function validateProfessional(form: FreelancerFormState, _ctx: ValidationContext, partial: boolean): FormErrors {
  const e: FormErrors = {};
  if (!partial) {
    if (!form.professional_title.trim()) e.professional_title = 'Professional title is required';
    if (!form.skills.trim()) e.skills = 'Add at least one skill';
    if (!form.availability) e.availability = 'Select your availability';
  }
  const checks: [keyof FreelancerFormState, string][] = [
    ['years_of_experience', numberError(form.years_of_experience, 0, 70, 'Enter whole years between 0 and 70', { integer: true })],
    ['hours_per_day', numberError(form.hours_per_day, 0, 24, 'Enter more than 0 and at most 24 hours', { exclusiveMin: true })],
    ['hours_per_week', numberError(form.hours_per_week, 0, 168, 'Enter more than 0 and at most 168 hours', { exclusiveMin: true })],
    ['notice_period_days', numberError(form.notice_period_days, 0, 365, 'Enter whole days between 0 and 365', { integer: true })],
    ['rate', numberError(form.rate, 0, 1e10, 'Enter a valid amount')],
    ['portfolio_url', urlError(form.portfolio_url)],
  ];
  checks.forEach(([k, msg]) => {
    if (msg) e[k] = msg;
  });
  if (form.linkedin_url.trim()) {
    const err = urlError(form.linkedin_url);
    if (err) e.linkedin_url = err;
    else {
      const host = new URL(withScheme(form.linkedin_url)).hostname.toLowerCase();
      if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) e.linkedin_url = 'Enter a LinkedIn profile URL (linkedin.com/in/...)';
    }
  }
  if (form.preferred_start_date && form.available_until && form.available_until < form.preferred_start_date) {
    e.available_until = 'Must be on or after the preferred start date';
  }
  const zones = timeZoneOptions();
  if (form.timezone && zones.length && !zones.includes(form.timezone) && form.timezone !== 'UTC') e.timezone = 'Choose a time zone from the list';
  return e;
}

function validateDocuments(_form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  if (partial) return {};
  if (!ctx.hasRecord) return { documents: 'Save the onboarding first, then upload the documents' };
  const summary = summarizeDocuments(ctx.slots, ctx.documents);
  const problems = [
    ...summary.missingRequired.map((l) => `${l} is missing`),
    ...summary.problemRequired.map((l) => `${l} was rejected or has expired`),
  ];
  return problems.length ? { documents: problems.join('; ') } : {};
}

const VALIDATORS: Record<OnboardingStepKey, (f: FreelancerFormState, c: ValidationContext, p: boolean) => FormErrors> = {
  basic: validateBasic,
  identity: validateIdentity,
  address: validateAddress,
  banking: validateBanking,
  professional: validateProfessional,
  documents: validateDocuments,
};

export function validateStep(step: WizardStepKey, form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  if (step === 'review') return validateAll(form, ctx, partial);
  return VALIDATORS[step](form, ctx, partial);
}

export function validateAll(form: FreelancerFormState, ctx: ValidationContext, partial: boolean): FormErrors {
  return (Object.keys(VALIDATORS) as OnboardingStepKey[]).reduce<FormErrors>(
    (acc, step) => ({ ...acc, ...VALIDATORS[step](form, ctx, partial) }),
    {},
  );
}

/* ------------------------------------------------------------------ */
/* Server errors -> form keys / steps                                  */
/* ------------------------------------------------------------------ */

const SERVER_TO_FORM: Record<string, string> = {
  full_name: 'first_name',
  permanent_address_line1: 'permanent.line1', permanent_address_line2: 'permanent.line2', permanent_city: 'permanent.city',
  permanent_state: 'permanent.state', permanent_pincode: 'permanent.postal_code',
  temp_address_line1: 'temp.line1', temp_address_line2: 'temp.line2', temp_city: 'temp.city', temp_state: 'temp.state',
  temp_pincode: 'temp.postal_code',
  bank_country: 'bank.bank_country', account_holder_name: 'bank.account_holder_name', bank_name: 'bank.bank_name',
  account_number: 'bank.account_number', confirm_account_number: 'bank.confirm_account_number', ifsc_code: 'bank.ifsc_code',
  routing_code: 'bank.routing_code', swift_code: 'bank.swift_code', iban: 'bank.iban', branch_name: 'bank.branch_name',
  bank_address: 'bank.bank_address', account_type: 'bank.account_type',
};

export const formKeyOf = (serverKey: string) => SERVER_TO_FORM[serverKey] ?? serverKey;

const FIELD_STEPS: Record<string, WizardStepKey> = {
  first_name: 'basic', middle_name: 'basic', last_name: 'basic', email: 'basic', phone: 'basic', alternate_phone: 'basic',
  date_of_birth: 'basic', gender: 'basic', nationality: 'basic', photo: 'basic',
  country_of_residence: 'identity', id_document_type: 'identity', id_document_number: 'identity', tax_number: 'identity',
  tax_residency_country: 'identity', pan_verification_status: 'identity',
  permanent_country: 'address', temp_country: 'address', temp_same_as_permanent: 'address',
  emergency_contact_name: 'address', emergency_contact_phone: 'address', emergency_contact_relationship: 'address',
  payment_method: 'banking', upi_id: 'banking', paypal_email: 'banking', wise_email: 'banking', payment_terms: 'banking',
  payment_status: 'banking',
  professional_title: 'professional', skills: 'professional', years_of_experience: 'professional', portfolio_url: 'professional',
  linkedin_url: 'professional', availability: 'professional', preferred_start_date: 'professional',
  available_until: 'professional', hours_per_day: 'professional', hours_per_week: 'professional',
  notice_period_days: 'professional', timezone: 'professional', currency: 'professional', rate: 'professional',
  notes: 'professional', internal_remarks: 'professional', documents: 'documents',
};

export function stepOfKey(formKey: string): WizardStepKey | null {
  if (formKey.startsWith('permanent.') || formKey.startsWith('temp.')) return 'address';
  if (formKey.startsWith('bank.')) return 'banking';
  if (formKey.startsWith('document:')) return 'documents';
  return FIELD_STEPS[formKey] ?? null;
}

/** Server field errors ({field: message}, from parseApiErrors) -> form keys. */
export function formErrorsFromServer(parsed: Record<string, string | undefined>): FormErrors {
  const e: FormErrors = {};
  Object.entries(parsed).forEach(([key, message]) => {
    if (key === 'general' || !message) return;
    e[formKeyOf(key)] = message;
  });
  return e;
}

/** Issues from a 400 `missing` list (or the detail payload) -> inline errors. */
export function formErrorsFromIssues(issues: OnboardingIssue[]): FormErrors {
  const e: FormErrors = {};
  const documents: string[] = [];
  issues.forEach((issue) => {
    if (issue.key.startsWith('document:')) documents.push(issue.message);
    else if (!e[formKeyOf(issue.key)]) e[formKeyOf(issue.key)] = issue.message;
  });
  if (documents.length) e.documents = documents.join(' ');
  return e;
}

export const firstErrorStep = (errors: FormErrors): WizardStepKey | null => {
  const steps = Object.keys(errors).map(stepOfKey).filter((s): s is WizardStepKey => !!s);
  if (!steps.length) return null;
  return steps.sort((a, b) => stepIndex(a) - stepIndex(b))[0];
};

export const errorsForStep = (errors: FormErrors, step: WizardStepKey) =>
  Object.fromEntries(Object.entries(errors).filter(([k, v]) => v && stepOfKey(k) === step));

/** Errors for <AddressFields> (permanent / current address). */
export function addressErrorsFor(errors: FormErrors, prefix: 'permanent' | 'temp'): AddressErrors {
  const e: AddressErrors = {};
  (['line1', 'line2', 'city', 'district', 'state', 'postal_code', 'landmark'] as const).forEach((k) => {
    if (errors[`${prefix}.${k}`]) e[k] = errors[`${prefix}.${k}`];
  });
  if (errors[`${prefix}_country`]) e.country = errors[`${prefix}_country`];
  return e;
}

/** Errors for <BankDetailsFields>. */
export function bankErrorsFor(errors: FormErrors): BankErrors {
  const e: BankErrors = {};
  Object.entries(errors).forEach(([k, v]) => {
    if (k.startsWith('bank.') && v) e[k.slice(5) as keyof BankFormValue] = v;
  });
  return e;
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const toSlots = (slots: RequiredDocumentSlot[] | undefined): DocumentSlotConfig[] =>
  (slots || []).map((s) => ({ key: s.key, label: s.label, required: s.required, tracksExpiry: s.tracks_expiry, helpText: s.help_text || undefined }));

/** Documents the slot list doesn't show: older uploads in a slot's category and categories without a slot. */
export function otherDocuments(slots: DocumentSlotConfig[], documents: FreelancerDocument[]): FreelancerDocument[] {
  const shown = latestByCategory(documents);
  const slotKeys = new Set(slots.map((s) => s.key));
  return documents.filter((d) => !slotKeys.has(d.category) || shown.get(d.category)?.id !== d.id);
}

/** Why Submit is disabled: required documents missing / rejected / expired. */
export function documentBlockReason(slots: DocumentSlotConfig[], documents: FreelancerDocument[]): string {
  if (!slots.length) return '';
  const summary = summarizeDocuments(slots, documents);
  const parts: string[] = [];
  if (summary.missingRequired.length) parts.push(`Upload: ${summary.missingRequired.join(', ')}`);
  if (summary.problemRequired.length) parts.push(`Replace (rejected or expired): ${summary.problemRequired.join(', ')}`);
  return parts.join('. ');
}
