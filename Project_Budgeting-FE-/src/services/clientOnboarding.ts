import axiosInstance from '../utils/axiosInstance';
import type {
  ChangeRequestSection,
  Client,
  ClientAuditLogEntry,
  ClientChangeRequest,
  ClientDocument,
  ClientPermissionFlags,
  CompanyTag,
  SubmissionIssue,
} from '../pages/client-onboarding/clientTypes';

/**
 * Clients & KYC API (client/urls.py). Every call goes through axiosInstance (JWT attached);
 * nothing here logs request or response bodies - they carry bank, tax and identity data.
 */

export type ClientPayload = Record<string, unknown>;

export const fetchClient = (id: number) => axiosInstance.get<Client>(`/client/${id}/`).then((r) => r.data);

/** Creates a draft client - only the Basic Information minimum is required. */
export const createClient = (payload: ClientPayload) => axiosInstance.post<Client>('/client/', payload).then((r) => r.data);

/** Partial update: send only the fields that changed. */
export const updateClient = (id: number, payload: ClientPayload) =>
  axiosInstance.patch<Client>(`/client/${id}/`, payload).then((r) => r.data);

/** Maker: submit for approval (required fields + required documents are checked by the server). */
export const submitClient = (id: number) => axiosInstance.post<Client>(`/client/${id}/submit/`, {}).then((r) => r.data);

/** Approver: final approval (marks the client verified and project-ready). */
export const approveClient = (id: number, remarks?: string) =>
  axiosInstance.post<Client>(`/client/${id}/approve/`, remarks?.trim() ? { approval_remarks: remarks.trim() } : {}).then((r) => r.data);

let permissionsPromise: Promise<ClientPermissionFlags> | null = null;

/** The signed-in user's Clients & KYC permissions (cached for the page's lifetime). */
export function fetchClientPermissions(): Promise<ClientPermissionFlags> {
  if (!permissionsPromise) {
    permissionsPromise = axiosInstance
      .get<{ permissions: ClientPermissionFlags }>('/client/permissions/')
      .then((r) => r.data.permissions)
      .catch((err) => {
        permissionsPromise = null; // retry on the next call
        throw err;
      });
  }
  return permissionsPromise;
}

export const fetchCompanyTags = () => axiosInstance.get<CompanyTag[]>('/company-tags/').then((r) => r.data);

export const listClientDocuments = (clientId: number) =>
  axiosInstance.get<ClientDocument[]>(`/client/${clientId}/documents/`).then((r) => r.data);

export interface UploadClientDocumentOptions {
  onProgress?: (percent: number) => void;
  /** Id of the document this upload replaces (swapped atomically by the server). */
  replaces?: number;
  /** YYYY-MM-DD */
  expiryDate?: string;
  documentNumber?: string;
}

export function uploadClientDocument(clientId: number, category: string, file: File, opts: UploadClientDocumentOptions = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('category', category);
  if (opts.replaces) fd.append('replaces', String(opts.replaces));
  if (opts.expiryDate) fd.append('expiry_date', opts.expiryDate);
  if (opts.documentNumber) fd.append('document_number', opts.documentNumber);
  return axiosInstance
    .post<ClientDocument>(`/client/${clientId}/documents/`, fd, {
      onUploadProgress: (e) => opts.onProgress?.((e.loaded / (e.total || e.loaded || 1)) * 100),
    })
    .then((r) => r.data);
}

export const deleteClientDocument = (clientId: number, docId: number) =>
  axiosInstance.delete(`/client/${clientId}/documents/${docId}/`).then(() => undefined);

export const verifyClientDocument = (
  clientId: number,
  docId: number,
  status: 'verified' | 'rejected' | 'under_review',
  remarks?: string
) => axiosInstance.post<ClientDocument>(`/client/${clientId}/documents/${docId}/verify/`, { status, remarks: remarks ?? '' }).then((r) => r.data);

/** Short-lived signed URL for viewing / downloading a document. */
export const getClientDocumentUrl = (clientId: number, docId: number) =>
  axiosInstance
    .get<{ file_name: string; download_url: string }>(`/client/${clientId}/documents/${docId}/download/`)
    .then((r) => r.data.download_url);

/** Full bank account number for reviewers (the server audit-logs every reveal). */
export const revealClientBankAccount = (clientId: number) =>
  axiosInstance
    .get<{ account_number: string }>(`/client/${clientId}/bank-account/unmasked/`)
    .then((r) => r.data.account_number || null);

export const listChangeRequests = (clientId: number) =>
  axiosInstance.get<ClientChangeRequest[]>(`/client/${clientId}/change-requests/`).then((r) => r.data);

export const createChangeRequest = (clientId: number, body: { section: ChangeRequestSection; required_changes: string; comments?: string }) =>
  axiosInstance.post<ClientChangeRequest>(`/client/${clientId}/change-requests/`, body).then((r) => r.data);

export const resolveChangeRequest = (clientId: number, crId: number) =>
  axiosInstance.post<ClientChangeRequest>(`/client/${clientId}/change-requests/${crId}/resolve/`).then((r) => r.data);

export const fetchClientAuditLogs = (clientId: number) =>
  axiosInstance.get<ClientAuditLogEntry[]>(`/client/${clientId}/audit-logs/`).then((r) => r.data);

/* ------------------------------------------------------------------ */
/* Error bodies                                                        */
/* ------------------------------------------------------------------ */

export interface ClientApiError {
  status?: number;
  /** One readable sentence for a toast / banner. */
  message: string;
  /** {field: message} - field errors from a 400, keyed by API field name. */
  fields: Record<string, string>;
  /** Submit / approve checklist ("missing" in the error body). */
  missing: string[];
  /** Submit issues with the wizard step and field they belong to. */
  issues: SubmissionIssue[];
}

const firstText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(firstText).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(firstText).filter(Boolean).join(' ');
  return value == null ? '' : String(value);
};

const isIssue = (value: unknown): value is SubmissionIssue =>
  !!value && typeof value === 'object' && typeof (value as SubmissionIssue).message === 'string' && typeof (value as SubmissionIssue).step === 'string';

/** Reads any client API error body: {"error", "errors": {field: [..], missing: [..], issues: [..]}},
 * the legacy {"errors": {...}} / {"missing": [...]} shapes, or a plain {"detail"}. */
export function readClientApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): ClientApiError {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  const data = response?.data;
  const result: ClientApiError = { status: response?.status, message: '', fields: {}, missing: [], issues: [] };
  if (!response) {
    result.message = 'Could not reach the server - check your connection and try again.';
    return result;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    const errors = (body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors) ? body.errors : null) as Record<string, unknown> | null;
    const source: Record<string, unknown> = errors ?? (body.error || body.detail || body.message ? {} : body);
    const missing = (errors?.missing ?? body.missing) as unknown;
    if (Array.isArray(missing)) result.missing = missing.map(firstText).filter(Boolean);
    const issues = (errors?.issues ?? body.issues) as unknown;
    if (Array.isArray(issues)) result.issues = issues.filter(isIssue);
    Object.entries(source).forEach(([key, value]) => {
      if (key === 'missing' || key === 'issues') return;
      const text = firstText(value);
      if (text) result.fields[key] = text;
    });
    // Document endpoints send {message, error: <code>}; everything else {error: <message>}.
    const headline = [body.message, body.error, body.detail].find((m): m is string => typeof m === 'string' && m.length > 0);
    result.message = headline || Object.values(result.fields)[0] || result.missing[0] || fallback;
  } else if (typeof data === 'string' && data.length < 300) {
    result.message = data;
  }
  if (!result.message) {
    result.message =
      response.status === 403 ? "You don't have permission to do this." : response.status === 404 ? 'This client no longer exists.' : fallback;
  }
  return result;
}
