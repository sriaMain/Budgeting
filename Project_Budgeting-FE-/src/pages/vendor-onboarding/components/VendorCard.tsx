import React from 'react';
import { Archive, ArchiveRestore, Star } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import type { VendorOnboardingDetail } from '../../../types/vendorOnboarding.types';
import { formatAmount, fyLabel, vendorOnboarding, vendorStatusLabel } from './vendorDisplay';

const initials = (name: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

interface VendorCardProps {
  vendor: VendorOnboardingDetail;
  selected: boolean;
  /** Card click - selects the vendor (drives the onboarding panel). */
  onSelect: () => void;
  /** Edit button - opens the onboarding form. */
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}

export const VendorCard: React.FC<VendorCardProps> = ({ vendor, selected, onSelect, onEdit, onArchive, onUnarchive }) => {
  const f = vendor.financials;
  const consumption = f?.po_consumption_percent;
  const subtitle = vendor.service_categories?.length ? vendor.service_categories.join(', ') : vendor.vendor_type_display;
  const rating = vendor.onboarding_profile?.rating ?? null;
  const headcount = vendor.onboarding_profile?.headcount ?? null;
  // The onboarding form opens read-only when the user can't change anything.
  const canEdit = !!(vendor.permissions?.edit || vendor.permissions?.edit_master);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`bg-white rounded-lg border shadow-sm p-4 sm:p-5 flex flex-col gap-4 cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900 dark:focus-visible:ring-violet-500 ${
        selected ? 'border-blue-600 ring-1 ring-blue-600 dark:border-violet-500 dark:ring-violet-500' : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      {/* Identity */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 dark:bg-violet-600">
          {initials(vendor.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate dark:text-white" title={vendor.name}>{vendor.name || 'Untitled vendor'}</p>
          <p className="text-sm text-gray-500 truncate dark:text-gray-400" title={subtitle}>{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <StatusBadge status={vendor.status} label={vendorStatusLabel(vendor)} />
          <span
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300"
            title={rating ? `Rated ${rating} out of 5` : 'Not rated yet'}
          >
            <Star className={`w-3.5 h-3.5 ${rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
            {rating ? `${rating}/5` : 'Not rated'}
          </span>
        </div>
      </div>

      {/* Commercials - spend from vendor bills; headcount from the vendor profile */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">{fyLabel(f?.fy_start)} spend</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{formatAmount(f?.fy_spend)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {f?.po_count ?? 0} PO{f?.po_count === 1 ? '' : 's'} · {formatAmount(f?.po_total)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Headcount</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{headcount ?? '—'}</p>
        </div>
      </div>

      <div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
          <div className="h-full bg-blue-600 rounded-full dark:bg-violet-500" style={{ width: `${consumption ?? 0}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1.5 dark:text-gray-400">
          {consumption === null || consumption === undefined ? 'No committed PO yet' : `PO consumption · ${consumption}%`}
          <span className="float-right">Onboarding · {vendorOnboarding(vendor).completed_steps}/{vendorOnboarding(vendor).total_steps}</span>
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100 mt-auto dark:border-gray-800">
        <p className="text-xs text-gray-500 min-w-0 truncate dark:text-gray-400">
          {f?.latest_po_no
            ? `${f.latest_po_no}${f.latest_po_issue_date ? ` · ${new Date(f.latest_po_issue_date).toLocaleDateString()}` : ''}`
            : vendor.vendor_reference_no || '—'}
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {f && f.pending_bills > 0 ? (
            <StatusBadge status="pending_bills" variant="warning" label={`${f.pending_bills} invoice${f.pending_bills === 1 ? '' : 's'} pending`} />
          ) : f && Number(f.billed_total) > 0 ? (
            <StatusBadge status="settled" variant="success" label="All settled" />
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title={canEdit ? 'Edit vendor details' : 'View vendor details'}
          >
            {canEdit ? 'Edit' : 'View'}
          </button>
          <button
            type="button"
            onClick={vendor.is_archived ? onUnarchive : onArchive}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title={vendor.is_archived ? 'Restore to main list' : 'Archive (hide from the main list)'}
            aria-label={vendor.is_archived ? 'Restore vendor' : 'Archive vendor'}
          >
            {vendor.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
