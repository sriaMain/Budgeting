import React, { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';

export const Step2KycCompliance: React.FC = () => {
  const { register, watch, setValue, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const vendorType = watch('step1.vendor_type');
  const tan = watch('step2.tan');

  useEffect(() => {
    setValue('step2.vendor_type', vendorType || '');
  }, [vendorType, setValue]);

  const isCompany = vendorType === 'company';

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Tax Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Country of Tax Residence *" {...register('step2.country_of_tax_residence')} error={errors.step2?.country_of_tax_residence?.message} />
          <InputField label="PAN Number *" {...register('step2.pan')} error={errors.step2?.pan?.message} placeholder="AAAAA9999A" />
        </div>
      </section>

      {isCompany && (
        <section className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Corporate Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <InputField label="CIN Number *" {...register('step2.cin')} error={errors.step2?.cin?.message} />
            <InputField label="Date of Incorporation *" type="date" {...register('step2.incorporation_date')} error={errors.step2?.incorporation_date?.message} />
          </div>
          <p className="text-xs text-gray-500 mt-1">Upload the CIN / Incorporation Certificate in the Documents step.</p>
        </section>
      )}

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">TAN (if applicable)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="TAN Number" {...register('step2.tan')} error={errors.step2?.tan?.message} />
          {tan && (
            <InputField label="TAN Associated Mobile Number *" {...register('step2.tan_mobile')} error={errors.step2?.tan_mobile?.message} />
          )}
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">EPF / ESIC (if applicable)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="EPF Number" {...register('step2.epf_number')} />
          <InputField label="ESIC Number" {...register('step2.esic_number')} />
          <InputField label="ESIC District" {...register('step2.esic_district')} />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          If an EPF or ESIC number is provided, the corresponding certificate becomes required in the Documents step.
        </p>
      </section>
    </div>
  );
};
