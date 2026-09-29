import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import type { VendorOnboardingFormValues } from '../../../schemas/vendorOnboarding.schemas';
import type { Choice } from '../../../types/vendorOnboarding.types';

interface Props {
  vendorTypeOptions: Choice[];
}

const SECTION_TITLE = 'text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300';

/** Step 1 - Intake. GST registration is edited on the Tax & KYC step (it's stored on the same profile). */
export const Step1VendorDetails: React.FC<Props> = ({ vendorTypeOptions }) => {
  const { register, watch, control, formState: { errors } } = useFormContext<VendorOnboardingFormValues>();
  const msmeRegistered = watch('step1.msme_registered');
  const e = errors.step1;

  return (
    <div className="space-y-8">
      <section>
        <h3 className={SECTION_TITLE}>Legal Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Legal Name *" {...register('step1.name')} error={e?.name?.message} placeholder="Registered legal entity name" />
          <SelectField
            label="Vendor Type *"
            options={vendorTypeOptions}
            placeholder="Select vendor type"
            {...register('step1.vendor_type')}
            error={e?.vendor_type?.message}
          />
          <InputField label="Service Category *" {...register('step1.service_category')} error={e?.service_category?.message} placeholder="e.g. QA & test engineering" />
          <InputField label="Country *" {...register('step1.country')} error={e?.country?.message} placeholder="e.g. India" />
          <InputField label="Registration Number" {...register('step1.registration_number')} error={e?.registration_number?.message} placeholder="Company / business registration no." />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Primary Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Contact Person *" {...register('step1.contact_person_name')} error={e?.contact_person_name?.message} />
          <InputField label="Designation" {...register('step1.contact_person_designation')} error={e?.contact_person_designation?.message} />
          <InputField label="Contact Email *" type="email" {...register('step1.email')} error={e?.email?.message} placeholder="onboarding@vendor.com" />
          <InputField label="Phone" {...register('step1.phone')} error={e?.phone?.message} />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Registered Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Registered Address *" {...register('step1.address_line1')} error={e?.address_line1?.message} />
          <InputField label="Address Line 2" {...register('step1.address_line2')} />
          <InputField label="City *" {...register('step1.city')} error={e?.city?.message} />
          <InputField label="State / Province" {...register('step1.state')} error={e?.state?.message} />
          <InputField label="District" {...register('step1.district')} />
          <InputField label="PIN / Postal Code" {...register('step1.pin_code')} error={e?.pin_code?.message} />
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>MSME Registration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Controller
            control={control}
            name="step1.msme_registered"
            render={({ field }) => (
              <SelectField
                label="MSME Registered?"
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                value={String(field.value)}
                onChange={(ev) => field.onChange(ev.target.value === 'true')}
              />
            )}
          />
          {msmeRegistered && (
            <>
              <InputField label="UDYAM Number *" {...register('step1.udyam_number')} error={e?.udyam_number?.message} />
              <SelectField
                label="MSME Category *"
                options={[{ value: 'micro', label: 'Micro' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }]}
                placeholder="Select category"
                {...register('step1.msme_category')}
                error={e?.msme_category?.message}
              />
            </>
          )}
        </div>
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Vendor Introduction / Description</h3>
        <textarea
          {...register('step1.vendor_introduction')}
          rows={3}
          className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all dark:bg-gray-800 dark:border dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500 dark:focus:bg-gray-800"
          placeholder="Optional introduction about this vendor"
        />
      </section>

      <section className="border-t pt-6 dark:border-gray-800">
        <h3 className={SECTION_TITLE}>Internal References &amp; Finance Contact (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Company Code" {...register('step1.company_code')} error={e?.company_code?.message} />
          <InputField label="Plant" {...register('step1.plant')} error={e?.plant?.message} />
          <InputField label="Finance Manager Name" {...register('step1.finance_manager_name')} />
          <InputField label="Finance Manager Email" type="email" {...register('step1.finance_manager_email')} />
          <InputField label="Finance Manager Mobile" {...register('step1.finance_manager_mobile')} />
        </div>
      </section>
    </div>
  );
};
