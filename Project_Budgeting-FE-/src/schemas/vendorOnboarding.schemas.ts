import { z } from "zod";
import { findCountry, type CountryConfig, type CountrySummary } from "../services/countries";
import {
  EMAIL_REGEX, validatePhoneValue, validatePostalCode, validateTaxId,
} from "../utils/countryRules";
import { bankErrors, EMPTY_BANK_VALUE, type BankFormValue } from "../components/onboarding/bankForm";
import { effectiveDocStatus, todayIso } from "../utils/documentStatus";

/**
 * Vendor onboarding form: value shapes, empty values, the required-document rules and the
 * per-step validators. Mirrors vendor_onboarding/progress.py + serializers.py (the backend
 * stays the authority - it re-validates every save and the submission).
 *
 * Validators are country-config aware: they take the loaded CountryConfig of the vendor's
 * country, its country of tax residence and its bank's country. 'draft' mode only rejects
 * malformed values; 'full' mode (Save & next, Submit) also enforces required fields.
 */

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const LLPIN_REGEX = /^[A-Z]{3}-[0-9]{4}$/;
export const TAN_REGEX = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

// Kept in sync with vendor_onboarding/progress.py (also served in the choices payload).
export const INCORPORATED_VENDOR_TYPES = ["company", "llp"];
export const INDIVIDUAL_VENDOR_TYPES = ["freelancer", "proprietorship"];
export const MAX_VENDOR_KYC_DOCUMENTS = 8;
export const NON_KYC_DOCUMENT_CATEGORIES = ["contract_document", "other"];
export const BANK_PROOF_CATEGORIES = ["bank_proof_cancelled_cheque", "bank_proof_bank_statement", "bank_proof_bank_certificate"];

// A PAN's 4th character is the holder type; these vendor types must match it.
const PAN_HOLDER_TYPES: Record<string, string> = { company: "C", llp: "F", partnership: "F", freelancer: "P", proprietorship: "P" };
const PAN_HOLDER_LABELS: Record<string, string> = {
  C: "a company", F: "a firm / LLP", P: "an individual", H: "a Hindu undivided family", A: "an association of persons",
  T: "a trust", B: "a body of individuals", L: "a local authority", J: "an artificial juridical person", G: "a government body",
};

export type VendorEntity = "business" | "individual";
export const vendorEntity = (vendorType: string): VendorEntity => (INDIVIDUAL_VENDOR_TYPES.includes(vendorType) ? "individual" : "business");

/** Upper-case and drop spaces - PAN, GSTIN, TAN, CIN / LLPIN, UDYAM are stored that way. */
export const normalizeIdentifier = (value: string) => (value || "").replace(/\s+/g, "").toUpperCase();

export function panVendorTypeMismatch(pan: string, vendorType: string): string {
  const p = normalizeIdentifier(pan);
  const expected = PAN_HOLDER_TYPES[vendorType];
  if (!expected || !PAN_REGEX.test(p) || p[3] === expected) return "";
  return `This PAN belongs to ${PAN_HOLDER_LABELS[p[3]] ?? "another kind of holder"} (4th letter ${p[3]}), which doesn't match the vendor type`;
}

/* ------------------------------------------------------------------ */
/* Form values                                                         */
/* ------------------------------------------------------------------ */

export interface VendorBasicValues {
  first_name: string;
  middle_name: string;
  last_name: string;
  vendor_type: string;
  service_category: string;
  /** Canonical country name ("India", "United States"). */
  country: string;
  contact_person_name: string;
  contact_person_designation: string;
  email: string;
  /** E.164 from <PhoneInput>. */
  phone: string;
  vendor_introduction: string;
  finance_manager_name: string;
  finance_manager_email: string;
  finance_manager_mobile: string;
  // Internal (admin form only - never sent by the portal)
  company_code: string;
  plant: string;
  internal_requester: string;
  initial_comments: string;
  headcount: string;
  /** 0 = not rated. */
  rating: number;
  manual_amount_spent: string;
}

export interface VendorKycValues {
  // India
  pan: string;
  gst_registered: boolean;
  gstin: string;
  cin: string;
  incorporation_date: string;
  tan: string;
  tan_mobile: string;
  epf_number: string;
  esic_number: string;
  esic_district: string;
  msme_registered: boolean;
  udyam_number: string;
  msme_category: string;
  // Other countries
  tax_id: string;
  country_of_tax_residence: string;
  // Businesses
  registration_number: string;
  beneficial_ownership_details: string;
}

export interface VendorAddressValues {
  line1: string;
  line2: string;
  city: string;
  district: string;
  state: string;
  postal_code: string;
  landmark: string;
}

export type VendorBankValues = BankFormValue;

export interface VendorCommercialValues {
  contract_number: string;
  po_number: string;
  contract_start_date: string;
  contract_end_date: string;
  order_currency: string;
  payment_terms: string;
  custom_payment_terms: string;
  billing_frequency: string;
  service_rate: string;
  rate_unit: string;
  withholding_tax_applicable: boolean;
  withholding_tax_percentage: string;
  tax_remarks: string;
  // ERP / procurement settings (internal - admin form only)
  account_group: string;
  purchasing_org: string;
  grouping_key: string;
  partner_category: string;
  incoterms_1: string;
  incoterms_2: string;
  reconciliation_account: string;
  schema_group: string;
  gr_based_invoice_verification: boolean;
  check_double_invoice: boolean;
}

/** Internal review fields - admin form only, saved through the review endpoint. */
export interface VendorReviewValues {
  kyc_status: string;
  risk_rating: string;
  compliance_remarks: string;
  bank_verification_status: string;
  bank_verification_remarks: string;
}

export interface VendorFormValues {
  basic: VendorBasicValues;
  kyc: VendorKycValues;
  address: VendorAddressValues;
  bank: VendorBankValues;
  commercial: VendorCommercialValues;
  review: VendorReviewValues;
}

export type VendorFormSection = keyof VendorFormValues;

export const EMPTY_VENDOR_FORM: VendorFormValues = {
  basic: {
    first_name: "", middle_name: "", last_name: "", vendor_type: "", service_category: "", country: "",
    contact_person_name: "", contact_person_designation: "", email: "", phone: "", vendor_introduction: "",
    finance_manager_name: "", finance_manager_email: "", finance_manager_mobile: "",
    company_code: "", plant: "", internal_requester: "", initial_comments: "", headcount: "", rating: 0, manual_amount_spent: "",
  },
  kyc: {
    pan: "", gst_registered: false, gstin: "", cin: "", incorporation_date: "", tan: "", tan_mobile: "",
    epf_number: "", esic_number: "", esic_district: "", msme_registered: false, udyam_number: "", msme_category: "",
    tax_id: "", country_of_tax_residence: "", registration_number: "", beneficial_ownership_details: "",
  },
  address: { line1: "", line2: "", city: "", district: "", state: "", postal_code: "", landmark: "" },
  bank: { ...EMPTY_BANK_VALUE },
  commercial: {
    contract_number: "", po_number: "", contract_start_date: "", contract_end_date: "", order_currency: "",
    payment_terms: "", custom_payment_terms: "", billing_frequency: "", service_rate: "", rate_unit: "",
    withholding_tax_applicable: false, withholding_tax_percentage: "", tax_remarks: "",
    account_group: "", purchasing_org: "", grouping_key: "", partner_category: "", incoterms_1: "", incoterms_2: "",
    reconciliation_account: "", schema_group: "", gr_based_invoice_verification: false, check_double_invoice: false,
  },
  review: {
    kyc_status: "draft", risk_rating: "low", compliance_remarks: "",
    bank_verification_status: "not_verified", bank_verification_remarks: "",
  },
};

/* ------------------------------------------------------------------ */
/* Documents - mirrors progress.required_document_rules()              */
/* ------------------------------------------------------------------ */

export type VendorDocumentGroup = "kyc" | "banking" | "other";

export interface VendorDocumentRuleContext {
  vendorType: string;
  indian: boolean;
  gstRegistered: boolean;
  msmeRegistered: boolean;
  hasEpf: boolean;
  hasEsic: boolean;
}

export interface VendorDocumentRule {
  key: string;
  label: string;
  /** Any one of these categories satisfies the rule. */
  categories: string[];
  group: VendorDocumentGroup;
}

export interface VendorDocumentSlot {
  key: string;
  label: string;
  required: boolean;
  tracksExpiry?: boolean;
  helpText?: string;
  group: VendorDocumentGroup;
}

const signatoryExempt = (vendorType: string) => INDIVIDUAL_VENDOR_TYPES.includes(vendorType);

export function vendorDocumentRules(ctx: VendorDocumentRuleContext): VendorDocumentRule[] {
  const rules: VendorDocumentRule[] = [];
  const business = vendorEntity(ctx.vendorType) === "business";
  const rule = (label: string, categories: string[], group: VendorDocumentGroup = "kyc") => rules.push({ key: categories[0], label, categories, group });
  if (ctx.indian) {
    rule("PAN Card", ["pan"]);
    if (ctx.gstRegistered) rule("GST Registration Certificate", ["gst_certificate"]);
    if (INCORPORATED_VENDOR_TYPES.includes(ctx.vendorType)) rule("Certificate of Incorporation / LLP Certificate", ["cin_incorporation_certificate"]);
    if (ctx.msmeRegistered) rule("UDYAM / MSME Certificate", ["msme_udyam_certificate"]);
    if (ctx.hasEpf) rule("EPF Registration Certificate", ["epf_certificate"]);
    if (ctx.hasEsic) rule("ESIC Registration Certificate", ["esic_certificate"]);
  } else {
    if (business) rule("Company Registration Document", ["registration_certificate", "cin_incorporation_certificate"]);
    else rule("Government ID (Passport / National ID)", ["government_id"]);
    rule("Tax Residency Document", ["tax_residency_certificate"]);
  }
  if (ctx.vendorType && !signatoryExempt(ctx.vendorType)) rule("Authorised Signatory Proof", ["authorised_signatory_proof"]);
  rule(ctx.indian ? "Bank Proof (cancelled cheque, bank letter or statement)" : "Bank Letter / Bank Statement", BANK_PROOF_CATEGORIES, "banking");
  return rules;
}

/** Upload slots per group (required + optional). Multi-category rules (bank proof) show each
 * category as an optional slot; the rule itself is checked by vendorDocumentStatus(). */
export function vendorDocumentSlots(ctx: VendorDocumentRuleContext): VendorDocumentSlot[] {
  const slots: VendorDocumentSlot[] = [];
  const business = vendorEntity(ctx.vendorType) === "business";
  const add = (key: string, label: string, required: boolean, group: VendorDocumentGroup, extra: Partial<VendorDocumentSlot> = {}) =>
    slots.push({ key, label, required, group, ...extra });

  if (ctx.indian) {
    add("pan", "PAN Card", true, "kyc", { helpText: "PAN of the vendor (the proprietor's own PAN for a proprietorship)" });
    if (ctx.gstRegistered) add("gst_certificate", "GST Registration Certificate", true, "kyc");
    if (INCORPORATED_VENDOR_TYPES.includes(ctx.vendorType)) {
      add("cin_incorporation_certificate", ctx.vendorType === "llp" ? "LLP Incorporation Certificate" : "Certificate of Incorporation", true, "kyc");
    } else if (business) {
      add("registration_certificate", "Registration Certificate (firm / trust / society)", false, "kyc", { tracksExpiry: true });
    }
    if (ctx.msmeRegistered) add("msme_udyam_certificate", "UDYAM / MSME Certificate", true, "kyc");
    if (ctx.hasEpf) add("epf_certificate", "EPF Registration Certificate", true, "kyc");
    if (ctx.hasEsic) add("esic_certificate", "ESIC Registration Certificate", true, "kyc");
  } else if (business) {
    add("registration_certificate", "Company Registration Document", true, "kyc", {
      tracksExpiry: true, helpText: "Certificate of incorporation, business / trade licence or registry extract",
    });
    add("tax_id_certificate", "Tax ID / VAT Registration Certificate", false, "kyc");
  } else {
    add("government_id", "Government ID (Passport / National ID)", true, "kyc", { tracksExpiry: true, helpText: "Passport or national ID card of the individual" });
  }
  if (!ctx.indian) {
    add("tax_residency_certificate", "Tax Residency Certificate", true, "kyc", { tracksExpiry: true });
    add("tax_form", "W-8BEN / W-8BEN-E or Applicable Tax Form", false, "kyc", { tracksExpiry: true });
  }
  if (ctx.vendorType && !signatoryExempt(ctx.vendorType)) {
    add("authorised_signatory_proof", "Authorised Signatory Proof", true, "kyc", {
      tracksExpiry: true, helpText: "Board resolution, power of attorney or authorisation letter",
    });
  }
  if (business) {
    add("beneficial_ownership_proof", "Beneficial Ownership Document", false, "kyc", {
      helpText: ctx.indian ? "Shareholding pattern / register of beneficial owners" : "Or describe the owners in Identity & KYC",
    });
  }
  if (ctx.indian) add("bank_proof_cancelled_cheque", "Cancelled Cheque", false, "banking");
  add("bank_proof_bank_certificate", "Bank Letter / Account Confirmation", false, "banking");
  add("bank_proof_bank_statement", "Bank Statement", false, "banking", { helpText: "Recent statement showing the account holder and number" });
  add("contract_document", "Contract / Agreement", false, "other");
  add("other", "Other Document", false, "other");
  return slots;
}

export interface DocumentLikeForRules {
  category: string;
  status?: string;
  uploaded_at: string;
  expiry_date?: string | null;
}

/** Same rule as core.document_security.document_counts_as_present. */
export const documentCountsAsPresent = (d: DocumentLikeForRules) =>
  !["rejected", "expired"].includes(effectiveDocStatus(d.status ?? "uploaded", d.expiry_date));

export interface VendorDocumentRuleStatus {
  rule: VendorDocumentRule;
  state: "missing" | "rejected" | "expired" | "present" | "verified";
}

export function vendorDocumentStatus(rules: VendorDocumentRule[], documents: DocumentLikeForRules[]): VendorDocumentRuleStatus[] {
  return rules.map((rule) => {
    const docs = documents.filter((d) => rule.categories.includes(d.category));
    const usable = docs.filter(documentCountsAsPresent);
    if (usable.length) return { rule, state: usable.some((d) => d.status === "verified") ? "verified" : "present" };
    if (!docs.length) return { rule, state: "missing" };
    const latest = [...docs].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))[0];
    return { rule, state: effectiveDocStatus(latest.status ?? "uploaded", latest.expiry_date) === "expired" ? "expired" : "rejected" };
  });
}

/** Documents counted toward the KYC cap: rejected and contract / miscellaneous documents don't count. */
export const countKycDocuments = (documents: { category: string; status?: string }[]) =>
  documents.filter((d) => !NON_KYC_DOCUMENT_CATEGORIES.includes(d.category) && d.status !== "rejected").length;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Field errors keyed by form path, e.g. 'basic.email', 'bank.ifsc_code'. */
export type VendorFieldErrors = Record<string, string>;

export interface VendorValidationContext {
  /** 'draft' rejects malformed values only; 'full' also requires every mandatory field. */
  mode: "draft" | "full";
  /** Admin form (internal fields present). */
  internal: boolean;
  countries: CountrySummary[];
  /** Vendor's country, its country of tax residence (non-India) and its bank's country. */
  countryConfig: CountryConfig | null;
  taxConfig: CountryConfig | null;
  bankConfig: CountryConfig | null;
  /** Indian rule set (India, or no country yet - like the backend). */
  indian: boolean;
  /** A masked account number is already on file (a blank field keeps it). */
  hasSavedAccount: boolean;
  documents: DocumentLikeForRules[];
}

const isBlank = (v: string | null | undefined) => !(v || "").trim();
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

function prefix(section: string, errors: Record<string, string | undefined>): VendorFieldErrors {
  const out: VendorFieldErrors = {};
  Object.entries(errors).forEach(([k, v]) => {
    if (v) out[`${section}.${k}`] = v;
  });
  return out;
}

export function validateBasic(values: VendorFormValues, ctx: VendorValidationContext): VendorFieldErrors {
  const v = values.basic;
  const full = ctx.mode === "full";
  const e: Record<string, string | undefined> = {};
  // Every vendor needs a name, even a draft (Vendor.name is unique and required).
  if (isBlank(v.first_name)) e.first_name = "First name is required";
  if (full) {
    if (isBlank(v.vendor_type)) e.vendor_type = "Vendor type is required";
    if (isBlank(v.service_category)) e.service_category = "Service category is required";
    if (isBlank(v.country)) e.country = "Country is required";
    if (isBlank(v.contact_person_name)) e.contact_person_name = "Contact person is required";
    if (isBlank(v.email)) e.email = "Contact email is required";
  }
  if (!isBlank(v.country) && ctx.countries.length && !findCountry(ctx.countries, v.country)) e.country = "Select the country from the list";
  if (!isBlank(v.email) && !EMAIL_REGEX.test(v.email.trim())) e.email = "Enter a valid email address";
  if (!isBlank(v.finance_manager_email) && !EMAIL_REGEX.test(v.finance_manager_email.trim())) e.finance_manager_email = "Enter a valid email address";
  const phone = validatePhoneValue(v.phone, ctx.countries, v.country, false);
  if (phone) e.phone = phone;
  const financeMobile = validatePhoneValue(v.finance_manager_mobile, ctx.countries, v.country, false);
  if (financeMobile) e.finance_manager_mobile = financeMobile;
  if (ctx.internal) {
    if (v.headcount && !/^\d+$/.test(v.headcount.trim())) e.headcount = "Enter a whole number";
    if (v.manual_amount_spent && !/^\d+(\.\d{1,2})?$/.test(v.manual_amount_spent.trim())) e.manual_amount_spent = "Enter an amount, e.g. 150000 or 1500.50";
  }
  return prefix("basic", e);
}

export function validateKyc(values: VendorFormValues, ctx: VendorValidationContext): VendorFieldErrors {
  const k = values.kyc;
  const vendorType = values.basic.vendor_type;
  const full = ctx.mode === "full";
  const entity = vendorEntity(vendorType);
  const e: Record<string, string | undefined> = {};
  if (ctx.indian) {
    const pan = normalizeIdentifier(k.pan);
    if (!pan) {
      if (full) e.pan = "PAN is required";
    } else if (!PAN_REGEX.test(pan)) {
      e.pan = "Enter a valid PAN - 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)";
    } else {
      e.pan = panVendorTypeMismatch(pan, vendorType) || undefined;
    }
    if (k.gst_registered) {
      const gstin = normalizeIdentifier(k.gstin);
      if (!gstin) {
        if (full) e.gstin = "GSTIN is required when GST registered";
      } else if (!GSTIN_REGEX.test(gstin)) {
        e.gstin = "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)";
      } else if (PAN_REGEX.test(pan) && gstin.slice(2, 12) !== pan) {
        e.gstin = "This GSTIN doesn't match the PAN (characters 3-12 of a GSTIN are the PAN)";
      }
    }
    if (INCORPORATED_VENDOR_TYPES.includes(vendorType)) {
      const cin = normalizeIdentifier(k.cin);
      const label = vendorType === "company" ? "CIN" : "LLPIN";
      if (!cin) {
        if (full && isBlank(k.registration_number)) e.cin = `${label} is required`;
      } else if (vendorType === "company" ? !CIN_REGEX.test(cin) : !(LLPIN_REGEX.test(cin) || CIN_REGEX.test(cin))) {
        e.cin = vendorType === "company" ? "Enter a valid 21-character CIN (e.g. U72900KA2015PTC082988)" : "Enter a valid LLPIN (e.g. AAB-1234) or CIN";
      }
      if (full && isBlank(k.incorporation_date)) e.incorporation_date = "Date of incorporation is required";
    }
    const tan = normalizeIdentifier(k.tan);
    if (tan && !TAN_REGEX.test(tan)) e.tan = "Enter a valid TAN - 4 letters, 5 digits, 1 letter (e.g. ABCD12345E)";
    if (tan && full && isBlank(k.tan_mobile)) e.tan_mobile = "The mobile number linked to the TAN is required";
    const tanMobile = validatePhoneValue(k.tan_mobile, ctx.countries, "IN", false);
    if (tanMobile) e.tan_mobile = tanMobile;
    if (k.msme_registered) {
      const udyam = normalizeIdentifier(k.udyam_number);
      if (!udyam) {
        if (full) e.udyam_number = "UDYAM number is required when MSME registered";
      } else if (!UDYAM_REGEX.test(udyam)) {
        e.udyam_number = "Enter a valid UDYAM number (e.g. UDYAM-MH-01-0000001)";
      }
      if (full && isBlank(k.msme_category)) e.msme_category = "MSME category is required when MSME registered";
    }
  } else {
    if (full && isBlank(k.country_of_tax_residence)) e.country_of_tax_residence = "Country of tax residence is required";
    const taxConfig = ctx.taxConfig ?? ctx.countryConfig;
    const taxError = validateTaxId(k.tax_id, taxConfig, entity, full ? undefined : false);
    if (taxError) e.tax_id = taxError;
    if (full && entity === "business" && isBlank(k.beneficial_ownership_details)) {
      const hasBoDoc = ctx.documents.some((d) => d.category === "beneficial_ownership_proof" && documentCountsAsPresent(d));
      if (!hasBoDoc) e.beneficial_ownership_details = "Describe the beneficial owners or upload a beneficial ownership document";
    }
  }
  if (k.incorporation_date) {
    if (!isoDateRegex.test(k.incorporation_date)) e.incorporation_date = "Enter a valid date";
    else if (k.incorporation_date > todayIso()) e.incorporation_date = "The date of incorporation can't be in the future";
  }
  return prefix("kyc", e);
}

export function validateAddress(values: VendorFormValues, ctx: VendorValidationContext): VendorFieldErrors {
  const a = values.address;
  const full = ctx.mode === "full";
  const e: Record<string, string | undefined> = {};
  if (full) {
    if (isBlank(a.line1)) e.line1 = "Address line 1 is required";
    if (isBlank(a.city)) e.city = "City / town is required";
  }
  const postal = validatePostalCode(a.postal_code, ctx.countryConfig, full ? undefined : false);
  if (postal) e.postal_code = postal;
  return prefix("address", e);
}

export function validateBank(values: VendorFormValues, ctx: VendorValidationContext): VendorFieldErrors {
  const b = values.bank;
  const full = ctx.mode === "full";
  const errors = bankErrors(b, ctx.bankConfig, { partial: !full, hasSavedAccount: ctx.hasSavedAccount, requireCountry: true });
  if (!isBlank(b.bank_country) && ctx.countries.length && !findCountry(ctx.countries, b.bank_country)) errors.bank_country = "Select the bank's country from the list";
  return prefix("bank", errors as Record<string, string | undefined>);
}

const commercialSchema = z
  .object({
    contract_start_date: z.string(),
    contract_end_date: z.string(),
    service_rate: z.string(),
    withholding_tax_applicable: z.boolean(),
    withholding_tax_percentage: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.contract_start_date && !isoDateRegex.test(v.contract_start_date)) issue("contract_start_date", "Enter a valid date");
    if (v.contract_end_date && !isoDateRegex.test(v.contract_end_date)) issue("contract_end_date", "Enter a valid date");
    if (v.contract_start_date && v.contract_end_date && v.contract_end_date < v.contract_start_date) {
      issue("contract_end_date", "Contract end date must be on or after the start date");
    }
    if (v.service_rate.trim() && !(Number(v.service_rate) >= 0)) issue("service_rate", "Enter a valid, non-negative rate");
    if (v.withholding_tax_applicable && v.withholding_tax_percentage.trim()) {
      const pct = Number(v.withholding_tax_percentage);
      if (!(pct >= 0 && pct <= 100)) issue("withholding_tax_percentage", "Enter a percentage between 0 and 100");
    }
  });

export function validateCommercial(values: VendorFormValues, ctx: VendorValidationContext): VendorFieldErrors {
  const c = values.commercial;
  const full = ctx.mode === "full";
  const e: Record<string, string | undefined> = {};
  const parsed = commercialSchema.safeParse(c);
  if (!parsed.success) parsed.error.issues.forEach((i) => { e[String(i.path[0])] = i.message; });
  if (full) {
    if (isBlank(c.order_currency)) e.order_currency = e.order_currency || "Order currency is required";
    if (isBlank(c.payment_terms)) e.payment_terms = "Payment terms are required";
    if (c.payment_terms === "custom" && isBlank(c.custom_payment_terms)) e.custom_payment_terms = "Describe the custom payment terms";
    if (isBlank(c.billing_frequency)) e.billing_frequency = "Billing frequency is required";
    if (isBlank(c.contract_start_date)) e.contract_start_date = "Contract start date is required";
    if (isBlank(c.contract_end_date)) e.contract_end_date = e.contract_end_date || "Contract end date is required";
    if (c.withholding_tax_applicable && isBlank(c.withholding_tax_percentage)) e.withholding_tax_percentage = "Withholding tax % is required when withholding tax applies";
  }
  return prefix("commercial", e);
}

/** Wizard step -> the validator of the form section it edits. */
export const SECTION_VALIDATORS: Partial<Record<string, (values: VendorFormValues, ctx: VendorValidationContext) => VendorFieldErrors>> = {
  basic: validateBasic,
  kyc: validateKyc,
  address: validateAddress,
  banking: validateBank,
  commercial: validateCommercial,
};
