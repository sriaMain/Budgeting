import { formatDate as toDMY } from '../../utils/date';
import type { ReactNode } from 'react';
import type { ReviewRow } from '../../components/onboarding/OnboardingWizard';
import { bankPayload } from '../../components/onboarding/bankForm';
import type { CountryConfig } from '../../services/countries';
import { normalizeBankValue } from '../../utils/countryRules';
import { namePartsFrom, joinName } from '../../utils/personName';
import {
  EMPTY_VENDOR_FORM, INCORPORATED_VENDOR_TYPES, normalizeIdentifier, vendorEntity,
  type VendorFieldErrors, type VendorFormValues,
} from '../../schemas/vendorOnboarding.schemas';
import type {
  Choice, VendorBankDetail, VendorKYC, VendorOnboardingProfile, VendorProcurementDetail, VendorRequirementIssue,
  VendorReview, VendorSectionsPayload,
} from '../../types/vendorOnboarding.types';
import { VENDOR_WIZARD_STEPS, type VendorWizardStepKey, wizardStepForServerStep } from './components/vendorSteps';

/**
 * Form logic shared by the admin onboarding drawer, the full-page wizard and the vendor's
 * self-service portal, so all three load, save and display a vendor exactly the same way.
 */

/* ------------------------------------------------------------------ */
/* Load: record -> form values                                         */
/* ------------------------------------------------------------------ */

/** What both the admin detail and the public (portal) detail carry. */
export interface VendorRecordLike {
  name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  vendor_type: string;
  email: string;
  phone: string;
  contact_person_name?: string;
  company_code?: string;
  plant?: string;
  internal_requester?: string;
  initial_comments?: string;
  onboarding_profile: VendorOnboardingProfile | null;
  kyc: VendorKYC | null;
  bank_detail: VendorBankDetail | null;
  procurement_detail: VendorProcurementDetail | null;
  review?: VendorReview | null;
}

const s = (v: string | null | undefined) => v ?? '';

export function recordToFormValues(r: VendorRecordLike): VendorFormValues {
  const p = r.onboarding_profile;
  const k = r.kyc;
  const b = r.bank_detail;
  const proc = r.procurement_detail;
  const names = namePartsFrom(r, r.name);
  const country = s(p?.country);
  return {
    basic: {
      ...names,
      vendor_type: s(r.vendor_type),
      service_category: s(p?.service_category),
      country,
      contact_person_name: s(p?.contact_person_name) || s(r.contact_person_name),
      contact_person_designation: s(p?.contact_person_designation),
      email: s(r.email),
      phone: s(r.phone),
      vendor_introduction: s(p?.vendor_introduction),
      finance_manager_name: s(p?.finance_manager_name),
      finance_manager_email: s(p?.finance_manager_email),
      finance_manager_mobile: s(p?.finance_manager_mobile),
      company_code: s(p?.company_code) || s(r.company_code),
      plant: s(p?.plant) || s(r.plant),
      internal_requester: s(r.internal_requester),
      initial_comments: s(r.initial_comments),
      headcount: p?.headcount != null ? String(p.headcount) : '',
      rating: p?.rating ?? 0,
      manual_amount_spent: p?.manual_amount_spent != null ? String(Number(p.manual_amount_spent)) : '',
    },
    kyc: {
      pan: s(k?.pan), gst_registered: !!p?.gst_registered, gstin: s(p?.gstin), cin: s(k?.cin),
      incorporation_date: s(k?.incorporation_date), tan: s(k?.tan), tan_mobile: s(k?.tan_mobile),
      epf_number: s(k?.epf_number), esic_number: s(k?.esic_number), esic_district: s(k?.esic_district),
      msme_registered: !!p?.msme_registered, udyam_number: s(p?.udyam_number), msme_category: s(p?.msme_category),
      tax_id: s(k?.tax_id), country_of_tax_residence: s(k?.country_of_tax_residence),
      registration_number: s(p?.registration_number), beneficial_ownership_details: s(k?.beneficial_ownership_details),
    },
    address: {
      line1: s(p?.address_line1), line2: s(p?.address_line2), city: s(p?.city), district: s(p?.district),
      state: s(p?.state), postal_code: s(p?.pin_code), landmark: s(p?.landmark),
    },
    bank: {
      // A blank bank country means "the vendor's country" (older records only stored it for
      // overseas banks) - the form shows that explicitly so the right identifiers appear.
      bank_country: s(b?.bank_country) || country || (b ? 'India' : ''),
      account_holder_name: s(b?.account_holder_name), bank_name: s(b?.bank_name),
      // Write-only on the server - a blank field keeps the number on file.
      account_number: '', confirm_account_number: '',
      ifsc_code: s(b?.ifsc_code), routing_code: s(b?.routing_code), swift_code: s(b?.swift_code), iban: s(b?.iban),
      branch_name: s(b?.branch), bank_address: s(b?.bank_address), account_type: s(b?.account_type),
    },
    commercial: {
      contract_number: s(proc?.contract_number), po_number: s(proc?.po_number),
      contract_start_date: s(proc?.contract_start_date), contract_end_date: s(proc?.contract_end_date),
      order_currency: s(proc?.order_currency), payment_terms: s(proc?.payment_terms), custom_payment_terms: s(proc?.custom_payment_terms),
      billing_frequency: s(proc?.billing_frequency), service_rate: proc?.service_rate != null ? String(Number(proc.service_rate)) : '',
      rate_unit: s(proc?.rate_unit), withholding_tax_applicable: !!proc?.withholding_tax_applicable,
      withholding_tax_percentage: proc?.withholding_tax_percentage != null ? String(Number(proc.withholding_tax_percentage)) : '',
      tax_remarks: s(proc?.tax_remarks),
      account_group: s(proc?.account_group), purchasing_org: s(proc?.purchasing_org), grouping_key: s(proc?.grouping_key),
      partner_category: s(proc?.partner_category), incoterms_1: s(proc?.incoterms_1), incoterms_2: s(proc?.incoterms_2),
      reconciliation_account: s(proc?.reconciliation_account), schema_group: s(proc?.schema_group),
      gr_based_invoice_verification: !!proc?.gr_based_invoice_verification, check_double_invoice: !!proc?.check_double_invoice,
    },
    review: r.review
      ? {
          kyc_status: r.review.kyc_status, risk_rating: r.review.risk_rating, compliance_remarks: r.review.compliance_remarks || '',
          bank_verification_status: r.review.bank_verification_status, bank_verification_remarks: r.review.bank_verification_remarks || '',
        }
      : { ...EMPTY_VENDOR_FORM.review },
  };
}

/** The record's stored bank country is blank but the form shows one - persist it with the next save. */
export const bankCountryNeedsSaving = (r: VendorRecordLike | null, values: VendorFormValues) =>
  !!r?.bank_detail && !r.bank_detail.bank_country && !!values.bank.bank_country.trim();

/* ------------------------------------------------------------------ */
/* Save: form values -> API sections                                   */
/* ------------------------------------------------------------------ */

export interface PayloadContext {
  /** Admin form - includes the internal fields the portal never sends. */
  internal: boolean;
  /** Indian rule set for the vendor's country. */
  indian: boolean;
  bankConfig: CountryConfig | null;
}

const trim = (v: string) => (v || '').trim();
const dateOrNull = (v: string) => (trim(v) ? trim(v) : null);
const numberOrNull = (v: string) => (trim(v) ? trim(v) : null);

/** Every API section derived from the form. Identifiers that don't apply to the vendor's (or the
 * bank's) country are sent blank, so a value typed before switching country can't linger. */
export function buildSectionsPayload(values: VendorFormValues, ctx: PayloadContext) {
  const { basic: b, kyc: k, address: a, bank, commercial: c } = values;
  const business = vendorEntity(b.vendor_type) === 'business';
  const incorporated = INCORPORATED_VENDOR_TYPES.includes(b.vendor_type);
  const indian = ctx.indian;

  const identity: Record<string, unknown> = {
    first_name: trim(b.first_name), middle_name: trim(b.middle_name), last_name: trim(b.last_name),
    phone: trim(b.phone), contact_person_name: trim(b.contact_person_name),
  };
  if (ctx.internal) {
    Object.assign(identity, {
      vendor_type: b.vendor_type, email: trim(b.email), internal_requester: trim(b.internal_requester),
      initial_comments: trim(b.initial_comments), company_code: trim(b.company_code), plant: trim(b.plant),
    });
  }

  const profile: Record<string, unknown> = {
    service_category: trim(b.service_category), country: trim(b.country),
    contact_person_name: trim(b.contact_person_name), contact_person_designation: trim(b.contact_person_designation),
    vendor_introduction: trim(b.vendor_introduction), finance_manager_name: trim(b.finance_manager_name),
    finance_manager_email: trim(b.finance_manager_email), finance_manager_mobile: trim(b.finance_manager_mobile),
    gst_registered: indian && k.gst_registered, gstin: indian && k.gst_registered ? normalizeIdentifier(k.gstin) : '',
    msme_registered: indian && k.msme_registered,
    udyam_number: indian && k.msme_registered ? normalizeIdentifier(k.udyam_number) : '',
    msme_category: indian && k.msme_registered ? k.msme_category : '',
    registration_number: business ? trim(k.registration_number) : '',
    address_line1: trim(a.line1), address_line2: trim(a.line2), city: trim(a.city), district: trim(a.district),
    state: trim(a.state), pin_code: trim(a.postal_code), landmark: trim(a.landmark),
  };
  if (ctx.internal) {
    Object.assign(profile, {
      company_code: trim(b.company_code), plant: trim(b.plant),
      headcount: trim(b.headcount) ? Number(b.headcount) : null,
      rating: b.rating || null,
      manual_amount_spent: numberOrNull(b.manual_amount_spent),
    });
  }

  const tan = indian ? normalizeIdentifier(k.tan) : '';
  const esic = indian ? normalizeIdentifier(k.esic_number) : '';
  const kyc: Record<string, unknown> = {
    pan: indian ? normalizeIdentifier(k.pan) : '',
    cin: indian && incorporated ? normalizeIdentifier(k.cin) : '',
    incorporation_date: (indian ? incorporated : business) ? dateOrNull(k.incorporation_date) : null,
    tan,
    tan_mobile: tan ? trim(k.tan_mobile) : '',
    epf_number: indian ? normalizeIdentifier(k.epf_number) : '',
    esic_number: esic,
    esic_district: esic ? trim(k.esic_district) : '',
    tax_id: indian ? '' : trim(k.tax_id),
    // An Indian vendor's tax residence is India; elsewhere it's asked for (defaulting to the vendor's country).
    country_of_tax_residence: indian ? trim(b.country) : trim(k.country_of_tax_residence),
    beneficial_ownership_details: business ? trim(k.beneficial_ownership_details) : '',
  };

  const bp = bankPayload(bank, ctx.bankConfig);
  const { branch_name, account_number, ...bankRest } = bp;
  const bank_detail: Record<string, unknown> = { ...bankRest, branch: branch_name, routing_code: bp.routing_code };
  if (account_number) {
    // Write-only: sent only when (re)entered, always with its confirmation.
    bank_detail.account_number = account_number;
    bank_detail.confirm_account_number = normalizeBankValue('account_number', bank.confirm_account_number);
  }

  const procurement_detail: Record<string, unknown> = {
    contract_number: trim(c.contract_number), po_number: trim(c.po_number),
    contract_start_date: dateOrNull(c.contract_start_date), contract_end_date: dateOrNull(c.contract_end_date),
    order_currency: c.order_currency, payment_terms: c.payment_terms,
    custom_payment_terms: c.payment_terms === 'custom' ? trim(c.custom_payment_terms) : '',
    billing_frequency: c.billing_frequency, service_rate: numberOrNull(c.service_rate), rate_unit: trim(c.rate_unit),
    withholding_tax_applicable: c.withholding_tax_applicable,
    withholding_tax_percentage: c.withholding_tax_applicable ? numberOrNull(c.withholding_tax_percentage) : null,
    tax_remarks: trim(c.tax_remarks),
  };
  if (ctx.internal) {
    Object.assign(procurement_detail, {
      account_group: trim(c.account_group), purchasing_org: trim(c.purchasing_org), grouping_key: trim(c.grouping_key),
      partner_category: trim(c.partner_category), incoterms_1: trim(c.incoterms_1), incoterms_2: trim(c.incoterms_2),
      reconciliation_account: trim(c.reconciliation_account), schema_group: trim(c.schema_group),
      gr_based_invoice_verification: c.gr_based_invoice_verification, check_double_invoice: c.check_double_invoice,
    });
  }
  return { identity, profile, kyc, bank_detail, procurement_detail };
}

export interface DirtySections {
  basic: boolean;
  kyc: boolean;
  address: boolean;
  bank: boolean;
  commercial: boolean;
}

/** Which form sections differ from what was last loaded / saved. A changed country or vendor
 * type also re-sends Identity & KYC, because what applies there depends on both. */
export function dirtySections(values: VendorFormValues, saved: VendorFormValues): DirtySections {
  const changed = (k: keyof DirtySections) => JSON.stringify(values[k]) !== JSON.stringify(saved[k]);
  const scopeChanged = values.basic.country !== saved.basic.country || values.basic.vendor_type !== saved.basic.vendor_type;
  return {
    basic: changed('basic'),
    kyc: changed('kyc') || scopeChanged,
    address: changed('address'),
    bank: changed('bank'),
    commercial: changed('commercial'),
  };
}

export const anyDirty = (d: DirtySections) => Object.values(d).some(Boolean);

/** Only the API sections a save needs to send. */
export function sectionsToSend(values: VendorFormValues, dirty: DirtySections, ctx: PayloadContext, extra: { bankCountry?: boolean } = {}): VendorSectionsPayload {
  const all = buildSectionsPayload(values, ctx);
  const out: VendorSectionsPayload = {};
  if (dirty.basic) out.identity = all.identity;
  if (dirty.basic || dirty.kyc || dirty.address) out.profile = all.profile;
  if (dirty.kyc) out.kyc = all.kyc;
  if (dirty.bank || extra.bankCountry) out.bank_detail = all.bank_detail;
  if (dirty.commercial) out.procurement_detail = all.procurement_detail;
  return out;
}

/* ------------------------------------------------------------------ */
/* Server errors -> form fields and steps                              */
/* ------------------------------------------------------------------ */

const PROFILE_PATHS: Record<string, string> = {
  service_category: 'basic.service_category', country: 'basic.country', contact_person_name: 'basic.contact_person_name',
  contact_person_designation: 'basic.contact_person_designation', vendor_introduction: 'basic.vendor_introduction',
  finance_manager_name: 'basic.finance_manager_name', finance_manager_email: 'basic.finance_manager_email',
  finance_manager_mobile: 'basic.finance_manager_mobile', company_code: 'basic.company_code', plant: 'basic.plant',
  headcount: 'basic.headcount', rating: 'basic.rating', manual_amount_spent: 'basic.manual_amount_spent',
  gst_registered: 'kyc.gst_registered', gstin: 'kyc.gstin', msme_registered: 'kyc.msme_registered',
  udyam_number: 'kyc.udyam_number', msme_category: 'kyc.msme_category', registration_number: 'kyc.registration_number',
  address_line1: 'address.line1', address_line2: 'address.line2', city: 'address.city', district: 'address.district',
  state: 'address.state', pin_code: 'address.postal_code', landmark: 'address.landmark',
};

const IDENTITY_PATHS: Record<string, string> = {
  first_name: 'basic.first_name', middle_name: 'basic.middle_name', last_name: 'basic.last_name', name: 'basic.first_name',
  vendor_type: 'basic.vendor_type', email: 'basic.email', phone: 'basic.phone', contact_person_name: 'basic.contact_person_name',
  company_code: 'basic.company_code', plant: 'basic.plant', internal_requester: 'basic.internal_requester',
  initial_comments: 'basic.initial_comments',
};

/** API section + field -> form path ('profile', 'pin_code' -> 'address.postal_code'). */
export function serverFieldPath(section: string, field: string): string | null {
  if (section === 'identity') return IDENTITY_PATHS[field] ?? null;
  if (section === 'profile') return PROFILE_PATHS[field] ?? null;
  if (section === 'kyc') return `kyc.${field}`;
  if (section === 'bank_detail') return field === 'branch' ? 'bank.branch_name' : `bank.${field}`;
  if (section === 'procurement_detail') return `commercial.${field}`;
  return null;
}

/** A submission issue's key (vendor_onboarding/progress.py) -> form path. */
export function issueFieldPath(key: string): string | null {
  if (key.startsWith('document_')) return null;
  if (IDENTITY_PATHS[key]) return IDENTITY_PATHS[key];
  if (PROFILE_PATHS[key]) return PROFILE_PATHS[key];
  const kycFields = ['pan', 'cin', 'incorporation_date', 'tan', 'tan_mobile', 'epf_number', 'esic_number', 'tax_id',
    'country_of_tax_residence', 'beneficial_ownership_details'];
  if (kycFields.includes(key)) return `kyc.${key}`;
  const bankFields = ['bank_country', 'account_holder_name', 'bank_name', 'account_number', 'ifsc_code', 'routing_code', 'swift_code', 'iban'];
  if (bankFields.includes(key)) return `bank.${key}`;
  const commercialFields = ['order_currency', 'payment_terms', 'custom_payment_terms', 'billing_frequency', 'contract_start_date',
    'contract_end_date', 'withholding_tax_percentage'];
  if (commercialFields.includes(key)) return `commercial.${key}`;
  return null;
}

/** Form path -> the wizard step that shows it. */
export function stepForPath(path: string): VendorWizardStepKey {
  const section = path.split('.')[0];
  if (section === 'bank') return 'banking';
  if (section === 'basic' || section === 'kyc' || section === 'address' || section === 'commercial' || section === 'documents') return section;
  return 'review';
}

export const stepsWithErrors = (errors: VendorFieldErrors): Set<VendorWizardStepKey> =>
  new Set(Object.keys(errors).map(stepForPath));

const firstMessage = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(firstMessage).find(Boolean) ?? '';
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(firstMessage).find(Boolean) ?? '';
  return value == null ? '' : String(value);
};

export interface ParsedVendorError {
  fieldErrors: VendorFieldErrors;
  /** Submission issues returned by a refused submit. */
  issues: VendorRequirementIssue[];
  general: string;
  status?: number;
}

/** Reads every error shape the vendor endpoints return: {error, errors: {section: {field: [..]}}}
 * (wizard saves), {error, errors: {field: [..]}} (single-section saves) and the submit / approve
 * refusals {error, issues: [...], errors: {issue_key: [..]}}. */
export function parseVendorError(err: unknown, fallback = 'Something went wrong. Please try again.'): ParsedVendorError {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  const status = response?.status;
  const data = (response?.data && typeof response.data === 'object' ? response.data : {}) as Record<string, unknown>;
  const fieldErrors: VendorFieldErrors = {};
  const issues = Array.isArray(data.issues) ? (data.issues as VendorRequirementIssue[]) : [];
  const raw = (data.errors && typeof data.errors === 'object' ? data.errors : null) as Record<string, unknown> | null;
  if (raw) {
    Object.entries(raw).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value as Record<string, unknown>).forEach(([field, messages]) => {
          const path = serverFieldPath(key, field);
          if (path && !fieldErrors[path]) fieldErrors[path] = firstMessage(messages);
        });
      } else {
        const path = issueFieldPath(key) ?? IDENTITY_PATHS[key] ?? PROFILE_PATHS[key];
        if (path && !fieldErrors[path]) fieldErrors[path] = firstMessage(value);
      }
    });
  }
  let general = [data.error, data.detail, data.message].find((m): m is string => typeof m === 'string' && !!m) ?? '';
  if (status === 429) general = 'Too many requests right now - wait a minute and try again.';
  else if (!response) general = 'Could not reach the server - check your connection and try again.';
  else if (status && status >= 500) general = 'The server could not complete this request. Please try again.';
  return { fieldErrors, issues, general: general || fallback, status };
}

/* ------------------------------------------------------------------ */
/* Review rows (Review & Submit step and the details page)             */
/* ------------------------------------------------------------------ */

export interface ReviewContext {
  internal: boolean;
  indian: boolean;
  vendorTypes: Choice[];
  paymentTerms: Choice[];
  billingFrequencies: Choice[];
  msmeCategories: Choice[];
  currencies: Choice[];
  countryConfig: CountryConfig | null;
  taxConfig: CountryConfig | null;
  bankConfig: CountryConfig | null;
  /** "XXXXXX4821" on file. */
  maskedAccountNumber?: string;
  /** Full validation errors (form path -> message): required values still empty show as Missing. */
  errors?: VendorFieldErrors;
}

export interface ReviewSectionData {
  step: VendorWizardStepKey;
  title: string;
  rows: ReviewRow[];
}

export const choiceLabel = (choices: Choice[], value: string) => (value ? choices.find((c) => c.value === value)?.label ?? value.replace(/_/g, ' ') : '');

const formatDate = (iso: string) => {
  return toDMY(iso, '');
};

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

export function buildReviewSections(values: VendorFormValues, ctx: ReviewContext): ReviewSectionData[] {
  const { basic: b, kyc: k, address: a, bank, commercial: c } = values;
  const entity = vendorEntity(b.vendor_type);
  const business = entity === 'business';
  const incorporated = INCORPORATED_VENDOR_TYPES.includes(b.vendor_type);
  const errors = ctx.errors ?? {};
  const row = (label: string, value: ReactNode, path?: string, wide = false): ReviewRow => ({
    label, value, wide, missing: !!path && !!errors[path] && (value === '' || value === null || value === undefined),
  });
  const title = (key: VendorWizardStepKey) => VENDOR_WIZARD_STEPS.find((s) => s.key === key)?.title ?? key;

  const basicRows: ReviewRow[] = [
    row(business ? 'Legal name' : 'Full name', joinName(b.first_name, b.middle_name, b.last_name), 'basic.first_name'),
    row('Vendor type', choiceLabel(ctx.vendorTypes, b.vendor_type), 'basic.vendor_type'),
    row('Service category', b.service_category, 'basic.service_category'),
    row('Country', b.country, 'basic.country'),
    row('Contact person', b.contact_person_name, 'basic.contact_person_name'),
    row('Designation', b.contact_person_designation),
    row('Contact email', b.email, 'basic.email'),
    row('Phone', b.phone),
    row('Finance contact', [b.finance_manager_name, b.finance_manager_email, b.finance_manager_mobile].filter(Boolean).join(' · ')),
    row('About the vendor', b.vendor_introduction, undefined, true),
  ];
  if (ctx.internal) {
    basicRows.push(
      row('Company code', b.company_code), row('Plant', b.plant),
      row('Internal requester', b.internal_requester), row('Headcount', b.headcount),
      row('Rating', b.rating ? `${b.rating} / 5` : ''), row('Internal comments', b.initial_comments, undefined, true),
    );
  }

  const taxRule = (ctx.taxConfig ?? ctx.countryConfig)?.tax[entity];
  const kycRows: ReviewRow[] = ctx.indian
    ? [
        row('PAN', k.pan, 'kyc.pan'),
        row('GST registered', k.gst_registered ? `Yes · ${k.gstin || '—'}` : 'No', 'kyc.gstin'),
        ...(incorporated
          ? [row(b.vendor_type === 'company' ? 'CIN' : 'LLPIN', k.cin, 'kyc.cin'), row('Date of incorporation', formatDate(k.incorporation_date), 'kyc.incorporation_date')]
          : business ? [row('Registration number', k.registration_number)] : []),
        row('TAN', k.tan ? `${k.tan}${k.tan_mobile ? ` · mobile ${k.tan_mobile}` : ''}` : '', 'kyc.tan_mobile'),
        row('EPF number', k.epf_number),
        row('ESIC number', k.esic_number ? `${k.esic_number}${k.esic_district ? ` · ${k.esic_district}` : ''}` : ''),
        row('MSME registered', k.msme_registered ? `Yes · ${k.udyam_number || '—'}${k.msme_category ? ` · ${choiceLabel(ctx.msmeCategories, k.msme_category)}` : ''}` : 'No', 'kyc.udyam_number'),
        ...(business ? [row('Beneficial ownership', k.beneficial_ownership_details, undefined, true)] : []),
      ]
    : [
        row('Country of tax residence', k.country_of_tax_residence, 'kyc.country_of_tax_residence'),
        row(taxRule?.label || 'Tax ID', k.tax_id, 'kyc.tax_id'),
        ...(business
          ? [
              row('Registration number', k.registration_number),
              row('Date of incorporation', formatDate(k.incorporation_date)),
              row('Beneficial ownership', k.beneficial_ownership_details, 'kyc.beneficial_ownership_details', true),
            ]
          : []),
      ];

  const postalLabel = ctx.countryConfig?.address.postal.label || 'Postal code';
  const addressRows: ReviewRow[] = [
    row('Address', [a.line1, a.line2].filter(Boolean).join(', '), 'address.line1', true),
    row('City / town', a.city, 'address.city'),
    ...(ctx.indian ? [row('District', a.district)] : []),
    row(ctx.countryConfig?.address.state_label || 'State / province', a.state),
    row(postalLabel, a.postal_code, 'address.postal_code'),
    row('Landmark', a.landmark),
    row('Country', b.country),
  ];

  const routing = ctx.bankConfig?.bank.routing;
  const routingValue = routing?.field === 'ifsc_code' ? bank.ifsc_code : routing?.field === 'routing_code' ? bank.routing_code : '';
  const enteredAccount = normalizeBankValue('account_number', bank.account_number);
  const accountType = ctx.bankConfig?.bank.account_types?.find(([v]) => v === bank.account_type)?.[1] ?? bank.account_type;
  const bankRows: ReviewRow[] = [
    row('Bank country', bank.bank_country, 'bank.bank_country'),
    row('Account holder', bank.account_holder_name, 'bank.account_holder_name'),
    row('Bank name', bank.bank_name, 'bank.bank_name'),
    row('Branch', bank.branch_name),
    row(ctx.bankConfig?.bank.account_number?.label || 'Account number',
      enteredAccount ? `${'X'.repeat(Math.max(0, enteredAccount.length - 4))}${enteredAccount.slice(-4)} (new, not saved yet)` : ctx.maskedAccountNumber || '',
      'bank.account_number'),
    ...(routing ? [row(routing.label, routingValue, `bank.${routing.field}`)] : []),
    ...(ctx.bankConfig?.bank.swift !== 'hidden' ? [row('SWIFT / BIC', bank.swift_code, 'bank.swift_code')] : []),
    ...(ctx.bankConfig?.bank.iban !== 'hidden' ? [row('IBAN', bank.iban, 'bank.iban')] : []),
    ...(ctx.bankConfig?.bank.account_types?.length ? [row('Account type', accountType)] : []),
    row('Bank address', bank.bank_address, undefined, true),
  ];

  const currency = choiceLabel(ctx.currencies, c.order_currency);
  const commercialRows: ReviewRow[] = [
    row('Contract number', c.contract_number),
    row('PO number', c.po_number),
    row('Contract start', formatDate(c.contract_start_date), 'commercial.contract_start_date'),
    row('Contract end', formatDate(c.contract_end_date), 'commercial.contract_end_date'),
    row('Order currency', currency, 'commercial.order_currency'),
    row('Payment terms', c.payment_terms === 'custom' ? `Custom · ${c.custom_payment_terms || '—'}` : choiceLabel(ctx.paymentTerms, c.payment_terms), 'commercial.payment_terms'),
    row('Billing frequency', choiceLabel(ctx.billingFrequencies, c.billing_frequency), 'commercial.billing_frequency'),
    row('Rate', c.service_rate ? `${c.order_currency ? `${c.order_currency} ` : ''}${c.service_rate}${c.rate_unit ? ` ${c.rate_unit}` : ''}` : ''),
    row('Withholding tax', c.withholding_tax_applicable ? `Yes · ${c.withholding_tax_percentage || '—'}%` : 'No', 'commercial.withholding_tax_percentage'),
    row('Tax remarks', c.tax_remarks, undefined, true),
  ];
  if (ctx.internal) {
    const erp: [string, string][] = [
      ['Account group', c.account_group], ['Purchasing organization', c.purchasing_org], ['Grouping key', c.grouping_key],
      ['Partner category', c.partner_category], ['Incoterms', [c.incoterms_1, c.incoterms_2].filter(Boolean).join(' · ')],
      ['Reconciliation account', c.reconciliation_account], ['Schema group', c.schema_group],
    ];
    erp.filter(([, v]) => v).forEach(([label, v]) => commercialRows.push(row(label, v)));
    if (c.gr_based_invoice_verification || c.check_double_invoice) {
      commercialRows.push(row('Invoice checks', [c.gr_based_invoice_verification && 'GR-based verification', c.check_double_invoice && 'Double-invoice check'].filter(Boolean).join(' · ')));
    }
  }

  return [
    { step: 'basic', title: title('basic'), rows: basicRows },
    { step: 'kyc', title: title('kyc'), rows: kycRows },
    { step: 'address', title: title('address'), rows: addressRows },
    { step: 'banking', title: title('banking'), rows: bankRows },
    { step: 'commercial', title: title('commercial'), rows: commercialRows },
  ];
}

/** Server submission issues grouped by wizard step (for the Review step's per-section issue lists). */
export function issuesByStep(issues: VendorRequirementIssue[]): Partial<Record<VendorWizardStepKey, string[]>> {
  const out: Partial<Record<VendorWizardStepKey, string[]>> = {};
  issues.forEach((i) => {
    const step = wizardStepForServerStep(i.step);
    (out[step] ??= []).push(i.kind === 'missing' ? `${i.message} is required` : i.message);
  });
  return out;
}

/** DOM id of a form field ('bank.ifsc_code' -> 'vw-bank-ifsc_code'), used to focus the first invalid field. */
export const vendorFieldId = (path: string) => `vw-${path.replace('.', '-')}`;
