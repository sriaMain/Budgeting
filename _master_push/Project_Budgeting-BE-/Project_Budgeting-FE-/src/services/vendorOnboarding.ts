import axiosInstance from "../utils/axiosInstance";
import type {
  VendorOnboardingChoices,
  VendorOnboardingDetail,
  VendorOnboardingProfile,
  VendorKYC,
  VendorBankDetail,
  VendorProcurementDetail,
  VendorDocument,
  VendorApprovalHistoryEvent,
  VendorApprovalWorkflowConfig,
  VendorListFilters,
  VendorRequestSummary,
  VendorSubmissionVersion,
  RaiseVendorRequestPayload,
  RequestChangesPayload,
} from "../types/vendorOnboarding.types";

const BASE = "/vendor-onboarding";

export const getChoices = async (): Promise<VendorOnboardingChoices> => {
  const res = await axiosInstance.get(`${BASE}/choices/`);
  return res.data;
};

export const getSummary = async (): Promise<VendorRequestSummary> => {
  const res = await axiosInstance.get(`${BASE}/summary/`);
  return res.data;
};

export const listVendors = async (filters: VendorListFilters = {}): Promise<VendorOnboardingDetail[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const res = await axiosInstance.get(`${BASE}/vendors/`, { params });
  return res.data;
};

export const getVendor = async (id: number): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/`);
  return res.data;
};

export const raiseVendorRequest = async (payload: RaiseVendorRequestPayload): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/raise/`, payload);
  return res.data;
};

export const resendInvite = async (id: number): Promise<void> => {
  await axiosInstance.post(`${BASE}/vendors/${id}/resend-invite/`);
};

export const archiveVendor = async (id: number): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/archive/`);
  return res.data;
};

export const unarchiveVendor = async (id: number): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/unarchive/`);
  return res.data;
};

export const createDraft = async (data: { name?: string; vendor_type?: string; email?: string; phone?: string }) => {
  const res = await axiosInstance.post(`${BASE}/vendors/`, data);
  return res.data as VendorOnboardingDetail;
};

export const patchDraft = async (id: number, data: Partial<{ name: string; vendor_type: string; email: string; phone: string; last_saved_step: number }>) => {
  const res = await axiosInstance.patch(`${BASE}/vendors/${id}/`, data);
  return res.data as VendorOnboardingDetail;
};

export const deleteVendor = async (id: number) => {
  await axiosInstance.delete(`${BASE}/vendors/${id}/`);
};

export const patchProfile = async (id: number, data: Partial<VendorOnboardingProfile>) => {
  const res = await axiosInstance.patch(`${BASE}/vendors/${id}/profile/`, data);
  return res.data as VendorOnboardingProfile;
};

export const patchKYC = async (id: number, data: Partial<VendorKYC>) => {
  const res = await axiosInstance.patch(`${BASE}/vendors/${id}/kyc/`, data);
  return res.data as VendorKYC;
};

export const patchBankDetail = async (id: number, data: Partial<VendorBankDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/vendors/${id}/bank-detail/`, data);
  return res.data as VendorBankDetail;
};

export const getUnmaskedBankDetail = async (id: number): Promise<VendorBankDetail> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/bank-detail/unmasked/`);
  return res.data;
};

export const patchProcurementDetail = async (id: number, data: Partial<VendorProcurementDetail>) => {
  const res = await axiosInstance.patch(`${BASE}/vendors/${id}/procurement-detail/`, data);
  return res.data as VendorProcurementDetail;
};

export const listDocuments = async (id: number): Promise<VendorDocument[]> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/documents/`);
  return res.data;
};

export const uploadDocument = async (id: number, category: string, file: File): Promise<VendorDocument> => {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/documents/`, formData);
  return res.data;
};

export const deleteDocument = async (id: number, docId: number) => {
  await axiosInstance.delete(`${BASE}/vendors/${id}/documents/${docId}/`);
};

export const downloadDocument = async (id: number, docId: number): Promise<{ file_name: string; download_url: string }> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/documents/${docId}/download/`);
  return res.data;
};

export const submitForApproval = async (id: number): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/submit/`);
  return res.data;
};

export const getSubmissionVersions = async (id: number): Promise<VendorSubmissionVersion[]> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/versions/`);
  return res.data;
};

export const listApprovalQueue = async (): Promise<VendorOnboardingDetail[]> => {
  const res = await axiosInstance.get(`${BASE}/approvals/queue/`);
  return res.data;
};

export const approveVendor = async (id: number, comments = ""): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/approve/`, { comments });
  return res.data;
};

export const requestVendorChanges = async (
  id: number,
  payload: RequestChangesPayload
): Promise<VendorOnboardingDetail> => {
  const res = await axiosInstance.post(`${BASE}/vendors/${id}/request-changes/`, payload);
  return res.data;
};

export const getApprovalHistory = async (id: number): Promise<VendorApprovalHistoryEvent[]> => {
  const res = await axiosInstance.get(`${BASE}/vendors/${id}/approval-history/`);
  return res.data;
};

export const listApprovalConfigs = async (): Promise<VendorApprovalWorkflowConfig[]> => {
  const res = await axiosInstance.get(`${BASE}/approval-config/`);
  return res.data;
};

export const createApprovalConfig = async (data: Partial<VendorApprovalWorkflowConfig>) => {
  const res = await axiosInstance.post(`${BASE}/approval-config/`, data);
  return res.data as VendorApprovalWorkflowConfig;
};

export const updateApprovalConfig = async (id: number, data: Partial<VendorApprovalWorkflowConfig>) => {
  const res = await axiosInstance.put(`${BASE}/approval-config/${id}/`, data);
  return res.data as VendorApprovalWorkflowConfig;
};

export const deleteApprovalConfig = async (id: number) => {
  await axiosInstance.delete(`${BASE}/approval-config/${id}/`);
};

export const createApprovalLevel = async (configId: number, data: { level_order: number; name: string; approver_role?: number; approver_user?: number }) => {
  const res = await axiosInstance.post(`${BASE}/approval-config/${configId}/levels/`, data);
  return res.data;
};

export const updateApprovalLevel = async (configId: number, levelId: number, data: Partial<{ level_order: number; name: string; approver_role: number | null; approver_user: number | null }>) => {
  const res = await axiosInstance.put(`${BASE}/approval-config/${configId}/levels/${levelId}/`, data);
  return res.data;
};

export const deleteApprovalLevel = async (configId: number, levelId: number) => {
  await axiosInstance.delete(`${BASE}/approval-config/${configId}/levels/${levelId}/`);
};
