import axiosInstance from '../utils/axiosInstance';

export interface HrmsEmployee {
  id: number;
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  hrms_role: string;
  branch: string;
  /** AIRA employee API v2 fields - blank / null when AIRA doesn't send them. */
  first_name: string;
  middle_name: string;
  last_name: string;
  phone: string;
  reporting_manager_employee_id: string;
  date_of_joining: string | null;
  exit_date: string | null;
  employment_type: string;
  hrms_updated_at: string | null;
  is_active_in_hrms: boolean;
  first_seen_at: string;
  last_seen_at: string | null;
  removed_from_hrms_at: string | null;
  is_eligible: boolean;
  account_id: number | null;
  account_is_active: boolean;
  roles: { id: number; role_name: string }[];
  /** Budgeting-only fields HRMS doesn't provide - set when access is granted. */
  modules: { id: number; product_service_name: string }[];
  charges_per_hour: string | null;
  currency: string | null;
  access_granted_at: string | null;
  access_granted_by_name: string | null;
  access_revoked_at: string | null;
  access_revoked_reason: '' | 'hrms_missing' | 'manual';
}

export interface HrmsSyncRun {
  id: number;
  status: 'running' | 'success' | 'failed';
  triggered_by_name: string | null;
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  created_count: number;
  updated_count: number;
  returned_count: number;
  removed_count: number;
  access_revoked_count: number;
  error_message: string;
}

export const getHrmsEmployees = async (): Promise<{ employees: HrmsEmployee[]; last_sync: HrmsSyncRun | null }> => {
  const { data } = await axiosInstance.get('hrms/employees/');
  return data;
};

/** Manual Refresh: re-fetches from HRMS and revokes access for anyone no longer listed. */
export const syncHrmsEmployees = async (): Promise<HrmsSyncRun> => {
  const { data } = await axiosInstance.post('hrms/employees/sync/');
  return data.sync;
};

/** Automatic pull from AIRA (no Refresh button): the backend skips it when one ran in the last
 * few minutes. Never throws for an AIRA failure - that comes back in `sync.status`. */
export const autoSyncHrmsEmployees = async (): Promise<{ ran: boolean; sync: HrmsSyncRun | null }> => {
  const { data } = await axiosInstance.post('hrms/employees/sync/', { auto: true });
  return data;
};

export interface GrantHrmsAccessPayload {
  roles: number[];
  modules: number[];
  charges_per_hour: string;
  currency: string;
}

/** Grants (or updates) Budgeting access: roles plus the module and hourly rate HRMS doesn't have. */
export const grantHrmsAccess = async (id: number, payload: GrantHrmsAccessPayload): Promise<HrmsEmployee> => {
  const { data } = await axiosInstance.post(`hrms/employees/${id}/access/`, payload);
  return data;
};

/** An HRMS user with access but no module or hourly rate - their logged time would be costed at zero. */
export const needsSetup = (e: HrmsEmployee) => e.is_eligible && (e.modules.length === 0 || e.charges_per_hour === null);

export const revokeHrmsAccess = async (id: number): Promise<HrmsEmployee> => {
  const { data } = await axiosInstance.delete(`hrms/employees/${id}/access/`);
  return data;
};

/** Re-reads one employee from AIRA (external/employees/<employee_id>/) and applies it. */
export const refreshHrmsEmployee = async (id: number): Promise<HrmsEmployee> => {
  const { data } = await axiosInstance.post(`hrms/employees/${id}/refresh/`);
  return data;
};
