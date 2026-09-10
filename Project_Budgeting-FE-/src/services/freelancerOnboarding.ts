import axiosInstance from "../utils/axiosInstance";
import type {
  Freelancer, FreelancerChoices, FreelancerDocument, FreelancerListFilters,
  FreelancerManualPayload, InviteFreelancerPayload,
} from "../types/freelancerOnboarding.types";

const BASE = "/freelancer-onboarding";

export const getChoices = async (): Promise<FreelancerChoices> => {
  const res = await axiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const listFreelancers = async (filters: FreelancerListFilters = {}): Promise<Freelancer[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const res = await axiosInstance.get(`${BASE}/freelancers/`, { params });
  return res.data;
};

export const getFreelancer = async (id: number): Promise<Freelancer> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${id}/`);
  return res.data;
};

export const inviteFreelancer = async (payload: InviteFreelancerPayload): Promise<Freelancer> => {
  const res = await axiosInstance.post(`${BASE}/freelancers/invite/`, payload);
  return res.data;
};

export const addFreelancerManually = async (payload: FreelancerManualPayload): Promise<Freelancer> => {
  const res = await axiosInstance.post(`${BASE}/freelancers/`, payload);
  return res.data;
};

export const updateFreelancer = async (id: number, payload: Partial<FreelancerManualPayload>): Promise<Freelancer> => {
  const res = await axiosInstance.patch(`${BASE}/freelancers/${id}/`, payload);
  return res.data;
};

export const resendInvite = async (id: number): Promise<void> => {
  await axiosInstance.post(`${BASE}/freelancers/${id}/resend-invite/`);
};

export const listDocuments = async (id: number): Promise<FreelancerDocument[]> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${id}/documents/`);
  return res.data;
};

export const uploadDocument = async (id: number, category: string, file: File): Promise<FreelancerDocument> => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  const res = await axiosInstance.post(`${BASE}/freelancers/${id}/documents/`, formData);
  return res.data;
};

export const deleteDocument = async (id: number, docId: number) => {
  await axiosInstance.delete(`${BASE}/freelancers/${id}/documents/${docId}/`);
};

export const downloadDocument = async (id: number, docId: number): Promise<{ file_name: string; download_url: string }> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${id}/documents/${docId}/download/`);
  return res.data;
};
