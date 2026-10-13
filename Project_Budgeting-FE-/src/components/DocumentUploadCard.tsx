import React, { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, XCircle, Loader2, ShieldCheck, ShieldX, Eye, CalendarClock, Clock } from 'lucide-react';
import { formatFileSize } from '../utils/fileHelpers';
import { StatusBadge } from './StatusBadge';
import { effectiveDocStatus, todayIso } from '../utils/documentStatus';

interface ExistingDoc {
  id: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  uploadedAt: string;
  /** Only set once a reviewer has acted on the document via the verify endpoint. */
  verifiedBy?: string | number | null;
  verifiedAt?: string | null;
  remarks?: string | null;
  expiryDate?: string | null;
  documentNumber?: string | null;
}

export interface UploadOptions {
  /** Upload progress, 0-100. */
  onProgress?: (percent: number) => void;
  /** Id of the document this upload replaces - the server swaps them atomically. */
  replaces?: number;
  expiryDate?: string;
}

interface DocumentUploadCardProps {
  label: string;
  required: boolean;
  accept?: string;
  /** Human-readable form of `accept`, used in the help text and in the
   * "only accepts X files" validation message (e.g. "JPG, JPEG or PNG"). */
  allowedTypesText?: string;
  maxSizeMb?: number;
  existingDoc?: ExistingDoc;
  onUpload: (file: File, opts: UploadOptions) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDownload?: () => void;
  disabled?: boolean;
  /** Reviewer-only verify / reject affordance. */
  canVerify?: boolean;
  onVerify?: (status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
  /** Opens the document for viewing (e.g. a signed URL in a new tab). */
  onPreview?: () => void;
  /** Review-only: hides upload/replace/delete but keeps verify/reject (e.g. a submitted vendor). */
  readOnly?: boolean;
  /** Rejection needs a reason. */
  requireRejectReason?: boolean;
  /** Badge text for a freshly uploaded, unverified document. */
  uploadedLabel?: string;
  /** Ask for the document's expiry date (passports, certificates with a validity period). */
  tracksExpiry?: boolean;
  /** One-line guidance under the label (e.g. "Masked Aadhaar only"). */
  helpText?: string;
  /** A verified document can't be replaced by the uploader (portal users). */
  lockVerified?: boolean;
}

/** Status-aware badge for the document lifecycle. "missing" is shown for an empty required slot. */
const DOC_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  missing: 'danger',
  uploaded: 'info',
  under_review: 'warning',
  verified: 'success',
  rejected: 'danger',
  expired: 'danger',
};

const DOC_STATUS_LABELS: Record<string, string> = {
  missing: 'Missing',
  uploaded: 'Uploaded',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Checks `file` against an HTML `accept` attribute string (comma-separated
 * extensions like ".pdf" and/or MIME types like "image/png"). Checks both the
 * browser-reported MIME type and the filename extension, since some OSes /
 * camera apps produce files with an empty or generic `file.type`. */
function isFileTypeAllowed(file: File, accept: string): boolean {
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const fileName = file.name.toLowerCase();
  const mimeType = (file.type || '').toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return fileName.endsWith(token);
    if (token.includes('/')) return mimeType === token;
    return false;
  });
}

export const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({
  label, required, accept = '.pdf,.jpg,.jpeg,.png', allowedTypesText = 'PDF, JPG, JPEG or PNG', maxSizeMb = 10,
  existingDoc, onUpload, onDelete, onDownload, disabled, canVerify, onVerify, onPreview, readOnly, requireRejectReason, uploadedLabel,
  tracksExpiry, helpText, lockVerified,
}) => {
  const canModify = !disabled && !readOnly;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [expiry, setExpiry] = useState('');

  const status = existingDoc ? effectiveDocStatus(existingDoc.status, existingDoc.expiryDate) : required ? 'missing' : '';
  const replaceLocked = !!existingDoc && lockVerified && existingDoc.status === 'verified';

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Guards against a duplicate upload firing while one is already in flight for this slot.
    if (isUploading) return;
    setError(undefined);

    if (!isFileTypeAllowed(file, accept)) {
      setError(`${label} only accepts ${allowedTypesText} files.`);
      resetFileInput();
      return;
    }
    if (file.size === 0) {
      setError(`${label}: the selected file is empty.`);
      resetFileInput();
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`${label}: Maximum file size is ${maxSizeMb}MB (this file is ${formatFileSize(file.size)}).`);
      resetFileInput();
      return;
    }
    if (tracksExpiry && expiry && expiry < todayIso()) {
      setError(`${label}: the expiry date is in the past - upload a document that is still valid.`);
      resetFileInput();
      return;
    }

    setIsUploading(true);
    setProgress(0);
    try {
      await onUpload(file, {
        onProgress: (p) => setProgress(Math.max(0, Math.min(100, Math.round(p)))),
        replaces: existingDoc?.id,
        expiryDate: tracksExpiry && expiry ? expiry : undefined,
      });
      setExpiry('');
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { message?: unknown; detail?: unknown; error?: unknown } } })?.response;
      const serverMessage = [response?.data?.message, response?.data?.detail, response?.data?.error].find((m): m is string => typeof m === 'string' && m.length > 0);
      if (response?.status === 429) {
        setError(`${label} upload is temporarily rate-limited. Please try again later.`);
      } else if (response?.status === 401) {
        setError('Your session has expired. Please sign in again.');
      } else if (response?.status === 403) {
        setError(serverMessage || "You don't have permission to upload this document.");
      } else if (!response) {
        setError(`${label} upload failed - check your connection and try again.`);
      } else {
        setError(serverMessage ? `${label}: ${serverMessage}` : `${label} upload failed. Please try again.`);
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      resetFileInput();
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: unknown; error?: unknown; detail?: unknown } } })?.response?.data;
      const text = [msg?.message, msg?.error, msg?.detail].find((m): m is string => typeof m === 'string' && m.length > 0);
      setError(text || `Could not remove ${label}. Please try again.`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleVerify = async () => {
    if (!onVerify) return;
    setIsVerifying(true);
    setError(undefined);
    try {
      await onVerify('verified');
    } catch {
      setError('Failed to verify this document. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!onVerify) return;
    if (requireRejectReason && !rejectRemarks.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setIsVerifying(true);
    setError(undefined);
    try {
      await onVerify('rejected', rejectRemarks.trim() || undefined);
      setIsRejecting(false);
      setRejectRemarks('');
    } catch {
      setError('Failed to reject this document. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const showVerifyActions = canVerify && existingDoc && onVerify && !disabled;
  const statusLabel = (s: string) => (s === 'uploaded' && uploadedLabel ? uploadedLabel : DOC_STATUS_LABELS[s] ?? titleCase(s));
  const problem = status === 'rejected' || status === 'expired';
  const cardTone = error || problem
    ? 'border-red-300 bg-red-50/60 dark:border-red-900/40 dark:bg-red-500/10'
    : status === 'missing'
      ? 'border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
      : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';

  return (
    <div className={`border rounded-lg p-4 ${cardTone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 dark:bg-blue-500/15">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {label} {required && <span className="text-red-500">*</span>}
              {!required && <span className="text-xs font-normal text-gray-400 ml-1 dark:text-gray-500">(Optional)</span>}
            </p>
            {existingDoc ? (
              <>
                <p className="text-xs text-gray-600 truncate dark:text-gray-300" title={existingDoc.fileName}>
                  {existingDoc.fileName} &middot; {formatFileSize(existingDoc.sizeBytes)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Uploaded {formatDate(existingDoc.uploadedAt)}</span>
                  {existingDoc.expiryDate && (
                    <span className={`inline-flex items-center gap-1 ${status === 'expired' ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                      <CalendarClock className="w-3 h-3" /> {status === 'expired' ? 'Expired' : 'Expires'} {formatDate(existingDoc.expiryDate)}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">{helpText ? `${helpText} · ` : ''}{allowedTypesText}, up to {maxSizeMb}MB</p>
            )}
            {existingDoc?.verifiedAt && (
              <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                {existingDoc.status === 'rejected' ? 'Rejected' : existingDoc.status === 'under_review' ? 'Marked for review' : 'Verified'} by {existingDoc.verifiedBy ?? 'reviewer'} on{' '}
                {new Date(existingDoc.verifiedAt).toLocaleString()}
              </p>
            )}
            {existingDoc?.status === 'rejected' && existingDoc.remarks && (
              <p className="text-xs text-red-700 mt-1 dark:text-red-300">
                Reason: "{existingDoc.remarks}"{canModify && !replaceLocked ? ' - upload a corrected document to resubmit.' : ''}
              </p>
            )}
            {status === 'expired' && canModify && <p className="text-xs text-red-700 mt-1 dark:text-red-300">This document has expired - upload a current one.</p>}
            {error && <p className="text-xs text-red-600 mt-1 dark:text-red-400" role="alert">{error}</p>}
            {isUploading && progress !== null && (
              <div className="mt-2 w-48 max-w-full">
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${label}`}>
                  <div className="h-full bg-blue-600 dark:bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end">
          {status && (
            <StatusBadge status={status} variant={DOC_STATUS_VARIANTS[status] ?? 'neutral'} label={statusLabel(status)} />
          )}
          {!existingDoc && !isUploading && error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" /> Upload failed
            </span>
          )}
          {showVerifyActions && (
            <>
              {existingDoc.status !== 'verified' && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={isVerifying || isRejecting}
                  className="p-1.5 rounded-md hover:bg-green-50 text-green-600 dark:hover:bg-green-500/10 dark:text-green-400 disabled:opacity-50"
                  title="Verify"
                  aria-label={`Verify ${label}`}
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                </button>
              )}
              {existingDoc.status !== 'rejected' && (
                <button
                  type="button"
                  onClick={() => setIsRejecting((prev) => !prev)}
                  disabled={isVerifying}
                  className="p-1.5 rounded-md hover:bg-red-50 text-red-500 dark:hover:bg-red-500/10 dark:text-red-400 disabled:opacity-50"
                  title="Reject"
                  aria-label={`Reject ${label}`}
                >
                  <ShieldX className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {existingDoc && onPreview && (
            <button type="button" onClick={onPreview} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 dark:hover:bg-gray-800 dark:text-gray-400" title="Preview" aria-label={`Preview ${label}`}>
              <Eye className="w-4 h-4" />
            </button>
          )}
          {existingDoc && onDownload && (
            <button type="button" onClick={onDownload} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 dark:hover:bg-gray-800 dark:text-gray-400" title="Download" aria-label={`Download ${label}`}>
              <Download className="w-4 h-4" />
            </button>
          )}
          {existingDoc && onDelete && canModify && !replaceLocked && (
            <button type="button" onClick={handleDelete} disabled={isDeleting || isUploading} className="p-1.5 rounded-md hover:bg-red-50 text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10 dark:text-red-400" title="Remove" aria-label={`Remove ${label}`}>
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
          {canModify && !replaceLocked && (
            <>
              {tracksExpiry && (
                <label className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Expires
                  <input
                    type="date"
                    value={expiry}
                    min={todayIso()}
                    onChange={(e) => setExpiry(e.target.value)}
                    disabled={isUploading}
                    aria-label={`${label} expiry date`}
                    className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                  />
                </label>
              )}
              <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isDeleting}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border disabled:opacity-50 ${
                  problem
                    ? 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10'
                    : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isUploading ? 'Uploading...' : existingDoc ? 'Replace' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>

      {isRejecting && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-600 mb-1.5 dark:text-gray-400">
            Reason for rejection {requireRejectReason ? <span className="text-red-500">*</span> : '(optional)'}
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
            <textarea
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Document is illegible, wrong file type, expired..."
              className="flex-1 px-3 py-2 text-sm bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-800 dark:focus:ring-violet-500"
            />
            <div className="flex sm:flex-col gap-1.5">
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isVerifying || (requireRejectReason && !rejectRemarks.trim())}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-risk-600 text-white hover:bg-risk-700 disabled:opacity-50"
              >
                {isVerifying ? 'Rejecting…' : 'Confirm Reject'}
              </button>
              <button
                type="button"
                onClick={() => { setIsRejecting(false); setRejectRemarks(''); }}
                disabled={isVerifying}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
