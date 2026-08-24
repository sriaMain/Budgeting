import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { EmployeeChangeRequest } from '../../../types/employeeOnboarding.types';

interface EmployeeActionRequiredBannerProps {
  changeRequest: EmployeeChangeRequest;
}

export const EmployeeActionRequiredBanner: React.FC<EmployeeActionRequiredBannerProps> = ({ changeRequest }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-red-800 uppercase tracking-wide">Action Required</p>
        <p className="text-sm text-red-700 mt-1">
          Your onboarding information requires an update in <strong>{changeRequest.section_display}</strong>
          {changeRequest.field_name && <> &mdash; <strong>{changeRequest.field_name}</strong></>}.
        </p>
        {changeRequest.requested_by_name && (
          <p className="text-xs text-red-600 mt-2">Requested by: {changeRequest.requested_by_name}</p>
        )}
        <div className="mt-2 bg-white border border-red-100 rounded-md p-3">
          <p className="text-xs font-semibold text-red-800 mb-1">Required Update</p>
          <p className="text-sm text-red-900 whitespace-pre-wrap">{changeRequest.reason}</p>
        </div>
        {changeRequest.comments && (
          <div className="mt-2 bg-white border border-red-100 rounded-md p-3">
            <p className="text-xs font-semibold text-red-800 mb-1">Comments</p>
            <p className="text-sm text-red-900 whitespace-pre-wrap">{changeRequest.comments}</p>
          </div>
        )}
      </div>
    </div>
  </div>
);
