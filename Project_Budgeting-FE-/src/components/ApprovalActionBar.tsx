import React, { useState } from 'react';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import { RequestInfoModal } from './RequestInfoModal';
import type { Choice, RequestChangesPayload } from '../types/vendorOnboarding.types';

interface ApprovalActionBarProps {
  canAct: boolean;
  onApprove: (comments: string) => Promise<void>;
  onRequestChanges: (payload: RequestChangesPayload) => Promise<void>;
  sectionOptions: Choice[];
}

export const ApprovalActionBar: React.FC<ApprovalActionBarProps> = ({ canAct, onApprove, onRequestChanges, sectionOptions }) => {
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

      <RequestInfoModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmit={onRequestChanges}
        sectionOptions={sectionOptions}
      />
    </div>
  );
};
