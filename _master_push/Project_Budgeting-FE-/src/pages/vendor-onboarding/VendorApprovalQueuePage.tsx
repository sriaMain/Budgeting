import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AppShell } from '../../components/AppShell';
import { StatusBadge } from '../../components/StatusBadge';
import { DataTable, type Column } from '../../components/ReusableTable';
import { ApprovalDrawer } from '../../components/ApprovalDrawer';
import { RequestInfoModal } from '../../components/RequestInfoModal';
import * as api from '../../services/vendorOnboarding';
import type {
  VendorOnboardingDetail,
  VendorOnboardingChoices,
  VendorApprovalHistoryEvent,
  RequestChangesPayload,
} from '../../types/vendorOnboarding.types';

// Vendor onboarding has no due-date/SLA field yet (see enterprise-artifacts/UI_BUILD_HANDOFF.md
// Phase 4 backend gaps) — this is a "time since submission" stand-in, not a real SLA countdown.
function timeSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const VendorApprovalQueuePage: React.FC = () => {
  const [vendors, setVendors] = useState<VendorOnboardingDetail[]>([]);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeVendor, setActiveVendor] = useState<VendorOnboardingDetail | null>(null);
  const [activeHistory, setActiveHistory] = useState<VendorApprovalHistoryEvent[]>([]);
  const [requestTarget, setRequestTarget] = useState<VendorOnboardingDetail | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listApprovalQueue();
      setVendors(data);
    } catch (err) {
      console.error(err);
      setError('Could not load the approval queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getChoices().then(setChoices).catch(() => {});
  }, []);

  const openDrawer = async (vendor: VendorOnboardingDetail) => {
    setActiveVendor(vendor);
    setActiveHistory([]);
    try {
      setActiveHistory(await api.getApprovalHistory(vendor.id));
    } catch {
      // History is best-effort inside the drawer; approve still works without it.
    }
  };

  const handleApprove = async (comments: string) => {
    if (!activeVendor) return;
    await api.approveVendor(activeVendor.id, comments);
    toast.success('Vendor approved');
    setVendors((prev) => prev.filter((v) => v.id !== activeVendor.id));
  };

  const handleRequestChanges = async (payload: RequestChangesPayload) => {
    if (!requestTarget) return;
    await api.requestVendorChanges(requestTarget.id, payload);
    toast.success('Request sent to the vendor');
    setRequestTarget(null);
    await load();
  };

  const columns: Column<VendorOnboardingDetail>[] = [
    {
      header: 'Request',
      accessor: (v) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{v.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{v.vendor_reference_no ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Type', accessor: 'vendor_type_display' },
    { header: 'Owner', accessor: (v) => v.internal_requester || '—' },
    { header: 'Submitted', accessor: (v) => timeSince(v.submitted_at) },
    {
      header: 'Status',
      accessor: (v) => <StatusBadge status={v.status} label={v.status_display} variant="warning" />,
    },
    {
      header: '',
      accessor: (v) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setRequestTarget(v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-600 text-amber-700 hover:bg-amber-50 transition-colors dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            Request changes
          </button>
          <button
            type="button"
            onClick={() => openDrawer(v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-900 text-white hover:bg-navy-800 transition-colors"
          >
            Open
          </button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <AppShell breadcrumb="Administration" title="Approval workbench">
      <div className="space-y-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">Vendor onboarding requests currently awaiting your approval.</p>

        <DataTable
          data={vendors}
          columns={columns}
          keyField="id"
          isLoading={loading}
          error={error}
          onRetry={load}
          emptyMessage="There are no vendor requests awaiting your approval right now."
          onRowClick={(v) => openDrawer(v)}
        />
      </div>

      {activeVendor && (
        <ApprovalDrawer
          isOpen={Boolean(activeVendor)}
          onClose={() => setActiveVendor(null)}
          title={activeVendor.name}
          summary={`${activeVendor.vendor_type_display}${activeVendor.vendor_reference_no ? ` · ${activeVendor.vendor_reference_no}` : ''}`}
          impact="Vendor onboarding request awaiting your decision. Open the vendor record for full KYC, bank and procurement details."
          historyEvents={activeHistory}
          onApprove={handleApprove}
          rejectDisabledReason="Rejection isn't supported by vendor onboarding yet — request changes, or approve."
        />
      )}

      <RequestInfoModal
        isOpen={Boolean(requestTarget)}
        onClose={() => setRequestTarget(null)}
        onSubmit={handleRequestChanges}
        sectionOptions={choices?.change_request_sections || []}
      />
    </AppShell>
  );
};

export default VendorApprovalQueuePage;
