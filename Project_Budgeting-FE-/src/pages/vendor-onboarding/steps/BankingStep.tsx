import React from 'react';
import { BankDetailsFields } from '../../../components/onboarding/BankDetailsFields';
import type { BankErrors } from '../../../components/onboarding/bankForm';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import { BankReviewPanel } from '../components/ReviewerPanels';
import type { VendorWizard } from '../components/useVendorWizard';

/** Step 4 - the bank account payments go to. Identifiers follow the bank's country (IFSC in India,
 * ABA / sort code / BSB / IBAN elsewhere); verification is a reviewer's decision, never automatic. */
export const BankingStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, editable, internal, adminRecord, permissions, maskedAccountNumber } = wiz;
  const bankErrors: BankErrors = {};
  Object.entries(errors).forEach(([path, message]) => {
    if (path.startsWith('bank.')) bankErrors[path.slice('bank.'.length) as keyof BankErrors] = message;
  });
  return (
    <div className="space-y-5">
      <fieldset disabled={!editable} className="min-w-0">
        <FormSection title="Bank account" description="Payments are made only to this account. Account numbers are stored masked.">
          <BankDetailsFields
            idPrefix="vw-bank"
            value={values.bank}
            onChange={(change) => patch('bank', change)}
            errors={bankErrors}
            maskedAccountNumber={maskedAccountNumber}
            onRevealAccountNumber={internal && permissions?.view_unmasked_bank ? wiz.revealAccountNumber : undefined}
            verificationStatus={internal ? adminRecord?.review.bank_verification_status : undefined}
          />
        </FormSection>
      </fieldset>
      <BankReviewPanel wiz={wiz} />
    </div>
  );
};
