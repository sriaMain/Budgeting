import React, { useState } from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red/destructive styling for the confirm button. Defaults to true (delete-style actions). */
  danger?: boolean;
}

/**
 * Generic confirm/cancel dialog built on the existing Modal, used in place of
 * window.confirm() where a proper accessible dialog (and an async confirm
 * action with a loading state) is needed.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isConfirming ? () => {} : onClose}
      title={title}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`px-5 py-2 rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white ${
              danger ? 'bg-risk-600 hover:bg-risk-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isConfirming ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {danger && (
          <div className="w-10 h-10 rounded-full bg-risk-50 text-risk-600 flex items-center justify-center flex-shrink-0 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={20} />
          </div>
        )}
        <div className="text-sm text-gray-600 dark:text-gray-300">{message}</div>
      </div>
    </Modal>
  );
};
