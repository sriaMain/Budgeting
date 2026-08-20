import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Eye, EyeOff, FileText, Download, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { ApprovalTimeline } from '../../components/ApprovalTimeline';
import { ApprovalActionBar } from '../../components/ApprovalActionBar';
import { VersionDiffPanel } from '../../components/VersionDiffPanel';
import { Tabs } from '../../components/Tabs';
import { useAppSelector } from '../../hooks/useAppSelector';
import * as api from '../../services/vendorOnboarding';
import type {
  VendorOnboardingDetail, VendorApprovalHistoryEvent, VendorOnboardingChoices,
  VendorSubmissionVersion, RequestChangesPayload,
} from '../../types/vendorOnboarding.types';

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm text-gray-900 font-medium">{value || '-'}</p>
  </div>
);

const SECTION_TABS = [
  { key: 'vendor_details', label: 'Vendor Details' },
  { key: 'kyv_compliance', label: 'KYV / Compliance' },
  { key: 'bank_details', label: 'Bank Details' },
  { key: 'business_procurement', label: 'Business / Procurement' },
  { key: 'documents', label: 'Documents' },
  { key: 'approval_history', label: 'Approval History' },
];

interface VendorDetailsContentProps {
  vendorId: number;
  onBack: () => void;
  onEdit: (vendorId: number) => void;
  backLabel?: string;
}

/**
 * The actual vendor request review UI, with no Layout/route of its own - takes vendorId
 * and navigation callbacks as props so it can be shown either inline (swapped in place of
 * the list, no URL change) or inside the standalone /vendors/:id route below.
 */
export function VendorDetailsContent({ vendorId, onBack, onEdit, backLabel = 'Vendors' }: VendorDetailsContentProps) {
  const [vendor, setVendor] = useState<VendorOnboardingDetail | null>(null);
  const [history, setHistory] = useState<VendorApprovalHistoryEvent[]>([]);
  const [versions, setVersions] = useState<VendorSubmissionVersion[]>([]);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullAccount, setShowFullAccount] = useState(false);
  const [unmaskedAccount, setUnmaskedAccount] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('vendor_details');

  const load = async () => {
    setLoading(true);
    try {
      const [v, h, ver] = await Promise.all([
        api.getVendor(vendorId),
        api.getApprovalHistory(vendorId),
        api.getSubmissionVersions(vendorId).catch(() => []),
      ]);
      setVendor(v);
      setHistory(h);
      setVersions(ver);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load vendor request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getChoices().then(setChoices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const handleRevealAccount = async () => {
    try {
      const detail = await api.getUnmaskedBankDetail(vendorId);
      setUnmaskedAccount(detail.account_number || null);
      setShowFullAccount(true);
    } catch {
      toast.error('You are not authorized to view the full account number');
    }
  };

  const handleApprove = async (comments: string) => {
    await api.approveVendor(vendorId, comments);
    toast.success('Vendor approved');
    await load();
  };

  const handleRequestChanges = async (payload: RequestChangesPayload) => {
    await api.requestVendorChanges(vendorId, payload);
    toast.success('Request sent to the vendor');
    await load();
  };

  if (loading || !vendor) {
    return <div className="text-center p-12 text-gray-500">Loading...</div>;
  }

  const openChangeRequest = vendor.change_requests.find((c) => c.status === 'open');
  const isEditable = vendor.status === 'draft' || vendor.status === 'action_required';
  const isUnderReview = vendor.status === 'submitted' || vendor.status === 'resubmitted' || vendor.status === 'approval_in_progress';
  const p = vendor.onboarding_profile;
  const k = vendor.kyc;
  const b = vendor.bank_detail;
  const proc = vendor.procurement_detail;

  return (
    <div className="space-y-6 animate-fade-in-down">
      {/* Breadcrumb / Back */}
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">
          {backLabel}
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-medium">{vendor.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold text-gray-900">{vendor.name}</h2>
          <StatusBadge status={vendor.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500">
            {vendor.vendor_reference_no} &middot; {vendor.vendor_type_display}
            {isUnderReview && ` · ${vendor.current_stage}`}
          </p>
          {isEditable && (
            <button
              onClick={() => onEdit(vendor.id)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              <Edit2 className="w-4 h-4" />
              {vendor.status === 'draft' ? 'Continue Draft' : 'Edit & Resubmit'}
            </button>
          )}
          {vendor.is_current_approver && isUnderReview && (
            <ApprovalActionBar
              canAct
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              sectionOptions={choices?.change_request_sections || []}
            />
          )}
        </div>
      </div>

      {vendor.status === 'action_required' && openChangeRequest && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-orange-800">Action Required — {openChangeRequest.section_display}</p>
          <p className="text-sm text-orange-700 mt-1">
            Requested by {openChangeRequest.requested_by_name || 'an approver'}: {openChangeRequest.required_changes}
          </p>
          {openChangeRequest.comments && <p className="text-sm text-orange-600 mt-1">{openChangeRequest.comments}</p>}
        </div>
      )}

      {vendor.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
          <Send className="w-4 h-4 text-green-700" />
          <p className="text-sm font-semibold text-green-800">
            This vendor request has been fully approved and is now an active vendor.
          </p>
        </div>
      )}

      <Tabs tabs={SECTION_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'vendor_details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-sm">Vendor Details</h3>
            <Field label="Company Code" value={p?.company_code} />
            <Field label="Plant" value={p?.plant} />
            <Field label="Contact Person" value={p?.contact_person_name} />
            <Field label="Designation" value={p?.contact_person_designation} />
            <Field label="Email" value={vendor.email} />
            <Field label="Phone" value={vendor.phone} />
            <Field label="Vendor Introduction" value={p?.vendor_introduction} />
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-sm">Address</h3>
            <Field label="Address Line 1" value={p?.address_line1} />
            <Field label="Address Line 2" value={p?.address_line2} />
            <Field label="City" value={p?.city} />
            <Field label="District" value={p?.district} />
            <Field label="State" value={p?.state} />
            <Field label="Country" value={p?.country} />
            <Field label="PIN Code" value={p?.pin_code} />
          </div>
        </div>
      )}

      {activeTab === 'kyv_compliance' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="PAN" value={k?.pan} />
          <Field label="Country of Tax Residence" value={k?.country_of_tax_residence} />
          <Field label="CIN" value={k?.cin} />
          <Field label="Date of Incorporation" value={k?.incorporation_date} />
          <Field label="TAN" value={k?.tan} />
          <Field label="TAN Associated Mobile" value={k?.tan_mobile} />
          <Field label="GST Registered" value={p?.gst_registered ? `Yes (${p.gstin})` : 'No'} />
          <Field label="MSME Registered" value={p?.msme_registered ? `Yes (${p.udyam_number}, ${p.msme_category})` : 'No'} />
          <Field label="EPF Number" value={k?.epf_number} />
          <Field label="ESIC Number" value={k?.esic_number} />
          <Field label="ESIC District" value={k?.esic_district} />
        </div>
      )}

      {activeTab === 'bank_details' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Bank Name" value={b?.bank_name} />
          <Field label="Account Holder" value={b?.account_holder_name} />
          <div>
            <p className="text-xs text-gray-500">Account Number</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-900 font-medium">
                {showFullAccount && unmaskedAccount ? unmaskedAccount : b?.account_number_masked || '-'}
              </p>
              <button onClick={handleRevealAccount} className="text-gray-400 hover:text-gray-600">
                {showFullAccount ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Field label="IFSC Code" value={b?.ifsc_code} />
          <Field label="Branch" value={b?.branch} />
          <Field label="Region" value={b?.region} />
          <Field label="Street" value={b?.street} />
          <Field label="City" value={b?.city} />
        </div>
      )}

      {activeTab === 'business_procurement' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="Account Group" value={proc?.account_group} />
          <Field label="Purchasing Org" value={proc?.purchasing_org} />
          <Field label="Payment Terms" value={proc?.payment_terms} />
          <Field label="Order Currency" value={proc?.order_currency} />
          <Field label="Grouping Key" value={proc?.grouping_key} />
          <Field label="Partner Category" value={proc?.partner_category} />
          <Field label="Incoterms" value={proc?.incoterms_1} />
          <Field label="Incoterms Location" value={proc?.incoterms_2} />
          <Field label="Reconciliation Account" value={proc?.reconciliation_account} />
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {vendor.documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {vendor.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.file_name}</p>
                      <p className="text-xs text-gray-500">{d.category.replace(/_/g, ' ')} &middot; Uploaded by {d.uploaded_by_role}</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const { download_url } = await api.downloadDocument(vendor.id, d.id);
                      window.open(download_url, '_blank');
                    }}
                    className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'approval_history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 text-sm mb-4">Timeline</h3>
            <ApprovalTimeline events={history} />
          </div>
          {versions.length > 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 text-sm mb-4">Submission Versions</h3>
              <VersionDiffPanel versions={versions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const VendorDetailsPage: React.FC = () => {
  const { vendorId } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();
  const userRole = (useAppSelector((state) => state.auth.userRole) as 'admin' | 'user' | 'manager') || 'admin';

  if (!vendorId) return null;

  return (
    <Layout userRole={userRole} currentPage="vendors" onNavigate={() => {}}>
      <VendorDetailsContent
        vendorId={Number(vendorId)}
        onBack={() => navigate('/vendors')}
        onEdit={(id) => navigate(`/vendors/${id}/edit`)}
      />
    </Layout>
  );
};

export default VendorDetailsPage;
