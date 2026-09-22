import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { VendorChangeRequest } from '../../../types/vendorOnboarding.types';

interface ActionRequiredBannerProps {
  changeRequest: VendorChangeRequest;
}

export const ActionRequiredBanner: React.FC<ActionRequiredBannerProps> = ({ changeRequest }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-5 dark:bg-red-500/10 dark:border-red-500/30">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5 dark:text-red-400" />
      <div>
        <p className="text-sm font-bold text-red-800 uppercase tracking-wide dark:text-red-300">Action Required</p>
        <p className="text-sm text-red-700 mt-1 dark:text-red-400">
          Your vendor onboarding information requires changes in <strong>{changeRequest.section_display}</strong>.
        </p>
        {changeRequest.requested_by_name && (
          <p className="text-xs text-red-600 mt-2 dark:text-red-400">Requested by: {changeRequest.requested_by_name}</p>
        )}
        <div className="mt-2 bg-white border border-red-100 rounded-md p-3 dark:bg-gray-900 dark:border-red-500/20">
          <p className="text-xs font-semibold text-red-800 mb-1 dark:text-red-300">Required Changes</p>
          <p className="text-sm text-red-900 whitespace-pre-wrap dark:text-red-200">{changeRequest.required_changes}</p>
        </div>
        {changeRequest.comments && (
          <div className="mt-2 bg-white border border-red-100 rounded-md p-3 dark:bg-gray-900 dark:border-red-500/20">
            <p className="text-xs font-semibold text-red-800 mb-1 dark:text-red-300">Comments</p>
            <p className="text-sm text-red-900 whitespace-pre-wrap dark:text-red-200">{changeRequest.comments}</p>
          </div>
        )}
      </div>
    </div>
  </div>
);
