import React from 'react';
import { History } from 'lucide-react';
import type { VendorSubmissionVersion } from '../types/vendorOnboarding.types';

const GROUP_LABELS: Record<string, string> = {
  profile: 'Vendor Details',
  kyc: 'KYV / Compliance',
  bank_detail: 'Bank Details',
  procurement_detail: 'Business / Procurement',
};

const FIELD_LABELS: Record<string, string> = {
  account_number_masked: 'Account Number',
};

function labelForField(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface FieldChange {
  group: string;
  field: string;
  previous: string;
  next: string;
}

interface DocumentChange {
  category: string;
  previous: string | null;
  next: string | null;
}

type Snapshot = Record<string, unknown>;
interface SnapshotDocument {
  category: string;
  file_name: string;
}

function diffSnapshots(
  previous: Snapshot | undefined,
  next: Snapshot
): { fieldChanges: FieldChange[]; documentChanges: DocumentChange[] } {
  const fieldChanges: FieldChange[] = [];

  for (const group of Object.keys(GROUP_LABELS)) {
    const prevGroup = (previous?.[group] as Snapshot) || {};
    const nextGroup = (next?.[group] as Snapshot) || {};
    const keys = new Set([...Object.keys(prevGroup), ...Object.keys(nextGroup)]);
    keys.forEach((key) => {
      const prevVal = prevGroup[key] ?? '';
      const nextVal = nextGroup[key] ?? '';
      if (String(prevVal) !== String(nextVal)) {
        fieldChanges.push({ group, field: key, previous: String(prevVal) || '—', next: String(nextVal) || '—' });
      }
    });
  }

  const prevDocsList = (previous?.documents as SnapshotDocument[] | undefined) || [];
  const nextDocsList = (next?.documents as SnapshotDocument[] | undefined) || [];
  const prevDocs = new Map<string, string>(prevDocsList.map((d) => [d.category, d.file_name]));
  const nextDocs = new Map<string, string>(nextDocsList.map((d) => [d.category, d.file_name]));
  const documentChanges: DocumentChange[] = [];
  const allCategories = new Set([...prevDocs.keys(), ...nextDocs.keys()]);
  allCategories.forEach((category) => {
    const prevName = prevDocs.get(category) || null;
    const nextName = nextDocs.get(category) || null;
    if (prevName !== nextName) {
      documentChanges.push({ category, previous: prevName, next: nextName });
    }
  });

  return { fieldChanges, documentChanges };
}

interface VersionDiffPanelProps {
  versions: VendorSubmissionVersion[];
}

export const VersionDiffPanel: React.FC<VersionDiffPanelProps> = ({ versions }) => {
  if (versions.length === 0) {
    return <p className="text-sm text-gray-500">No submissions yet.</p>;
  }

  const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);

  return (
    <div className="space-y-6">
      {sorted.map((version, idx) => {
        const previous = sorted[idx - 1]?.snapshot as Snapshot | undefined;
        const { fieldChanges, documentChanges } = diffSnapshots(previous, version.snapshot as Snapshot);
        const isFirst = idx === 0;

        return (
          <div key={version.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-4 h-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-900">
                Version {version.version_number} — {version.is_resubmission ? 'Vendor Resubmitted' : 'Vendor Submitted'}
              </p>
              <span className="text-xs text-gray-400">{new Date(version.created_at).toLocaleString()}</span>
            </div>

            {isFirst ? (
              <p className="text-sm text-gray-500 pl-6">Initial submission.</p>
            ) : fieldChanges.length === 0 && documentChanges.length === 0 ? (
              <p className="text-sm text-gray-500 pl-6">No changes detected from the previous submission.</p>
            ) : (
              <div className="pl-6 space-y-2">
                {fieldChanges.map((change) => (
                  <div key={`${change.group}-${change.field}`} className="text-sm">
                    <span className="text-gray-500">{GROUP_LABELS[change.group]} — {labelForField(change.field)}: </span>
                    <span className="text-red-600 line-through mr-2">{change.previous}</span>
                    <span className="text-green-700 font-medium">{change.next}</span>
                  </div>
                ))}
                {documentChanges.map((change) => (
                  <div key={change.category} className="text-sm">
                    <span className="text-gray-500">Document ({change.category.replace(/_/g, ' ')}): </span>
                    {change.previous && <span className="text-red-600 line-through mr-2">{change.previous}</span>}
                    {change.next && <span className="text-green-700 font-medium">{change.next}</span>}
                    {!change.next && <span className="text-red-600">Removed</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
