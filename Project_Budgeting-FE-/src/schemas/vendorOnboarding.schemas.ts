import { z } from "zod";

export const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const gstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const tanRegex = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const udyamRegex = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
export const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const mobileRegex = /^[0-9]{10}$/;
const phoneRegex = /^\+?[0-9\s-]{7,15}$/;

export type Jurisdiction = "Indian" | "Overseas";

/** Same rule as the backend's vendor_jurisdiction(): blank / India = Indian, anything else = Overseas. */
export const vendorJurisdiction = (country: string | undefined, taxResidence?: string): Jurisdiction => {
  const c = (country || taxResidence || "").trim().toLowerCase();
  return !c || c === "india" || c === "in" ? "Indian" : "Overseas";
};

// Vendor types that are incorporated entities (CIN / LLPIN, incorporation certificate) and
// vendor types that sign for themselves (no separate authorised-signatory proof) - kept in
// sync with vendor_onboarding/progress.py.
export const INCORPORATED_VENDOR_TYPES = ["company", "llp"];
const SIGNATORY_EXEMPT_VENDOR_TYPES = ["freelancer", "proprietorship"];

/* ------------------------------------------------------------------ */
/* Step 1 - Intake                                                     */
/* ------------------------------------------------------------------ */

export const vendorDetailsSchema = z
  .object({
    name: z.string().trim().min(1, "Legal name is required"),
    vendor_type: z.string().min(1, "Vendor type is required"),
    service_category: z.string().trim().min(1, "Service category is required"),
    country: z.string().trim().min(1, "Country is required"),
    registration_number: z.string().optional().default(""),
    email: z.string().email("Enter a valid contact email"),
    phone: z.string().optional().default("").refine((v) => !v || phoneRegex.test(v), "Enter a valid phone number"),
    company_code: z.string().optional().default(""),
    plant: z.string().optional().default(""),
    contact_person_name: z.string().trim().min(1, "Contact person is required"),
    contact_person_designation: z.string().optional().default(""),
    // GST lives in the profile record but is edited (and validated) in Tax & KYC.
    gst_registered: z.boolean(),
    gstin: z.string().optional().default(""),
    msme_registered: z.boolean(),
    udyam_number: z.string().optional().default(""),
    msme_category: z.string().optional().default(""),
    address_line1: z.string().trim().min(1, "Registered address is required"),
    address_line2: z.string().optional().default(""),
    city: z.string().trim().min(1, "City is required"),
    district: z.string().optional().default(""),
    state: z.string().optional().default(""),
    pin_code: z.string().optional().default(""),
    landmark: z.string().optional().default(""),
    vendor_introduction: z.string().optional().default(""),
    finance_manager_name: z.string().optional().default(""),
    finance_manager_email: z.string().optional().default(""),
    finance_manager_mobile: z.string().optional().default(""),
    // Internal vendor-master fields - admin only, never required, never sent by the portal.
    headcount: z.string().optional().default("").refine((v) => !v || /^\d+$/.test(v), "Enter a whole number"),
    rating: z.number().int().min(0).max(5).default(0), // 0 = not rated
  })
  .refine((v) => !v.msme_registered || !!v.udyam_number, {
    message: "UDYAM number is required when MSME registered",
    path: ["udyam_number"],
  })
  .refine((v) => !v.msme_registered || !!v.msme_category, {
    message: "MSME category is required when MSME registered",
    path: ["msme_category"],
  });

export type VendorDetailsFormValues = z.infer<typeof vendorDetailsSchema>;

/* ------------------------------------------------------------------ */
/* Step 2 - Tax & KYC (validated with jurisdiction / GST context)      */
/* ------------------------------------------------------------------ */

const kycFieldsSchema = z.object({
  country_of_tax_residence: z.string().optional().default(""),
  pan: z.string().optional().default(""),
  cin: z.string().optional().default(""),
  incorporation_date: z.string().optional().default(""),
  tan: z.string().optional().default(""),
  tan_mobile: z.string().optional().default(""),
  epf_number: z.string().optional().default(""),
  esic_number: z.string().optional().default(""),
  esic_district: z.string().optional().default(""),
  tax_id: z.string().optional().default(""),
  beneficial_ownership_details: z.string().optional().default(""),
  // carried over from step 1 purely so this schema can cross-validate; not persisted from here
  vendor_type: z.string().optional().default(""),
});

export type KYCComplianceFormValues = z.infer<typeof kycFieldsSchema>;

/** Validation input = step 2 fields + the step 1 context they depend on. */
export const kycComplianceSchema = kycFieldsSchema
  .extend({
    jurisdiction: z.enum(["Indian", "Overseas"]).default("Indian"),
    gst_registered: z.boolean().default(false),
    gstin: z.string().optional().default(""),
    registration_number: z.string().optional().default(""),
    has_beneficial_ownership_doc: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.jurisdiction === "Indian") {
      if (!panRegex.test(v.pan || "")) issue("pan", v.pan ? "Enter a valid PAN (format AAAAA9999A)" : "PAN is required");
      if (v.gst_registered && !gstinRegex.test(v.gstin || "")) issue("gstin", "A valid GSTIN is required when GST registered");
      if (INCORPORATED_VENDOR_TYPES.includes(v.vendor_type)) {
        if (!v.cin && !v.registration_number) issue("cin", "CIN / LLPIN is required for this vendor type");
        else if (v.cin && v.vendor_type === "company" && !cinRegex.test(v.cin)) issue("cin", "Enter a valid CIN");
      }
      if (v.vendor_type === "company" && !v.incorporation_date) issue("incorporation_date", "Date of incorporation is required for a company");
    } else {
      if (!v.tax_id) issue("tax_id", "VAT / EIN / Tax ID is required");
      if (!v.country_of_tax_residence) issue("country_of_tax_residence", "Country of tax residence is required");
      if (!v.beneficial_ownership_details && !v.has_beneficial_ownership_doc)
        issue("beneficial_ownership_details", "Provide beneficial ownership details or upload a beneficial ownership document");
    }
    if (v.tan && !v.tan_mobile) issue("tan_mobile", "TAN associated mobile number is required when TAN is provided");
  });

/* ------------------------------------------------------------------ */
/* Step 3 - Banking                                                    */
/* ------------------------------------------------------------------ */

// account_number is intentionally NOT required here: the backend never returns the raw
// account number once saved (only a masked value), so re-opening a vendor always shows this
// field blank even when one is on file. Whether it's actually required (nothing on file yet)
// is checked separately against `account_number_masked` in validateVendorSection().
const bankFieldsSchema = z.object({
  bank_name: z.string().optional().default(""),
  account_holder_name: z.string().optional().default(""),
  account_number: z.string().optional().default(""),
  ifsc_code: z.string().optional().default(""),
  swift_code: z.string().optional().default(""),
  iban: z.string().optional().default(""),
  bank_country: z.string().optional().default(""),
  bank_address: z.string().optional().default(""),
  bank_id: z.string().optional().default(""),
  bank_country_key: z.string().optional().default(""),
  bank_control_key: z.string().optional().default(""),
  branch: z.string().optional().default(""),
  region: z.string().optional().default(""),
  street: z.string().optional().default(""),
  city: z.string().optional().default(""),
});

export type BankDetailsFormValues = z.infer<typeof bankFieldsSchema>;

export const bankDetailsSchema = bankFieldsSchema
  .extend({ jurisdiction: z.enum(["Indian", "Overseas"]).default("Indian") })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!v.bank_name) issue("bank_name", "Bank name is required");
    if (!v.account_holder_name) issue("account_holder_name", "Account holder name is required");
    if (v.jurisdiction === "Indian") {
      if (!ifscRegex.test(v.ifsc_code || "")) issue("ifsc_code", v.ifsc_code ? "Enter a valid IFSC code" : "IFSC is required");
    } else {
      if (!v.swift_code && !v.iban) issue("swift_code", "Enter a SWIFT code or an IBAN");
      if (!v.bank_country) issue("bank_country", "Bank country is required");
    }
  });

/* ------------------------------------------------------------------ */
/* Step 4 - Contract                                                   */
/* ------------------------------------------------------------------ */

export const businessProcurementSchema = z
  .object({
    contract_number: z.string().optional().default(""),
    po_number: z.string().optional().default(""),
    contract_start_date: z.string().min(1, "Contract start date is required"),
    contract_end_date: z.string().min(1, "Contract end date is required"),
    order_currency: z.string().min(1, "Currency is required"),
    payment_terms: z.string().min(1, "Payment terms are required"),
    custom_payment_terms: z.string().optional().default(""),
    billing_frequency: z.string().min(1, "Billing frequency is required"),
    service_rate: z.string().optional().default(""),
    rate_unit: z.string().optional().default(""),
    withholding_tax_applicable: z.boolean().default(false),
    withholding_tax_percentage: z.string().optional().default(""),
    tax_remarks: z.string().optional().default(""),
    // Existing procurement / ERP settings - optional.
    account_group: z.string().optional().default(""),
    purchasing_org: z.string().optional().default(""),
    grouping_key: z.string().optional().default(""),
    partner_category: z.string().optional().default(""),
    incoterms_1: z.string().optional().default(""),
    incoterms_2: z.string().optional().default(""),
    reconciliation_account: z.string().optional().default(""),
    schema_group: z.string().optional().default(""),
    gr_based_invoice_verification: z.boolean().default(false),
    check_double_invoice: z.boolean().default(false),
  })
  .refine((v) => v.payment_terms !== "custom" || !!v.custom_payment_terms.trim(), {
    message: "Describe the custom payment terms",
    path: ["custom_payment_terms"],
  })
  .refine((v) => !v.contract_start_date || !v.contract_end_date || v.contract_end_date >= v.contract_start_date, {
    message: "Contract end date must be on or after the start date",
    path: ["contract_end_date"],
  })
  .refine((v) => !v.withholding_tax_applicable || v.withholding_tax_percentage !== "", {
    message: "Withholding tax % is required when withholding tax applies",
    path: ["withholding_tax_percentage"],
  })
  .refine((v) => !v.service_rate || !Number.isNaN(Number(v.service_rate)), {
    message: "Enter a valid rate",
    path: ["service_rate"],
  });

export type BusinessProcurementFormValues = z.infer<typeof businessProcurementSchema>;

/* ------------------------------------------------------------------ */
/* Internal review (admin drawer only - never part of portal payloads) */
/* ------------------------------------------------------------------ */

export interface VendorReviewFormValues {
  kyc_status: string;
  risk_rating: string;
  compliance_remarks: string;
  bank_verification_status: string;
  bank_verification_remarks: string;
}

/* ------------------------------------------------------------------ */
/* Documents - mirrors vendor_onboarding/progress.py required_document_rules() */
/* ------------------------------------------------------------------ */

export type VendorDocumentStep = "intake" | "tax_kyc" | "banking" | "contract";

export const BANK_PROOF_CATEGORIES = [
  "bank_proof_cancelled_cheque",
  "bank_proof_bank_statement",
  "bank_proof_bank_certificate",
];

export interface VendorDocumentRuleContext {
  vendorType: string;
  jurisdiction: Jurisdiction;
  gstRegistered: boolean;
  msmeRegistered: boolean;
  hasEpf: boolean;
  hasEsic: boolean;
}

/** One entry per REQUIRED document - any of `categories` satisfies it. */
export function vendorDocumentRules(ctx: VendorDocumentRuleContext): { step: VendorDocumentStep; label: string; categories: string[] }[] {
  const rules: { step: VendorDocumentStep; label: string; categories: string[] }[] = [];
  const indian = ctx.jurisdiction === "Indian";
  if (indian) {
    rules.push({ step: "tax_kyc", label: "PAN Document", categories: ["pan"] });
    if (ctx.gstRegistered) rules.push({ step: "tax_kyc", label: "GST Certificate", categories: ["gst_certificate"] });
    if (INCORPORATED_VENDOR_TYPES.includes(ctx.vendorType))
      rules.push({ step: "tax_kyc", label: "Certificate of Incorporation / CIN", categories: ["cin_incorporation_certificate"] });
  } else {
    rules.push({ step: "tax_kyc", label: "Company Registration Document", categories: ["registration_certificate", "cin_incorporation_certificate"] });
    rules.push({ step: "tax_kyc", label: "Tax Residency Document", categories: ["tax_residency_certificate"] });
  }
  if (ctx.vendorType && !SIGNATORY_EXEMPT_VENDOR_TYPES.includes(ctx.vendorType))
    rules.push({ step: "tax_kyc", label: "Authorised Signatory Proof", categories: ["authorised_signatory_proof"] });
  if (ctx.msmeRegistered) rules.push({ step: "intake", label: "UDYAM / MSME Certificate", categories: ["msme_udyam_certificate"] });
  if (ctx.hasEpf) rules.push({ step: "tax_kyc", label: "EPF Certificate", categories: ["epf_certificate"] });
  if (ctx.hasEsic) rules.push({ step: "tax_kyc", label: "ESIC Certificate", categories: ["esic_certificate"] });
  rules.push({ step: "banking", label: indian ? "Bank Letter / Cancelled Cheque" : "Bank Letter", categories: BANK_PROOF_CATEGORIES });
  return rules;
}

/** Upload slots per step (required + optional), for the drawer, wizard and portal. */
export function vendorDocumentSlots(ctx: VendorDocumentRuleContext): { step: VendorDocumentStep; key: string; label: string; required: boolean }[] {
  const indian = ctx.jurisdiction === "Indian";
  const required = new Set(vendorDocumentRules(ctx).flatMap((r) => (r.categories.length === 1 ? r.categories : [])));
  const slots: { step: VendorDocumentStep; key: string; label: string; required: boolean }[] = [];
  const add = (step: VendorDocumentStep, key: string, label: string, isRequired = required.has(key)) =>
    slots.push({ step, key, label, required: isRequired });

  if (ctx.msmeRegistered) add("intake", "msme_udyam_certificate", "UDYAM / MSME Certificate");
  if (indian) {
    add("tax_kyc", "pan", "PAN Document");
    if (ctx.gstRegistered) add("tax_kyc", "gst_certificate", "GST Certificate");
    add("tax_kyc", "cin_incorporation_certificate", "Certificate of Incorporation / CIN");
  } else {
    add("tax_kyc", "registration_certificate", "Company Registration Document", true);
    add("tax_kyc", "tax_id_certificate", "VAT / EIN / Tax ID Certificate");
    add("tax_kyc", "tax_residency_certificate", "Tax Residency Document");
    add("tax_kyc", "tax_form", "W-8BEN-E / Applicable Tax Form");
  }
  add("tax_kyc", "authorised_signatory_proof", "Authorised Signatory Proof");
  add("tax_kyc", "beneficial_ownership_proof", "Beneficial Ownership Document");
  if (ctx.hasEpf) add("tax_kyc", "epf_certificate", "EPF Certificate");
  if (ctx.hasEsic) add("tax_kyc", "esic_certificate", "ESIC Certificate");
  if (indian) {
    add("banking", "bank_proof_cancelled_cheque", "Cancelled Cheque", false);
    add("banking", "bank_proof_bank_certificate", "Bank Letter", false);
    add("banking", "bank_proof_bank_statement", "Bank Statement", false);
  } else {
    add("banking", "bank_proof_bank_certificate", "Bank Letter", false);
    add("banking", "bank_proof_bank_statement", "Bank Statement", false);
  }
  add("contract", "contract_document", "Contract Document", false);
  add("contract", "other", "Other Document", false);
  return slots;
}

/** Labels of required documents still missing. `categoriesPresent` must exclude rejected documents. */
export function computeMissingDocuments(categoriesPresent: Set<string>, ctx: VendorDocumentRuleContext): string[] {
  return vendorDocumentRules(ctx)
    .filter((r) => !r.categories.some((c) => categoriesPresent.has(c)))
    .map((r) => r.label);
}

/* ------------------------------------------------------------------ */
/* Whole-form shape                                                    */
/* ------------------------------------------------------------------ */

export interface VendorOnboardingFormValues {
  step1: VendorDetailsFormValues;
  step2: KYCComplianceFormValues;
  step3: BankDetailsFormValues;
  step4: BusinessProcurementFormValues;
  /** Internal review fields - only the admin drawer reads/writes these. */
  review: VendorReviewFormValues;
}

export const EMPTY_FORM_VALUES: VendorOnboardingFormValues = {
  step1: {
    name: "", vendor_type: "", service_category: "", country: "", registration_number: "",
    email: "", phone: "", company_code: "", plant: "",
    contact_person_name: "", contact_person_designation: "", gst_registered: false, gstin: "",
    msme_registered: false, udyam_number: "", msme_category: "", address_line1: "", address_line2: "",
    city: "", district: "", state: "", pin_code: "", landmark: "", vendor_introduction: "",
    finance_manager_name: "", finance_manager_email: "", finance_manager_mobile: "",
    headcount: "", rating: 0,
  },
  step2: {
    country_of_tax_residence: "", pan: "", cin: "", incorporation_date: "", tan: "", tan_mobile: "",
    epf_number: "", esic_number: "", esic_district: "", tax_id: "", beneficial_ownership_details: "", vendor_type: "",
  },
  step3: {
    bank_name: "", account_holder_name: "", account_number: "", ifsc_code: "", swift_code: "", iban: "",
    bank_country: "", bank_address: "", bank_id: "", bank_country_key: "", bank_control_key: "",
    branch: "", region: "", street: "", city: "",
  },
  step4: {
    contract_number: "", po_number: "", contract_start_date: "", contract_end_date: "",
    order_currency: "", payment_terms: "", custom_payment_terms: "", billing_frequency: "",
    service_rate: "", rate_unit: "", withholding_tax_applicable: false, withholding_tax_percentage: "", tax_remarks: "",
    account_group: "", purchasing_org: "", grouping_key: "", partner_category: "", incoterms_1: "", incoterms_2: "",
    reconciliation_account: "", schema_group: "", gr_based_invoice_verification: false, check_double_invoice: false,
  },
  review: {
    kyc_status: "draft", risk_rating: "low", compliance_remarks: "",
    bank_verification_status: "not_verified", bank_verification_remarks: "",
  },
};

export const STEP_FIELD_NAMES: Record<number, string[]> = {
  1: Object.keys(EMPTY_FORM_VALUES.step1),
  2: Object.keys(EMPTY_FORM_VALUES.step2).filter((k) => k !== "vendor_type"),
  3: Object.keys(EMPTY_FORM_VALUES.step3),
  4: Object.keys(EMPTY_FORM_VALUES.step4),
};
