import axiosInstance from "../utils/axiosInstance";
import type {
  EmployeeOnboardingChoices, EmployeeOnboardingDetail, EmployeeInvitePayload,
  EmployeeRequestChangesPayload, EmployeeOnboardingHistoryEvent, EmployeeDocument,
  EmployeePersonalDetail, EmployeeAddressDetail, EmployeeStatutoryDetail,
  EmployeeBankDetail, EmployeeEmergencyContact,
} from "../types/employeeOnboarding.types";

const BASE = "/employee-onboarding";

export const getChoices = async (): Promise<EmployeeOnboardingChoices> => {
  const res = await axiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const listEmployeeOnboarding = async (params?: { status?: string; search?: string }): Promise<EmployeeOnboardingDetail[]> => {
  const res = await axiosInstance.get(`${BASE}/employees/`, { params });
  return res.data;
};

export const sendOnboardingInvite = async (accountId: number, payload: EmployeeInvitePayload = {}): Promise<EmployeeOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/employees/${accountId}/invite/`, payload);
  return res.data;
};

export const getEmployeeOnboarding = async (accountId: number): Promise<EmployeeOnboardingDetail> => {
  const res = await axiosInstance.get(`${BASE}/employees/${accountId}/`);
  return res.data;
};

/** Admin-only: fills in / corrects the request's own employment fields
 * (department, designation, employee_code, ...) - used by the "fill
 * onboarding on the employee's behalf" wizard. */
export const patchEmploymentDetails = async (accountId: number, data: Partial<EmployeeInvitePayload>): Promise<EmployeeOnboardingDetail> => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/`, data);
  return res.data;
};

export const patchPersonal = async (accountId: number, data: Partial<EmployeePersonalDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/personal/`, data);
  return res.data as EmployeePersonalDetail;
};

export const patchAddress = async (accountId: number, data: Partial<EmployeeAddressDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/address/`, data);
  return res.data as EmployeeAddressDetail;
};

export const patchStatutory = async (accountId: number, data: Partial<EmployeeStatutoryDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/statutory/`, data);
  return res.data as EmployeeStatutoryDetail;
};

export const patchBankDetail = async (accountId: number, data: Partial<EmployeeBankDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/bank-detail/`, data);
  return res.data as EmployeeBankDetail;
};

export const patchEmergencyContact = async (accountId: number, data: Partial<EmployeeEmergencyContact>) => {
  const res = await axiosInstance.patch(`${BASE}/employees/${accountId}/emergency-contact/`, data);
  return res.data as EmployeeEmergencyContact;
};

export const listDocuments = async (accountId: number): Promise<EmployeeDocument[]> => {
  const res = await axiosInstance.get(`${BASE}/employees/${accountId}/documents/`);
  return res.data;
};

export const uploadDocument = async (accountId: number, category: string, file: File): Promise<EmployeeDocument> => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  const res = await axiosInstance.post(`${BASE}/employees/${accountId}/documents/`, formData);
  return res.data;
};

export const deleteDocument = async (accountId: number, docId: number) => {
  await axiosInstance.delete(`${BASE}/employees/${accountId}/documents/${docId}/`);
};

export const getApprovalHistory = async (accountId: number): Promise<EmployeeOnboardingHistoryEvent[]> => {
  const res = await axiosInstance.get(`${BASE}/employees/${accountId}/history/`);
  return res.data;
};

export const approveEmployee = async (accountId: number, comments = ""): Promise<EmployeeOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/employees/${accountId}/approve/`, { comments });
  return res.data;
};

export const requestEmployeeChanges = async (accountId: number, payload: EmployeeRequestChangesPayload): Promise<EmployeeOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/employees/${accountId}/request-changes/`, payload);
  return res.data;
};

export const downloadDocument = async (accountId: number, docId: number): Promise<{ file_name: string; download_url: string }> => {
  const res = await axiosInstance.get(`${BASE}/employees/${accountId}/documents/${docId}/download/`);
  return res.data;
};
