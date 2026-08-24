import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { InputField } from '../../components/InputField';
import { SelectField } from '../../components/SelectField';
import * as api from '../../services/employeeOnboarding';
import { parseApiErrors } from '../../utils/parseApiErrors';
import type { Choice, EmployeeInvitePayload } from '../../types/employeeOnboarding.types';
import type { FormErrors } from '../../types';

interface ManagerOption {
  id: number | string;
  first_name?: string;
  last_name?: string;
}

interface SendEmployeeOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  accountId: number;
  employeeName: string;
  employmentTypeOptions: Choice[];
  managerOptions: ManagerOption[];
}

type InviteFormValues = Omit<EmployeeInvitePayload, 'reporting_manager'> & { reporting_manager: string };

const EMPTY: InviteFormValues = {
  employee_code: '', department: '', designation: '', reporting_manager: '',
  joining_date: '', employment_type: '', work_location: '', pf_applicable: false,
};

export const SendEmployeeOnboardingModal: React.FC<SendEmployeeOnboardingModalProps> = ({
  isOpen, onClose, onSent, accountId, employeeName, employmentTypeOptions, managerOptions,
}) => {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = field === 'pf_applicable' ? (e.target as HTMLInputElement).checked : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
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
      await api.sendOnboardingInvite(accountId, {
        ...values,
        reporting_manager: values.reporting_manager ? Number(values.reporting_manager) : null,
      });
      toast.success(`Onboarding invitation sent to ${employeeName}.`);
      handleClose();
      onSent();
    } catch (err) {
      const parsed = parseApiErrors(err);
      setErrors(parsed);
      toast.error(parsed.general || 'Failed to send onboarding invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  const managerChoices: Choice[] = managerOptions
    .filter((m) => String(m.id) !== String(accountId))
    .map((m) => ({ value: String(m.id), label: `${m.first_name || ''} ${m.last_name || ''}`.trim() || `User #${m.id}` }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Send Onboarding Invite"
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="!w-auto px-6" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button className="!w-auto px-6" onClick={handleSubmit} isLoading={isSubmitting}>
            Send Invite
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <p className="text-sm text-gray-500 mb-4">
          Enter {employeeName}'s employment details, then send a secure link so they can complete the rest of
          their onboarding themselves.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
          <InputField label="Employee ID *" value={values.employee_code} onChange={set('employee_code')} error={errors.employee_code} />
          <InputField label="Department *" value={values.department} onChange={set('department')} error={errors.department} />
          <InputField label="Designation *" value={values.designation} onChange={set('designation')} error={errors.designation} />
          <SelectField
            label="Reporting Manager *"
            options={managerChoices}
            placeholder="Select reporting manager"
            value={String(values.reporting_manager ?? '')}
            onChange={set('reporting_manager')}
            error={errors.reporting_manager}
          />
          <InputField label="Joining Date *" type="date" value={values.joining_date || ''} onChange={set('joining_date')} error={errors.joining_date} />
          <SelectField
            label="Employment Type *"
            options={employmentTypeOptions}
            placeholder="Select employment type"
            value={values.employment_type}
            onChange={set('employment_type')}
            error={errors.employment_type}
          />
          <InputField label="Work Location *" value={values.work_location} onChange={set('work_location')} error={errors.work_location} />
        </div>
        <label className="flex items-center gap-2 mt-2 mb-4 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!values.pf_applicable}
            onChange={set('pf_applicable')}
            className="rounded border-gray-300"
          />
          PF Applicable (makes UAN mandatory for the employee)
        </label>
      </div>
    </Modal>
  );
};
