import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, UserPlus, Filter, X, Users, AlertCircle, CheckCircle2, Archive, ArchiveRestore } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { StatCard } from '../../components/StatCard';
import { Tabs, type TabItem } from '../../components/Tabs';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/vendorOnboarding';
import type { VendorOnboardingDetail, VendorOnboardingChoices, VendorListFilters, VendorRequestSummary } from '../../types/vendorOnboarding.types';
import { ACTION_REQUIRED_STATUS_GROUP } from '../../types/vendorOnboarding.types';
import { VendorDetailsContent } from './VendorDetailsPage';
import { RaiseVendorRequestModal } from './RaiseVendorRequestModal';

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
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<VendorOnboardingDetail[]>([]);
  const [summary, setSummary] = useState<VendorRequestSummary | null>(null);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [filters, setFilters] = useState<VendorListFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<VendorListFilters>({});
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

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

  const handleRowClick = (vendor: VendorOnboardingDetail) => {
    if (vendor.status === 'invited' || vendor.status === 'draft') {
      // Nothing meaningful to review yet - go straight to the wizard.
      navigate(`/vendors/${vendor.id}/edit`);
    } else {
      setSelectedVendorId(vendor.id);
    }
  };

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

  if (selectedVendorId) {
    return (
      <VendorDetailsContent
        vendorId={selectedVendorId}
        backLabel="Vendors"
        onBack={() => {
          setSelectedVendorId(null);
          fetchVendors();
          fetchSummary();
        }}
        onEdit={(id) => navigate(`/vendors/${id}/edit`)}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Vendor Requests</h2>

        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search vendor requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 text-sm sm:text-base"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          </div>

          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-semibold transition-colors whitespace-nowrap text-sm sm:text-base"
          >
            <Filter size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Filters</span>
          </button>

          <button
            onClick={() => navigate('/vendors/add')}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap text-sm sm:text-base"
          >
            <Plus size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Add Vendor</span>
          </button>

          <button
            onClick={() => setIsRaiseModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
          >
            <UserPlus size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Raise Vendor Request</span>
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

      <Tabs
        tabs={STATUS_TABS}
        active={appliedFilters.archived === 'true' ? ARCHIVED_TAB_KEY : appliedFilters.status || ''}
        onChange={handleTabOrCardClick}
      />

      <p className="text-xs text-gray-500">
        Search matches vendor name, email, phone, PAN or GSTIN.
      </p>

      {showFilters && choices && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {ADVANCED_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={filters.vendor_type || ''}
              onChange={(e) => setFilters({ ...filters, vendor_type: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Vendor Types</option>
              {choices.vendor_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              placeholder="Company Code"
              value={filters.company_code || ''}
              onChange={(e) => setFilters({ ...filters, company_code: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              placeholder="Plant"
              value={filters.plant || ''}
              onChange={(e) => setFilters({ ...filters, plant: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <select
              value={filters.gst_registered ?? ''}
              onChange={(e) => setFilters({ ...filters, gst_registered: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">GST Registered - Any</option>
              <option value="true">GST Registered - Yes</option>
              <option value="false">GST Registered - No</option>
            </select>
            <select
              value={filters.msme_registered ?? ''}
              onChange={(e) => setFilters({ ...filters, msme_registered: e.target.value || undefined })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">MSME Registered - Any</option>
              <option value="true">MSME Registered - Yes</option>
              <option value="false">MSME Registered - No</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              From
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              To
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </label>
            <div className="flex gap-2 col-span-1 sm:col-span-2 lg:col-span-2">
              <button onClick={handleApplyFilters} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Apply Filters
              </button>
              <button onClick={handleClearFilters} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center p-12 text-gray-500">Loading vendor requests...</div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No vendor requests found</h3>
          <p className="text-gray-600">Get started by raising your first vendor request</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Vendor Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Current Stage</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{vendor.vendor_reference_no || '—'}</td>
                  <td className="px-4 py-3 text-gray-900">{vendor.name || 'Untitled'}</td>
                  <td className="px-4 py-3 text-gray-600">{vendor.email || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{vendor.vendor_type_display}</td>
                  <td className="px-4 py-3"><StatusBadge status={vendor.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{vendor.current_stage}</td>
                  <td className="px-4 py-3 text-gray-500">{vendor.submitted_at ? new Date(vendor.submitted_at).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(vendor.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleRowClick(vendor)} className="text-blue-600 hover:text-blue-800 font-medium text-xs">
                        View
                      </button>
                      {vendor.is_archived ? (
                        <button
                          onClick={() => handleUnarchive(vendor)}
                          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-xs"
                          title="Restore to main list"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchive(vendor)}
                          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-xs"
                          title="Hide from the main list"
                        >
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RaiseVendorRequestModal
        isOpen={isRaiseModalOpen}
        onClose={() => setIsRaiseModalOpen(false)}
        onRaised={() => {
          fetchVendors();
          fetchSummary();
        }}
        vendorTypeOptions={choices?.vendor_types || []}
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
