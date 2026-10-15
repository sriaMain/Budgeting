import { formatDateTime as toDMYTime } from '../../../utils/date';
import React, { useEffect, useState } from 'react';
import { Check, X, Mail, Loader2, ShieldCheck, MessageSquareWarning, History } from 'lucide-react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { RequestInfoModal } from '../../../components/RequestInfoModal';
import * as api from '../../../services/vendorOnboarding';
import type { VendorAuditLogEntry, VendorOnboardingChoices } from '../../../types/vendorOnboarding.types';
import type { VendorWizard } from './useVendorWizard';
import { UNDER_REVIEW_VENDOR_STATUSES, VENDOR_WIZARD_STEPS, wizardStepForServerStep } from './vendorSteps';

/** Admin part of Review & Submit: approval checklist, onboarding email, approve / request changes
 * (current approver only) and the audit history. */
export const VendorApprovalStep: React.FC<{ wiz: VendorWizard }> = ({ wiz }) => {
  const vendor = wiz.adminRecord;
  const [history, setHistory] = useState<VendorAuditLogEntry[] | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [approveBlockers, setApproveBlockers] = useState<string[] | null>(null);
  const vendorKey = vendor ? `${vendor.id}:${vendor.updated_at}:${vendor.status}` : '';

  useEffect(() => {
    if (!vendor) return;
    let cancelled = false;
    api.getAuditLogs(vendor.id)
      .then((logs) => { if (!cancelled) setHistory(logs); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => {
      cancelled = true;
    };
    // vendorKey changes whenever the record is saved / reviewed / moved through the workflow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorKey]);

  if (!vendor) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Save the vendor first - the approval checklist appears once it exists.</p>;
  }

  const perms = vendor.permissions;
  const approvalIssues = wiz.approvalIssues;
  const underReview = UNDER_REVIEW_VENDOR_STATUSES.includes(vendor.status);
  const approvalReady = wiz.submissionIssues.length === 0 && approvalIssues.length === 0;
  const email = vendor.email_status;
  const checklist: [string, boolean][] = [
    ['All onboarding steps complete', wiz.submissionIssues.length === 0],
    ['Required documents verified', !approvalIssues.some((i) => i.key.startsWith('document_'))],
    ['KYC verified (no blocking KYC issue)', !approvalIssues.some((i) => i.key === 'kyc_status' || i.key === 'compliance_remarks')],
    ['Bank account verified', !approvalIssues.some((i) => i.key === 'bank_verification_status')],
    ['No open change requests', !approvalIssues.some((i) => i.key === 'change_requests')],
  ];

  const approve = async () => {
    setApproveBlockers(null);
    const blockers = await wiz.approve('');
    if (blockers) setApproveBlockers(blockers);
    setConfirmApprove(false);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-white">Approval checklist</h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {checklist.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              {ok ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <X className="w-4 h-4 text-gray-400" />}
              <span className={ok ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
            </li>
          ))}
        </ul>
        {vendor.status === 'approved' ? (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
            Vendor approved - available for Projects, Purchase Orders, Vendor Bills and Payments.
          </p>
        ) : (approvalIssues.length > 0 || approveBlockers) && (
          <div className="mt-4 rounded-lg border border-risk-600/40 bg-risk-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
            <p className="text-sm font-semibold text-risk-700 mb-1 dark:text-red-300">Before final approval:</p>
            <ul className="list-disc pl-5 text-sm space-y-0.5 text-risk-700 dark:text-red-300">
              {(approveBlockers ?? approvalIssues.map((i) => i.message)).map((m, idx) => {
                const issue = approveBlockers ? undefined : approvalIssues[idx];
                const step = issue ? VENDOR_WIZARD_STEPS.find((s) => s.key === wizardStepForServerStep(issue.step)) : undefined;
                return (
                  <li key={`${m}-${idx}`}>
                    {m}
                    {step && step.key !== 'review' && (
                      <> · <button type="button" className="underline" onClick={() => wiz.goTo(step.key)}>{step.title}</button></>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {(underReview && (perms?.approve || perms?.request_changes)) && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            {perms?.request_changes && (
              <button
                type="button"
                onClick={() => setRequestChangesOpen(true)}
                disabled={!!wiz.busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-600 text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                <MessageSquareWarning className="w-4 h-4" /> Request changes
              </button>
            )}
            {perms?.approve && (
              <button
                type="button"
                onClick={() => setConfirmApprove(true)}
                disabled={!!wiz.busy || !approvalReady}
                title={approvalReady ? undefined : 'Resolve the items listed above first'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {wiz.busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Approve vendor
              </button>
            )}
          </div>
        )}
        {underReview && !perms?.approve && (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Submitted for review{vendor.current_approval_stage?.level_name ? ` · awaiting ${vendor.current_approval_stage.level_name}` : ''}.
          </p>
        )}
      </section>

      {vendor.status !== 'approved' && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="text-sm min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white">Vendor self-service link</p>
            <p className="text-gray-500 break-words dark:text-gray-400">
              {email?.status === 'sent' && `Sent to ${email.recipient} on ${toDMYTime(email.sent_at)}`}
              {email?.status === 'failed' && <span className="text-risk-700 dark:text-red-300">Failed to send to {email.recipient} - check the address and try again</span>}
              {(!email || email.status === 'not_sent') && (vendor.email ? `Not sent yet · will go to ${vendor.email}` : 'Add a contact email in Basic Information to send the secure onboarding link')}
            </p>
          </div>
          {perms?.send_email && (
            <button
              type="button"
              onClick={() => void wiz.sendInvite()}
              disabled={!!wiz.busy || !vendor.email}
              className="flex shrink-0 items-center justify-center gap-2 px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 dark:border-violet-500 dark:text-violet-300 dark:hover:bg-violet-500/10"
            >
              {wiz.busy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {email?.status === 'sent' || email?.status === 'failed' ? 'Resend link' : 'Email onboarding link'}
            </button>
          )}
        </section>
      )}

      <details className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
          <History className="w-4 h-4" /> Onboarding history
        </summary>
        <div className="px-4 pb-4">
          {history === null ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="text-sm border-l-2 border-gray-200 pl-3 dark:border-gray-700">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{h.action_display}</p>
                  <p className="text-xs text-gray-500 break-words dark:text-gray-400">
                    {h.performed_by_name || 'System'} &middot; {toDMYTime(h.created_at)}
                    {h.new_value && ` · ${h.new_value}`}
                  </p>
                  {h.remarks && <p className="text-xs italic text-gray-500 break-words dark:text-gray-400">{h.remarks}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>

      <ConfirmDialog
        isOpen={confirmApprove}
        onClose={() => (wiz.busy === 'approve' ? undefined : setConfirmApprove(false))}
        onConfirm={approve}
        title="Approve vendor"
        message={<>Approve <strong>{vendor.name}</strong>? Once fully approved it becomes available for Projects, Purchase Orders, Vendor Bills and Payments.</>}
        confirmLabel="Approve vendor"
        danger={false}
      />
      <RequestInfoModal
        isOpen={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        onSubmit={wiz.requestChanges}
        sectionOptions={(wiz.choices as VendorOnboardingChoices | null)?.change_request_sections ?? []}
      />
    </div>
  );
};
