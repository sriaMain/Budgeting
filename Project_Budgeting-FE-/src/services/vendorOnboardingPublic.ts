import publicAxiosInstance from "../utils/publicAxiosInstance";
import type {
  VendorOnboardingProfile, VendorKYC, VendorBankDetail, VendorProcurementDetail,
  VendorDocument, VendorPublicChoices, VendorSectionsPayload, VendorDocumentUploadOptions,
} from "../types/vendorOnboarding.types";
import type { VendorPublicDetail } from "../types/vendorOnboardingPublic.types";

const BASE = "/vendor-onboarding/public";

/** Shared by the admin and portal upload calls: replace / expiry / document number + upload progress.
 * (Lives here so the token-only portal never imports the authenticated axios instance.) */
export const documentFormData = (category: string, file: File, opts: VendorDocumentUploadOptions = {}) => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  if (opts.replaces) formData.append("replaces", String(opts.replaces));
  if (opts.expiryDate) formData.append("expiry_date", opts.expiryDate);
  if (opts.documentNumber) formData.append("document_number", opts.documentNumber);
  return formData;
};

export const uploadProgressHandler = (opts: VendorDocumentUploadOptions = {}) =>
  opts.onProgress
    ? (e: { loaded: number; total?: number }) => opts.onProgress?.((e.loaded / (e.total || e.loaded || 1)) * 100)
    : undefined;


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
  data: Partial<{ name: string; first_name: string; middle_name: string; last_name: string; vendor_type: string; email: string; phone: string; contact_person_name: string; last_saved_step: number }>
) => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/identity/`, data);
  return res.data as VendorPublicDetail;
};

/** One request per wizard save (vendor-facing fields only). Returns the refreshed public detail. */
export const saveSectionsByToken = async (token: string, payload: VendorSectionsPayload): Promise<VendorPublicDetail> => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/sections/`, payload);
  return res.data;
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

export const uploadDocumentByToken = async (token: string, category: string, file: File, opts: VendorDocumentUploadOptions = {}): Promise<VendorDocument> => {
  const res = await publicAxiosInstance.post(`${BASE}/${token}/documents/`, documentFormData(category, file, opts), {
    onUploadProgress: uploadProgressHandler(opts),
  });
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
