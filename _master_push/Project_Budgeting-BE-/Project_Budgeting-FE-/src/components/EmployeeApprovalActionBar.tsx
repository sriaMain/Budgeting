import React from 'react';
import { ApprovalActionBar as SharedApprovalActionBar } from './shared/ApprovalActionBar';
import { EmployeeRequestChangesModal } from './EmployeeRequestChangesModal';
import type { Choice, EmployeeRequestChangesPayload } from '../types/employeeOnboarding.types';

interface EmployeeApprovalActionBarProps {
  canAct: boolean;
  onApprove: (comments: string) => Promise<void>;
  onRequestChanges: (payload: EmployeeRequestChangesPayload) => Promise<void>;
  sectionOptions: Choice[];
}

/** Thin wrapper over the shared, generic ApprovalActionBar — kept so existing call sites don't change. */
export const EmployeeApprovalActionBar: React.FC<EmployeeApprovalActionBarProps> = (props) => (
  <SharedApprovalActionBar<EmployeeRequestChangesPayload> RequestChangesModal={EmployeeRequestChangesModal} {...props} />
);
