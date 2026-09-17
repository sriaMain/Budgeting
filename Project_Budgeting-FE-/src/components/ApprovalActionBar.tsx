import React from 'react';
import { ApprovalActionBar as SharedApprovalActionBar } from './shared/ApprovalActionBar';
import { RequestInfoModal } from './RequestInfoModal';
import type { Choice, RequestChangesPayload } from '../types/vendorOnboarding.types';

interface ApprovalActionBarProps {
  canAct: boolean;
  onApprove: (comments: string) => Promise<void>;
  onRequestChanges: (payload: RequestChangesPayload) => Promise<void>;
  sectionOptions: Choice[];
}

/** Thin wrapper over the shared, generic ApprovalActionBar — kept so existing call sites don't change. */
export const ApprovalActionBar: React.FC<ApprovalActionBarProps> = (props) => (
  <SharedApprovalActionBar<RequestChangesPayload> RequestChangesModal={RequestInfoModal} {...props} />
);
