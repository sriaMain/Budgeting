import React from 'react';
import { CheckCircle2, Send, MessageSquareWarning, RefreshCw, Mail } from 'lucide-react';
import type { VendorApprovalHistoryEvent } from '../types/vendorOnboarding.types';

const SECTION_LABELS: Record<string, string> = {
  vendor_details: 'Vendor Details',
  kyv_compliance: 'KYV / Compliance',
  bank_details: 'Bank Details',
  business_procurement: 'Business / Procurement',
  documents: 'Documents',
};

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  invited: { icon: Mail, color: 'text-purple-600 bg-purple-100 dark:bg-purple-500/15 dark:text-purple-300', label: 'Invited' },
  submitted: { icon: Send, color: 'text-blue-600 bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300', label: 'Submitted' },
  resubmitted: { icon: RefreshCw, color: 'text-blue-600 bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300', label: 'Resubmitted' },
  approved: { icon: CheckCircle2, color: 'text-green-600 bg-green-100 dark:bg-green-500/15 dark:text-green-300', label: 'Approved' },
  requested_changes: { icon: MessageSquareWarning, color: 'text-orange-600 bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300', label: 'Requested Changes' },
};

interface ApprovalTimelineProps {
  events: VendorApprovalHistoryEvent[];
}

export const ApprovalTimeline: React.FC<ApprovalTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No approval activity yet.</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const meta = ACTION_META[event.action] || ACTION_META.submitted;
        const Icon = meta.icon;
        const isLast = idx === events.length - 1;

        return (
          <div key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${meta.color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1 dark:bg-gray-700" />}
            </div>
            <div className="pb-6 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {meta.label}
                {event.level_order ? ` — Level ${event.level_order}` : ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                {event.actor_name || 'System'}{event.actor_role_snapshot ? ` (${event.actor_role_snapshot})` : ''} &middot;{' '}
                {new Date(event.created_at).toLocaleString()}
              </p>
              {event.comments && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap dark:text-gray-300">{event.comments}</p>}
              {event.required_changes && (
                <div className="mt-2 bg-orange-50 border border-orange-100 rounded-md p-3 dark:bg-orange-500/10 dark:border-orange-900/40">
                  <p className="text-xs font-semibold text-orange-800 mb-1 dark:text-orange-300">
                    Required Changes{event.section ? ` — ${SECTION_LABELS[event.section] || event.section}` : ''}
                  </p>
                  <p className="text-sm text-orange-900 whitespace-pre-wrap dark:text-orange-200">{event.required_changes}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
