import React, { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatFileSize } from '../utils/fileHelpers';

interface ExistingDoc {
  id: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  uploadedAt: string;
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
}

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
  existingDoc, onUpload, onDelete, onDownload, disabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

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

  return (
    <div className={`border rounded-lg p-4 ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {label} {required && <span className="text-red-500">*</span>}
              {!required && <span className="text-xs font-normal text-gray-400 ml-1">(Optional)</span>}
            </p>
            {existingDoc ? (
              <p className="text-xs text-gray-500 truncate">
                {existingDoc.fileName} &middot; {formatFileSize(existingDoc.sizeBytes)}
              </p>
            ) : (
              <p className="text-xs text-gray-400">{allowedTypesText}, up to {maxSizeMb}MB</p>
            )}
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {existingDoc && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700">
              <CheckCircle2 className="w-4 h-4" /> Uploaded
            </span>
          )}
          {!existingDoc && !isUploading && error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600">
              <XCircle className="w-4 h-4" /> Upload failed
            </span>
          )}
          {existingDoc && onDownload && (
            <button type="button" onClick={onDownload} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Download">
              <Download className="w-4 h-4" />
            </button>
          )}
          {existingDoc && onDelete && !disabled && (
            <button type="button" onClick={handleDelete} disabled={isDeleting} className="p-1.5 rounded-md hover:bg-red-50 text-red-500" title="Delete">
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isUploading ? 'Uploading...' : existingDoc ? 'Replace' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
