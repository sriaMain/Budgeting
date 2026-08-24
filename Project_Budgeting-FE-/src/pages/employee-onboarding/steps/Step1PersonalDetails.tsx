import React from 'react';
import { useFormContext } from 'react-hook-form';
import { InputField } from '../../../components/InputField';
import { SelectField } from '../../../components/SelectField';
import type { EmployeeOnboardingFormValues } from '../../../schemas/employeeOnboarding.schemas';
import type { Choice } from '../../../types/employeeOnboarding.types';

interface Props {
  genderOptions: Choice[];
  /** When true, first/last name are shown read-only (from the Account
   * record) instead of editable inputs - used by the admin "fill onboarding"
   * wizard, since there's no admin identity-PATCH endpoint here: the name is
   * already set at account-creation time and should be edited via Manage
   * Users instead, not silently diverge from the account record. */
  identityReadOnly?: { firstName: string; lastName: string };
}

export const Step1PersonalDetails: React.FC<Props> = ({ genderOptions, identityReadOnly }) => {
  const { register, formState: { errors } } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Name</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
          {identityReadOnly ? (
            <>
              <div>
                <p className="block text-base font-medium text-gray-900 mb-2">First Name</p>
                <p className="px-4 py-3.5 bg-gray-50 rounded-lg text-gray-700 text-sm">{identityReadOnly.firstName || '-'}</p>
              </div>
              <InputField label="Middle Name" {...register('step1.middle_name')} />
              <div>
                <p className="block text-base font-medium text-gray-900 mb-2">Last Name</p>
                <p className="px-4 py-3.5 bg-gray-50 rounded-lg text-gray-700 text-sm">{identityReadOnly.lastName || '-'}</p>
              </div>
            </>
          ) : (
            <>
              <InputField label="First Name *" {...register('step1.first_name')} error={errors.step1?.first_name?.message} />
              <InputField label="Middle Name" {...register('step1.middle_name')} />
              <InputField label="Last Name *" {...register('step1.last_name')} error={errors.step1?.last_name?.message} />
            </>
          )}
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Personal Email *" type="email" {...register('step1.personal_email')} error={errors.step1?.personal_email?.message} />
          <InputField label="Alternate Email" type="email" {...register('step1.alternate_email')} />
          <InputField label="Mobile Number *" {...register('step1.mobile_number')} error={errors.step1?.mobile_number?.message} />
          <InputField label="Alternate Mobile" {...register('step1.alternate_mobile')} />
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InputField label="Date of Birth *" type="date" {...register('step1.date_of_birth')} error={errors.step1?.date_of_birth?.message} />
          <SelectField
            label="Gender *"
            options={genderOptions}
            placeholder="Select gender"
            {...register('step1.gender')}
            error={errors.step1?.gender?.message}
          />
          <InputField label="Marital Status" {...register('step1.marital_status')} />
          <InputField label="Blood Group" {...register('step1.blood_group')} />
          <InputField label="Nationality" {...register('step1.nationality')} />
        </div>
      </section>
    </div>
  );
};
