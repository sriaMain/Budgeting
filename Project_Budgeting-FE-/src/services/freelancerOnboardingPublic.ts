import publicAxiosInstance from "../utils/publicAxiosInstance";
import type {
  FreelancerDocument, FreelancerPublicChoices, FreelancerProfilePayload, FreelancerPublic, FreelancerPortalClosed,
  FreelancerBankDetail, FreelancerBankDetailPayload, DocumentUploadOptions,
} from "../types/freelancerOnboarding.types";

/**
 * Secure-link (no login) freelancer portal. Every call is authenticated only by the
 * token in its URL - publicAxiosInstance never attaches the admin session.
 */
const BASE = "/freelancer-onboarding/public";

export const getPublicChoices = async (): Promise<FreelancerPublicChoices> => {
  const res = await publicAxiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

/** The onboarding, or - for a link closed after approval - only the outcome. */
export const getFreelancerByToken = async (token: string): Promise<FreelancerPublic | FreelancerPortalClosed> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/`);
  return res.data;
};

export const updateByToken = async (token: string, data: FreelancerProfilePayload): Promise<FreelancerPublic> => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/update/`, data);
  return res.data;
};

export const uploadProfilePhotoByToken = async (token: string, file: File): Promise<FreelancerPublic> => {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await publicAxiosInstance.post(`${BASE}/${token}/profile-photo/`, formData);
  return res.data;
};

export const removeProfilePhotoByToken = async (token: string): Promise<FreelancerPublic> => {
  const res = await publicAxiosInstance.delete(`${BASE}/${token}/profile-photo/`);
  return res.data;
};

export const listDocumentsByToken = async (token: string): Promise<FreelancerDocument[]> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/documents/`);
  return res.data;
};

export const uploadDocumentByToken = async (
  token: string, category: string, file: File, opts: DocumentUploadOptions = {},
): Promise<FreelancerDocument> => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  if (opts.replaces) formData.append("replaces", String(opts.replaces));
  if (opts.expiryDate) formData.append("expiry_date", opts.expiryDate);
  if (opts.documentNumber) formData.append("document_number", opts.documentNumber);
  const res = await publicAxiosInstance.post(`${BASE}/${token}/documents/`, formData, {
    onUploadProgress: (e) => opts.onProgress?.((e.loaded / (e.total || e.loaded || 1)) * 100),
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

/** 400 with `missing` when requirements are unmet; afterwards the link is read-only. */
export const submitByToken = async (token: string): Promise<FreelancerPublic> => {
  const res = await publicAxiosInstance.post(`${BASE}/${token}/submit/`);
  return res.data;
};

export const getBankDetailByToken = async (token: string): Promise<FreelancerBankDetail | null> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/bank-detail/`);
  return res.data;
};

export const updateBankDetailByToken = async (token: string, payload: FreelancerBankDetailPayload): Promise<FreelancerBankDetail> => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/bank-detail/`, payload);
  return res.data;
};
