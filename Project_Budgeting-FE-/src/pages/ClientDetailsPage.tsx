import { formatDateTime as toDMYTime } from '../utils/date';
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { MapPin, Phone, Building2, Edit3, X, Mail } from "lucide-react";
import { AddPOCModal } from "../components/AddPOCModal";
import { StatusBadge } from "../components/StatusBadge";
import { ClientDocumentsSection } from "../components/ClientDocumentsSection";
import { ApprovalSummaryPanel } from "../components/ApprovalSummaryPanel";
import { RequestChangesDialog } from "../components/RequestChangesDialog";
import {
  fetchClient,
  fetchClientAuditLogs,
  listChangeRequests,
  listClientDocuments,
  readClientApiError,
  resolveChangeRequest,
} from "../services/clientOnboarding";
import { clientRecordPermissions, useClientPermissions } from "./client-onboarding/useClientPermissions";
import {
  auditActionLabel,
  bankingVerificationStatusLabel,
  changeRequestSectionLabel,
  clientTypeLabel,
  computeJurisdiction,
  kycStatusLabel,
  kycStatusVariant,
  onboardingStepLabel,
  riskRatingLabel,
  riskRatingVariant,
  type Client,
  type ClientAuditLogEntry,
  type ClientChangeRequest,
  type ClientDocument,
  type POC,
  type UserRole,
} from "./client-onboarding/clientTypes";

interface ClientDetailsProps {
  client: Client;
  pocs: POC[];
  userRole: UserRole;
  onAddPOC: (poc: POC) => void;
  onEdit: () => void;
  onBack: () => void;
  /** Called whenever this page changes the client (approval, change requests, documents) so the
   * parent's list stays in sync. */
  onClientUpdated?: (updated: Client) => void;
}

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-sm text-gray-900 font-medium break-words dark:text-gray-100">{value || '-'}</p>
  </div>
);

export function ClientDetailsPage({ client, pocs, userRole, onAddPOC, onEdit, onBack, onClientUpdated }: ClientDetailsProps) {
  const navigate = useNavigate();
  const [isPOCModalOpen, setIsPOCModalOpen] = useState(false);
  const [selectedPOC, setSelectedPOC] = useState<POC | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingPOC, setEditingPOC] = useState<POC | null>(null);

  const { can } = useClientPermissions(userRole);
  const perms = clientRecordPermissions(can, client);
  const canEdit = can.edit;

  // null = still loading
  const [documents, setDocuments] = useState<ClientDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ClientAuditLogEntry[] | null>(null);
  const [changeRequests, setChangeRequests] = useState<ClientChangeRequest[] | null>(null);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  // Reset per client (a different client is shown without remounting).
  const [loadedFor, setLoadedFor] = useState(client.id);
  if (loadedFor !== client.id) {
    setLoadedFor(client.id);
    setDocuments(null);
    setDocsError(null);
    setAuditLogs(null);
    setChangeRequests(null);
  }

  useEffect(() => {
    let alive = true;
    listClientDocuments(client.id)
      .then((rows) => {
        if (alive) setDocuments(rows);
      })
      .catch((err) => {
        if (alive) setDocsError(readClientApiError(err, 'Unable to load the KYC documents.').message);
      });
    fetchClientAuditLogs(client.id)
      .then((rows) => {
        if (alive) setAuditLogs(rows);
      })
      .catch(() => {
        if (alive) setAuditLogs([]);
      });
    listChangeRequests(client.id)
      .then((rows) => {
        if (alive) setChangeRequests(rows);
      })
      .catch(() => {
        if (alive) setChangeRequests([]);
      });
    return () => {
      alive = false;
    };
  }, [client.id]);

  /** Re-reads the client and its activity after a change made on this page. */
  const refreshClient = () => {
    fetchClient(client.id)
      .then((fresh) => onClientUpdated?.(fresh))
      .catch(() => undefined);
    fetchClientAuditLogs(client.id)
      .then(setAuditLogs)
      .catch(() => undefined);
  };

  const reloadDocuments = () => {
    setDocsError(null);
    listClientDocuments(client.id)
      .then(setDocuments)
      .catch((err) => setDocsError(readClientApiError(err, 'Unable to load the KYC documents.').message));
  };

  const handleResolveChangeRequest = async (crId: number) => {
    try {
      const updated = await resolveChangeRequest(client.id, crId);
      setChangeRequests((prev) => (prev ?? []).map((cr) => (cr.id === crId ? updated : cr)));
      toast.success('Change request resolved.');
      refreshClient();
    } catch (err) {
      toast.error(readClientApiError(err, 'Failed to resolve change request.').message);
    }
  };

  const openChangeRequests = (changeRequests ?? []).filter((cr) => cr.status === 'open');

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

  const jurisdiction = client.jurisdiction ?? computeJurisdiction(client.country);
  const phone = client.phone || [client.country_code, client.mobile_number].filter(Boolean).join(' ');
  const bankCodes = [
    client.bank_ifsc_code && `IFSC ${client.bank_ifsc_code}`,
    client.bank_routing_code && `Routing ${client.bank_routing_code}`,
    client.bank_swift_code && `SWIFT ${client.bank_swift_code}`,
    client.bank_iban && `IBAN ${client.bank_iban}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6 animate-fade-in-down">
      {/* Breadcrumb / Back */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">
          Contacts
        </button>
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <span className="text-gray-700 font-medium truncate dark:text-gray-300">{client.company_name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words dark:text-white">{client.company_name}</h2>
          <StatusBadge status={client.kyc_status} variant={kycStatusVariant(client.kyc_status)} label={kycStatusLabel(client.kyc_status)} />
          {client.is_project_ready && <StatusBadge status="ready" variant="success" label="Project Ready" />}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/pipeline/add-quote', { state: { clientName: client.company_name } })}
            className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Add Quote
          </button>
          {perms.request_changes && (
            <button
              onClick={() => setIsRequestChangesOpen(true)}
              className="px-5 py-2.5 text-amber-700 font-semibold border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              Request Changes
            </button>
          )}
          {(canEdit || perms.approve || perms.edit_compliance) && (
            <button
              onClick={onEdit}
              className="px-5 py-2.5 text-blue-600 font-semibold border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors dark:hover:bg-blue-500/10"
            >
              {perms.edit ? 'Modify' : 'Open onboarding'}
            </button>
          )}
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Location & Contact</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
              <div className="min-w-0">
                <p className="text-gray-600 dark:text-gray-300">{[client.city, client.state, client.country].filter(Boolean).join(', ') || '-'}</p>
                <p className="text-xs text-gray-500 mt-1 break-words dark:text-gray-400">{[client.street_address, client.postal_code].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400 flex-shrink-0 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-300">{phone || '-'}</p>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0 dark:text-gray-500" />
              <div className="min-w-0">
                <p className="text-blue-600 text-xs break-all">{client.email}</p>
                {client.contact_person && <p className="text-xs text-gray-500 dark:text-gray-400">{client.contact_person}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Company Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3 border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">Industry:</span>
              <span className="font-medium text-gray-900 text-right dark:text-white">{client.tags.map((t) => t.name).join(', ') || 'N/A'}</span>
            </div>
            <div className="flex justify-between gap-3 border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">{jurisdiction === 'Indian' ? 'GSTIN:' : 'Tax ID:'}</span>
              <span className="font-medium text-gray-900 break-all text-right dark:text-white">{(jurisdiction === 'Indian' ? client.gstin : client.tax_id) || 'N/A'}</span>
            </div>
            <div className="flex justify-between gap-3 border-b pb-2 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-300">Jurisdiction:</span>
              <span className="font-medium text-gray-900 dark:text-white">{jurisdiction} &middot; {client.currency}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-600 dark:text-gray-300">Status:</span>
              <StatusBadge status={client.is_active ? 'active' : 'inactive'} variant={client.is_active ? 'success' : 'neutral'} label={client.is_active ? 'Active' : 'Inactive'} />
            </div>
          </div>
        </div>

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
              pocs.map((poc) => (
                <div
                  key={poc.id}
                  onClick={() => handlePOCClick(poc)}
                  className="flex items-start gap-3 pb-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-2 rounded transition-colors group dark:border-gray-800 dark:hover:bg-gray-800"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 dark:bg-blue-500/15 dark:text-blue-300">
                    {poc.poc_name.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="text-xs flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{poc.poc_name}</p>
                    <p className="text-gray-600 dark:text-gray-300">{poc.designation}</p>
                    <p className="text-gray-500 mt-0.5 dark:text-gray-400">{poc.poc_mobile}</p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={(e) => handleEditPOC(poc, e)}
                      className="text-gray-600 p-1.5 hover:text-blue-800 hover:bg-blue-50 rounded transition-all dark:text-gray-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
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
            {jurisdiction === 'Indian' ? <Field label="PAN" value={client.pan} /> : <Field label="Tax ID" value={client.tax_id} />}
            {client.client_type !== 'individual' && <Field label="Registration No." value={client.registration_no} />}
            {client.client_type !== 'individual' && (
              <Field label="Authorised Signatory" value={[client.authorised_signatory_name, client.authorised_signatory_role].filter(Boolean).join(' · ')} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t dark:border-gray-800">
            <StatusBadge status={client.risk_rating} variant={riskRatingVariant(client.risk_rating)} label={`Risk: ${riskRatingLabel(client.risk_rating)}`} />
            <StatusBadge status={client.onboarding_step} variant="info" label={onboardingStepLabel(client.onboarding_step)} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">Banking</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account Holder" value={client.bank_account_holder_name} />
            <Field label="Bank" value={[client.bank_name, client.bank_branch].filter(Boolean).join(' · ')} />
            <Field label="Account Number" value={client.bank_account_number_masked} />
            <Field label="Bank Codes" value={bankCodes.length ? bankCodes.join(' · ') : client.bank_code} />
            <Field label="Bank Country" value={client.bank_country || client.country} />
            <Field label="Verification" value={bankingVerificationStatusLabel(client.banking_verification_status)} />
          </div>
        </div>
      </div>

      {/* Open change requests */}
      {openChangeRequests.length > 0 && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 space-y-3 dark:bg-amber-500/10 dark:border-amber-500/20">
          <h3 className="font-bold text-amber-800 text-sm dark:text-amber-300">Open Change Requests</h3>
          <div className="divide-y divide-amber-100 dark:divide-amber-500/20">
            {openChangeRequests.map((cr) => (
              <div key={cr.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{changeRequestSectionLabel(cr.section)}</p>
                  <p className="text-sm text-amber-800 mt-0.5 break-words dark:text-amber-300">{cr.required_changes}</p>
                  {cr.comments && <p className="text-xs text-amber-700 mt-0.5 dark:text-amber-400">{cr.comments}</p>}
                  <p className="text-xs text-amber-600 mt-1 dark:text-amber-500">
                    Requested by {cr.requested_by_name || 'system'} on {toDMYTime(cr.requested_at)}
                  </p>
                </div>
                {perms.request_changes && (
                  <button
                    type="button"
                    onClick={() => handleResolveChangeRequest(cr.id)}
                    className="self-start px-3 py-1.5 text-xs font-semibold rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors flex-shrink-0 dark:bg-transparent dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
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
        <h3 className="font-bold text-gray-900 text-sm mb-4 dark:text-white">KYC Documents</h3>
        <ClientDocumentsSection
          clientId={client.id}
          slots={client.document_slots ?? []}
          documents={documents ?? []}
          onDocumentsChange={setDocuments}
          onChanged={refreshClient}
          canUpload={perms.upload_documents}
          canDelete={perms.delete_documents}
          canVerify={perms.verify_documents}
          readOnly={!perms.upload_documents}
          loading={documents === null && !docsError}
          loadError={docsError}
          onRetry={reloadDocuments}
        />
      </div>

      {/* Final Approval Summary */}
      <ApprovalSummaryPanel
        client={client}
        documents={documents ?? []}
        userRole={userRole}
        onBack={onBack}
        onApproved={(updated) => {
          onClientUpdated?.(updated);
          refreshClient();
        }}
        onChangeRequestCreated={(cr) => {
          setChangeRequests((prev) => [cr, ...(prev ?? [])]);
          refreshClient();
        }}
      />

      <RequestChangesDialog
        isOpen={isRequestChangesOpen}
        clientId={client.id}
        onClose={() => setIsRequestChangesOpen(false)}
        onCreated={(cr) => {
          setChangeRequests((prev) => [cr, ...(prev ?? [])]);
          refreshClient();
        }}
      />

      {/* Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-bold text-gray-900 text-sm mb-3 dark:text-white">Activity</h3>
        {auditLogs === null ? (
          <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading activity...</div>
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{auditActionLabel(log)}</p>
                  {log.field_name && <p className="text-xs text-gray-500 break-words dark:text-gray-400">{log.field_name.replace(/^document:/, 'Document: ')}</p>}
                  {(log.old_value || log.new_value) && (
                    <p className="text-xs text-gray-500 mt-0.5 break-words dark:text-gray-400">
                      {log.old_value && <span>{log.old_value} → </span>}
                      <span>{log.new_value || '-'}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">by {log.performed_by_name || 'system'}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap dark:text-gray-500">{toDMYTime(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isPOCModalOpen && (
        <AddPOCModal
          companyId={client.id}
          companyName={client.company_name}
          defaultCountry={client.country}
          poc={editingPOC || undefined}
          onSave={onAddPOC}
          onClose={handleClosePOCModal}
        />
      )}

      {isDetailsModalOpen && selectedPOC && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 dark:bg-black/60">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in-down dark:bg-gray-900 dark:shadow-black/40">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Contact Details</h3>
              <button onClick={handleCloseDetailsModal} className="p-1 hover:bg-gray-100 rounded-full transition-colors dark:hover:bg-gray-800" aria-label="Close">
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold flex-shrink-0 dark:bg-blue-500/15 dark:text-blue-300">
                  {selectedPOC.poc_name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white">{selectedPOC.poc_name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedPOC.designation}</p>
                </div>
              </div>
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
                    <a href={`tel:${selectedPOC.poc_mobile}`} className="text-sm font-medium text-blue-600 hover:underline">{selectedPOC.poc_mobile}</a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail size={20} className="text-gray-400 mt-0.5 flex-shrink-0 dark:text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-1 dark:text-gray-400">Email</p>
                    <a href={`mailto:${selectedPOC.poc_email}`} className="text-sm font-medium text-blue-600 hover:underline break-all">{selectedPOC.poc_email}</a>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
              <button onClick={handleCloseDetailsModal} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors dark:text-gray-300 dark:hover:bg-gray-700">
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
