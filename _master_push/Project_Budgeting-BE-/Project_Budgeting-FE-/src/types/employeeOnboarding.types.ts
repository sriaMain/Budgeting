export interface Choice {
  value: string;
  label: string;
}

export interface EmployeeOnboardingChoices {
  genders: Choice[];
  employment_types: Choice[];
  employee_statuses: Choice[];
  document_categories: Choice[];
  change_request_sections: Choice[];
}

export interface EmployeePublicChoices {
  genders: Choice[];
  employment_types: Choice[];
  document_categories: Choice[];
}

export type EmployeeOnboardingStatus =
  | 'invited'
  | 'draft'
  | 'submitted'
  | 'action_required'
  | 'resubmitted'
  | 'approved';

export const CHANGE_REQUEST_SECTIONS = [
  'personal_details',
  'address',
  'statutory_details',
  'bank_details',
  'emergency_contact',
  'documents',
] as const;

export type EmployeeChangeRequestSection = (typeof CHANGE_REQUEST_SECTIONS)[number];

/** Maps a change-request section to the wizard step index it corresponds to. */
export const SECTION_TO_STEP: Record<string, number> = {
  personal_details: 1,
  address: 2,
  statutory_details: 4,
  bank_details: 5,
  emergency_contact: 6,
  documents: 7,
};

export const SECTION_LABELS: Record<string, string> = {
  personal_details: 'Personal Details',
  address: 'Address',
  statutory_details: 'Statutory Details',
  bank_details: 'Bank Details',
  emergency_contact: 'Emergency Contact',
  documents: 'Documents',
};

export interface AccountBasic {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  display_name: string;
}

export interface EmployeePersonalDetail {
  middle_name: string;
  personal_email: string;
  alternate_email: string;
  mobile_number: string;
  alternate_mobile: string;
  date_of_birth: string | null;
  gender: string;
  marital_status: string;
  blood_group: string;
  nationality: string;
}

export interface EmployeeAddressDetail {
  current_address: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
}

export interface EmployeeStatutoryDetail {
  pan: string;
  aadhaar_number: string;
  uan_number: string;
  tan: string;
  esic_number: string;
}

export interface EmployeeBankDetail {
  account_number_masked?: string;
  account_number?: string;
  account_holder_name: string;
  bank_name: string;
  ifsc_code: string;
}

export interface EmployeeEmergencyContact {
  contact_name: string;
  contact_number: string;
  relationship: string;
}

export interface EmployeeDocument {
  id: number;
  request: number;
  file: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  is_required: boolean;
  status: string;
  uploaded_by: number | null;
  uploaded_by_role: 'admin' | 'employee';
  uploaded_at: string;
}

export interface EmployeeChangeRequest {
  id: number;
  section: EmployeeChangeRequestSection;
  section_display: string;
  field_name: string;
  reason: string;
  comments: string;
  requested_by: number | null;
  requested_by_name: string | null;
  requested_at: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
}

export interface EmployeeOnboardingHistoryEvent {
  id: number;
  actor: number | null;
  actor_name: string | null;
  actor_role_snapshot: string;
  action: 'invited' | 'submitted' | 'resubmitted' | 'approved' | 'requested_changes';
  previous_status: string;
  new_status: string;
  comments: string;
  reason: string;
  section: EmployeeChangeRequestSection | null;
  created_at: string;
}

/** Admin-facing employee onboarding request. */
export interface EmployeeOnboardingDetail {
  id: number;
  account: AccountBasic;
  employee_code: string;
  department: string;
  designation: string;
  reporting_manager: AccountBasic | null;
  joining_date: string | null;
  employment_type: string;
  employment_type_display: string;
  work_location: string;
  pf_applicable: boolean;
  status: EmployeeOnboardingStatus;
  status_display: string;
  current_stage: string;
  progress_percentage: number;
  last_saved_step: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  personal_detail: EmployeePersonalDetail | null;
  address_detail: EmployeeAddressDetail | null;
  statutory_detail: EmployeeStatutoryDetail | null;
  bank_detail: EmployeeBankDetail | null;
  emergency_contact: EmployeeEmergencyContact | null;
  documents: EmployeeDocument[];
  change_requests: EmployeeChangeRequest[];
}

export interface EmployeeInvitePayload {
  // Optional - if left blank, the backend auto-assigns an EMP-<year>-<seq>
  // code, so a bare account can be created with no employment details known
  // yet and filled in afterwards via the onboarding wizard.
  employee_code?: string;
  department?: string;
  designation?: string;
  reporting_manager?: number | null;
  joining_date?: string | null;
  employment_type?: string;
  work_location?: string;
  pf_applicable?: boolean;
}

export interface EmployeeRequestChangesPayload {
  section: EmployeeChangeRequestSection;
  field_name?: string;
  reason: string;
  comments?: string;
}
