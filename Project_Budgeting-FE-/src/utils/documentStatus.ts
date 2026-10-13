/** Document lifecycle helpers shared by every KYC document list (mirrors core/document_security.py). */

export interface DocumentLike {
  category: string;
  status?: string;
  uploaded_at: string;
  expiry_date?: string | null;
}

export interface DocumentSlotLike {
  key: string;
  label: string;
  required: boolean;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A non-rejected document past its expiry date reads as expired. */
export const effectiveDocStatus = (status: string, expiryDate?: string | null) =>
  status !== 'rejected' && expiryDate && expiryDate < todayIso() ? 'expired' : status;

/** Newest document per category. */
export function latestByCategory<T extends DocumentLike>(documents: T[]): Map<string, T> {
  const map = new Map<string, T>();
  documents.forEach((d) => {
    const prev = map.get(d.category);
    if (!prev || (d.uploaded_at || '') > (prev.uploaded_at || '')) map.set(d.category, d);
  });
  return map;
}

/** Counts for the "x of y required documents" summary and the submit checklist. */
export function summarizeDocuments(slots: DocumentSlotLike[], documents: DocumentLike[]) {
  const byCategory = latestByCategory(documents);
  const required = slots.filter((s) => s.required);
  const status = (key: string) => {
    const d = byCategory.get(key);
    return d ? effectiveDocStatus(d.status ?? 'uploaded', d.expiry_date) : 'missing';
  };
  return {
    requiredTotal: required.length,
    requiredPresent: required.filter((s) => !['missing', 'rejected', 'expired'].includes(status(s.key))).length,
    verified: slots.filter((s) => status(s.key) === 'verified').length,
    rejected: slots.filter((s) => status(s.key) === 'rejected').length,
    expired: slots.filter((s) => status(s.key) === 'expired').length,
    missingRequired: required.filter((s) => status(s.key) === 'missing').map((s) => s.label),
    problemRequired: required.filter((s) => ['rejected', 'expired'].includes(status(s.key))).map((s) => s.label),
    unverifiedRequired: required.filter((s) => status(s.key) !== 'verified').map((s) => s.label),
  };
}
