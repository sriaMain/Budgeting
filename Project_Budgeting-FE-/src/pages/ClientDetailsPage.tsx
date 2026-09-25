import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { Client, POC, ClientDocument, ClientAuditLogEntry, ClientChangeRequest } from "../pages/ClientListPage";
import {
  AUDIT_ACTION_LABELS,
  DOCUMENT_CATEGORY_OPTIONS,
  clientTypeLabel,
  kycStatusLabel,
  riskRatingLabel,
  onboardingStepLabel,
  kycStatusVariant,
  riskRatingVariant,
  computeJurisdiction,
  changeRequestSectionLabel,
} from "../pages/ClientListPage";
import { AddPOCModal } from "../components/AddPOCModal";
import { StatusBadge } from "../components/StatusBadge";
import { DocumentList } from "../components/DocumentList";
import { ApprovalSummaryPanel } from "../components/ApprovalSummaryPanel";
import { RequestChangesDialog } from "../components/RequestChangesDialog";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { MapPin, Phone, Building2, Edit3, X, Mail } from "lucide-react";

interface ClientDetailsProps {
  client: Client;
  pocs: POC[];
  userRole: 'admin' | 'user' | 'manager';
  onAddPOC: (poc: POC) => void;
  onEdit: () => void;
  onBack: () => void;
  /** Called whenever this page updates the client itself (currently: Approve & Mark
   * Project Ready), so the parent's own client list/table stays in sync without
   * waiting for its next full refetch. Optional so existing callers aren't forced
   * to wire it up if they don't need the list to reflect it immediately. */
  onClientUpdated?: (updated: Client) => void;
}

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-sm text-gray-900 font-medium dark:text-gray-100">{value || '-'}</p>
  </div>
);

export function ClientDetailsPage({ client, pocs, userRole, onAddPOC, onEdit, onBack, onClientUpdated }: ClientDetailsProps) {
  const navigate = useNavigate();
  const [isPOCModalOpen, setIsPOCModalOpen] = useState(false);
  const [selectedPOC, setSelectedPOC] = useState<POC | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingPOC, setEditingPOC] = useState<POC | null>(null);

  const canEdit = userRole === 'admin' || userRole === 'manager';

  // Local mirror of the `client` prop, so the Approve & Mark Project Ready action (fired
  // straight from ApprovalSummaryPanel, not through the parent's onSaved/edit-drawer path)
  // can reflect the server's updated Company immediately without needing a full clients
  // refetch upstream. Resynced whenever the parent hands us a fresher client (e.g. after
  // editing via the drawer).
  const [localClient, setLocalClient] = useState<Client>(client);
  useEffect(() => setLocalClient(client), [client]);

  // Documents (Section 20's KYC document set)
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);

  // Audit trail (read-only)
  const [auditLogs, setAuditLogs] = useState<ClientAuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Change requests (open/resolved) filed against this client's sections
  const [changeRequests, setChangeRequests] = useState<ClientChangeRequest[]>([]);
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(true);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  useEffect(() => {
    setDocsLoading(true);
    axiosInstance
      .get(`/client/${client.id}/documents/`)
      .then((res) => setDocuments(res.data))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setDocsLoading(false));

    setAuditLoading(true);
    axiosInstance
      .get(`/client/${client.id}/audit-logs/`)
      .then((res) => setAuditLogs(res.data))
      .catch(() => toast.error('Failed to load activity log'))
      .finally(() => setAuditLoading(false));

    setChangeRequestsLoading(true);
    axiosInstance
      .get(`/client/${client.id}/change-requests/`)
      .then((res) => setChangeRequests(res.data))
      .catch(() => toast.error('Failed to load change requests'))
      .finally(() => setChangeRequestsLoading(false));
  }, [client.id]);

  const handleVerifyDocument = async (docId: number, status: 'verified' | 'rejected', remarks?: string) => {
    const res = await axiosInstance.post(`/client/${client.id}/documents/${docId}/verify/`, { status, remarks });
    setDocuments((prev) => prev.map((d) => (d.id === docId ? res.data : d)));
  };

  const handleResolveChangeRequest = async (crId: number) => {
    try {
      const res = await axiosInstance.post(`/client/${client.id}/change-requests/${crId}/resolve/`);
      setChangeRequests((prev) => prev.map((cr) => (cr.id === crId ? res.data : cr)));
      toast.success('Change request resolved.');
    } catch (err) {
      const apiErrors = parseApiErrors(err);
      toast.error(apiErrors.general || 'Failed to resolve change request.');
    }
  };

  const openChangeRequests = changeRequests.filter((cr) => cr.status === 'open');

  const handleUploadDocument = async (category: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    fd.append('is_required', 'false');
    const res = await axiosInstance.post(`/client/${client.id}/documents/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setDocuments((prev) => [...prev.filter((d) => d.id !== res.data.id), res.data]);
  };

  const handleDeleteDocument = async (docId: number) => {
    await axiosInstance.delete(`/client/${client.id}/documents/${docId}/`);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleDownloadDocument = (docId: number) => {
    axiosInstance
      .get(`/client/${client.id}/documents/${docId}/download/`)
      .then((res) => window.open(res.data.download_url, '_blank'))
      .catch(() => toast.error('Failed to get download link'));
  };

  const documentSlots = DOCUMENT_CATEGORY_OPTIONS.map((opt) => ({ key: opt.value, label: opt.label, required: false }));

  const handlePOCClick = (poc: POC) => {
    setSelectedPOC(poc);
    setIsDetailsModalOpen(true);
  };

  const handleEditPOC = (poc: POC, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
    setEditingPOC(poc);
    setIsPOCModalOpen(true);
  };

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedPOC(null);
  };

  const handleClosePOCModal = () => {
    setIsPOCModalOpen(false);
    setEditingPOC(null);
  };

  const jurisdiction = localClient.jurisdiction ?? computeJurisdiction(localClient.country);

  return (
    <div className="space-y-6 animate-fade-in-down">
      {/* Breadcrumb / Back */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
        >
          Contacts
        </button>
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <span className="text-gray-700 font-medium dark:text-gray-300">{client.company_name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{client.company_name}</h2>
          <StatusBadge status={localClient.kyc_status} variant={kycStatusVariant(localClient.kyc_status)} label={kycStatusLabel(localClient.kyc_status)} />
          {localClient.is_project_ready && <StatusBadge status="ready" variant="success" label="Project Ready" />}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/pipeline/add-quote', { state: { clientName: client.company_name } })}
            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Add Quote
          </button>
          {canEdit && (
            <button
              onClick={() => setIsRequestChangesOpen(true)}
              className="px-6 py-2.5 text-amber-700 font-semibold border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              Request Changes
            </button>
          )}
          {canEdit && (
            <button
              onClick={onEdit}
              className="px-6 py-2.5 text-blue-600 font-semibold border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors dark:hover:bg-blue-500/10"
            >
              Modify
            </button>
          )}
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Location Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Location & Contact</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
              <div>
                <p className="text-gray-600 dark:text-gray-300">{client.city}, {client.state}</p>
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{client.street_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400 flex-shrink-0 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-300">{client.mobile_number}</p>
            </div>
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0 dark:text-gray-500" />
              <p className="text-blue-600 hover:underline cursor-pointer text-xs">{client.email}</p>
            </div>
          </div>
        </div>

        {/* Company Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Company Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">Industry:</span>
              <span className="font-medium text-gray-900 dark:text-white">{client.tags[0]?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">GSTIN:</span>
              <span className="font-medium text-gray-900 dark:text-white">{client.gstin || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">Jurisdiction:</span>
              <span className="font-medium text-gray-900 dark:text-white">{jurisdiction} &middot; {client.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Status:</span>
              <StatusBadge status={client.is_active ? 'active' : 'inactive'} variant={client.is_active ? 'success' : 'neutral'} label={client.is_active ? 'Active' : 'Inactive'} />
            </div>
          </div>
        </div>

        {/* People (POCs) Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col dark:bg-gray-900 dark:border-gray-800">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center dark:bg-gray-800 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 text-sm dark:text-white">Points of Contact</h3>
            {canEdit && (
              <button
                onClick={() => setIsPOCModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded-md font-semibold transition-colors"
              >
                Add POC
              </button>
            )}
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-56">
            {pocs.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-4 dark:text-gray-500">No contacts yet.</p>
            ) : (
              pocs.map((poc, idx) => (
                <div
                  key={idx}
                  onClick={() => handlePOCClick(poc)}
                  className="flex items-start gap-3 pb-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-2 rounded transition-colors group dark:border-gray-800 dark:hover:bg-gray-800"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 dark:bg-blue-500/15 dark:text-blue-300">
                    {poc.poc_name.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="text-xs flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{poc.poc_name}</p>
                    <p className="text-gray-600 dark:text-gray-300">{poc.designation}</p>
                    <p className="text-gray-500 mt-0.5 dark:text-gray-400">{poc.poc_mobile}</p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={(e) => handleEditPOC(poc, e)}
                      className="text-gray-600 opacity-100 group-hover:opacity-100 p-1.5 hover:text-blue-800 hover:bg-blue-50 rounded transition-all dark:text-gray-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
                      aria-label="Edit POC"
                    >
                      <Edit3 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* KYC / Banking Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">KYC &amp; Onboarding</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client Type" value={clientTypeLabel(client.client_type)} />
            <Field label="Registration No." value={client.registration_no} />
            <Field label="PAN" value={client.pan} />
            <Field
              label="Authorised Signatory"
              value={[client.authorised_signatory_name, client.authorised_signatory_role].filter(Boolean).join(' · ')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t dark:border-gray-800">
            <StatusBadge status={localClient.risk_rating} variant={riskRatingVariant(localClient.risk_rating)} label={`Risk: ${riskRatingLabel(localClient.risk_rating)}`} />
            <StatusBadge status={localClient.onboarding_step} variant="info" label={onboardingStepLabel(localClient.onboarding_step)} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Banking</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bank Name" value={client.bank_name} />
            <Field label="Account Number" value={client.bank_account_number_masked} />
            <Field label="Bank Code" value={client.bank_code} />
          </div>
        </div>
      </div>

      {/* Open change requests - filed via ApprovalSummaryPanel/RequestChangesDialog */}
      {!changeRequestsLoading && openChangeRequests.length > 0 && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 space-y-3 dark:bg-amber-500/10 dark:border-amber-500/20">
          <h3 className="font-bold text-amber-800 text-sm dark:text-amber-300">Open Change Requests</h3>
          <div className="divide-y divide-amber-100 dark:divide-amber-500/20">
            {openChangeRequests.map((cr) => (
              <div key={cr.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{changeRequestSectionLabel(cr.section)}</p>
                  <p className="text-sm text-amber-800 mt-0.5 dark:text-amber-300">{cr.required_changes}</p>
                  {cr.comments && <p className="text-xs text-amber-700 mt-0.5 dark:text-amber-400">{cr.comments}</p>}
                  <p className="text-xs text-amber-600 mt-1 dark:text-amber-500">
                    Requested by {cr.requested_by_name || 'system'} on {new Date(cr.requested_at).toLocaleString()}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleResolveChangeRequest(cr.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors flex-shrink-0 dark:bg-transparent dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-bold text-gray-900 text-sm mb-4 dark:text-white">Documents</h3>
        <DocumentList
          slots={documentSlots}
          documents={documents}
          onUpload={handleUploadDocument}
          onDelete={handleDeleteDocument}
          onDownload={handleDownloadDocument}
          onVerify={handleVerifyDocument}
          canVerify={canEdit}
          disabled={docsLoading || !canEdit}
        />
      </div>

      {/* Final Approval Summary - only once the client is meaningfully close to done */}
      {(localClient.onboarding_step === 'commercials' || localClient.onboarding_step === 'approved') && (
        <ApprovalSummaryPanel
          client={localClient}
          documents={documents}
          userRole={userRole}
          onBack={onBack}
          onApproved={(updated) => {
            setLocalClient(updated);
            onClientUpdated?.(updated);
          }}
          onChangeRequestCreated={(cr) => setChangeRequests((prev) => [...prev, cr])}
        />
      )}

      {/* Standalone Request Changes entry point, also reachable from the banner above */}
      <RequestChangesDialog
        isOpen={isRequestChangesOpen}
        clientId={client.id}
        onClose={() => setIsRequestChangesOpen(false)}
        onCreated={(cr) => setChangeRequests((prev) => [...prev, cr])}
      />

      {/* Audit Trail - mirrors FreelancerActivityTab's minimal list/empty-state layout */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-bold text-gray-900 text-sm mb-3 dark:text-white">Activity</h3>
        {auditLoading ? (
          <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading activity...</div>
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{AUDIT_ACTION_LABELS[log.action]}</p>
                  {(log.old_value || log.new_value) && (
                    <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                      {log.old_value && <span>{log.old_value} → </span>}
                      <span>{log.new_value || '-'}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">by {log.performed_by_name || 'system'}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap dark:text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* POC Modal for Add/Edit */}
      {isPOCModalOpen && (
        <AddPOCModal
          companyId={client.id}
          companyName={client.company_name}
          poc={editingPOC || undefined}
          onSave={onAddPOC}
          onClose={handleClosePOCModal}
        />
      )}

      {/* POC Details Modal */}
      {isDetailsModalOpen && selectedPOC && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 dark:bg-black/60">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in-down dark:bg-gray-900 dark:shadow-black/40">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Contact Details</h3>
              <button
                onClick={handleCloseDetailsModal}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors dark:hover:bg-gray-800"
              >
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Avatar and Name */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold flex-shrink-0 dark:bg-blue-500/15 dark:text-blue-300">
                  {selectedPOC.poc_name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white">{selectedPOC.poc_name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedPOC.designation}</p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 size={20} className="text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1 dark:text-gray-400">Company</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedPOC.company_name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone size={20} className="text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1 dark:text-gray-400">Phone</p>
                    <a href={`tel:${selectedPOC.poc_mobile}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {selectedPOC.poc_mobile}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail size={20} className="text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1 dark:text-gray-400">Email</p>
                    <a href={`mailto:${selectedPOC.poc_email}`} className="text-sm font-medium text-blue-600 hover:underline break-all">
                      {selectedPOC.poc_email}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
              <button
                onClick={handleCloseDetailsModal}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
              {canEdit && (
                <button
                  onClick={(e: React.MouseEvent) => {
                    handleCloseDetailsModal();
                    handleEditPOC(selectedPOC, e);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Edit3 size={16} />
                  Edit Contact
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
