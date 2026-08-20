import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { Choice } from '../../../types/vendorOnboarding.types';

interface Props {
  vendorTypeOptions: Choice[];
}

export const Step1VendorDetails: React.FC<Props> = ({ vendorTypeOptions }) => {
  const { register, watch, control, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const gstRegistered = watch('step1.gst_registered');
  const msmeRegistered = watch('step1.msme_registered');

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Basic Vendor Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Vendor Legal Name *" {...register('step1.name')} error={errors.step1?.name?.message} />
          <SelectField
            label="Vendor Type *"
            options={vendorTypeOptions}
            placeholder="Select vendor type"
            {...register('step1.vendor_type')}
            error={errors.step1?.vendor_type?.message}
          />
          <InputField label="Company Code *" {...register('step1.company_code')} error={errors.step1?.company_code?.message} />
          <InputField label="Plant *" {...register('step1.plant')} error={errors.step1?.plant?.message} />
          <InputField label="Primary Email *" type="email" {...register('step1.email')} error={errors.step1?.email?.message} />
          <InputField label="Primary Mobile *" {...register('step1.phone')} error={errors.step1?.phone?.message} />
          <InputField label="Contact Person Name *" {...register('step1.contact_person_name')} error={errors.step1?.contact_person_name?.message} />
          <InputField label="Contact Person Designation *" {...register('step1.contact_person_designation')} error={errors.step1?.contact_person_designation?.message} />
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">GST Registration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Controller
            control={control}
            name="step1.gst_registered"
            render={({ field }) => (
              <SelectField
                label="GST Registered? *"
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                value={String(field.value)}
                onChange={(e) => field.onChange(e.target.value === 'true')}
              />
            )}
          />
          {gstRegistered && (
            <InputField label="GSTIN *" {...register('step1.gstin')} error={errors.step1?.gstin?.message} placeholder="15-character GSTIN" />
          )}
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">MSME Registration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Controller
            control={control}
            name="step1.msme_registered"
            render={({ field }) => (
              <SelectField
                label="MSME Registered? *"
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                value={String(field.value)}
                onChange={(e) => field.onChange(e.target.value === 'true')}
              />
            )}
          />
          {msmeRegistered && (
            <>
              <InputField label="UDYAM Number *" {...register('step1.udyam_number')} error={errors.step1?.udyam_number?.message} />
              <SelectField
                label="MSME Category *"
                options={[{ value: 'micro', label: 'Micro' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }]}
                placeholder="Select category"
                {...register('step1.msme_category')}
                error={errors.step1?.msme_category?.message}
              />
            </>
          )}
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Registered Office Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Address Line 1 *" {...register('step1.address_line1')} error={errors.step1?.address_line1?.message} />
          <InputField label="Address Line 2" {...register('step1.address_line2')} />
          <InputField label="City *" {...register('step1.city')} error={errors.step1?.city?.message} />
          <InputField label="District" {...register('step1.district')} />
          <InputField label="State / Province *" {...register('step1.state')} error={errors.step1?.state?.message} />
          <InputField label="Country *" {...register('step1.country')} error={errors.step1?.country?.message} />
          <InputField label="PIN / Postal Code *" {...register('step1.pin_code')} error={errors.step1?.pin_code?.message} />
          <InputField label="Landmark" {...register('step1.landmark')} />
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Vendor Introduction</h3>
        <textarea
          {...register('step1.vendor_introduction')}
          rows={4}
          className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all"
          placeholder="Optional introduction about this vendor"
        />
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Finance Manager Details (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Finance Manager Name" {...register('step1.finance_manager_name')} />
          <InputField label="Finance Manager Email" type="email" {...register('step1.finance_manager_email')} />
          <InputField label="Finance Manager Mobile" {...register('step1.finance_manager_mobile')} />
        </div>
      </section>
    </div>
  );
};
