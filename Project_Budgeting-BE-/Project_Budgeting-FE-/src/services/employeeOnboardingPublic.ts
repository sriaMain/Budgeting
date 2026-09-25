import publicAxiosInstance from "../utils/publicAxiosInstance";
import type {
  EmployeePersonalDetail, EmployeeAddressDetail, EmployeeStatutoryDetail,
  EmployeeBankDetail, EmployeeEmergencyContact, EmployeeDocument, EmployeePublicChoices,
} from "../types/employeeOnboarding.types";
import type { EmployeePublicDetail } from "../types/employeeOnboardingPublic.types";

const BASE = "/employee-onboarding/public";

export const getPublicChoices = async (): Promise<EmployeePublicChoices> => {
  const res = await publicAxiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const getRequestByToken = async (token: string): Promise<EmployeePublicDetail> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/`);
  return res.data;
};

export const patchIdentityByToken = async (
  token: string,
  data: Partial<{ first_name: string; last_name: string; last_saved_step: number }>
): Promise<EmployeePublicDetail> => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/identity/`, data);
  return res.data;
};

export const patchPersonalByToken = async (token: string, data: Partial<EmployeePersonalDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/personal/`, data);
  return res.data as EmployeePersonalDetail;
};

export const patchAddressByToken = async (token: string, data: Partial<EmployeeAddressDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/address/`, data);
  return res.data as EmployeeAddressDetail;
};

export const patchStatutoryByToken = async (token: string, data: Partial<EmployeeStatutoryDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/statutory/`, data);
  return res.data as EmployeeStatutoryDetail;
};

export const patchBankDetailByToken = async (token: string, data: Partial<EmployeeBankDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/bank-detail/`, data);
  return res.data as EmployeeBankDetail;
};

export const patchEmergencyContactByToken = async (token: string, data: Partial<EmployeeEmergencyContact>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/emergency-contact/`, data);
  return res.data as EmployeeEmergencyContact;
};

export const listDocumentsByToken = async (token: string): Promise<EmployeeDocument[]> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/documents/`);
  return res.data;
};

export const uploadDocumentByToken = async (token: string, category: string, file: File): Promise<EmployeeDocument> => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  const res = await publicAxiosInstance.post(`${BASE}/${token}/documents/`, formData);
  return res.data;
};

export const deleteDocumentByToken = async (token: string, docId: number) => {
  await publicAxiosInstance.delete(`${BASE}/${token}/documents/${docId}/`);
};

export const downloadDocumentByToken = async (token: string, docId: number): Promise<{ file_name: string; download_url: string }> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/documents/${docId}/download/`);
  return res.data;
};

export const submitByToken = async (token: string): Promise<EmployeePublicDetail> => {
  const res = await publicAxiosInstance.post(`${BASE}/${token}/submit/`);
  return res.data;
};
