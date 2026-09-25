import React, { useState } from 'react';
import { X, FileText } from 'lucide-react';
import { ApprovalTimeline } from './ApprovalTimeline';
import type { VendorApprovalHistoryEvent } from '../types/vendorOnboarding.types';

export interface ApprovalDrawerDocument {
  name: string;
  url?: string;
}

type ApprovalAction = 'approve' | 'reject' | 'request_changes';

interface ApprovalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  summary?: string;
  impact?: string;
  documents?: ApprovalDrawerDocument[];
  historyEvents: VendorApprovalHistoryEvent[];
  onApprove: (comments: string) => Promise<void>;
  /** Omit to hide the action entirely (e.g. no backend endpoint yet). */
  onRequestChanges?: (comments: string) => Promise<void>;
  /** Omit to hide the action entirely (e.g. no backend endpoint yet). */
  onReject?: (comments: string) => Promise<void>;
  /**
   * When `onReject` is omitted but this is set, Reject still renders — visibly disabled,
   * with this text as its tooltip — instead of disappearing (e.g. "Rejection isn't
   * supported by vendor onboarding yet"). Ignored when `onReject` is provided.
   */
  rejectDisabledReason?: string;
  /** Which actions require a non-empty comment before they can be submitted. */
  requireCommentFor?: ApprovalAction[];
}

/**
 * Reusable slide-in approval surface (enterprise-artifacts/UI_BUILD_HANDOFF.md's "ApprovalDrawer").
 * Built for the Dashboard's "Needs your decision" panel; reused by the Approval Workbench.
 */
export const ApprovalDrawer: React.FC<ApprovalDrawerProps> = ({
  isOpen,
  onClose,
  title,
  summary,
  impact,
  documents,
  historyEvents,
  onApprove,
  onRequestChanges,
  onReject,
  rejectDisabledReason,
  requireCommentFor = ['reject', 'request_changes'],
}) => {
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<ApprovalAction | null>(null);

  if (!isOpen) return null;

  const commentRequired = (action: ApprovalAction) => requireCommentFor.includes(action);
  const commentMissing = (action: ApprovalAction) => commentRequired(action) && !comment.trim();

  const run = async (action: ApprovalAction, handler?: (c: string) => Promise<void>) => {
    if (!handler || commentMissing(action)) return;
    setPending(action);
    try {
      await handler(comment);
      setComment('');
      onClose();
    } finally {
      setPending(null);
    }
  };

  const actionButtonClass =
    'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="approval-drawer-title">
      <div className="absolute inset-0 bg-navy-900/40 dark:bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col dark:bg-gray-900 dark:shadow-black/40">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Approval decision</p>
            <h2 id="approval-drawer-title" className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {summary && <p className="text-sm text-gray-600 dark:text-gray-400">{summary}</p>}

          {impact && (
            <div className="rounded-lg bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-teal-900 dark:bg-violet-500/10 dark:border-violet-900/40 dark:text-violet-300">{impact}</div>
          )}

          {documents && documents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-gray-400">Documents</p>
              <ul className="space-y-1.5">
                {documents.map((doc) => (
                  <li key={doc.name}>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-teal-700 hover:underline"
                      >
                        <FileText size={14} /> {doc.name}
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <FileText size={14} /> {doc.name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 dark:text-gray-400">Approval trail</p>
            <ApprovalTimeline events={historyEvents} />
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-5 space-y-3 dark:border-gray-800">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400" htmlFor="approval-drawer-comment">
            Comment {onReject || onRequestChanges ? '(required to reject or request changes)' : '(optional)'}
          </label>
          <textarea
            id="approval-drawer-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={`${actionButtonClass} text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800`}>
              Cancel
            </button>
            {onRequestChanges && (
              <button
                type="button"
                onClick={() => run('request_changes', onRequestChanges)}
                disabled={pending !== null || commentMissing('request_changes')}
                className={`${actionButtonClass} border border-amber-600 text-amber-700 hover:bg-amber-50 dark:border-amber-500/60 dark:text-amber-400 dark:hover:bg-amber-500/10`}
              >
                {pending === 'request_changes' ? 'Sending…' : 'Request changes'}
              </button>
            )}
            {onReject && (
              <button
                type="button"
                onClick={() => run('reject', onReject)}
                disabled={pending !== null || commentMissing('reject')}
                className={`${actionButtonClass} bg-risk-600 hover:bg-risk-700 text-white`}
              >
                {pending === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            )}
            {!onReject && rejectDisabledReason && (
              <button
                type="button"
                disabled
                title={rejectDisabledReason}
                className={`${actionButtonClass} bg-risk-50 text-risk-600 cursor-not-allowed dark:bg-red-500/10 dark:text-red-400`}
              >
                Reject
              </button>
            )}
            <button
              type="button"
              onClick={() => run('approve', onApprove)}
              disabled={pending !== null}
              className={`${actionButtonClass} bg-teal-800 hover:bg-teal-700 text-white`}
            >
              {pending === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
