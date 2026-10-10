import React, { useState } from 'react';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';

export interface RequestChangesModalProps<TPayload> {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: TPayload) => Promise<void>;
  sectionOptions: { value: string; label: string }[];
}

interface ApprovalActionBarProps<TPayload> {
  canAct: boolean;
  onApprove: (comments: string) => Promise<void>;
  onRequestChanges: (payload: TPayload) => Promise<void>;
  /** Each onboarding module passes its own section-picker modal here. */
  RequestChangesModal: React.ComponentType<RequestChangesModalProps<TPayload>>;
  sectionOptions: { value: string; label: string }[];
}

/**
 * Generalized approve/request-changes bar (enterprise-artifacts/UI_BUILD_HANDOFF.md Phase 4).
 * `ApprovalActionBar.tsx` and `EmployeeApprovalActionBar.tsx` were byte-identical apart from
 * their payload type and modal — both now re-export this, parameterized by `TPayload`.
 */
export function ApprovalActionBar<TPayload>({
  canAct,
  onApprove,
  onRequestChanges,
  RequestChangesModal,
  sectionOptions,
}: ApprovalActionBarProps<TPayload>) {
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
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border border-amber-600 text-amber-700 hover:bg-amber-50 transition-colors dark:text-amber-400 dark:hover:bg-amber-500/10"
      >
        <MessageSquareWarning className="w-4 h-4" />
        Request Changes
      </button>
      <button
        onClick={handleApprove}
        disabled={isApproving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-teal-800 hover:bg-teal-700 text-white shadow-sm transition-colors disabled:opacity-60"
      >
        <CheckCircle2 className="w-4 h-4" />
        {isApproving ? 'Approving...' : 'Approve'}
      </button>

      <RequestChangesModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmit={onRequestChanges}
        sectionOptions={sectionOptions}
      />
    </div>
  );
}
