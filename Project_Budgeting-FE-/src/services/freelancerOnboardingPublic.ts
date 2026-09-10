import publicAxiosInstance from "../utils/publicAxiosInstance";
import type {
  Freelancer, FreelancerDocument, FreelancerPublicChoices, FreelancerManualPayload,
} from "../types/freelancerOnboarding.types";

const BASE = "/freelancer-onboarding/public";

export const getPublicChoices = async (): Promise<FreelancerPublicChoices> => {
  const res = await publicAxiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const getFreelancerByToken = async (token: string): Promise<Freelancer> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/`);
  return res.data;
};

export const updateByToken = async (token: string, data: Partial<FreelancerManualPayload> & { last_saved_step?: number }): Promise<Freelancer> => {
  const res = await publicAxiosInstance.patch(`${BASE}/${token}/update/`, data);
  return res.data;
};

export const listDocumentsByToken = async (token: string): Promise<FreelancerDocument[]> => {
  const res = await publicAxiosInstance.get(`${BASE}/${token}/documents/`);
  return res.data;
};

export const uploadDocumentByToken = async (token: string, category: string, file: File): Promise<FreelancerDocument> => {
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

export const submitByToken = async (token: string): Promise<Freelancer> => {
  const res = await publicAxiosInstance.post(`${BASE}/${token}/submit/`);
  return res.data;
};
