import { z } from "zod";

export const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const gstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const tanRegex = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const udyamRegex = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
export const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const mobileRegex = /^[0-9]{10}$/;

export const vendorDetailsSchema = z
  .object({
    name: z.string().min(1, "Vendor legal name is required"),
    vendor_type: z.string().min(1, "Vendor type is required"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().regex(mobileRegex, "Enter a valid 10-digit mobile number"),
    company_code: z.string().min(1, "Company code is required"),
    plant: z.string().min(1, "Plant is required"),
    contact_person_name: z.string().min(1, "Contact person name is required"),
    contact_person_designation: z.string().min(1, "Contact person designation is required"),
    gst_registered: z.boolean(),
    gstin: z.string().optional().default(""),
    msme_registered: z.boolean(),
    udyam_number: z.string().optional().default(""),
    msme_category: z.string().optional().default(""),
    address_line1: z.string().min(1, "Address line 1 is required"),
    address_line2: z.string().optional().default(""),
    city: z.string().min(1, "City is required"),
    district: z.string().optional().default(""),
    state: z.string().min(1, "State is required"),
    country: z.string().min(1, "Country is required"),
    pin_code: z.string().min(1, "PIN / postal code is required"),
    landmark: z.string().optional().default(""),
    vendor_introduction: z.string().optional().default(""),
    finance_manager_name: z.string().optional().default(""),
    finance_manager_email: z.string().optional().default(""),
    finance_manager_mobile: z.string().optional().default(""),
  })
  .refine((v) => !v.gst_registered || (!!v.gstin && gstinRegex.test(v.gstin)), {
    message: "A valid GSTIN is required when GST registered",
    path: ["gstin"],
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

export const kycComplianceSchema = z
  .object({
    country_of_tax_residence: z.string().min(1, "Country of tax residence is required"),
    pan: z.string().regex(panRegex, "Enter a valid PAN (format AAAAA9999A)"),
    cin: z.string().optional().default(""),
    incorporation_date: z.string().optional().default(""),
    tan: z.string().optional().default(""),
    tan_mobile: z.string().optional().default(""),
    epf_number: z.string().optional().default(""),
    esic_number: z.string().optional().default(""),
    esic_district: z.string().optional().default(""),
    // carried over from step 1 purely so this schema can cross-validate; not persisted from here
    vendor_type: z.string().optional().default(""),
  })
  .refine((v) => v.vendor_type !== "company" || (!!v.cin && cinRegex.test(v.cin)), {
    message: "A valid CIN is required for Company vendor type",
    path: ["cin"],
  })
  .refine((v) => v.vendor_type !== "company" || !!v.incorporation_date, {
    message: "Date of incorporation is required for Company vendor type",
    path: ["incorporation_date"],
  })
  .refine((v) => !v.tan || !!v.tan_mobile, {
    message: "TAN associated mobile number is required when TAN is provided",
    path: ["tan_mobile"],
  });

export type KYCComplianceFormValues = z.infer<typeof kycComplianceSchema>;

// account_number is intentionally NOT required here: the backend never returns the raw
// account number once saved (only a masked value), so re-opening a draft/vendor always
// shows this field blank even when one is already on file. Whether it's actually required
// (brand-new vendor with nothing on file yet) is checked separately against
// `account_number_masked` in the wizard's validateStep(), not in this schema.
export const bankDetailsSchema = z.object({
  bank_name: z.string().min(1, "Bank name is required"),
  account_holder_name: z.string().min(1, "Account holder name is required"),
  account_number: z.string().optional().default(""),
  ifsc_code: z.string().regex(ifscRegex, "Enter a valid IFSC code"),
  bank_id: z.string().optional().default(""),
  bank_country_key: z.string().optional().default(""),
  bank_control_key: z.string().optional().default(""),
  branch: z.string().optional().default(""),
  region: z.string().optional().default(""),
  street: z.string().optional().default(""),
  city: z.string().optional().default(""),
});

export type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>;

export const businessProcurementSchema = z.object({
  account_group: z.string().min(1, "Account group is required"),
  purchasing_org: z.string().min(1, "Purchasing organization is required"),
  payment_terms: z.string().min(1, "Payment terms are required"),
  order_currency: z.string().min(1, "Order currency is required"),
  grouping_key: z.string().optional().default(""),
  partner_category: z.string().optional().default(""),
  incoterms_1: z.string().optional().default(""),
  incoterms_2: z.string().optional().default(""),
  reconciliation_account: z.string().optional().default(""),
  schema_group: z.string().optional().default(""),
  gr_based_invoice_verification: z.boolean().default(false),
  check_double_invoice: z.boolean().default(false),
});

export type BusinessProcurementFormValues = z.infer<typeof businessProcurementSchema>;

const BANK_PROOF_CATEGORIES = [
  "bank_proof_cancelled_cheque",
  "bank_proof_bank_statement",
  "bank_proof_bank_certificate",
];

export function computeMissingDocuments(
  categoriesPresent: Set<string>,
  opts: { vendorType: string; gstRegistered: boolean; msmeRegistered: boolean; hasEpf: boolean; hasEsic: boolean }
): string[] {
  const missing: string[] = [];
  if (!categoriesPresent.has("pan")) missing.push("PAN Document");
  if (!BANK_PROOF_CATEGORIES.some((c) => categoriesPresent.has(c))) missing.push("Bank Proof (cheque / statement / certificate)");
  if (opts.gstRegistered && !categoriesPresent.has("gst_certificate")) missing.push("GST Certificate");
  if (opts.vendorType === "company" && !categoriesPresent.has("cin_incorporation_certificate")) missing.push("CIN / Incorporation Certificate");
  if (opts.msmeRegistered && !categoriesPresent.has("msme_udyam_certificate")) missing.push("UDYAM / MSME Certificate");
  if (opts.hasEpf && !categoriesPresent.has("epf_certificate")) missing.push("EPF Certificate");
  if (opts.hasEsic && !categoriesPresent.has("esic_certificate")) missing.push("ESIC Certificate");
  return missing;
}

export interface VendorOnboardingFormValues {
  step1: VendorDetailsFormValues;
  step2: KYCComplianceFormValues;
  step3: BankDetailsFormValues;
  step4: BusinessProcurementFormValues;
}

export const EMPTY_FORM_VALUES: VendorOnboardingFormValues = {
  step1: {
    name: "", vendor_type: "", email: "", phone: "", company_code: "", plant: "",
    contact_person_name: "", contact_person_designation: "", gst_registered: false, gstin: "",
    msme_registered: false, udyam_number: "", msme_category: "", address_line1: "", address_line2: "",
    city: "", district: "", state: "", country: "", pin_code: "", landmark: "", vendor_introduction: "",
    finance_manager_name: "", finance_manager_email: "", finance_manager_mobile: "",
  },
  step2: {
    country_of_tax_residence: "", pan: "", cin: "", incorporation_date: "", tan: "", tan_mobile: "",
    epf_number: "", esic_number: "", esic_district: "", vendor_type: "",
  },
  step3: {
    bank_name: "", account_holder_name: "", account_number: "", ifsc_code: "", bank_id: "",
    bank_country_key: "", bank_control_key: "", branch: "", region: "", street: "", city: "",
  },
  step4: {
    account_group: "", purchasing_org: "", payment_terms: "", order_currency: "", grouping_key: "",
    partner_category: "", incoterms_1: "", incoterms_2: "", reconciliation_account: "", schema_group: "",
    gr_based_invoice_verification: false, check_double_invoice: false,
  },
};

export const STEP_FIELD_NAMES: Record<number, string[]> = {
  1: [
    "name", "vendor_type", "email", "phone", "company_code", "plant",
    "contact_person_name", "contact_person_designation", "gst_registered", "gstin",
    "msme_registered", "udyam_number", "msme_category", "address_line1", "address_line2",
    "city", "district", "state", "country", "pin_code", "landmark", "vendor_introduction",
    "finance_manager_name", "finance_manager_email", "finance_manager_mobile",
  ],
  2: [
    "country_of_tax_residence", "pan", "cin", "incorporation_date", "tan", "tan_mobile",
    "epf_number", "esic_number", "esic_district",
  ],
  3: Object.keys(bankDetailsSchema.shape),
  4: Object.keys(businessProcurementSchema.shape),
};
