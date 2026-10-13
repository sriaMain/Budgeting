import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { ReviewSection } from '../../../components/onboarding/OnboardingWizard';
import {
  validateAddress, validateBank, validateBasic, validateCommercial, validateKyc, type VendorValidationContext,
} from '../../../schemas/vendorOnboarding.schemas';
import { buildReviewSections, issuesByStep } from '../vendorOnboardingForm';
import type { VendorWizard } from '../components/useVendorWizard';
import { VendorApprovalStep } from '../components/VendorApprovalStep';
import { UNDER_REVIEW_VENDOR_STATUSES } from '../components/vendorSteps';

/** Step 7 - every section with Edit links and what's still missing; submit from the footer.
 * Admins also get the approval checklist, approve / request changes and the history. */
export const ReviewStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, record, internal, choices, countries, countryConfig, taxConfig, bankConfig, indian, documents } = wiz;
  const hasSavedAccount = !!wiz.maskedAccountNumber;

  const fullErrors = useMemo(() => {
    const ctx: VendorValidationContext = {
      mode: 'full', internal, countries, countryConfig, taxConfig, bankConfig, indian, hasSavedAccount, documents,
    };
    return {
      ...validateBasic(values, ctx), ...validateKyc(values, ctx), ...validateAddress(values, ctx),
      ...validateBank(values, ctx), ...validateCommercial(values, ctx),
    };
  }, [values, internal, countries, countryConfig, taxConfig, bankConfig, indian, hasSavedAccount, documents]);

  const sections = buildReviewSections(values, {
    internal, indian,
    vendorTypes: choices?.vendor_types ?? [],
    paymentTerms: choices?.payment_terms ?? [],
    billingFrequencies: choices?.billing_frequencies ?? [],
    msmeCategories: choices?.msme_categories ?? [],
    currencies: choices?.onboarding_currencies ?? [],
    countryConfig, taxConfig, bankConfig,
    maskedAccountNumber: wiz.maskedAccountNumber,
    errors: fullErrors,
  });
  const serverIssues = issuesByStep(wiz.submissionIssues);
  const localIssues: Record<string, string[]> = {};
  Object.entries(fullErrors).forEach(([path, message]) => {
    const section = path.split('.')[0];
    const step = section === 'bank' ? 'banking' : section;
    (localIssues[step] ??= []).push(message);
  });
  const sectionIssues = (step: string) =>
    Array.from(new Set([...(localIssues[step] ?? []), ...(wiz.isDirty ? [] : serverIssues[step as keyof typeof serverIssues] ?? [])]));

  const docIssues = wiz.docProblems.map((d) => (d.state === 'missing' ? `${d.rule.label} is missing` : `${d.rule.label} - ${d.state}`));
  const totalIssues = sections.reduce((n, s) => n + sectionIssues(s.step).length, 0) + docIssues.length;
  const status = record?.status;
  const underReview = !!status && UNDER_REVIEW_VENDOR_STATUSES.includes(status);

  return (
    <div className="space-y-5">
      {status === 'approved' ? (
        <Banner tone="ok" icon={<CheckCircle2 className="w-4 h-4" />}>This vendor is approved.</Banner>
      ) : underReview ? (
        <Banner tone="info" icon={<Clock className="w-4 h-4" />}>
          Submitted for approval{record?.current_stage ? ` · ${record.current_stage}` : ''}. The details are locked while under review.
        </Banner>
      ) : totalIssues > 0 ? (
        <Banner tone="warn" icon={<AlertTriangle className="w-4 h-4" />}>
          {totalIssues} item{totalIssues === 1 ? '' : 's'} still needed before submitting - listed under each section below.
        </Banner>
      ) : (
        <Banner tone="ok" icon={<CheckCircle2 className="w-4 h-4" />}>
          Everything required is filled in{wiz.isDirty ? ' - your changes will be saved when you submit' : ''}. Submit when ready.
        </Banner>
      )}

      {sections.map((s) => (
        <ReviewSection
          key={s.step}
          title={s.title}
          rows={s.rows}
          issues={sectionIssues(s.step)}
          onEdit={wiz.editable ? () => wiz.goTo(s.step) : undefined}
        />
      ))}

      <ReviewSection
        title="KYC Documents"
        issues={docIssues}
        onEdit={() => wiz.goTo('documents')}
        rows={wiz.docStatus.map(({ rule, state }) => ({
          label: rule.label,
          value: { verified: 'Verified', present: 'Uploaded - awaiting verification', missing: '', rejected: 'Rejected', expired: 'Expired' }[state],
          missing: state === 'missing',
        }))}
      />

      {internal && <VendorApprovalStep wiz={wiz} />}
    </div>
  );
};

const Banner: React.FC<{ tone: 'ok' | 'warn' | 'info'; icon: React.ReactNode; children: React.ReactNode }> = ({ tone, icon, children }) => {
  const cls = tone === 'ok'
    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
    : tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
  return <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${cls}`}><span className="mt-0.5 shrink-0">{icon}</span><span>{children}</span></div>;
};
