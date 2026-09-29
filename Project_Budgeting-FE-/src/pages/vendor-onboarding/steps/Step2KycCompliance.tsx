import React, { useEffect } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import { INCORPORATED_VENDOR_TYPES, vendorJurisdiction, type VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';

const SECTION_TITLE = 'text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300';

/** Step 2 - Tax & KYC. Fields switch between Indian (PAN / GSTIN / CIN) and overseas (VAT / EIN / Tax ID). */
export const Step2KycCompliance: React.FC = () => {
  const { register, watch, setValue, control, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const vendorType = watch('step1.vendor_type');
  const country = watch('step1.country');
  const taxResidence = watch('step2.country_of_tax_residence');
  const gstRegistered = watch('step1.gst_registered');
  const tan = watch('step2.tan');
  const e = errors.step2;

  useEffect(() => {
    setValue('step2.vendor_type', vendorType || '');
  }, [vendorType, setValue]);

  const indian = vendorJurisdiction(country, taxResidence) === 'Indian';
  const incorporated = INCORPORATED_VENDOR_TYPES.includes(vendorType);

  return (
    <div className="space-y-8">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {indian ? 'Indian vendor' : 'Overseas vendor'} &middot; based on the country entered in Intake
        {country ? ` (${country})` : ''}.
      </p>

      <section>
        <h3 className={SECTION_TITLE}>Tax Identification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField
            label={indian ? 'Country of Tax Residence' : 'Country of Tax Residence *'}
            {...register('step2.country_of_tax_residence')}
            error={e?.country_of_tax_residence?.message}
          />
          {indian ? (
            <InputField label="PAN *" {...register('step2.pan')} error={e?.pan?.message} placeholder="AAAAA9999A" />
          ) : (
            <InputField label="VAT / EIN / Tax ID *" {...register('step2.tax_id')} error={e?.tax_id?.message} />
          )}
        </div>
      </section>

      {indian && (
        <section className="border-t pt-6 dark:border-gray-800">
          <h3 className={SECTION_TITLE}>GST Registration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <Controller
              control={control}
              name="step1.gst_registered"
              render={({ field }) => (
                <SelectField
                  label="GST Registered?"
                  options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                  value={String(field.value)}
                  onChange={(ev) => field.onChange(ev.target.value === 'true')}
                />
              )}
            />
            {gstRegistered && (
              <InputField label="GSTIN *" {...register('step1.gstin')} error={errors.step1?.gstin?.message} placeholder="15-character GSTIN" />
            )}
          </div>
        </section>
      )}

      {(incorporated || !indian) && (
        <section className="border-t pt-6 dark:border-gray-800">
          <h3 className={SECTION_TITLE}>Corporate Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {indian && (
              <InputField label="CIN / LLPIN *" {...register('step2.cin')} error={e?.cin?.message} placeholder="Or enter it as the Registration Number in Intake" />
            )}
            <InputField
              label={indian && vendorType === 'company' ? 'Date of Incorporation *' : 'Date of Incorporation'}
              type="date"
              {...register('step2.incorporation_date')}
              error={e?.incorporation_date?.message}
            />
          </div>
        </section>
      )}

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Beneficial Ownership</h3>
        <textarea
          {...register('step2.beneficial_ownership_details')}
          rows={3}
          className={`w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all dark:bg-gray-800 dark:border dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500 dark:focus:bg-gray-800 ${
            e?.beneficial_ownership_details ? 'ring-2 ring-red-500' : ''
          }`}
          placeholder={indian ? 'Optional - owners holding 10% or more, where required' : 'Owners holding 10% or more (name, country, % held) - or upload a beneficial ownership document'}
        />
        {e?.beneficial_ownership_details && <p className="text-xs text-red-600 mt-1 dark:text-red-400">{e.beneficial_ownership_details.message}</p>}
      </section>

      {indian && (
        <>
          <section className="border-t pt-6 dark:border-gray-800">
            <h3 className={SECTION_TITLE}>TAN (if applicable)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <InputField label="TAN Number" {...register('step2.tan')} error={e?.tan?.message} />
              {tan && <InputField label="TAN Associated Mobile Number *" {...register('step2.tan_mobile')} error={e?.tan_mobile?.message} />}
            </div>
          </section>

          <section className="border-t pt-6 dark:border-gray-800">
            <h3 className={SECTION_TITLE}>EPF / ESIC (if applicable)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <InputField label="EPF Number" {...register('step2.epf_number')} />
              <InputField label="ESIC Number" {...register('step2.esic_number')} />
              <InputField label="ESIC District" {...register('step2.esic_district')} />
            </div>
            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
              If an EPF or ESIC number is provided, the corresponding certificate becomes a required document.
            </p>
          </section>
        </>
      )}
    </div>
  );
};
