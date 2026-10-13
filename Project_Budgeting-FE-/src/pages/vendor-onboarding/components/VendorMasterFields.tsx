import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { InputField } from '../../../components/InputField';
import { COMPACT_LABEL } from '../../../components/fieldDensity';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import { vendorFieldId } from '../vendorOnboardingForm';
import { StarRating } from './StarRating';
import type { VendorWizard } from './useVendorWizard';
import { formatAmount, fyLabel } from './vendorDisplay';

/** Internal vendor-master fields (admin only): headcount, 1-5 star rating and the FY amount spent
 * that isn't recorded as vendor bills. They stay editable after submission / approval - then they
 * are saved on their own with "Save summary". */
export const VendorMasterFields: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, adminRecord, canEditMaster, editable, busy } = wiz;
  const financials = adminRecord?.financials;
  const disabled = !canEditMaster || !!busy;
  const fy = fyLabel(financials?.fy_start);
  const manual = Number(values.basic.manual_amount_spent || 0);
  const billed = Number(financials?.billed_fy_spend ?? financials?.fy_spend ?? 0);
  const lockedButEditable = !editable && canEditMaster && !!adminRecord;
  const changed = ['headcount', 'rating', 'manual_amount_spent'].some(
    (k) => String(values.basic[k as 'headcount']) !== String(wiz.saved.basic[k as 'headcount']),
  );

  return (
    <FormSection
      title="Vendor summary"
      description="Internal only - never shown to the vendor."
      actions={lockedButEditable ? (
        <button
          type="button"
          onClick={() => void wiz.saveMasterFields()}
          disabled={disabled || !changed}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-violet-600"
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save summary
        </button>
      ) : undefined}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
        <InputField
          id={vendorFieldId('basic.headcount')}
          label="Headcount"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 4"
          disabled={disabled}
          value={values.basic.headcount}
          onChange={(e) => patch('basic', { headcount: e.target.value })}
          error={errors['basic.headcount']}
        />
        <div className="mb-5">
          <span className={COMPACT_LABEL}>Rating</span>
          <div className="flex items-center gap-2 py-2">
            <StarRating value={values.basic.rating} onChange={(rating) => patch('basic', { rating })} disabled={disabled} />
            <span className="text-sm text-gray-600 dark:text-gray-300">{values.basic.rating ? `${values.basic.rating}/5` : 'Not rated'}</span>
          </div>
        </div>
        <InputField
          id={vendorFieldId('basic.manual_amount_spent')}
          label={`${fy} amount spent (₹)`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="e.g. 150000"
          disabled={disabled}
          value={values.basic.manual_amount_spent}
          onChange={(e) => patch('basic', { manual_amount_spent: e.target.value })}
          error={errors['basic.manual_amount_spent']}
        />
      </div>
      <div className="-mt-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-800/40">
        <span className="text-gray-500 dark:text-gray-400">Total {fy} spend: </span>
        <span className="font-bold text-gray-900 dark:text-white">{formatAmount(String(billed + manual))}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {' '}= {formatAmount(String(billed))} from vendor bills + {formatAmount(String(manual))} entered above
          {financials ? ` · ${financials.po_count} PO${financials.po_count === 1 ? '' : 's'} worth ${formatAmount(financials.po_total)}` : ''}
        </span>
      </div>
    </FormSection>
  );
};
