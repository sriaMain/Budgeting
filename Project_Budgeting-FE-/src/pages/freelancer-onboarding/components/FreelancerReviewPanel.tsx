import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Link2, Link2Off, Loader2, Mail, MessageSquareWarning, ShieldCheck, ShieldX } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import * as api from '../../../services/freelancerOnboarding';
import { parseApiErrors } from '../../../utils/parseApiErrors';
import type {
  BankVerificationPayload, FreelancerBankDetail, FreelancerDetail, OnboardingIssue, OnboardingStepKey,
} from '../../../types/freelancerOnboarding.types';
import { STEP_TITLES } from '../wizard/freelancerWizardModel';
import { kycVariant, linkStatusText } from './freelancerDisplay';

interface Props {
  detail: FreelancerDetail;
  bank: FreelancerBankDetail | null;
  onDetail: (detail: FreelancerDetail) => void;
  onBank: (bank: FreelancerBankDetail) => void;
  /** Jump to a wizard step (from an issue). */
  onGoToStep: (step: OnboardingStepKey) => void;
}

const SECTION_KEYS: OnboardingStepKey[] = ['basic', 'identity', 'address', 'banking', 'professional', 'documents'];
const BUTTON = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border disabled:opacity-50';

type Dialog =
  | { kind: 'approve' }
  | { kind: 'changes' }
  | { kind: 'reject'; target: 'bank' | 'pan' }
  | null;

const missingOf = (err: unknown): OnboardingIssue[] =>
  (err as { response?: { data?: { missing?: OnboardingIssue[] } } })?.response?.data?.missing || [];

/** Reviewer actions on the Review step - shown only for what the user's role allows. */
export const FreelancerReviewPanel: React.FC<Props> = ({ detail, bank, onDetail, onBank, onGoToStep }) => {
  const perms = detail.permissions;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [remarks, setRemarks] = useState('');
  const [sections, setSections] = useState<OnboardingStepKey[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<OnboardingIssue[] | null>(null);

  const issues = detail.status === 'completed' ? detail.approval_issues : detail.submission_issues;
  const close = () => {
    setDialog(null);
    setRemarks('');
    setSections([]);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      const missing = missingOf(err);
      if (missing.length) setBlocking(missing);
      toast.error(parseApiErrors(err).general || 'The action failed - please try again.');
    } finally {
      setBusy(null);
    }
  };

  const verifyPayout = (payload: BankVerificationPayload) =>
    run(`${payload.target}-${payload.status}`, async () => {
      onBank(await api.verifyBankDetail(detail.id, payload));
      onDetail(await api.getFreelancer(detail.id));
      toast.success(payload.status === 'verified' ? 'Marked verified' : payload.status === 'rejected' ? 'Marked rejected' : 'Updated');
      close();
    });

  const link = detail.access_link;
  const canResend = ['draft', 'invited', 'onboarding', 'changes_requested'].includes(detail.status);

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5 space-y-4 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reviewer</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {detail.status === 'completed' ? 'Submitted - verify the documents and payout details, then approve or request changes.'
              : detail.status === 'changes_requested' ? 'Waiting for the freelancer to make the requested changes.'
              : ['active', 'available', 'assigned', 'on_hold', 'inactive'].includes(detail.status) ? 'Onboarding approved.'
              : 'Onboarding in progress - not submitted yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} label={detail.status_display} />
          <StatusBadge status={detail.kyc_status} variant={kycVariant(detail.kyc_status)} label={`KYC: ${detail.kyc_status_display}`} />
        </div>
      </div>

      {detail.review_remarks && (
        <div className="text-xs text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Last review{detail.reviewed_by_name ? ` by ${detail.reviewed_by_name}` : ''}{detail.reviewed_at ? ` on ${new Date(detail.reviewed_at).toLocaleDateString()}` : ''}:</span> {detail.review_remarks}
        </div>
      )}

      {/* What still blocks submission / approval */}
      {issues.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {detail.status === 'completed' ? 'Before approval' : 'Before submission'} ({issues.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {issues.slice(0, 12).map((i) => (
              <li key={`${i.step}-${i.key}-${i.message}`} className="text-xs text-amber-800 dark:text-amber-300">
                • <button type="button" className="underline-offset-2 hover:underline" onClick={() => onGoToStep(i.step)}>{STEP_TITLES[i.step]}</button>: {i.message}
              </li>
            ))}
            {issues.length > 12 && <li className="text-xs text-amber-700">…and {issues.length - 12} more</li>}
          </ul>
        </div>
      ) : (
        detail.status === 'completed' && (
          <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Everything required for approval is verified.</p>
        )
      )}

      {/* Payout / PAN verification */}
      {perms.verify && bank && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bank.payment_method && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Payout details</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Status: {bank.payment_status.replace(/_/g, ' ')}{bank.verified_by_name ? ` · ${bank.verified_by_name}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {bank.payment_status !== 'verified' && (
                  <button type="button" disabled={!!busy} onClick={() => void verifyPayout({ target: 'bank', status: 'verified' })} className={`${BUTTON} border-green-300 text-green-700 hover:bg-green-50 dark:border-green-500/40 dark:text-green-300`}>
                    {busy === 'bank-verified' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Verify
                  </button>
                )}
                {bank.payment_status !== 'rejected' && (
                  <button type="button" disabled={!!busy} onClick={() => setDialog({ kind: 'reject', target: 'bank' })} className={`${BUTTON} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300`}>
                    <ShieldX className="w-3.5 h-3.5" /> Reject
                  </button>
                )}
              </div>
            </div>
          )}
          {bank.has_tax_number && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{bank.tax_label || 'Tax ID'} <span className="font-mono font-normal">{bank.tax_number_masked}</span></p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Status: {bank.pan_verification_status}</p>
              <div className="flex flex-wrap gap-2">
                {bank.pan_verification_status !== 'verified' && (
                  <button type="button" disabled={!!busy} onClick={() => void verifyPayout({ target: 'pan', status: 'verified' })} className={`${BUTTON} border-green-300 text-green-700 hover:bg-green-50 dark:border-green-500/40 dark:text-green-300`}>
                    {busy === 'pan-verified' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Verify
                  </button>
                )}
                {bank.pan_verification_status !== 'rejected' && (
                  <button type="button" disabled={!!busy} onClick={() => setDialog({ kind: 'reject', target: 'pan' })} className={`${BUTTON} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300`}>
                    <ShieldX className="w-3.5 h-3.5" /> Reject
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Decision + link */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {perms.approve && (
          <button
            type="button"
            disabled={!!busy || detail.approval_issues.length > 0}
            title={detail.approval_issues.length ? 'Resolve the items above first' : undefined}
            onClick={() => setDialog({ kind: 'approve' })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve
          </button>
        )}
        {perms.request_changes && (
          <button type="button" disabled={!!busy} onClick={() => setDialog({ kind: 'changes' })} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/50 dark:text-amber-300 dark:hover:bg-amber-500/10">
            <MessageSquareWarning className="w-4 h-4" /> Request changes
          </button>
        )}
        {perms.manage_link && (
          <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Link2 className="w-3.5 h-3.5" /> {linkStatusText(link)}
            {canResend && (
              <button
                type="button"
                disabled={!!busy || !detail.email}
                onClick={() => void run('resend', async () => {
                  const res = await api.resendInvite(detail.id);
                  onDetail(res.freelancer);
                  toast.success(res.detail);
                })}
                className={`${BUTTON} border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-violet-500/40 dark:text-violet-300`}
              >
                {busy === 'resend' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} {link.status === 'none' ? 'Send link' : 'Resend link'}
              </button>
            )}
            {link.status === 'active' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run('revoke', async () => {
                  onDetail(await api.revokeLink(detail.id));
                  toast.success('Link revoked');
                })}
                className={`${BUTTON} border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300`}
              >
                <Link2Off className="w-3.5 h-3.5" /> Revoke link
              </button>
            )}
          </span>
        )}
      </div>

      {blocking && blocking.length > 0 && (
        <div className="text-xs text-red-700 dark:text-red-300">
          <p className="font-semibold">The server reported:</p>
          <ul>{blocking.map((i) => <li key={`${i.key}-${i.message}`}>• {STEP_TITLES[i.step]}: {i.message}</li>)}</ul>
        </div>
      )}

      <Modal
        isOpen={dialog !== null}
        onClose={busy ? () => undefined : close}
        title={dialog?.kind === 'approve' ? 'Approve onboarding' : dialog?.kind === 'changes' ? 'Request changes' : dialog?.kind === 'reject' ? `Reject ${dialog.target === 'pan' ? 'tax ID' : 'payout details'}` : ''}
        footer={
          <>
            <button type="button" onClick={close} disabled={!!busy} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Cancel</button>
            <button
              type="button"
              disabled={!!busy || ((dialog?.kind === 'changes' || dialog?.kind === 'reject') && !remarks.trim())}
              onClick={() => {
                if (dialog?.kind === 'approve') {
                  void run('approve', async () => {
                    onDetail(await api.approveFreelancer(detail.id, remarks.trim()));
                    toast.success('Onboarding approved - the freelancer is now active');
                    close();
                  });
                } else if (dialog?.kind === 'changes') {
                  void run('changes', async () => {
                    onDetail(await api.requestFreelancerChanges(detail.id, { remarks: remarks.trim(), sections }));
                    toast.success('Changes requested - the freelancer has been emailed');
                    close();
                  });
                } else if (dialog?.kind === 'reject') {
                  void verifyPayout({ target: dialog.target, status: 'rejected', remarks: remarks.trim() });
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {dialog?.kind === 'approve' ? 'Approve' : dialog?.kind === 'changes' ? 'Send to freelancer' : 'Reject'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {dialog?.kind === 'approve' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">The freelancer becomes active and their onboarding link is closed. They receive a confirmation email.</p>
          )}
          {dialog?.kind === 'changes' && (
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 dark:text-gray-400">Sections to revisit</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {SECTION_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={sections.includes(key)}
                      onChange={(e) => setSections((s) => (e.target.checked ? [...s, key] : s.filter((x) => x !== key)))}
                      className="rounded border-gray-300"
                    />
                    {STEP_TITLES[key]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {dialog?.kind === 'approve' ? 'Remarks (optional)' : dialog?.kind === 'changes' ? 'What needs to change *' : 'Reason *'}
            </span>
            <textarea
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={dialog?.kind === 'changes' ? 'Shown to the freelancer, e.g. "Upload a clearer copy of your PAN card."' : ''}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </label>
        </div>
      </Modal>
    </section>
  );
};
