import React, { useState } from 'react';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import { EmployeeRequestChangesModal } from './EmployeeRequestChangesModal';
import type { Choice, EmployeeRequestChangesPayload } from '../types/employeeOnboarding.types';

interface EmployeeApprovalActionBarProps {
  canAct: boolean;
  onApprove: (comments: string) => Promise<void>;
  onRequestChanges: (payload: EmployeeRequestChangesPayload) => Promise<void>;
  sectionOptions: Choice[];
}

export const EmployeeApprovalActionBar: React.FC<EmployeeApprovalActionBarProps> = ({ canAct, onApprove, onRequestChanges, sectionOptions }) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  if (!canAct) return null;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove('');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsRequestModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors"
      >
        <MessageSquareWarning className="w-4 h-4" />
        Request Changes
      </button>
      <button
        onClick={handleApprove}
        disabled={isApproving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors disabled:opacity-60"
      >
        <CheckCircle2 className="w-4 h-4" />
        {isApproving ? 'Approving...' : 'Approve'}
      </button>

      <EmployeeRequestChangesModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmit={onRequestChanges}
        sectionOptions={sectionOptions}
      />
    </div>
  );
};
