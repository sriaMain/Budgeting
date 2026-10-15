import { formatDate as toDMY } from '../utils/date';
import React from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Download, FileText, Loader2, RotateCw, Trash2 } from 'lucide-react';
import { DocumentList, type DocumentSlotConfig, type UploadOptions } from './DocumentList';
import { StatusBadge } from './StatusBadge';
import { formatFileSize } from '../utils/fileHelpers';
import { effectiveDocStatus } from '../utils/documentStatus';
import {
  deleteClientDocument,
  getClientDocumentUrl,
  readClientApiError,
  uploadClientDocument,
  verifyClientDocument,
} from '../services/clientOnboarding';
import { slotDocument } from '../pages/client-onboarding/clientForm';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_STATUS_LABELS,
  documentStatusVariant,
  type ClientDocument,
  type ClientDocumentSlot,
  type DocumentSlotStatus,
} from '../pages/client-onboarding/clientTypes';

interface ClientDocumentsSectionProps {
  clientId: number;
  /** Document slots for this client (server `document_slots`: required ones first). */
  slots: ClientDocumentSlot[];
  documents: ClientDocument[];
  onDocumentsChange: (documents: ClientDocument[]) => void;
  /** After any change - e.g. re-read the client so slot statuses / approval blockers refresh. */
  onChanged?: () => void;
  canUpload: boolean;
  canDelete: boolean;
  canVerify: boolean;
  /** Review-only (e.g. submitted client for a maker): no upload / replace / delete. */
  readOnly?: boolean;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  showSummary?: boolean;
}

const MAX_CLIENT_DOCUMENTS = 8;

const categoryLabel = (category: string) => DOCUMENT_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;

/** Opens a short-lived signed URL in a new tab (the tab opens first, so popup blockers allow it). */
async function openDocument(clientId: number, docId: number) {
  const win = window.open('', '_blank');
  try {
    const url = await getClientDocumentUrl(clientId, docId);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (err) {
    win?.close();
    toast.error(readClientApiError(err, 'Unable to open the document.').message);
  }
}

/**
 * KYC documents for one client: the shared <DocumentList> slots (required / optional per the
 * client's jurisdiction and type, decided by the backend), with upload progress, server-side
 * replace, expiry dates, verify / reject (reason required) for reviewers, and any other documents
 * already on file that no current slot asks for.
 */
export const ClientDocumentsSection: React.FC<ClientDocumentsSectionProps> = ({
  clientId, slots, documents, onDocumentsChange, onChanged, canUpload, canDelete, canVerify, readOnly,
  loading, loadError, onRetry, showSummary = true,
}) => {
  // Only a reviewer (client.document.verify) may replace or remove a verified document - the API
  // refuses anyone else, so the card hides those actions for them.
  const lockVerified = !canVerify;
  // A slot shows the newest document of its own category, else of an accepted alternate category
  // (e.g. a legacy "CIN / LLPIN" upload in the incorporation-certificate slot) - same rule as the API.
  const shown = new Map<number, ClientDocument>();
  slots.forEach((slot) => {
    const doc = slotDocument(slot, documents);
    if (doc) shown.set(doc.id, doc.category === slot.category ? doc : { ...doc, category: slot.category });
  });
  const slotCategories = new Set(slots.map((s) => s.category));
  const listDocuments = [...shown.values()];
  const others = documents.filter((d) => !shown.has(d.id) && !slotCategories.has(d.category));

  const slotConfigs: DocumentSlotConfig[] = slots.map((s) => ({
    key: s.category,
    label: s.reviewer_only ? `${s.label} (reviewer)` : s.label,
    required: s.required,
    tracksExpiry: s.tracks_expiry,
    helpText: s.help_text || undefined,
  }));

  const replaceList = (next: ClientDocument, replacedId?: number) =>
    onDocumentsChange([next, ...documents.filter((d) => d.id !== next.id && d.id !== replacedId)]);

  const handleUpload = async (category: string, file: File, opts?: UploadOptions) => {
    const doc = await uploadClientDocument(clientId, category, file, {
      onProgress: opts?.onProgress,
      replaces: opts?.replaces,
      expiryDate: opts?.expiryDate,
    });
    replaceList(doc, opts?.replaces);
    toast.success(opts?.replaces ? 'Document replaced' : 'Document uploaded');
    onChanged?.();
  };

  const handleDelete = async (docId: number) => {
    if (!canDelete) {
      // Same shape as an API error so the document card shows the message.
      throw { response: { status: 403, data: { message: "You don't have permission to remove documents." } } };
    }
    await deleteClientDocument(clientId, docId);
    onDocumentsChange(documents.filter((d) => d.id !== docId));
    toast.success('Document removed');
    onChanged?.();
  };

  const handleVerify = async (docId: number, status: 'verified' | 'rejected', remarks?: string) => {
    try {
      const doc = await verifyClientDocument(clientId, docId, status, remarks);
      replaceList(doc);
      toast.success(status === 'verified' ? 'Document verified' : 'Document rejected');
      onChanged?.();
    } catch (err) {
      toast.error(readClientApiError(err, 'Unable to update the document.').message);
      throw err;
    }
  };

  const handleDeleteOther = async (doc: ClientDocument) => {
    try {
      await handleDelete(doc.id);
    } catch (err) {
      toast.error(readClientApiError(err, 'Unable to remove the document.').message);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {loadError}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="flex items-center gap-1 text-xs font-semibold hover:underline">
            <RotateCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  const atLimit = documents.length >= MAX_CLIENT_DOCUMENTS;
  const uploadDisabled = readOnly || !canUpload;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        PDF, JPG or PNG, up to 10 MB each &middot; at most {MAX_CLIENT_DOCUMENTS} documents per client ({documents.length} on file).
        Uploading never verifies a document - a reviewer checks each one.
        {atLimit && ' The limit is reached: replace or remove a document to add another.'}
      </p>
      <DocumentList
        slots={slotConfigs}
        documents={listDocuments}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onDownload={(docId) => void openDocument(clientId, docId)}
        disabled={uploadDisabled && !canVerify}
        readOnly={uploadDisabled}
        canVerify={canVerify}
        onVerify={canVerify ? handleVerify : undefined}
        requireRejectReason
        showSummary={showSummary}
        lockVerified={lockVerified}
      />

      {others.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Other documents on file</p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {others.map((doc) => {
              const status = effectiveDocStatus(doc.status, doc.expiry_date) as DocumentSlotStatus;
              return (
                <li key={doc.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100" title={doc.file_name}>{doc.file_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {doc.category_label || categoryLabel(doc.category)} &middot; {formatFileSize(doc.file_size)}
                        {doc.expiry_date ? ` · expires ${toDMY(doc.expiry_date)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={status} variant={documentStatusVariant(status)} label={DOCUMENT_STATUS_LABELS[status] ?? status} />
                    <button type="button" onClick={() => void openDocument(clientId, doc.id)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Download" aria-label={`Download ${doc.file_name}`}>
                      <Download className="w-4 h-4" />
                    </button>
                    {canDelete && !readOnly && (doc.status !== 'verified' || !lockVerified) && (
                      <button type="button" onClick={() => void handleDeleteOther(doc)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" title="Remove" aria-label={`Remove ${doc.file_name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
