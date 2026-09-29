import type { UseFormReturn } from 'react-hook-form';
import {
  vendorDetailsSchema, kycComplianceSchema, bankDetailsSchema, businessProcurementSchema, computeMissingDocuments,
  vendorJurisdiction, EMPTY_FORM_VALUES,
  type VendorOnboardingFormValues, type VendorDocumentRuleContext, type Jurisdiction,
} from '../../schemas/vendorOnboarding.schemas';
import type {
  VendorOnboardingDetail, VendorDocument, VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail, VendorReview,
} from '../../types/vendorOnboarding.types';
import type { VendorPublicDetail } from '../../types/vendorOnboardingPublic.types';
import * as api from '../../services/vendorOnboarding';
import * as publicApi from '../../services/vendorOnboardingPublic';

/**
 * Form logic shared by the admin onboarding drawer, the full-page wizard and the vendor's
 * self-service portal, so all three load, validate and save a vendor exactly the same way
 * (one source of truth). Sections 1-4 = Intake, Tax & KYC, Banking, Contract.
 */
export type VendorFormSection = 1 | 2 | 3 | 4;

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

interface VendorRecordLike {
  name: string;
  vendor_type: string;
  email: string;
  phone: string;
  contact_person_name?: string;
  company_code?: string;
  plant?: string;
  profile: VendorOnboardingProfile | null;
  kyc: VendorKYC | null;
  bank: VendorBankDetail | null;
  procurement: VendorProcurementDetail | null;
  review?: VendorReview | null;
}

function recordToFormValues(r: VendorRecordLike): VendorOnboardingFormValues {
  const p = r.profile;
  const k = r.kyc;
  const b = r.bank;
  const proc = r.procurement;
  const s = (v: string | null | undefined) => v ?? '';
  return {
    step1: {
      name: s(r.name), vendor_type: s(r.vendor_type), email: s(r.email), phone: s(r.phone),
      service_category: s(p?.service_category), registration_number: s(p?.registration_number),
      company_code: s(p?.company_code || r.company_code), plant: s(p?.plant || r.plant),
      contact_person_name: s(p?.contact_person_name || r.contact_person_name), contact_person_designation: s(p?.contact_person_designation),
      gst_registered: p?.gst_registered || false, gstin: s(p?.gstin),
      msme_registered: p?.msme_registered || false, udyam_number: s(p?.udyam_number), msme_category: s(p?.msme_category),
      address_line1: s(p?.address_line1), address_line2: s(p?.address_line2), city: s(p?.city),
      district: s(p?.district), state: s(p?.state), country: s(p?.country), pin_code: s(p?.pin_code),
      landmark: s(p?.landmark), vendor_introduction: s(p?.vendor_introduction),
      finance_manager_name: s(p?.finance_manager_name), finance_manager_email: s(p?.finance_manager_email),
      finance_manager_mobile: s(p?.finance_manager_mobile),
      headcount: p?.headcount != null ? String(p.headcount) : '', rating: p?.rating ?? 0,
    },
    step2: {
      country_of_tax_residence: s(k?.country_of_tax_residence), pan: s(k?.pan), cin: s(k?.cin),
      incorporation_date: s(k?.incorporation_date), tan: s(k?.tan), tan_mobile: s(k?.tan_mobile),
      epf_number: s(k?.epf_number), esic_number: s(k?.esic_number), esic_district: s(k?.esic_district),
      tax_id: s(k?.tax_id), beneficial_ownership_details: s(k?.beneficial_ownership_details),
      vendor_type: s(r.vendor_type),
    },
    step3: {
      bank_name: s(b?.bank_name), account_holder_name: s(b?.account_holder_name), account_number: s(b?.account_number),
      ifsc_code: s(b?.ifsc_code), swift_code: s(b?.swift_code), iban: s(b?.iban),
      bank_country: s(b?.bank_country), bank_address: s(b?.bank_address),
      bank_id: s(b?.bank_id), bank_country_key: s(b?.bank_country_key),
      bank_control_key: s(b?.bank_control_key), branch: s(b?.branch), region: s(b?.region),
      street: s(b?.street), city: s(b?.city),
    },
    step4: {
      contract_number: s(proc?.contract_number), po_number: s(proc?.po_number),
      contract_start_date: s(proc?.contract_start_date), contract_end_date: s(proc?.contract_end_date),
      order_currency: s(proc?.order_currency), payment_terms: s(proc?.payment_terms), custom_payment_terms: s(proc?.custom_payment_terms),
      billing_frequency: s(proc?.billing_frequency), service_rate: s(proc?.service_rate), rate_unit: s(proc?.rate_unit),
      withholding_tax_applicable: proc?.withholding_tax_applicable || false,
      withholding_tax_percentage: s(proc?.withholding_tax_percentage), tax_remarks: s(proc?.tax_remarks),
      account_group: s(proc?.account_group), purchasing_org: s(proc?.purchasing_org),
      grouping_key: s(proc?.grouping_key), partner_category: s(proc?.partner_category),
      incoterms_1: s(proc?.incoterms_1), incoterms_2: s(proc?.incoterms_2), reconciliation_account: s(proc?.reconciliation_account),
      schema_group: s(proc?.schema_group), gr_based_invoice_verification: proc?.gr_based_invoice_verification || false,
      check_double_invoice: proc?.check_double_invoice || false,
    },
    review: r.review
      ? {
          kyc_status: r.review.kyc_status, risk_rating: r.review.risk_rating, compliance_remarks: r.review.compliance_remarks || '',
          bank_verification_status: r.review.bank_verification_status, bank_verification_remarks: r.review.bank_verification_remarks || '',
        }
      : { ...EMPTY_FORM_VALUES.review },
  };
}

export const vendorToFormValues = (v: VendorOnboardingDetail): VendorOnboardingFormValues =>
  recordToFormValues({ ...v, profile: v.onboarding_profile, bank: v.bank_detail, procurement: v.procurement_detail, review: v.review });

export const publicDetailToFormValues = (d: VendorPublicDetail): VendorOnboardingFormValues =>
  recordToFormValues({ ...d, profile: d.onboarding_profile, bank: d.bank_detail, procurement: d.procurement_detail, review: null });

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

/** The five PATCH calls a section save needs - admin (by id) or portal (by token). */
export interface VendorSectionApi {
  /** Admin target - also saves the internal fields (rating, headcount) the portal never sends. */
  internal: boolean;
  patchIdentity: (data: { name: string; vendor_type: string; email: string; phone: string }) => Promise<unknown>;
  patchProfile: (data: Partial<VendorOnboardingProfile>) => Promise<unknown>;
  patchKYC: (data: Record<string, unknown>) => Promise<unknown>;
  patchBank: (data: Record<string, unknown>) => Promise<unknown>;
  patchProcurement: (data: Record<string, unknown>) => Promise<unknown>;
}

export const adminSectionApi = (id: number): VendorSectionApi => ({
  internal: true,
  patchIdentity: (d) => api.patchDraft(id, d),
  patchProfile: (d) => api.patchProfile(id, d),
  patchKYC: (d) => api.patchKYC(id, d as Partial<VendorKYC>),
  patchBank: (d) => api.patchBankDetail(id, d as Partial<VendorBankDetail>),
  patchProcurement: (d) => api.patchProcurementDetail(id, d as Partial<VendorProcurementDetail>),
});

export const publicSectionApi = (token: string): VendorSectionApi => ({
  internal: false,
  patchIdentity: (d) => publicApi.patchIdentityByToken(token, d),
  patchProfile: (d) => publicApi.patchProfileByToken(token, d),
  patchKYC: (d) => publicApi.patchKYCByToken(token, d as Partial<VendorKYC>),
  patchBank: (d) => publicApi.patchBankDetailByToken(token, d as Partial<VendorBankDetail>),
  patchProcurement: (d) => publicApi.patchProcurementDetailByToken(token, d as Partial<VendorProcurementDetail>),
});

const nullIfBlank = (v: string) => (v && v.trim() ? v : null);

/** The internal vendor-master fields in their API shape (blank headcount / 0 stars = null). */
export const vendorMasterPayload = (step1: VendorOnboardingFormValues['step1']) => ({
  headcount: step1.headcount.trim() ? Number(step1.headcount) : null,
  rating: step1.rating || null,
});

/** Saves one form section through the existing endpoints. Drafts may be partial - no validation here. */
export async function persistVendorSection(values: VendorOnboardingFormValues, section: VendorFormSection, target: VendorSectionApi): Promise<void> {
  const { step1, step2, step3, step4 } = values;
  if (section === 1) {
    await target.patchIdentity({ name: step1.name, vendor_type: step1.vendor_type, email: step1.email, phone: step1.phone });
    const { name: _n, vendor_type: _t, email: _e, phone: _p, headcount: _h, rating: _r, ...profile } = step1;
    void _n; void _t; void _e; void _p; void _h; void _r;
    await target.patchProfile(target.internal ? { ...profile, ...vendorMasterPayload(step1) } : profile);
  } else if (section === 2) {
    // GST is stored on the profile but edited on the Tax & KYC step.
    await target.patchProfile({ gst_registered: step1.gst_registered, gstin: step1.gst_registered ? step1.gstin : '' });
    const { vendor_type: _vt, ...kyc } = step2;
    void _vt;
    // Django's DateField rejects "" - an empty date must be sent as null.
    await target.patchKYC({ ...kyc, incorporation_date: nullIfBlank(kyc.incorporation_date) });
  } else if (section === 3) {
    // Never send a blank account_number - the field always reloads blank (only a masked value is
    // ever returned), so an untouched field must not overwrite what's already on file.
    const bank: Record<string, unknown> = { ...step3 };
    if (!step3.account_number) delete bank.account_number;
    await target.patchBank(bank);
  } else if (section === 4) {
    await target.patchProcurement({
      ...step4,
      contract_start_date: nullIfBlank(step4.contract_start_date),
      contract_end_date: nullIfBlank(step4.contract_end_date),
      service_rate: nullIfBlank(step4.service_rate),
      withholding_tax_percentage: step4.withholding_tax_applicable ? nullIfBlank(step4.withholding_tax_percentage) : null,
      custom_payment_terms: step4.payment_terms === 'custom' ? step4.custom_payment_terms : '',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export const formJurisdiction = (values: VendorOnboardingFormValues): Jurisdiction =>
  vendorJurisdiction(values.step1.country, values.step2.country_of_tax_residence);

export const documentRuleContext = (values: VendorOnboardingFormValues): VendorDocumentRuleContext => ({
  vendorType: values.step1.vendor_type,
  jurisdiction: formJurisdiction(values),
  gstRegistered: values.step1.gst_registered,
  msmeRegistered: values.step1.msme_registered,
  hasEpf: !!values.step2.epf_number,
  hasEsic: !!values.step2.esic_number,
});

const usableCategories = (documents: VendorDocument[]) =>
  new Set(documents.filter((d) => d.status !== 'rejected').map((d) => d.category));

function sectionResult(values: VendorOnboardingFormValues, section: VendorFormSection, documents: VendorDocument[]) {
  const jurisdiction = formJurisdiction(values);
  if (section === 1) return vendorDetailsSchema.safeParse(values.step1);
  if (section === 2)
    return kycComplianceSchema.safeParse({
      ...values.step2,
      vendor_type: values.step1.vendor_type,
      jurisdiction,
      gst_registered: values.step1.gst_registered,
      gstin: values.step1.gstin,
      registration_number: values.step1.registration_number,
      has_beneficial_ownership_doc: usableCategories(documents).has('beneficial_ownership_proof'),
    });
  if (section === 3) return bankDetailsSchema.safeParse({ ...values.step3, jurisdiction });
  return businessProcurementSchema.safeParse(values.step4);
}

// Validation paths that belong to another form group (GST is shown on step 2, stored in step1).
const FIELD_GROUP_OVERRIDES: Record<string, string> = { gstin: 'step1', gst_registered: 'step1' };

/** Validates one section and marks invalid fields on the form.
 * Returns the first invalid field name (for focusing), or null when the section is valid. */
export function validateVendorSection(
  methods: UseFormReturn<VendorOnboardingFormValues>,
  section: VendorFormSection,
  opts: { hasSavedBankAccount: boolean; documents?: VendorDocument[] }
): string | null {
  const values = methods.getValues();
  const result = sectionResult(values, section, opts.documents ?? []);
  const fieldPaths: string[] = [];
  if (!result.success) {
    result.error.issues.forEach((issue) => {
      const field = issue.path.join('.');
      const group = FIELD_GROUP_OVERRIDES[field] ?? `step${section}`;
      const path = `${group}.${field}`;
      methods.setError(path as never, { message: issue.message });
      fieldPaths.push(path);
    });
  }
  if (section === 3 && !values.step3.account_number && !opts.hasSavedBankAccount) {
    methods.setError('step3.account_number', { message: 'Account number is required' });
    fieldPaths.push('step3.account_number');
  }
  return fieldPaths[0] ?? null;
}

export const isSectionComplete = (values: VendorOnboardingFormValues, section: VendorFormSection, documents: VendorDocument[], hasSavedBankAccount: boolean) =>
  sectionResult(values, section, documents).success && (section !== 3 || !!values.step3.account_number || hasSavedBankAccount);

/** Everything still missing before the vendor can be submitted for review. */
export function computeVendorCompletion(
  values: VendorOnboardingFormValues,
  documents: VendorDocument[],
  hasSavedBankAccount: boolean
): { missingItems: string[]; completionPercent: number } {
  const labels: Record<VendorFormSection, string> = { 1: 'Intake', 2: 'Tax & KYC', 3: 'Banking', 4: 'Contract' };
  const missing: string[] = [];
  const sectionsOk = ([1, 2, 3, 4] as VendorFormSection[]).map((section) => {
    const ok = isSectionComplete(values, section, documents, hasSavedBankAccount);
    if (!ok) missing.push(`${labels[section]} (Step ${section}) is incomplete`);
    return ok;
  });
  const missingDocs = computeMissingDocuments(usableCategories(documents), documentRuleContext(values));
  missingDocs.forEach((d) => missing.push(`Missing document: ${d}`));

  const totalSections = 5; // 4 form sections + documents
  const passed = [...sectionsOk, missingDocs.length === 0].filter(Boolean).length;
  return { missingItems: missing, completionPercent: Math.round((passed / totalSections) * 100) };
}
