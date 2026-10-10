import React, { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, Filter, X, Users, AlertCircle, CheckCircle2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatCard } from '../../components/StatCard';
import { Tabs, type TabItem } from '../../components/Tabs';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/vendorOnboarding';
import type { VendorOnboardingDetail, VendorOnboardingChoices, VendorListFilters, VendorRequestSummary } from '../../types/vendorOnboarding.types';
import { ACTION_REQUIRED_STATUS_GROUP } from '../../types/vendorOnboarding.types';
import { VendorOnboardDrawer } from './VendorOnboardDrawer';
import { VendorOnboardingPanel } from './components/VendorOnboardingPanel';
import { VendorCard } from './components/VendorCard';
import type { VendorOnboardingStepKey } from '../../types/vendorOnboarding.types';

// Sentinel tab/card key for "Archived" - it's a visibility flag, not a
// status, so it can't just be another value in the status filter the way the
// other tabs are. Handled specially in handleTabOrCardClick below.
const ARCHIVED_TAB_KEY = '__archived__';

// Only the statuses an admin needs to see at a glance. Invited/Draft/
// Submitted/Resubmitted/Approval in Progress still exist and drive the
// workflow - they're just no longer surfaced as their own top-level tabs or
// dashboard cards (available via the advanced Status filter below instead).
const STATUS_TABS: TabItem[] = [
  { key: '', label: 'All' },
  { key: ACTION_REQUIRED_STATUS_GROUP, label: 'Action Required' },
  { key: 'approved', label: 'Approved' },
  { key: ARCHIVED_TAB_KEY, label: 'Archived' },
];

const ADVANCED_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: ACTION_REQUIRED_STATUS_GROUP, label: 'Action Required' },
  { value: 'resubmitted', label: 'Resubmitted' },
  { value: 'approval_in_progress', label: 'Approval in Progress' },
  { value: 'approved', label: 'Approved' },
];

function summaryCardValues(summary: VendorRequestSummary | null) {
  if (!summary) return null;
  return {
    total: summary.total,
    actionRequired: summary.action_required + summary.submitted + summary.resubmitted,
    approved: summary.approved,
    archived: summary.archived,
  };
}

/**
 * The actual list/search/filter UI, with no Layout wrapper of its own - shared between
 * the standalone /vendors route (wrapped in Layout below) and the Contacts screen's
 * Vendors tab (which supplies its own Layout), the same way ClientListPage is embedded.
 */
export function VendorListContent() {

  const [vendors, setVendors] = useState<VendorOnboardingDetail[]>([]);
  const [summary, setSummary] = useState<VendorRequestSummary | null>(null);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Onboarding drawer: vendorId null = onboard a new vendor; section = step to scroll to.
  const [drawer, setDrawer] = useState<{ open: boolean; vendorId: number | null; section?: VendorOnboardingStepKey }>({ open: false, vendorId: null });
  const panelRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<VendorListFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<VendorListFilters>({});
  // Card last clicked - drives the onboarding panel.
  const [activeVendorId, setActiveVendorId] = useState<number | null>(null);

  useEffect(() => {
    api.getChoices().then(setChoices).catch(() => {});
  }, []);

  const fetchSummary = async () => {
    try {
      setSummary(await api.getSummary());
    } catch {
      /* dashboard cards are a nice-to-have; list still works without them */
    }
  };

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const data = await api.listVendors({ ...appliedFilters, search: searchTerm || undefined });
      setVendors(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load vendor requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchVendors(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleApplyFilters = () => setAppliedFilters(filters);
  const handleClearFilters = () => {
    setFilters({});
    setAppliedFilters({});
  };

  // Tabs and dashboard cards apply immediately (no "Apply Filters" click
  // needed) - and keep the advanced panel's own Status dropdown in sync so
  // reopening it reflects what's actually active. "Archived" is a visibility
  // flag rather than a status, so it's handled as a distinct branch that
  // clears the status filter (and vice versa) - the two views don't mix.
  const handleTabOrCardClick = (key: string) => {
    const next =
      key === ARCHIVED_TAB_KEY
        ? { ...filters, status: undefined, archived: 'true' }
        : { ...filters, status: key || undefined, archived: undefined };
    setFilters(next);
    setAppliedFilters(next);
  };

  const openStep = (vendor: VendorOnboardingDetail, step: VendorOnboardingStepKey) => {
    setActiveVendorId(vendor.id);
    setDrawer({ open: true, vendorId: vendor.id, section: step });
  };

  const activeVendor = vendors.find((v) => v.id === activeVendorId) || null;

  const handleArchive = async (vendor: VendorOnboardingDetail) => {
    try {
      await api.archiveVendor(vendor.id);
      toast.success('Vendor request archived');
      fetchVendors();
      fetchSummary();
    } catch {
      toast.error('Failed to archive vendor request');
    }
  };

  const handleUnarchive = async (vendor: VendorOnboardingDetail) => {
    try {
      await api.unarchiveVendor(vendor.id);
      toast.success('Vendor request restored');
      fetchVendors();
      fetchSummary();
    } catch {
      toast.error('Failed to restore vendor request');
    }
  };

  /** Card click (like the client list's row click) only selects the vendor - the onboarding panel
   * above then shows where it is stuck, and clicking a step there opens the form at that step. */
  const selectVendor = (vendor: VendorOnboardingDetail) => {
    setActiveVendorId(vendor.id);
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** Edit opens the onboarding form - editable while the backend accepts edits, otherwise
   * read-only with the reviewer's verification and approval actions. */
  const openVendor = (vendor: VendorOnboardingDetail) => {
    setActiveVendorId(vendor.id);
    setDrawer({ open: true, vendorId: vendor.id });
  };

  const upsertVendor = (saved: VendorOnboardingDetail) =>
    setVendors((prev) => (prev.some((v) => v.id === saved.id) ? prev.map((v) => (v.id === saved.id ? saved : v)) : [saved, ...prev]));

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vendors</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Subcontracting firms and pods</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setDrawer({ open: true, vendorId: null })}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
            title="Enter the vendor's details and/or email them a secure onboarding link"
          >
            <UserPlus size={18} className="sm:w-5 sm:h-5" />
            <span>Onboard Vendor</span>
          </button>
        </div>
      </div>

      {/* Summary dashboard cards - the 4 an admin needs at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {(() => {
          const values = summaryCardValues(summary);
          return (
            <>
              <StatCard
                label="Total Requests"
                value={values ? String(values.total) : '-'}
                icon={<Users className="w-4 h-4" />}
                loading={!values}
                onClick={() => handleTabOrCardClick('')}
              />
              <StatCard
                label="Action Required"
                value={values ? String(values.actionRequired) : '-'}
                icon={<AlertCircle className="w-4 h-4" />}
                loading={!values}
                onClick={() => handleTabOrCardClick(ACTION_REQUIRED_STATUS_GROUP)}
              />
              <StatCard
                label="Approved"
                value={values ? String(values.approved) : '-'}
                icon={<CheckCircle2 className="w-4 h-4" />}
                loading={!values}
                onClick={() => handleTabOrCardClick('approved')}
              />
              <StatCard
                label="Archived"
                value={values ? String(values.archived) : '-'}
                icon={<Archive className="w-4 h-4" />}
                loading={!values}
                onClick={() => handleTabOrCardClick(ARCHIVED_TAB_KEY)}
              />
            </>
          );
        })()}
      </div>

      <div ref={panelRef} className="scroll-mt-4">
        <VendorOnboardingPanel vendor={activeVendor} onStepClick={openStep} />
      </div>

      <Tabs
        tabs={STATUS_TABS}
        active={appliedFilters.archived === 'true' ? ARCHIVED_TAB_KEY : appliedFilters.status || ''}
        onChange={handleTabOrCardClick}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Registered vendors &middot; {loading ? '…' : vendors.length}
        </h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              title="Matches vendor name, reference, email, phone, PAN or GSTIN"
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-72 text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-semibold transition-colors whitespace-nowrap text-sm sm:text-base dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Filter size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
      </div>

      {showFilters && choices && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            >
              {ADVANCED_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={filters.vendor_type || ''}
              onChange={(e) => setFilters({ ...filters, vendor_type: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            >
              <option value="">All Vendor Types</option>
              {choices.vendor_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              placeholder="Company Code"
              value={filters.company_code || ''}
              onChange={(e) => setFilters({ ...filters, company_code: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <input
              placeholder="Plant"
              value={filters.plant || ''}
              onChange={(e) => setFilters({ ...filters, plant: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <select
              value={filters.gst_registered ?? ''}
              onChange={(e) => setFilters({ ...filters, gst_registered: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            >
              <option value="">GST Registered - Any</option>
              <option value="true">GST Registered - Yes</option>
              <option value="false">GST Registered - No</option>
            </select>
            <select
              value={filters.msme_registered ?? ''}
              onChange={(e) => setFilters({ ...filters, msme_registered: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            >
              <option value="">MSME Registered - Any</option>
              <option value="true">MSME Registered - Yes</option>
              <option value="false">MSME Registered - No</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              From
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              To
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </label>
            <div className="flex gap-2 col-span-1 sm:col-span-2 lg:col-span-2">
              <button onClick={handleApplyFilters} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Apply Filters
              </button>
              <button onClick={handleClearFilters} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-1 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center p-12 text-gray-500 dark:text-gray-400">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
            <Users className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">No vendors found</h3>
          <p className="text-gray-600 dark:text-gray-300">Click "Onboard Vendor" to invite your first vendor</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {vendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              selected={vendor.id === activeVendorId}
              onSelect={() => selectVendor(vendor)}
              onEdit={() => openVendor(vendor)}
              onArchive={() => handleArchive(vendor)}
              onUnarchive={() => handleUnarchive(vendor)}
            />
          ))}
        </div>
      )}

      <VendorOnboardDrawer
        isOpen={drawer.open}
        vendorId={drawer.vendorId}
        initialSection={drawer.section}
        onClose={() => setDrawer({ open: false, vendorId: null })}
        onSaved={(saved) => {
          upsertVendor(saved);
          setActiveVendorId(saved.id);
          fetchSummary();
        }}
      />
    </div>
  );
}

const VendorListPage: React.FC = () => {
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  return (
    <Layout userRole={userRole} currentPage="vendors" onNavigate={() => {}}>
      <VendorListContent />
    </Layout>
  );
};

export default VendorListPage;
