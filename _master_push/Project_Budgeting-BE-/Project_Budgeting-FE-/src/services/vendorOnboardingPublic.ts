import publicAxiosInstance from "../utils/publicAxiosInstance";
import type {
  VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail,
  VendorDocument, VendorPublicChoices,
} from "../types/vendorOnboarding.types";
import type { VendorPublicDetail } from "../types/vendorOnboardingPublic.types";

const BASE = "/vendor-onboarding/public";

export const getPublicChoices = async (): Promise<VendorPublicChoices> => {
  const res = await publicAxiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const getRequestByToken = async (token: string): Promise<VendorPublicDetail> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/`);
  return res.data;
};

export const patchIdentityByToken = async (
  token: string,
  data: Partial<{ name: string; vendor_type: string; email: string; phone: string; contact_person_name: string; last_saved_step: number }>
) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/identity/`, data);
  return res.data as VendorPublicDetail;
};

export const patchProfileByToken = async (token: string, data: Partial<VendorOnboardingProfile>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/profile/`, data);
  return res.data as VendorOnboardingProfile;
};

export const patchKYCByToken = async (token: string, data: Partial<VendorKYC>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/kyc/`, data);
  return res.data as VendorKYC;
};

export const patchBankDetailByToken = async (token: string, data: Partial<VendorBankDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/bank-detail/`, data);
  return res.data as VendorBankDetail;
};

export const patchProcurementDetailByToken = async (token: string, data: Partial<VendorProcurementDetail>) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/procurement-detail/`, data);
  return res.data as VendorProcurementDetail;
};

export const listDocumentsByToken = async (token: string): Promise<VendorDocument[]> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/documents/`);
  return res.data;
};

export const uploadDocumentByToken = async (token: string, category: string, file: File): Promise<VendorDocument> => {
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

export const submitByToken = async (token: string): Promise<VendorPublicDetail> => {
  const res = await publicAxiosInstance.post(`${BASE}/${token}/submit/`);
  return res.data;
};
