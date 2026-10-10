import React, { useState } from 'react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { parseApiErrors } from '../utils/parseApiErrors';
import { Modal } from './Modal';
import { SelectField } from './SelectField';
import { CHANGE_REQUEST_SECTION_OPTIONS } from '../pages/ClientListPage';
import type { ChangeRequestSection, ClientChangeRequest } from '../pages/ClientListPage';

interface RequestChangesDialogProps {
  isOpen: boolean;
  clientId: number;
  onClose: () => void;
  onCreated: (changeRequest: ClientChangeRequest) => void;
}

/**
 * Small modal form (reuses the shared <Modal>, not <Drawer>) for filing a change request
 * against one of the 6 onboarding sections. Wired from both ApprovalSummaryPanel and
 * ClientDetailsPage's open-change-requests banner.
 */
export const RequestChangesDialog: React.FC<RequestChangesDialogProps> = ({ isOpen, clientId, onClose, onCreated }) => {
  const [section, setSection] = useState<ChangeRequestSection>('intake');
  const [requiredChanges, setRequiredChanges] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const resetAndClose = () => {
    setSection('intake');
    setRequiredChanges('');
    setComments('');
    setError(undefined);
    onClose();
  };

  const handleSubmit = async () => {
    if (!requiredChanges.trim()) {
      setError('Required changes is required.');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      const res = await axiosInstance.post(`/client/${clientId}/change-requests/`, {
        section,
        required_changes: requiredChanges.trim(),
        comments: comments.trim() || undefined,
      });
      toast.success('Change request submitted.');
      onCreated(res.data);
      resetAndClose();
    } catch (err) {
      const apiErrors = parseApiErrors(err);
      toast.error(apiErrors.general || 'Failed to submit change request.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : resetAndClose}
      title="Request Changes"
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Submitting…' : 'Submit Request'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Section *"
          options={CHANGE_REQUEST_SECTION_OPTIONS}
          value={section}
          onChange={(e) => setSection(e.target.value as ChangeRequestSection)}
        />
        <div>
          <label className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">
            Required Changes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={requiredChanges}
            onChange={(e) => setRequiredChanges(e.target.value)}
            rows={4}
            placeholder="Describe exactly what needs to change before this section can be approved"
            className={`w-full px-4 py-3 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all ${
              error ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/40' : ''
            }`}
          />
          {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div>
          <label className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">Comments (optional)</label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="Additional context for the client-facing team (optional)"
            className="w-full px-4 py-3 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all"
          />
        </div>
      </div>
    </Modal>
  );
};
