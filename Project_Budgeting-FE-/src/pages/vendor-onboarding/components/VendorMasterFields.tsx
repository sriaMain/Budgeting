import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { COMPACT_LABEL } from '../../../components/fieldDensity';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { VendorFinancials } from '../../../types/vendorOnboarding.types';
import { StarRating } from './StarRating';
import { formatAmount, fyLabel } from './vendorDisplay';

interface Props {
  /** From the vendor's committed POs / bills; null before the vendor exists. */
  financials: VendorFinancials | null | undefined;
  disabled?: boolean;
}

/** Internal vendor-master fields (admin views only): headcount, 1-5 star rating and the FY amount
 * spent that isn't recorded as vendor bills. The total FY spend adds the bill-based spend to it. */
export const VendorMasterFields: React.FC<Props> = ({ financials, disabled }) => {
  const { register, control, watch, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const fy = fyLabel(financials?.fy_start);
  // Recomputed from what's on screen so the total updates while typing, before saving.
  const manual = Number(watch('step1.manual_amount_spent') || 0);
  const billed = Number(financials?.billed_fy_spend ?? financials?.fy_spend ?? 0);

  return (
    <section className="border-t pt-6 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1 dark:text-gray-300">Vendor Summary</h3>
      <p className="text-xs text-gray-500 mb-4 dark:text-gray-400">Internal only - never shown to the vendor.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
        <InputField
          label="Headcount"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 4"
          disabled={disabled}
          {...register('step1.headcount')}
          error={errors.step1?.headcount?.message}
        />
        <div className="mb-5">
          <label className={COMPACT_LABEL}>Rating</label>
          <Controller
            control={control}
            name="step1.rating"
            render={({ field }) => (
              <div className="flex items-center gap-2 py-2">
                <StarRating value={field.value} onChange={field.onChange} disabled={disabled} />
                <span className="text-sm text-gray-600 dark:text-gray-300">{field.value ? `${field.value}/5` : 'Not rated'}</span>
              </div>
            )}
          />
        </div>
        <InputField
          label={`${fy} Amount Spent (₹)`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="e.g. 150000"
          disabled={disabled}
          {...register('step1.manual_amount_spent')}
          error={errors.step1?.manual_amount_spent?.message}
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
    </section>
  );
};
