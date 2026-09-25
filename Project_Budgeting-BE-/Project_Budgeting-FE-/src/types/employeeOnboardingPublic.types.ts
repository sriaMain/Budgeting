import type {
  AccountBasic, EmployeePersonalDetail, EmployeeAddressDetail, EmployeeStatutoryDetail,
  EmployeeBankDetail, EmployeeEmergencyContact, EmployeeDocument, EmployeeChangeRequest,
  EmployeeOnboardingStatus,
} from "./employeeOnboarding.types";

/**
 * The employee self-service portal's own view of the onboarding request -
 * the public serializer exposes the same field names as the admin one, just
 * scoped down to non-admin fields (no created_by, no other employees' data).
 */
export interface EmployeePublicDetail {
  account: AccountBasic;
  employee_code: string;
  department: string;
  designation: string;
  reporting_manager_name: string | null;
  joining_date: string | null;
  employment_type: string;
  employment_type_display: string;
  work_location: string;
  pf_applicable: boolean;
  status: EmployeeOnboardingStatus;
  status_display: string;
  current_stage: string;
  last_saved_step: number;
  progress_percentage: number;
  submitted_at: string | null;
  approved_at: string | null;
  personal_detail: EmployeePersonalDetail | null;
  address_detail: EmployeeAddressDetail | null;
  statutory_detail: EmployeeStatutoryDetail | null;
  bank_detail: EmployeeBankDetail | null;
  emergency_contact: EmployeeEmergencyContact | null;
  documents: EmployeeDocument[];
  open_change_request: EmployeeChangeRequest | null;
}
