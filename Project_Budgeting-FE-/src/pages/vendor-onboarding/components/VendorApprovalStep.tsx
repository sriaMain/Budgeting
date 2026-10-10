import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, Mail, Loader2, ShieldCheck, MessageSquareWarning, Send, History } from 'lucide-react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { RequestInfoModal } from '../../../components/RequestInfoModal';
import { parseApiErrors } from '../../../utils/parseApiErrors';
import * as api from '../../../services/vendorOnboarding';
import type {
  Choice, VendorAuditLogEntry, VendorOnboardingDetail, VendorRequirementIssue, RequestChangesPayload,
} from '../../../types/vendorOnboarding.types';
import { VENDOR_ONBOARDING_STEPS } from './VendorOnboardingPanel';
import { vendorOnboarding } from './vendorDisplay';

interface Props {
  vendor: VendorOnboardingDetail;
  sectionOptions: Choice[];
  /** Saves any pending form edits, then resolves - called before submitting. */
  onBeforeSubmit: () => Promise<boolean>;
  onSendEmail: () => void;
  isSendingEmail: boolean;
  onChanged: (vendor: VendorOnboardingDetail) => void;
}

const UNDER_REVIEW = ['submitted', 'resubmitted', 'approval_in_progress'];

const IssueList: React.FC<{ title: string; issues: VendorRequirementIssue[]; tone: 'amber' | 'red' }> = ({ title, issues, tone }) => (
  <div className={`rounded-lg border p-3 ${tone === 'red'
    ? 'border-risk-600/40 bg-risk-50 dark:border-red-500/40 dark:bg-red-500/10'
    : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'}`}
  >
    <p className={`text-sm font-semibold mb-1 ${tone === 'red' ? 'text-risk-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>{title}</p>
    <ul className={`list-disc pl-5 text-sm space-y-0.5 ${tone === 'red' ? 'text-risk-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
      {issues.map((i) => (
        <li key={`${i.stage}-${i.key}`}>
          {i.message}
          <span className="text-xs opacity-75"> &middot; {VENDOR_ONBOARDING_STEPS.find((s) => s.key === i.step)?.title}</span>
        </li>
      ))}
    </ul>
  </div>
);

/** Step 5 - requirements check, submission, onboarding email, final approval and history. */
export const VendorApprovalStep: React.FC<Props> = ({ vendor, sectionOptions, onBeforeSubmit, onSendEmail, isSendingEmail, onChanged }) => {
  const [history, setHistory] = useState<VendorAuditLogEntry[] | null>(null);
  const [busy, setBusy] = useState<null | 'submit' | 'approve'>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [approveBlockers, setApproveBlockers] = useState<string[] | null>(null);

  const perms = vendor.permissions;
  const submissionIssues = vendor.onboarding?.submission_issues ?? [];
  const approvalIssues = vendor.onboarding?.approval_issues ?? [];
  const statuses = vendorOnboarding(vendor).step_statuses;
  const underReview = UNDER_REVIEW.includes(vendor.status);
  const canSubmit = perms?.submit && ['draft', 'action_required', 'invited'].includes(vendor.status);
  const approvalReady = submissionIssues.length === 0 && approvalIssues.length === 0;

  useEffect(() => {
    let cancelled = false;
    api.getAuditLogs(vendor.id).then((logs) => !cancelled && setHistory(logs)).catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [vendor.id, vendor.updated_at, vendor.status]);

  const handleSubmit = async () => {
    setBusy('submit');
    try {
      if (!(await onBeforeSubmit())) return;
      const updated = await api.submitForApproval(vendor.id);
      onChanged(updated);
      toast.success('Vendor submitted for review');
    } catch (err) {
      console.error('Submitting vendor failed', err);
      const errors = parseApiErrors(err);
      toast.error(errors.general || errors.detail || 'Submission failed - complete the items listed below.');
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    setBusy('approve');
    setApproveBlockers(null);
    try {
      const updated = await api.approveVendor(vendor.id, '');
      onChanged(updated);
      toast.success(updated.status === 'approved' ? 'Vendor approved' : 'Approval recorded - moved to the next approval level');
    } catch (err) {
      console.error('Approving vendor failed', err);
      const data = (err as { response?: { data?: { missing?: string[]; detail?: string } } })?.response?.data;
      if (Array.isArray(data?.missing)) setApproveBlockers(data!.missing!);
      else toast.error(data?.detail || 'Unable to approve this vendor.');
    } finally {
      setBusy(null);
      setConfirmApprove(false);
    }
  };

  const handleRequestChanges = async (payload: RequestChangesPayload) => {
    const updated = await api.requestVendorChanges(vendor.id, payload);
    onChanged(updated);
    toast.success('Changes requested - the vendor has been notified');
  };

  const email = vendor.email_status;

  return (
    <div className="space-y-6">
      {/* Step checklist */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 dark:text-gray-300">Onboarding Checklist</h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VENDOR_ONBOARDING_STEPS.filter((s) => s.key !== 'approved').map((s) => {
            const done = statuses?.[s.key] === 'completed';
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                {done ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <X className="w-4 h-4 text-gray-400" />}
                <span className={done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>{s.title} completed</span>
              </li>
            );
          })}
          {[
            ['Required KYC documents verified', !approvalIssues.some((i) => i.key.startsWith('document_') && i.step !== 'banking')],
            ['KYC verified / no blocking KYC issue', !approvalIssues.some((i) => i.key === 'kyc_status' || i.key === 'compliance_remarks')],
            ['Banking verification completed', !approvalIssues.some((i) => i.step === 'banking')],
            ['No open change requests', !approvalIssues.some((i) => i.key === 'change_requests')],
          ].map(([label, ok]) => (
            <li key={label as string} className="flex items-center gap-2 text-sm">
              {ok ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <X className="w-4 h-4 text-gray-400" />}
              <span className={ok ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>{label as string}</span>
            </li>
          ))}
        </ul>
      </section>

      {vendor.status === 'approved' ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
          Vendor approved - available for Projects, Purchase Orders, Vendor Bills and Payments.
        </div>
      ) : (
        <>
          {submissionIssues.length > 0 && <IssueList title="Required before submitting for review" issues={submissionIssues} tone="amber" />}
          {(approvalIssues.length > 0 || approveBlockers) && (
            <IssueList
              title="Vendor cannot be approved yet - missing:"
              issues={approveBlockers
                ? approveBlockers.map((m, i) => ({ key: `blocker-${i}`, message: m, step: 'approved' as const, stage: 'approval' as const, kind: 'invalid' as const }))
                : approvalIssues}
              tone="red"
            />
          )}
        </>
      )}

      {/* Onboarding email */}
      {vendor.status !== 'approved' && (
        <section className="rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 dark:border-gray-800">
          <div className="text-sm">
            <p className="font-semibold text-gray-900 dark:text-white">Onboarding email</p>
            <p className="text-gray-500 dark:text-gray-400">
              {email?.status === 'sent' && `Sent to ${email.recipient} on ${new Date(email.sent_at!).toLocaleString()}`}
              {email?.status === 'failed' && <span className="text-risk-700 dark:text-red-300">Failed to send to {email.recipient} - check the address and try again</span>}
              {(!email || email.status === 'not_sent') && (vendor.email ? `Not sent yet · will go to ${vendor.email}` : 'Add a contact email in Intake to send the secure onboarding link')}
            </p>
          </div>
          {perms?.send_email && (
            <button
              type="button"
              onClick={onSendEmail}
              disabled={isSendingEmail || !vendor.email}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 dark:border-violet-500 dark:text-violet-300 dark:hover:bg-violet-500/10"
            >
              {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {email?.status === 'sent' || email?.status === 'failed' ? 'Resend Email' : 'Send Onboarding Email'}
            </button>
          )}
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canSubmit && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!!busy || submissionIssues.length > 0}
            title={submissionIssues.length ? 'Complete the required items first' : undefined}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'submit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {vendor.status === 'action_required' ? 'Resubmit for Review' : 'Submit for Review'}
          </button>
        )}
        {underReview && perms?.request_changes && (
          <button
            type="button"
            onClick={() => setRequestChangesOpen(true)}
            disabled={!!busy}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-amber-600 text-amber-700 font-semibold hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            <MessageSquareWarning className="w-4 h-4" /> Request Changes
          </button>
        )}
        {underReview && perms?.approve && (
          <button
            type="button"
            onClick={() => setConfirmApprove(true)}
            disabled={!!busy || !approvalReady}
            title={approvalReady ? undefined : 'Resolve the missing items listed above first'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Approve Vendor
          </button>
        )}
        {underReview && !perms?.approve && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Submitted for review{vendor.current_approval_stage?.level_name ? ` · awaiting ${vendor.current_approval_stage.level_name}` : ''}.
          </p>
        )}
      </div>

      {/* History */}
      <section className="border-t pt-5 dark:border-gray-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 dark:text-gray-300">
          <History className="w-4 h-4" /> Onboarding History
        </h3>
        {history === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="text-sm border-l-2 border-gray-200 pl-3 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-gray-100">{h.action_display}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {h.performed_by_name || 'System'} &middot; {new Date(h.created_at).toLocaleString()}
                  {h.new_value && ` · ${h.new_value}`}
                </p>
                {h.remarks && <p className="text-xs italic text-gray-500 dark:text-gray-400">{h.remarks}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        isOpen={confirmApprove}
        onClose={() => (busy === 'approve' ? undefined : setConfirmApprove(false))}
        onConfirm={handleApprove}
        title="Approve vendor"
        message={<>Approve <strong>{vendor.name}</strong>? Once fully approved it becomes available for Projects, Purchase Orders, Vendor Bills and Payments.</>}
        confirmLabel="Approve Vendor"
      />
      <RequestInfoModal
        isOpen={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        onSubmit={handleRequestChanges}
        sectionOptions={sectionOptions}
      />
    </div>
  );
};
