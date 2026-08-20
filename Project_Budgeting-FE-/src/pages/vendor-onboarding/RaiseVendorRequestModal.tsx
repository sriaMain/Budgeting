import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import * as api from '../../services/vendorOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { Choice, RaiseVendorRequestPayload } from '../../types/vendorOnboarding.types';
import type { FormErrors } from '../../types';

interface RaiseVendorRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRaised: () => void;
  vendorTypeOptions: Choice[];
}

const EMPTY: RaiseVendorRequestPayload = {
  name: '', email: '', phone: '', vendor_type: '', contact_person_name: '',
  company_code: '', plant: '', internal_requester: '', initial_comments: '',
};

export const RaiseVendorRequestModal: React.FC<RaiseVendorRequestModalProps> = ({ isOpen, onClose, onRaised, vendorTypeOptions }) => {
  const [values, setValues] = useState<RaiseVendorRequestPayload>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof RaiseVendorRequestPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
  };

  const handleClose = () => {
    setValues(EMPTY);
    setErrors({});
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const result = await api.raiseVendorRequest(values);
      toast.success(`Vendor request ${result.vendor_reference_no} raised — an invitation email has been sent.`);
      handleClose();
      onRaised();
    } catch (err) {
      const parsed = parseApiErrors(err);
      setErrors(parsed);
      toast.error(parsed.general || 'Failed to raise vendor request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Raise Vendor Request"
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="!w-auto px-6" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={isSubmitting}>
            Raise Request
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <p className="text-sm text-gray-500 mb-4">
          Send the vendor a secure link to complete their own onboarding. You only need to provide the basics -
          the vendor fills in everything else.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
          <InputField label="Vendor / Company Name *" value={values.name} onChange={set('name')} error={errors.name} />
          <SelectField
            label="Vendor Type *"
            options={vendorTypeOptions}
            placeholder="Select vendor type"
            value={values.vendor_type}
            onChange={set('vendor_type')}
            error={errors.vendor_type}
          />
          <InputField label="Vendor Email *" type="email" value={values.email} onChange={set('email')} error={errors.email} />
          <InputField label="Vendor Mobile *" value={values.phone} onChange={set('phone')} error={errors.phone} />
          <InputField label="Contact Person Name *" value={values.contact_person_name} onChange={set('contact_person_name')} error={errors.contact_person_name} />
        </div>

        <div className="border-t pt-4 mt-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Optional</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <InputField label="Company Code" value={values.company_code} onChange={set('company_code')} />
            <InputField label="Plant" value={values.plant} onChange={set('plant')} />
            <InputField label="Internal Requester" value={values.internal_requester} onChange={set('internal_requester')} />
          </div>
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">Initial Comments</label>
            <textarea
              value={values.initial_comments}
              onChange={set('initial_comments')}
              rows={3}
              className="w-full px-4 py-3 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
