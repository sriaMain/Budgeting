import { z } from "zod";

export const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const aadhaarRegex = /^[0-9]{12}$/;
export const uanRegex = /^[0-9]{12}$/;
export const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const mobileRegex = /^[0-9]{10}$/;

export const personalDetailsSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  middle_name: z.string().optional().default(""),
  personal_email: z.string().email("Enter a valid email address"),
  alternate_email: z.string().optional().default(""),
  mobile_number: z.string().regex(mobileRegex, "Enter a valid 10-digit mobile number"),
  alternate_mobile: z.string().optional().default(""),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.string().min(1, "Gender is required"),
  marital_status: z.string().optional().default(""),
  blood_group: z.string().optional().default(""),
  nationality: z.string().optional().default(""),
});

export type PersonalDetailsFormValues = z.infer<typeof personalDetailsSchema>;

export const addressSchema = z.object({
  current_address: z.string().min(1, "Current address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  pin_code: z.string().min(1, "PIN code is required"),
});

export type AddressFormValues = z.infer<typeof addressSchema>;

export const statutoryDetailsSchema = z
  .object({
    pan: z.string().regex(panRegex, "Enter a valid PAN (format AAAAA9999A)"),
    aadhaar_number: z.string().regex(aadhaarRegex, "Enter a valid 12-digit Aadhaar number"),
    uan_number: z.string().optional().default(""),
    tan: z.string().optional().default(""),
    esic_number: z.string().optional().default(""),
    // carried over purely so this schema can cross-validate; not persisted from here
    pf_applicable: z.boolean().optional().default(false),
  })
  .refine((v) => !v.pf_applicable || uanRegex.test(v.uan_number), {
    message: "A valid 12-digit UAN is required when PF is applicable",
    path: ["uan_number"],
  });

export type StatutoryDetailsFormValues = z.infer<typeof statutoryDetailsSchema>;

export const bankDetailsSchema = z.object({
  account_holder_name: z.string().min(1, "Account holder name is required"),
  bank_name: z.string().min(1, "Bank name is required"),
  account_number: z.string().optional().default(""),
  ifsc_code: z.string().regex(ifscRegex, "Enter a valid IFSC code"),
});

export type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>;

export const emergencyContactSchema = z.object({
  contact_name: z.string().min(1, "Emergency contact name is required"),
  contact_number: z.string().regex(mobileRegex, "Enter a valid 10-digit mobile number"),
  relationship: z.string().min(1, "Relationship is required"),
});

export type EmergencyContactFormValues = z.infer<typeof emergencyContactSchema>;

const MANDATORY_DOCUMENT_LABELS: Record<string, string> = {
  pan: "PAN Card",
  aadhaar: "Aadhaar Card",
  bank_proof: "Bank Proof / Cancelled Cheque",
  photo: "Passport-size Photo",
  education_certificate: "Highest Education Certificate",
};

export function computeMissingDocuments(categoriesPresent: Set<string>): string[] {
  return Object.entries(MANDATORY_DOCUMENT_LABELS)
    .filter(([category]) => !categoriesPresent.has(category))
    .map(([, label]) => label);
}

export interface EmployeeOnboardingFormValues {
  step1: PersonalDetailsFormValues;
  step2: AddressFormValues;
  step4: StatutoryDetailsFormValues;
  step5: BankDetailsFormValues;
  step6: EmergencyContactFormValues;
}

export const EMPTY_FORM_VALUES: EmployeeOnboardingFormValues = {
  step1: {
    first_name: "", last_name: "", middle_name: "", personal_email: "", alternate_email: "",
    mobile_number: "", alternate_mobile: "", date_of_birth: "", gender: "", marital_status: "",
    blood_group: "", nationality: "",
  },
  step2: {
    current_address: "", city: "", state: "", country: "", pin_code: "",
  },
  step4: {
    pan: "", aadhaar_number: "", uan_number: "", tan: "", esic_number: "", pf_applicable: false,
  },
  step5: {
    account_holder_name: "", bank_name: "", account_number: "", ifsc_code: "",
  },
  step6: {
    contact_name: "", contact_number: "", relationship: "",
  },
};
