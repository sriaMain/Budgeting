import React from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import { ReviewSection } from '../../../components/onboarding/OnboardingWizard';
import { ActionRequiredBanner } from './ActionRequiredBanner';
import { useVendorWizard, type VendorWizard } from '../components/useVendorWizard';
import { VendorWizardBody, VendorWizardFooter } from '../components/VendorWizardView';
import { buildReviewSections } from '../vendorOnboardingForm';
import { latestByCategory } from '../../../utils/documentStatus';
import type { VendorPublicDetail } from '../../../types/vendorOnboardingPublic.types';

/** The vendor's self-service onboarding (token link, no login): the same wizard as the admin form,
 * without internal fields or reviewer panels; verified documents can't be replaced. */
const VendorPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const wiz = useVendorWizard({ mode: 'portal', token });
  const detail = wiz.publicRecord;

  if (wiz.loading) {
    return <div className="min-h-screen py-16 text-center text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }
  if (wiz.loadError || !detail) {
    return (
      <div className="min-h-screen px-4 py-16 text-center dark:bg-gray-950">
        <p className="text-lg font-semibold text-gray-900 mb-2 dark:text-white">Link not available</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{wiz.loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-5">
        <PortalHeader detail={detail} />
        {detail.status === 'action_required' && detail.open_change_request && (
          <ActionRequiredBanner changeRequest={detail.open_change_request} />
        )}
        {wiz.editable ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
              <VendorWizardBody wiz={wiz} />
            </div>
            <div className="sticky bottom-0 z-10 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:bg-gray-900 dark:border-gray-800">
              <VendorWizardFooter wiz={wiz} />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Your progress is saved with each step - you can close this page and continue later with the same link.</p>
            </div>
          </>
        ) : (
          <LockedSummary wiz={wiz} detail={detail} />
        )}
      </div>
    </div>
  );
};

const PortalHeader: React.FC<{ detail: VendorPublicDetail }> = ({ detail }) => {
  const percent = detail.onboarding?.percent ?? detail.progress_percentage;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1 dark:text-blue-400">Vendor onboarding</p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words dark:text-white">{detail.name || 'Your company'}</h1>
          <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">Reference: {detail.vendor_reference_no}</p>
        </div>
        <StatusBadge status={detail.status} label={detail.status_display} />
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1 text-xs">
          <span className="font-medium text-gray-500 dark:text-gray-400">Progress</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{percent}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-800">
          <div className={`h-full transition-all ${percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

/** Submitted / approved - a read-only summary of what was provided. */
const LockedSummary: React.FC<{ wiz: VendorWizard; detail: VendorPublicDetail }> = ({ wiz, detail }) => {
  const approved = detail.status === 'approved';
  const sections = buildReviewSections(wiz.values, {
    internal: false, indian: wiz.indian,
    vendorTypes: wiz.choices?.vendor_types ?? [], paymentTerms: wiz.choices?.payment_terms ?? [],
    billingFrequencies: wiz.choices?.billing_frequencies ?? [], msmeCategories: wiz.choices?.msme_categories ?? [],
    currencies: wiz.choices?.onboarding_currencies ?? [], countryConfig: wiz.countryConfig, taxConfig: wiz.taxConfig,
    bankConfig: wiz.bankConfig, maskedAccountNumber: wiz.maskedAccountNumber,
  });
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:bg-gray-900 dark:border-gray-800">
        {approved
          ? <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          : <Clock className="w-10 h-10 text-blue-500 mx-auto mb-3" />}
        <h2 className="text-lg font-bold text-gray-900 mb-1 dark:text-white">{approved ? "You're approved!" : 'Your information is under review'}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {approved
            ? 'Your vendor onboarding has been fully approved. Thank you for completing the process.'
            : `Thank you for completing your vendor onboarding. Our team is reviewing your submission (${detail.current_stage}) and will contact you if anything else is needed.`}
        </p>
      </div>
      {sections.map((s) => <ReviewSection key={s.step} title={s.title} rows={s.rows} />)}
      <ReviewSection
        title="KYC Documents"
        rows={Array.from(latestByCategory(detail.documents).values()).map((d) => ({ label: d.category_display || d.category, value: `${d.file_name} · ${d.effective_status ?? d.status}` }))}
      />
    </div>
  );
};

export default VendorPortalPage;
