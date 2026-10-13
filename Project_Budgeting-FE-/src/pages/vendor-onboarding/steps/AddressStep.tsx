import React from 'react';
import { AddressFields } from '../../../components/onboarding/AddressFields';
import type { AddressErrors } from '../../../components/onboarding/addressForm';
import { FormSection } from '../../../components/onboarding/OnboardingWizard';
import type { VendorWizard } from '../components/useVendorWizard';

/** Step 3 - registered address; labels, postal format and lookup follow the vendor's country. */
export const AddressStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const { values, errors, patch, editable, indian } = wiz;
  const addressErrors: AddressErrors = {};
  Object.entries(errors).forEach(([path, message]) => {
    if (path.startsWith('address.')) addressErrors[path.slice('address.'.length) as keyof AddressErrors] = message;
  });
  return (
    <fieldset disabled={!editable} className="min-w-0">
      <FormSection
        title="Registered address"
        description={values.basic.country
          ? <>Address in <strong>{values.basic.country}</strong>. <button type="button" className="underline" onClick={() => wiz.goTo('basic')}>Change the country</button> in Basic Information.</>
          : <>Choose the vendor's country in <button type="button" className="underline" onClick={() => wiz.goTo('basic')}>Basic Information</button> first - it sets the postal-code format.</>}
      >
        <AddressFields
          idPrefix="vw-address"
          value={values.address}
          onChange={(change) => patch('address', change)}
          country={values.basic.country}
          errors={addressErrors}
          required
          showDistrict={indian}
          showLandmark
          line1Label="Address line 1 (building, street)"
        />
      </FormSection>
    </fieldset>
  );
};
