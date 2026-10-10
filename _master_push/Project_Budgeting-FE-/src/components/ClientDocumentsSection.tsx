import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, FileText, Eye, Download, Trash2, Loader2, ShieldCheck, ShieldX, X, Check, AlertCircle, AlertTriangle, RotateCw, ExternalLink,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { formatFileSize } from '../utils/fileHelpers';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  type ClientDocument,
  type ClientDocumentCategory,
  type Jurisdiction,
} from '../pages/ClientListPage';

/**
 * ==================================================================
 * SECTION: Constants
 * ==================================================================
 */

/** Backend cap - ClientDocumentListCreateView rejects the 9th upload. */
export const MAX_CLIENT_DOCUMENTS = 8;
/** Same per-file limit the backend enforces (and the app's other KYC uploads use). */
export const MAX_CLIENT_DOCUMENT_SIZE_MB = 10;
const ACCEPT = '.pdf,.jpg,.jpeg,.png';
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

/** Jurisdiction-specific document types, each mapped onto an existing ClientDocument category
 * so the backend's KYC rules (Company._has_doc) keep recognising them. */
const DOCUMENT_TYPES: Record<Jurisdiction, { value: ClientDocumentCategory; label: string }[]> = {
  Indian: [
    { value: 'registration_certificate', label: 'Certificate of Incorporation' },
    { value: 'gst_certificate', label: 'GST Certificate' },
    { value: 'pan_document', label: 'PAN' },
    { value: 'cin_llpin', label: 'CIN / LLPIN' },
    { value: 'authorised_signatory_id', label: 'Authorised Signatory Proof' },
    { value: 'bank_proof', label: 'Bank Letter' },
    { value: 'tax_residency_certificate', label: 'Tax Residency Document' },
    { value: 'other', label: 'Other' },
  ],
  Overseas: [
    { value: 'registration_certificate', label: 'Certificate of Incorporation / Equivalent' },
    { value: 'tax_certificate', label: 'VAT / EIN / Tax ID' },
    { value: 'w8ben_e', label: 'W-8BEN-E / Applicable Tax Document' },
    { value: 'beneficial_ownership_proof', label: 'Beneficial Ownership Document' },
    { value: 'sanctions_screening', label: 'Sanctions Document' },
    { value: 'bank_proof', label: 'Bank Letter' },
    { value: 'tax_residency_certificate', label: 'Tax Residency Document' },
    { value: 'other', label: 'Other' },
  ],
};

export const clientDocumentTypeLabel = (category: string, jurisdiction: Jurisdiction): string =>
  DOCUMENT_TYPES[jurisdiction].find((t) => t.value === category)?.label ??
  DOCUMENT_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ??
  category;

/** Best-effort type pre-selection from the file name - the user can always change it. */
const guessCategory = (fileName: string, jurisdiction: Jurisdiction): ClientDocumentCategory | '' => {
  const n = fileName.toLowerCase();
  const rules: [RegExp, ClientDocumentCategory][] = [
    [/residen|\btrc\b/, 'tax_residency_certificate'],
    [/gst/, 'gst_certificate'],
    [/\bpan\b|pan[_\s-]?card/, 'pan_document'],
    [/cin|llpin/, 'cin_llpin'],
    [/incorporat|\bcoi\b|registration/, 'registration_certificate'],
    [/bank|cheque|iban|swift/, 'bank_proof'],
    [/w-?8/, 'w8ben_e'],
    [/sanction/, 'sanctions_screening'],
    [/beneficial|\bubo\b/, 'beneficial_ownership_proof'],
    [/signator|authori[sz]/, 'authorised_signatory_id'],
    [/vat|\bein\b|tax[_\s-]?id/, 'tax_certificate'],
  ];
  const allowed = new Set(DOCUMENT_TYPES[jurisdiction].map((t) => t.value));
  const hit = rules.find(([re, cat]) => re.test(n) && allowed.has(cat));
  return hit ? hit[1] : '';
};

const fileExtension = (name: string) => (name.includes('.') ? name.split('.').pop() || '' : '').toLowerCase();
const isImage = (name: string, mime?: string) => /^image\//.test(mime || '') || ['jpg', 'jpeg', 'png'].includes(fileExtension(name));
const isPdf = (name: string, mime?: string) => mime === 'application/pdf' || fileExtension(name) === 'pdf';
const fileKindLabel = (name: string, mime?: string) =>
  fileExtension(name).toUpperCase() || mime?.split('/').pop()?.toUpperCase() || 'FILE';

const DOC_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  uploaded: { label: 'Uploaded · Pending Verification', variant: 'neutral' },
  under_review: { label: 'Under Review', variant: 'warning' },
  verified: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  expired: { label: 'Expired', variant: 'neutral' },
};

/** Renders dialogs on document.body - this section lives inside the KYC drawer's <form>,
 * and a dialog button nested in it would otherwise submit the client form. */
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => createPortal(children, document.body);

/**
 * ==================================================================
 * SECTION: Types
 * ==================================================================
 */

/** A file picked in the browser but not yet uploaded (e.g. while the client doesn't exist yet). */
export interface StagedClientDocument {
  key: string;
  file: File;
  category: ClientDocumentCategory | '';
  /** Object URL for image thumbnails; revoked by the owner when the entry is removed. */
  previewUrl?: string;
  state: 'ready' | 'uploading' | 'error';
  /** 0-100 while uploading. */
  progress?: number;
  error?: string;
}

/** A resolved preview source - `isBlob` URLs are same-origin and must be revoked after use. */
export interface DocumentPreviewSource {
  url: string;
  isBlob: boolean;
}

/** Evidence that satisfies a KYC requirement: either a document category on file or a form value. */
interface ChecklistItem {
  label: string;
  categories: ClientDocumentCategory[];
  satisfiedByField?: boolean;
}

interface ClientDocumentsSectionProps {
  jurisdiction: Jurisdiction;
  documents: ClientDocument[];
  staged: StagedClientDocument[];
  onStagedChange: React.Dispatch<React.SetStateAction<StagedClientDocument[]>>;
  /** False while the client hasn't been created yet: staged files upload on "Create Client". */
  canUploadNow: boolean;
  onUploadStaged: () => Promise<void>;
  onRetryStaged: (key: string) => Promise<void>;
  isUploading: boolean;
  isLoading?: boolean;
  /** Set when the document list couldn't be loaded - uploads are blocked until it is, since the
   * 8-document limit can't be checked against an unknown list. */
  loadError?: string;
  onReloadDocuments?: () => void;
  /** Ids uploaded in the last few seconds, for the "Uploaded successfully" confirmation. */
  recentlyUploadedIds: Set<number>;
  onLoadPreview: (doc: ClientDocument) => Promise<DocumentPreviewSource | undefined>;
  onOpenDocument: (doc: ClientDocument) => void;
  onDownload: (doc: ClientDocument) => void;
  onDelete: (doc: ClientDocument) => Promise<void>;
  /** Resolves a short-lived URL for image thumbnails of already-uploaded documents. */
  resolveThumbnailUrl?: (doc: ClientDocument) => Promise<string | undefined>;
  canVerify: boolean;
  onVerify: (doc: ClientDocument, status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
  /** Form values that satisfy a requirement without a document (mirrors Company._identity_kyc_required_ok). */
  fieldEvidence: { registration_no: boolean; gstin: boolean; pan: boolean; tax_id: boolean };
  error?: string;
}

/**
 * ==================================================================
 * SECTION: Component
 * ==================================================================
 */

export const ClientDocumentsSection: React.FC<ClientDocumentsSectionProps> = ({
  jurisdiction,
  documents,
  staged,
  onStagedChange,
  canUploadNow,
  onUploadStaged,
  onRetryStaged,
  isUploading,
  isLoading,
  loadError,
  onReloadDocuments,
  recentlyUploadedIds,
  onLoadPreview,
  onOpenDocument,
  onDownload,
  onDelete,
  resolveThumbnailUrl,
  canVerify,
  onVerify,
  fieldEvidence,
  error,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickErrors, setPickErrors] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);
  const [previewSource, setPreviewSource] = useState<DocumentPreviewSource | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [deleteTarget, setDeleteTarget] = useState<ClientDocument | null>(null);

  const total = documents.length + staged.length;
  const remaining = MAX_CLIENT_DOCUMENTS - total;
  const atLimit = remaining <= 0;
  const listUnavailable = Boolean(loadError) || Boolean(isLoading);
  const types = DOCUMENT_TYPES[jurisdiction];

  // Thumbnails for already-uploaded images (at most 8, fetched once per document).
  useEffect(() => {
    if (!resolveThumbnailUrl) return;
    documents
      .filter((d) => isImage(d.file_name, d.file_type) && !(d.id in thumbs))
      .forEach((d) => {
        resolveThumbnailUrl(d)
          .then((url) => url && setThumbs((prev) => ({ ...prev, [d.id]: url })))
          .catch(() => {});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (picked.length === 0) return;

    if (picked.length > remaining) {
      setPickErrors([
        `Maximum ${MAX_CLIENT_DOCUMENTS} KYC documents are allowed. You can add ${remaining} more, but selected ${picked.length}.`,
      ]);
      return;
    }

    const problems: string[] = [];
    const seen = new Set([
      ...documents.map((d) => `${d.file_name}|${d.file_size}`),
      ...staged.map((s) => `${s.file.name}|${s.file.size}`),
    ]);
    const accepted: StagedClientDocument[] = [];
    picked.forEach((file) => {
      if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
        problems.push(`${file.name}: Only PDF, JPG, JPEG and PNG files are allowed.`);
      } else if (file.size === 0) {
        problems.push(`${file.name}: The file is empty.`);
      } else if (file.size > MAX_CLIENT_DOCUMENT_SIZE_MB * 1024 * 1024) {
        problems.push(`${file.name}: File is too large (maximum ${MAX_CLIENT_DOCUMENT_SIZE_MB} MB).`);
      } else if (seen.has(`${file.name}|${file.size}`)) {
        problems.push(`${file.name}: This document has already been added.`);
      } else {
        seen.add(`${file.name}|${file.size}`);
        accepted.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          category: guessCategory(file.name, jurisdiction),
          previewUrl: isImage(file.name, file.type) ? URL.createObjectURL(file) : undefined,
          state: 'ready',
        });
      }
    });

    if (accepted.length) onStagedChange((prev) => [...prev, ...accepted]);
    setPickErrors(problems);
  };

  const removeStaged = (key: string) =>
    onStagedChange((prev) => {
      const target = prev.find((s) => s.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.key !== key);
    });

  const setStagedCategory = (key: string, category: ClientDocumentCategory | '') =>
    onStagedChange((prev) => prev.map((s) => (s.key === key ? { ...s, category, error: undefined, state: s.state === 'error' ? 'ready' : s.state } : s)));

  const openPreview = async (doc: ClientDocument) => {
    setPreviewDoc(doc);
    setPreviewSource(null);
    setPreviewState('loading');
    try {
      const source = await onLoadPreview(doc);
      if (!source) throw new Error('No preview URL');
      setPreviewSource(source);
      setPreviewState('idle');
    } catch (err) {
      console.error('Document preview failed', err);
      setPreviewState('error');
    }
  };

  const closePreview = () => {
    if (previewSource?.isBlob) URL.revokeObjectURL(previewSource.url);
    setPreviewDoc(null);
    setPreviewSource(null);
    setPreviewState('idle');
  };

  // Per-step document checklist - "on file" means a non-rejected document exists, exactly as the
  // backend's _has_doc() counts it. This is not verification; step status still comes from the server.
  const checklist: { step: string; items: ChecklistItem[] }[] =
    jurisdiction === 'Indian'
      ? [
          {
            step: 'Identity KYC',
            items: [
              { label: 'Incorporation / CIN', categories: ['registration_certificate', 'cin_llpin'], satisfiedByField: fieldEvidence.registration_no },
              { label: 'GST Certificate', categories: ['gst_certificate', 'tax_certificate'], satisfiedByField: fieldEvidence.gstin },
              { label: 'PAN', categories: ['pan_document'], satisfiedByField: fieldEvidence.pan },
            ],
          },
          { step: 'Compliance', items: [{ label: 'Tax Residency', categories: ['tax_residency_certificate'] }] },
          { step: 'Banking', items: [{ label: 'Bank Letter', categories: ['bank_proof'] }] },
        ]
      : [
          {
            step: 'Identity KYC',
            items: [
              { label: 'Incorporation', categories: ['registration_certificate'], satisfiedByField: fieldEvidence.registration_no },
              { label: 'VAT / EIN / Tax ID', categories: ['tax_certificate', 'w8ben_e'], satisfiedByField: fieldEvidence.tax_id },
            ],
          },
          {
            step: 'Compliance',
            items: [
              { label: 'Sanctions Document', categories: ['sanctions_screening'] },
              { label: 'Beneficial Ownership', categories: ['beneficial_ownership_proof'] },
              { label: 'Tax Residency', categories: ['tax_residency_certificate'] },
            ],
          },
          { step: 'Banking', items: [{ label: 'Bank Letter', categories: ['bank_proof'] }] },
        ];

  const onFile = (cats: ClientDocumentCategory[]) =>
    documents.some((d) => cats.includes(d.category) && d.status !== 'rejected');

  const needsType = staged.some((s) => !s.category);
  const failedCount = staged.filter((s) => s.state === 'error').length;

  return (
    <div className="space-y-4">
      {/* Header: help text, counter, upload action */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600 dark:text-gray-300">Upload the documents required for client verification.</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">KYC documents can be uploaded directly from your computer.</p>
          <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
            Supported formats: PDF, JPG, JPEG, PNG &middot; Maximum {MAX_CLIENT_DOCUMENTS} documents &middot; up to {MAX_CLIENT_DOCUMENT_SIZE_MB} MB each
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300" aria-label={`${documents.length} of ${MAX_CLIENT_DOCUMENTS} documents uploaded`}>
              {documents.length} / {MAX_CLIENT_DOCUMENTS}
            </p>
            <div className="mt-1 h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
              <div className="h-full bg-blue-600 rounded-full dark:bg-violet-500" style={{ width: `${(Math.min(total, MAX_CLIENT_DOCUMENTS) / MAX_CLIENT_DOCUMENTS) * 100}%` }} />
            </div>
          </div>
          {!atLimit && (
            <>
              <input ref={fileInputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleFiles} />
              <button
                type="button"
                onClick={() => { setPickErrors([]); fileInputRef.current?.click(); }}
                disabled={isUploading || listUnavailable}
                title={listUnavailable ? 'Documents must load before new ones can be added' : undefined}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Upload className="w-4 h-4" /> Upload KYC Documents
              </button>
            </>
          )}
        </div>
      </div>

      {atLimit && !listUnavailable && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Maximum {MAX_CLIENT_DOCUMENTS} documents uploaded. Delete a document to upload another.
        </p>
      )}
      {loadError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {loadError}</span>
          {onReloadDocuments && (
            <button type="button" onClick={onReloadDocuments} className="flex items-center gap-1 text-xs font-semibold hover:underline">
              <RotateCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      )}
      {(pickErrors.length > 0 || error) && (
        <ul className="space-y-0.5">
          {[...(error ? [error] : []), ...pickErrors].map((msg) => (
            <li key={msg} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {msg}
            </li>
          ))}
        </ul>
      )}

      {/* Selected (not yet uploaded) files */}
      {staged.length > 0 && (
        <div className="space-y-2">
          {staged.map((s) => (
            <div
              key={s.key}
              className={`border rounded-lg p-3 ${
                s.state === 'error'
                  ? 'border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-500/10'
                  : 'border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <DocThumb src={s.previewUrl} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate dark:text-white" title={s.file.name}>{s.file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fileKindLabel(s.file.name, s.file.type)} &middot; {formatFileSize(s.file.size)} &middot;{' '}
                      {s.state === 'uploading'
                        ? `Uploading… ${s.progress ?? 0}%`
                        : s.state === 'error'
                          ? 'Upload failed'
                          : canUploadNow
                            ? 'Ready to upload'
                            : 'Uploads when the client is created'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={s.category}
                    onChange={(e) => setStagedCategory(s.key, e.target.value as ClientDocumentCategory | '')}
                    disabled={s.state === 'uploading'}
                    aria-label={`Document type for ${s.file.name}`}
                    className={`text-sm px-2.5 py-1.5 rounded-md border bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-violet-500 ${
                      s.category ? 'border-gray-300 dark:border-gray-700' : 'border-amber-400 dark:border-amber-500/60'
                    }`}
                  >
                    <option value="">Select document type…</option>
                    {types.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {s.state === 'error' && canUploadNow && (
                    <button
                      type="button"
                      onClick={() => onRetryStaged(s.key)}
                      disabled={isUploading || !s.category}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeStaged(s.key)}
                    disabled={s.state === 'uploading'}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
                    title="Remove"
                  >
                    {s.state === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {s.state === 'uploading' && (
                <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700" role="progressbar" aria-valuenow={s.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-blue-600 rounded-full transition-all dark:bg-violet-500" style={{ width: `${s.progress ?? 0}%` }} />
                </div>
              )}
              {s.error && (
                <p className="flex items-start gap-1.5 text-xs text-red-600 mt-2 dark:text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {s.error}
                </p>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {needsType
                ? 'Select a document type for each file.'
                : failedCount > 0
                  ? 'Fix the issue shown on each failed file, then retry.'
                  : canUploadNow
                    ? 'Files also upload when you save the client.'
                    : 'These files upload automatically when you click Create Client.'}
            </p>
            {canUploadNow && (
              <button
                type="button"
                onClick={onUploadStaged}
                disabled={isUploading || needsType || listUnavailable}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isUploading ? 'Uploading…' : `Upload ${staged.length} document${staged.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Uploaded documents */}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading documents…</p>
      ) : documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <UploadedDocumentCard
              key={doc.id}
              doc={doc}
              typeLabel={clientDocumentTypeLabel(doc.category, jurisdiction)}
              thumbUrl={thumbs[doc.id]}
              justUploaded={recentlyUploadedIds.has(doc.id)}
              onPreview={() => openPreview(doc)}
              onDownload={() => onDownload(doc)}
              onRequestDelete={() => setDeleteTarget(doc)}
              canVerify={canVerify}
              onVerify={(status, remarks) => onVerify(doc, status, remarks)}
            />
          ))}
        </div>
      ) : (
        staged.length === 0 && !loadError && (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center dark:border-gray-700">
            <FileText className="w-6 h-6 mx-auto text-gray-400 dark:text-gray-500" />
            <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">No documents uploaded yet.</p>
          </div>
        )
      )}

      {/* How documents feed the onboarding steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {checklist.map((group) => (
          <div key={group.step}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 dark:text-gray-400">{group.step}</p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const docOnFile = onFile(item.categories);
                const ok = docOnFile || item.satisfiedByField;
                return (
                  <li key={item.label} className="flex items-center gap-1.5 text-xs">
                    {ok ? (
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                    )}
                    <span className={ok ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}>{item.label}</span>
                    {!docOnFile && item.satisfiedByField && <span className="text-gray-400 dark:text-gray-500">(entered above)</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Preview */}
      {previewDoc && (
        <Portal>
          <Modal
            isOpen
            onClose={closePreview}
            title={previewDoc.file_name}
            size="xl"
            footer={
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => onOpenDocument(previewDoc)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  <ExternalLink className="w-4 h-4" /> Open Document
                </button>
                <button type="button" onClick={() => onDownload(previewDoc)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>
            }
          >
            {previewState === 'loading' && (
              <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading preview…</p>
            )}
            {previewState === 'error' && (
              <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This document can't be previewed here. Use Open Document or Download instead.</p>
            )}
            {previewState === 'idle' && previewSource && (
              isImage(previewDoc.file_name, previewDoc.file_type) ? (
                <img src={previewSource.url} alt={previewDoc.file_name} className="max-h-[70vh] mx-auto rounded-lg" />
              ) : isPdf(previewDoc.file_name, previewDoc.file_type) && previewSource.isBlob ? (
                <iframe src={previewSource.url} title={previewDoc.file_name} className="w-full h-[70vh] rounded-lg border border-gray-200 dark:border-gray-800" />
              ) : (
                <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Preview isn't available for this file in the browser. Use Open Document or Download instead.</p>
              )
            )}
          </Modal>
        </Portal>
      )}

      {/* Delete confirmation */}
      <Portal>
        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!deleteTarget) return;
            try {
              await onDelete(deleteTarget);
            } finally {
              setDeleteTarget(null);
            }
          }}
          title="Delete document"
          message={
            <>
              Are you sure you want to delete this document?
              <span className="block mt-1 font-medium text-gray-900 dark:text-white">{deleteTarget?.file_name}</span>
            </>
          }
          confirmLabel="Delete"
          danger
        />
      </Portal>
    </div>
  );
};

/**
 * ==================================================================
 * SECTION: Sub-components
 * ==================================================================
 */

const DocThumb: React.FC<{ src?: string }> = ({ src }) =>
  src ? (
    <img src={src} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700" />
  ) : (
    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 dark:bg-blue-500/15">
      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-300" />
    </div>
  );

interface UploadedDocumentCardProps {
  doc: ClientDocument;
  typeLabel: string;
  thumbUrl?: string;
  justUploaded: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onRequestDelete: () => void;
  canVerify: boolean;
  onVerify: (status: 'verified' | 'rejected', remarks?: string) => Promise<void>;
}

const UploadedDocumentCard: React.FC<UploadedDocumentCardProps> = ({
  doc, typeLabel, thumbUrl, justUploaded, onPreview, onDownload, onRequestDelete, canVerify, onVerify,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const status = DOC_STATUS[doc.status] ?? { label: doc.status, variant: 'neutral' as const };

  const handleVerify = async (next: 'verified' | 'rejected') => {
    if (next === 'rejected' && !reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setIsVerifying(true);
    setError(undefined);
    try {
      await onVerify(next, next === 'rejected' ? reason.trim() : undefined);
      setIsRejecting(false);
      setReason('');
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || `Unable to ${next === 'verified' ? 'verify' : 'reject'} this document. Please try again.`);
    } finally {
      setIsVerifying(false);
    }
  };

  const iconBtn = 'p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50';

  return (
    <div className={`border rounded-lg p-3 bg-white dark:bg-gray-900 ${justUploaded ? 'border-green-300 dark:border-green-500/40' : 'border-gray-200 dark:border-gray-800'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <DocThumb src={thumbUrl} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate dark:text-white" title={doc.file_name}>{doc.file_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {typeLabel} &middot; {fileKindLabel(doc.file_name, doc.file_type)} &middot; {formatFileSize(doc.file_size)}
            </p>
            {justUploaded && (
              <p className="flex items-center gap-1 text-xs font-medium text-green-700 mt-0.5 dark:text-green-400">
                <Check className="w-3.5 h-3.5" /> Uploaded successfully
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={doc.status} variant={status.variant} label={status.label} />
          {canVerify && doc.status !== 'verified' && (
            <button type="button" onClick={() => handleVerify('verified')} disabled={isVerifying} className="p-1.5 rounded-md text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-500/10" title="Verify">
              {isVerifying && !isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            </button>
          )}
          {canVerify && doc.status !== 'rejected' && (
            <button type="button" onClick={() => { setIsRejecting((v) => !v); setError(undefined); }} disabled={isVerifying} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10" title="Reject">
              <ShieldX className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onPreview} className={iconBtn} title="Preview"><Eye className="w-4 h-4" /></button>
          <button type="button" onClick={onDownload} className={iconBtn} title="Download"><Download className="w-4 h-4" /></button>
          <button type="button" onClick={onRequestDelete} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {doc.verified_at && (
        <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
          {doc.status === 'rejected' ? 'Rejected' : 'Verified'} by {doc.verified_by ?? 'reviewer'} on {new Date(doc.verified_at).toLocaleString()}
          {doc.remarks && <span className="block italic text-gray-400 dark:text-gray-500">Reason: “{doc.remarks}”</span>}
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2 dark:text-red-400">{error}</p>}

      {isRejecting && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-600 mb-1.5 dark:text-gray-400">
            Rejection reason <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(undefined); }}
              rows={2}
              placeholder="e.g. Bank letter is outdated. Please upload the latest document."
              className="flex-1 px-3 py-2 text-sm bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-800 dark:focus:ring-violet-500"
            />
            <div className="flex sm:flex-col gap-1.5">
              <button type="button" onClick={() => handleVerify('rejected')} disabled={isVerifying || !reason.trim()} className="px-3 py-1.5 text-xs font-medium rounded-md bg-risk-600 text-white hover:bg-risk-700 disabled:opacity-50">
                {isVerifying ? 'Rejecting…' : 'Confirm Reject'}
              </button>
              <button type="button" onClick={() => { setIsRejecting(false); setReason(''); setError(undefined); }} disabled={isVerifying} className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
