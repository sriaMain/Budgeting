import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from './Modal';
import { SelectField } from './SelectField';
import { createChangeRequest, readClientApiError } from '../services/clientOnboarding';
import { CHANGE_REQUEST_SECTION_OPTIONS, type ChangeRequestSection, type ClientChangeRequest } from '../pages/client-onboarding/clientTypes';

interface RequestChangesDialogProps {
  isOpen: boolean;
  clientId: number;
  onClose: () => void;
  /** The client moves to "Changes requested" - callers should re-read it. */
  onCreated: (changeRequest: ClientChangeRequest) => void;
}

/**
 * Reviewer's "Request changes": files a change request against one section of the client. The
 * client moves to Changes Requested and returns to Draft once every open request is resolved.
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
      setError('Describe the changes that are needed.');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      const created = await createChangeRequest(clientId, {
        section,
        required_changes: requiredChanges.trim(),
        comments: comments.trim() || undefined,
      });
      toast.success('Changes requested - the client is back with the maker.');
      onCreated(created);
      resetAndClose();
    } catch (err) {
      const apiError = readClientApiError(err, 'Failed to submit the change request.');
      if (apiError.fields.required_changes) setError(apiError.fields.required_changes);
      toast.error(apiError.message);
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
            {isSaving ? 'Submitting…' : 'Request changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          id="change-request-section"
          label="Section *"
          options={CHANGE_REQUEST_SECTION_OPTIONS}
          value={section}
          onChange={(e) => setSection(e.target.value as ChangeRequestSection)}
        />
        <div>
          <label htmlFor="change-request-required" className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">
            Required changes <span className="text-red-500">*</span>
          </label>
          <textarea
            id="change-request-required"
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
          <label htmlFor="change-request-comments" className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">Comments (optional)</label>
          <textarea
            id="change-request-comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="Additional context for the team updating the client (optional)"
            className="w-full px-4 py-3 bg-input-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:bg-white dark:focus:bg-gray-800 dark:focus:ring-violet-500 transition-all"
          />
        </div>
      </div>
    </Modal>
  );
};
