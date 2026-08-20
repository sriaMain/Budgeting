import React, { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
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
  maxSizeMb?: number;
  existingDoc?: ExistingDoc;
  onUpload: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDownload?: () => void;
  disabled?: boolean;
}

export const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({
  label, required, accept = '.pdf,.jpg,.jpeg,.png', maxSizeMb = 10,
  existingDoc, onUpload, onDelete, onDownload, disabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(undefined);

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File exceeds ${maxSizeMb}MB limit`);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError('Upload failed. Please try again.');
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
              <p className="text-xs text-gray-400">PDF, JPG, JPEG or PNG, up to {maxSizeMb}MB</p>
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
                {existingDoc ? 'Replace' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
