import React, { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, XCircle, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { formatFileSize } from '../utils/fileHelpers';
import { StatusBadge } from './StatusBadge';

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
  onUpload: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDownload?: () => void;
  disabled?: boolean;
  /** Admin/manager-only verify affordance. Omitted entirely for modules that don't yet
   * have a review workflow (vendor/employee/freelancer onboarding), so this stays optional. */
  canVerify?: boolean;
  onVerify?: (status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
}

/** Status-aware badge for the 5 ClientDocument statuses (uploaded/under_review/verified/
 * rejected/expired). Falls back to a neutral title-cased label for any other status string,
 * so this keeps working unmodified for vendor/freelancer documents that only ever set
 * 'uploaded'/'verified'. */
const DOC_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  uploaded: 'neutral',
  under_review: 'warning',
  verified: 'success',
  rejected: 'danger',
  expired: 'neutral',
};

const DOC_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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
  existingDoc, onUpload, onDelete, onDownload, disabled, canVerify, onVerify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Guards against a duplicate upload firing while one is already in
    // flight for this exact document slot (each slot has its own state, so
    // this can never be tripped by a different document's upload).
    if (isUploading) return;
    setError(undefined);

    if (!isFileTypeAllowed(file, accept)) {
      setError(`${label} only accepts ${allowedTypesText} files.`);
      resetFileInput();
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`${label}: Maximum file size is ${maxSizeMb}MB.`);
      resetFileInput();
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError(`${label} upload is temporarily rate-limited. Please try again later.`);
      } else {
        setError(`${label} upload failed. Please try again.`);
      }
      console.error(err);
    } finally {
      setIsUploading(false);
      resetFileInput();
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
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

  return (
    <div className={`border rounded-lg p-4 ${error ? 'border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-500/10' : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'}`}>
      <div className="flex items-start justify-between gap-3">
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
              <p className="text-xs text-gray-500 truncate dark:text-gray-400">
                {existingDoc.fileName} &middot; {formatFileSize(existingDoc.sizeBytes)}
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">{allowedTypesText}, up to {maxSizeMb}MB</p>
            )}
            {existingDoc?.verifiedAt && (
              <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                {existingDoc.status === 'rejected' ? 'Rejected' : 'Verified'} by {existingDoc.verifiedBy ?? 'reviewer'} on{' '}
                {new Date(existingDoc.verifiedAt).toLocaleString()}
                {existingDoc.remarks && <span className="block italic text-gray-400 dark:text-gray-500">"{existingDoc.remarks}"</span>}
              </p>
            )}
            {error && <p className="text-xs text-red-600 mt-1 dark:text-red-400">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {existingDoc && (
            <StatusBadge
              status={existingDoc.status}
              variant={DOC_STATUS_VARIANTS[existingDoc.status] ?? 'neutral'}
              label={DOC_STATUS_LABELS[existingDoc.status] ?? titleCase(existingDoc.status)}
            />
          )}
          {!existingDoc && !isUploading && error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" /> Upload failed
            </span>
          )}
          {showVerifyActions && (
            <>
              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying || isRejecting}
                className="p-1.5 rounded-md hover:bg-green-50 text-green-600 dark:hover:bg-green-500/10 dark:text-green-400 disabled:opacity-50"
                title="Verify"
              >
                {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsRejecting((prev) => !prev)}
                disabled={isVerifying}
                className="p-1.5 rounded-md hover:bg-red-50 text-red-500 dark:hover:bg-red-500/10 dark:text-red-400 disabled:opacity-50"
                title="Reject"
              >
                <ShieldX className="w-4 h-4" />
              </button>
            </>
          )}
          {existingDoc && onDownload && (
            <button type="button" onClick={onDownload} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 dark:hover:bg-gray-800 dark:text-gray-400" title="Download">
              <Download className="w-4 h-4" />
            </button>
          )}
          {existingDoc && onDelete && !disabled && (
            <button type="button" onClick={handleDelete} disabled={isDeleting} className="p-1.5 rounded-md hover:bg-red-50 text-red-500 dark:hover:bg-red-500/10 dark:text-red-400" title="Delete">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
          {!disabled && (
            <>
              <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
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
          <label className="block text-xs font-medium text-gray-600 mb-1.5 dark:text-gray-400">Reason for rejection (optional)</label>
          <div className="flex items-start gap-2">
            <textarea
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Document is illegible, wrong file type, expired..."
              className="flex-1 px-3 py-2 text-sm bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-800 dark:focus:ring-violet-500"
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isVerifying}
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
