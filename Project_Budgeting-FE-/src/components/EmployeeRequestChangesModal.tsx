import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { InputField } from './InputField';
import type { Choice, EmployeeChangeRequestSection, EmployeeRequestChangesPayload } from '../types/employeeOnboarding.types';

interface EmployeeRequestChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: EmployeeRequestChangesPayload) => Promise<void>;
  sectionOptions: Choice[];
}

export const EmployeeRequestChangesModal: React.FC<EmployeeRequestChangesModalProps> = ({ isOpen, onClose, onSubmit, sectionOptions }) => {
  const [section, setSection] = useState<EmployeeChangeRequestSection | ''>('');
  const [fieldName, setFieldName] = useState('');
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allFilled = section && reason.trim();

  const handleClose = () => {
    setSection('');
    setFieldName('');
    setReason('');
    setComments('');
    onClose();
  };

  const handleSend = async () => {
    if (!allFilled) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ section: section as EmployeeChangeRequestSection, field_name: fieldName, reason, comments });
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Request Changes"
      footer={
        <>
          <Button variant="secondary" className="!w-auto px-6" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button className="!w-auto px-6" onClick={handleSend} isLoading={isSubmitting} disabled={!allFilled}>
            Send Request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Section *"
          options={sectionOptions}
          placeholder="Select the section that needs changes"
          value={section}
          onChange={(e) => setSection(e.target.value as EmployeeChangeRequestSection)}
        />
        <InputField
          label="Field"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          placeholder="e.g. IFSC Code"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            placeholder="Be specific about what the employee needs to change"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
        </div>
      </div>
    </Modal>
  );
};
