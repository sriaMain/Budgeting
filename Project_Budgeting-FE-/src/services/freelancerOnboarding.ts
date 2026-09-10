import axiosInstance from "../utils/axiosInstance";
import type {
  Freelancer, FreelancerChoices, FreelancerDocument, FreelancerListFilters,
  FreelancerManualPayload, InviteFreelancerPayload, FreelancerRateCard, FreelancerRateCardPayload,
  FreelancerContract, FreelancerContractPayload, FreelancerProjectAssignment,
  FreelancerProjectAssignmentPayload, CapacityCheckResult, FreelancerTaskAssignment,
  FreelancerTaskAssignmentPayload, FreelancerTimeEntry, FreelancerTimeEntryPayload, SimpleTask,
  FreelancerBankDetail, FreelancerBankDetailPayload, FreelancerBankDetailUnmasked,
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

export const archiveFreelancer = async (id: number): Promise<Freelancer> => {
  const res = await axiosInstance.post(`${BASE}/freelancers/${id}/archive/`);
  return res.data;
};

export const unarchiveFreelancer = async (id: number): Promise<Freelancer> => {
  const res = await axiosInstance.post(`${BASE}/freelancers/${id}/unarchive/`);
  return res.data;
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

// --- Rate Cards ---

export const listRateCards = async (freelancerId: number): Promise<FreelancerRateCard[]> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${freelancerId}/rate-cards/`);
  return res.data;
};

export const createRateCard = async (freelancerId: number, payload: FreelancerRateCardPayload): Promise<FreelancerRateCard> => {
  const res = await axiosInstance.post(`${BASE}/freelancers/${freelancerId}/rate-cards/`, payload);
  return res.data;
};

export const updateRateCard = async (
  freelancerId: number, rateId: number, payload: Partial<FreelancerRateCardPayload>,
): Promise<FreelancerRateCard> => {
  const res = await axiosInstance.patch(`${BASE}/freelancers/${freelancerId}/rate-cards/${rateId}/`, payload);
  return res.data;
};

export const deleteRateCard = async (freelancerId: number, rateId: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/freelancers/${freelancerId}/rate-cards/${rateId}/`);
};

// --- Contracts ---

export const listContracts = async (freelancerId: number): Promise<FreelancerContract[]> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${freelancerId}/contracts/`);
  return res.data;
};

export const createContract = async (freelancerId: number, payload: FreelancerContractPayload): Promise<FreelancerContract> => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, value instanceof File ? value : String(value));
  });
  const res = await axiosInstance.post(`${BASE}/freelancers/${freelancerId}/contracts/`, formData);
  return res.data;
};

export const updateContract = async (
  freelancerId: number, contractId: number, payload: Partial<FreelancerContractPayload>,
): Promise<FreelancerContract> => {
  const res = await axiosInstance.patch(`${BASE}/freelancers/${freelancerId}/contracts/${contractId}/`, payload);
  return res.data;
};

export const deleteContract = async (freelancerId: number, contractId: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/freelancers/${freelancerId}/contracts/${contractId}/`);
};

// --- Project Assignments ---

export const listAssignments = async (
  filters: { freelancer?: number; project?: number; status?: string } = {},
): Promise<FreelancerProjectAssignment[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const res = await axiosInstance.get(`${BASE}/assignments/`, { params });
  return res.data;
};

export const createAssignment = async (payload: FreelancerProjectAssignmentPayload): Promise<FreelancerProjectAssignment> => {
  const res = await axiosInstance.post(`${BASE}/assignments/`, payload);
  return res.data;
};

export const updateAssignment = async (
  id: number, payload: Partial<FreelancerProjectAssignmentPayload>,
): Promise<FreelancerProjectAssignment> => {
  const res = await axiosInstance.patch(`${BASE}/assignments/${id}/`, payload);
  return res.data;
};

export const deleteAssignment = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/assignments/${id}/`);
};

export const checkFreelancerCapacity = async (
  freelancerId: number,
  params: { start_date: string; end_date?: string; allocated_hours: string | number; exclude_assignment_id?: number },
): Promise<CapacityCheckResult> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${freelancerId}/capacity-check/`, { params });
  return res.data;
};

// --- Task Assignments ---

export const listTaskAssignments = async (
  filters: { freelancer?: number; task?: number; project?: number; status?: string } = {},
): Promise<FreelancerTaskAssignment[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const res = await axiosInstance.get(`${BASE}/task-assignments/`, { params });
  return res.data;
};

export const createTaskAssignment = async (payload: FreelancerTaskAssignmentPayload): Promise<FreelancerTaskAssignment> => {
  const res = await axiosInstance.post(`${BASE}/task-assignments/`, payload);
  return res.data;
};

export const updateTaskAssignment = async (
  id: number, payload: Partial<FreelancerTaskAssignmentPayload>,
): Promise<FreelancerTaskAssignment> => {
  const res = await axiosInstance.patch(`${BASE}/task-assignments/${id}/`, payload);
  return res.data;
};

export const deleteTaskAssignment = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/task-assignments/${id}/`);
};

// --- Time Entries ---

export const listTimeEntries = async (
  filters: { freelancer?: number; task_assignment?: number; status?: string; date_from?: string; date_to?: string } = {},
): Promise<FreelancerTimeEntry[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const res = await axiosInstance.get(`${BASE}/time-entries/`, { params });
  return res.data;
};

export const createTimeEntry = async (payload: FreelancerTimeEntryPayload): Promise<FreelancerTimeEntry> => {
  const res = await axiosInstance.post(`${BASE}/time-entries/`, payload);
  return res.data;
};

export const updateTimeEntry = async (
  id: number, payload: Partial<FreelancerTimeEntryPayload>,
): Promise<FreelancerTimeEntry> => {
  const res = await axiosInstance.patch(`${BASE}/time-entries/${id}/`, payload);
  return res.data;
};

export const deleteTimeEntry = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/time-entries/${id}/`);
};

export const submitTimeEntry = async (id: number): Promise<FreelancerTimeEntry> => {
  const res = await axiosInstance.post(`${BASE}/time-entries/${id}/submit/`);
  return res.data;
};

export const approveTimeEntry = async (id: number): Promise<FreelancerTimeEntry> => {
  const res = await axiosInstance.post(`${BASE}/time-entries/${id}/approve/`);
  return res.data;
};

export const rejectTimeEntry = async (id: number, reason: string): Promise<FreelancerTimeEntry> => {
  const res = await axiosInstance.post(`${BASE}/time-entries/${id}/reject/`, { reason });
  return res.data;
};

// --- Bank / KYC Details ---

export const getBankDetail = async (freelancerId: number): Promise<FreelancerBankDetail | null> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${freelancerId}/bank-detail/`);
  return res.data;
};

export const updateBankDetail = async (
  freelancerId: number, payload: FreelancerBankDetailPayload,
): Promise<FreelancerBankDetail> => {
  const res = await axiosInstance.patch(`${BASE}/freelancers/${freelancerId}/bank-detail/`, payload);
  return res.data;
};

export const getBankDetailUnmasked = async (freelancerId: number): Promise<FreelancerBankDetailUnmasked> => {
  const res = await axiosInstance.get(`${BASE}/freelancers/${freelancerId}/bank-detail/unmasked/`);
  return res.data;
};

// --- Tasks (from the Project app, for the "assign to task" picker) ---

export const listTasksForProject = async (projectId: number): Promise<SimpleTask[]> => {
  const res = await axiosInstance.get(`/tasks/${projectId}/tasks/`);
  const groups: { Tasks: SimpleTask[] }[] = res.data || [];
  return groups.flatMap((g) => g.Tasks || []);
};
