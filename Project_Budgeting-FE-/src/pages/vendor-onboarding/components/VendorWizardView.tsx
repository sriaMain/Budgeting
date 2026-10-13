import React from 'react';
import { Loader2 } from 'lucide-react';
import { WizardFooter, WizardProgress } from '../../../components/onboarding/OnboardingWizard';
import { CompactFields } from '../../../components/fieldDensity';
import { BasicInfoStep } from '../steps/BasicInfoStep';
import { IdentityKycStep } from '../steps/IdentityKycStep';
import { AddressStep } from '../steps/AddressStep';
import { BankingStep } from '../steps/BankingStep';
import { CommercialStep } from '../steps/CommercialStep';
import { DocumentsStep } from '../steps/DocumentsStep';
import { ReviewStep } from '../steps/ReviewStep';
import type { VendorWizard } from './useVendorWizard';
import { VENDOR_WIZARD_STEPS, wizardStepIndex } from './vendorSteps';

/**
 * The vendor onboarding wizard's body (progress + the current step) and footer. The admin drawer,
 * the full-page wizard and the vendor portal all render these two with the same useVendorWizard()
 * state, so the steps, fields and rules are identical everywhere.
 */
export const VendorWizardBody: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  if (wiz.loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (wiz.loadError) {
    return <p className="py-16 text-center text-sm text-gray-600 dark:text-gray-300">{wiz.loadError}</p>;
  }
  const meta = VENDOR_WIZARD_STEPS[wizardStepIndex(wiz.step)];
  const statusText = wiz.isDirty
    ? 'Unsaved changes'
    : wiz.lastSavedAt
      ? `Saved at ${wiz.lastSavedAt}`
      : wiz.record ? `${wiz.record.status_display}` : 'New vendor - nothing saved yet';

  return (
    <CompactFields>
      <div className="space-y-5 min-w-0">
        <WizardProgress steps={wiz.steps} currentKey={wiz.step} onStepChange={(key) => wiz.goTo(key as typeof wiz.step)} statusText={statusText} />
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{meta.title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
        </div>
        {!wiz.editable && wiz.record && wiz.step !== 'review' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {wiz.record.status_display} - the details are read-only{wiz.canVerify ? '; reviewer actions are still available' : ''}.
          </p>
        )}
        {wiz.step === 'basic' && <BasicInfoStep wiz={wiz} />}
        {wiz.step === 'kyc' && <IdentityKycStep wiz={wiz} />}
        {wiz.step === 'address' && <AddressStep wiz={wiz} />}
        {wiz.step === 'banking' && <BankingStep wiz={wiz} />}
        {wiz.step === 'commercial' && <CommercialStep wiz={wiz} />}
        {wiz.step === 'documents' && <DocumentsStep wiz={wiz} />}
        {wiz.step === 'review' && <ReviewStep wiz={wiz} />}
      </div>
    </CompactFields>
  );
};

export const VendorWizardFooter: React.FC<{ wiz: VendorWizard; onCancel?: () => void }> = ({ wiz, onCancel }) => {
  if (wiz.loading || wiz.loadError) return null;
  const index = wizardStepIndex(wiz.step);
  const resubmit = wiz.record?.status === 'action_required';
  const submitBlockedReason = !wiz.canSubmit
    ? 'You do not have permission to submit this vendor'
    : wiz.docProblems.length
      ? `Required documents missing, rejected or expired: ${wiz.docProblems.map((d) => d.rule.label).join(', ')}`
      : undefined;
  return (
    <WizardFooter
      isFirst={index === 0}
      isLast={index === VENDOR_WIZARD_STEPS.length - 1}
      onPrevious={wiz.previous}
      onNext={() => void wiz.next()}
      onSaveDraft={() => void wiz.saveDraft()}
      onSubmit={wiz.canSubmit ? () => void wiz.submit() : undefined}
      onCancel={onCancel}
      isSaving={wiz.busy === 'save'}
      isSubmitting={wiz.busy === 'submit'}
      submitLabel={resubmit ? 'Resubmit for approval' : 'Submit for approval'}
      submitBlockedReason={submitBlockedReason}
      readOnly={!wiz.editable}
      note={wiz.editable && wiz.isDirty ? 'Unsaved changes' : undefined}
    />
  );
};
