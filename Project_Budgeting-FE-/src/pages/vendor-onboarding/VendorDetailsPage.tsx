import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Eye, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/Layout';
import { ApprovalTimeline } from '../../components/ApprovalTimeline';
import { ApprovalActionBar } from '../../components/ApprovalActionBar';
import { VersionDiffPanel } from '../../components/VersionDiffPanel';
import { Tabs } from '../../components/Tabs';
import { DocumentList } from '../../components/DocumentList';
import { ReviewSection } from '../../components/onboarding/OnboardingWizard';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useCountries, useCountryConfig } from '../../hooks/useCountries';
import { findCountry } from '../../services/countries';
import * as api from '../../services/vendorOnboarding';
import { vendorDocumentSlots } from '../../schemas/vendorOnboarding.schemas';
import { VendorStatusHeader } from './components/VendorStatusHeader';
import { formatAmount, fyLabel } from './components/vendorDisplay';
import { EDITABLE_VENDOR_STATUSES, UNDER_REVIEW_VENDOR_STATUSES } from './components/vendorSteps';
import { buildReviewSections, choiceLabel, recordToFormValues } from './vendorOnboardingForm';
import type {
  VendorOnboardingDetail, VendorApprovalHistoryEvent, VendorOnboardingChoices,
  VendorSubmissionVersion, RequestChangesPayload,
} from '../../types/vendorOnboarding.types';

const SECTION_TABS = [
  { key: 'basic', label: 'Basic Information' },
  { key: 'kyc', label: 'Identity & KYC' },
  { key: 'address', label: 'Address' },
  { key: 'banking', label: 'Banking' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'documents', label: 'KYC Documents' },
  { key: 'approval_history', label: 'Approval History' },
];

interface VendorDetailsContentProps {
  vendorId: number;
  onBack: () => void;
  onEdit: (vendorId: number) => void;
  backLabel?: string;
  /** Rendered inside a side drawer: no breadcrumb, and the drawer header already carries the name. */
  embedded?: boolean;
  /** Notified after an approve / request-changes action, so a list behind the drawer can refresh. */
  onChanged?: (vendor: VendorOnboardingDetail) => void;
}

/**
 * Read-only vendor record with every saved field under human labels (same rows as the wizard's
 * Review step), documents with their review state, and the approval history.
 */
export function VendorDetailsContent({ vendorId, onBack, onEdit, backLabel = 'Vendors', embedded = false, onChanged }: VendorDetailsContentProps) {
  const [vendor, setVendor] = useState<VendorOnboardingDetail | null>(null);
  const [history, setHistory] = useState<VendorApprovalHistoryEvent[]>([]);
  const [versions, setVersions] = useState<VendorSubmissionVersion[]>([]);
  const [choices, setChoices] = useState<VendorOnboardingChoices | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getVendor(vendorId),
      api.getApprovalHistory(vendorId).catch(() => []),
      api.getSubmissionVersions(vendorId).catch(() => []),
      api.getChoices().catch(() => null),
    ])
      .then(([v, h, ver, c]) => {
        if (cancelled) return;
        setVendor(v);
        setHistory(h);
        setVersions(ver);
        if (c) setChoices(c);
        onChanged?.(v);
      })
      .catch((err) => {
        console.error('Loading vendor failed', err?.response?.status);
        toast.error('Failed to load vendor');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, reloadKey]);

  const values = useMemo(() => (vendor ? recordToFormValues(vendor) : null), [vendor]);
  const { countries } = useCountries();
  const country = values?.basic.country ?? '';
  const indian = findCountry(countries, country)?.code ? findCountry(countries, country)?.code === 'IN' : !country.trim();
  const { config: countryConfig } = useCountryConfig(country);
  const { config: taxConfig } = useCountryConfig(indian ? '' : values?.kyc.country_of_tax_residence || country);
  const { config: bankConfig } = useCountryConfig(values?.bank.bank_country || country);

  if (!vendor || !values) {
    return <div className="text-center p-12 text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const handleApprove = async (comments: string) => {
    await api.approveVendor(vendorId, comments);
    toast.success('Vendor approved');
    setReloadKey((k) => k + 1);
  };
  const handleRequestChanges = async (payload: RequestChangesPayload) => {
    await api.requestVendorChanges(vendorId, payload);
    toast.success('Request sent to the vendor');
    setReloadKey((k) => k + 1);
  };
  const reveal = async () => {
    try {
      const detail = await api.getUnmaskedBankDetail(vendorId);
      setRevealed(detail.account_number || null);
    } catch {
      toast.error('You are not authorized to view the full account number');
    }
  };
  const openDocument = async (docId: number) => {
    try {
      const { download_url } = await api.downloadDocument(vendor.id, docId);
      window.open(download_url, '_blank', 'noopener');
    } catch {
      toast.error('Unable to open the document.');
    }
  };

  const openChangeRequest = vendor.change_requests.find((c) => c.status === 'open');
  const isEditable = EDITABLE_VENDOR_STATUSES.includes(vendor.status) && vendor.permissions?.edit !== false;
  const isUnderReview = UNDER_REVIEW_VENDOR_STATUSES.includes(vendor.status);
  const sections = buildReviewSections(values, {
    internal: true, indian,
    vendorTypes: choices?.vendor_types ?? [], paymentTerms: choices?.payment_terms ?? [],
    billingFrequencies: choices?.billing_frequencies ?? [], msmeCategories: choices?.msme_categories ?? [],
    currencies: choices?.onboarding_currencies ?? [], countryConfig, taxConfig, bankConfig,
    maskedAccountNumber: revealed ?? vendor.bank_detail?.account_number_masked ?? undefined,
  });
  const section = sections.find((s) => s.step === activeTab);
  const legacyBank = vendor.bank_detail
    ? ([['Bank ID', vendor.bank_detail.bank_id], ['Bank country key', vendor.bank_detail.bank_country_key], ['Bank control key', vendor.bank_detail.bank_control_key],
        ['Region', vendor.bank_detail.region], ['Street', vendor.bank_detail.street], ['City', vendor.bank_detail.city]] as [string, string | undefined][])
        .filter(([, v]) => v)
    : [];
  const slots = vendorDocumentSlots({
    vendorType: values.basic.vendor_type, indian,
    gstRegistered: indian && values.kyc.gst_registered, msmeRegistered: indian && values.kyc.msme_registered,
    hasEpf: indian && !!values.kyc.epf_number, hasEsic: indian && !!values.kyc.esic_number,
  });
  // Older uploads in categories the current rules don't list still show up.
  const extraSlots = Array.from(new Set(vendor.documents.map((d) => d.category)))
    .filter((c) => !slots.some((s) => s.key === c))
    .map((c) => ({ key: c, label: choiceLabel(choices?.document_categories ?? [], c), required: false }));
  const review = vendor.review;

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6 animate-fade-in-down'}>
      <div className={`mb-2 flex items-center gap-2 text-sm ${embedded ? 'hidden' : ''}`}>
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-semibold transition-colors dark:text-blue-400 dark:hover:text-blue-300">
          {backLabel}
        </button>
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <span className="text-gray-700 font-medium dark:text-gray-300">{vendor.name}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {!embedded && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words dark:text-white">{vendor.name}</h2>}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {vendor.vendor_reference_no} &middot; {vendor.vendor_type_display}
            {isUnderReview && ` · ${vendor.current_stage}`}
          </p>
          {isEditable && (
            <button
              onClick={() => onEdit(vendor.id)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
            >
              <Edit2 className="w-4 h-4" />
              {vendor.status === 'action_required' ? 'Edit & resubmit' : 'Continue onboarding'}
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

      <VendorStatusHeader vendor={vendor} />

      {vendor.status === 'action_required' && openChangeRequest && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 dark:bg-amber-500/10 dark:border-amber-500/30">
          <p className="text-sm font-semibold text-orange-800 dark:text-amber-300">Action Required — {openChangeRequest.section_display}</p>
          <p className="text-sm text-orange-700 mt-1 dark:text-amber-400">
            Requested by {openChangeRequest.requested_by_name || 'an approver'}: {openChangeRequest.required_changes}
          </p>
          {openChangeRequest.comments && <p className="text-sm text-orange-600 mt-1 dark:text-amber-400">{openChangeRequest.comments}</p>}
        </div>
      )}

      {vendor.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 dark:bg-green-500/10 dark:border-green-500/30">
          <Send className="w-4 h-4 text-green-700 dark:text-green-400" />
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">This vendor has been fully approved and is now an active vendor.</p>
        </div>
      )}

      <Tabs tabs={SECTION_TABS} active={activeTab} onChange={setActiveTab} />

      {section && (
        <div className="space-y-4">
          <ReviewSection title={section.title} rows={section.rows} />
          {activeTab === 'basic' && (
            <ReviewSection
              title="Vendor summary (internal)"
              rows={[
                { label: 'Headcount', value: values.basic.headcount },
                { label: 'Rating', value: values.basic.rating ? `${values.basic.rating} / 5` : 'Not rated' },
                { label: `${fyLabel(vendor.financials?.fy_start)} spend`, value: formatAmount(vendor.financials?.fy_spend) },
              ]}
            />
          )}
          {activeTab === 'kyc' && (
            <ReviewSection
              title="KYC review (internal)"
              rows={[
                { label: 'KYC status', value: choiceLabel(choices?.kyc_statuses ?? [], review.kyc_status) },
                { label: 'Risk rating', value: choiceLabel(choices?.risk_ratings ?? [], review.risk_rating) },
                { label: 'Compliance remarks', value: review.compliance_remarks, wide: true },
              ]}
            />
          )}
          {activeTab === 'banking' && (
            <>
              <ReviewSection
                title="Bank verification (internal)"
                rows={[
                  { label: 'Verification status', value: choiceLabel(choices?.bank_verification_statuses ?? [], review.bank_verification_status) },
                  { label: 'Remarks', value: review.bank_verification_remarks },
                ]}
              />
              {vendor.permissions?.view_unmasked_bank && vendor.bank_detail?.account_number_masked && !revealed && (
                <button type="button" onClick={reveal} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-violet-300">
                  <Eye className="w-4 h-4" /> Reveal the full account number
                </button>
              )}
              {legacyBank.length > 0 && (
                <ReviewSection title="Legacy ERP bank keys" rows={legacyBank.map(([label, value]) => ({ label, value }))} />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 dark:bg-gray-900 dark:border-gray-800">
          <DocumentList
            slots={[...slots, ...extraSlots]}
            documents={vendor.documents}
            onUpload={async () => {}}
            onDelete={async () => {}}
            onDownload={(id) => void openDocument(id)}
            onPreview={(id) => void openDocument(id)}
            readOnly
            showSummary
          />
        </div>
      )}

      {activeTab === 'approval_history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 text-sm mb-4 dark:text-white">Timeline</h3>
            <ApprovalTimeline events={history} />
          </div>
          {versions.length > 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 text-sm mb-4 dark:text-white">Submission Versions</h3>
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
