import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { StatusBadge } from './StatusBadge';
import { RequestChangesDialog } from './RequestChangesDialog';
import {
  ONBOARDING_STEPS,
  clientTypeLabel,
  riskRatingLabel,
  riskRatingVariant,
  stepStatusLabel,
  stepStatusVariant,
  computeJurisdiction,
} from '../pages/ClientListPage';
import type { Client, ClientDocument, ClientChangeRequest, UserRole } from '../pages/ClientListPage';

interface ApprovalSummaryPanelProps {
  client: Client;
  documents: ClientDocument[];
  userRole: UserRole;
  onBack: () => void;
  /** Fires with the server's updated Company after a successful submit-for-approval call. */
  onApproved: (client: Client) => void;
  onChangeRequestCreated: (changeRequest: ClientChangeRequest) => void;
}

/** Matches ClientDetailsPage's own card/Field conventions exactly (same wrapper classes,
 * dark-mode variants, spacing) - duplicated locally rather than imported since ClientDetailsPage
 * doesn't export its local Field helper. */
const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-sm text-gray-900 font-medium dark:text-gray-100">{value || '-'}</p>
  </div>
);

/**
 * Final-approval recap, rendered inside ClientDetailsPage once a client is meaningfully
 * close to done (onboarding_step is 'commercials' or 'approved' - gated by the caller).
 * Shows a client info recap, the per-step checklist (from step_statuses), document
 * verification progress, the approval record once set, and the three terminal actions.
 */
export const ApprovalSummaryPanel: React.FC<ApprovalSummaryPanelProps> = ({
  client,
  documents,
  userRole,
  onBack,
  onApproved,
  onChangeRequestCreated,
}) => {
  const canApprove = userRole === 'admin' || userRole === 'manager';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalMissing, setApprovalMissing] = useState<string[] | null>(null);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  const jurisdiction = client.jurisdiction ?? computeJurisdiction(client.country);
  const verifiedCount = documents.filter((d) => d.status === 'verified').length;
  const blockers = client.approval_blockers ?? [];
  const isApproved = client.onboarding_step === 'approved';

  const handleApprove = async () => {
    setIsSubmitting(true);
    setApprovalMissing(null);
    try {
      const res = await axiosInstance.post(`/client/${client.id}/submit-for-approval/`, {});
      toast.success('Client approved and marked project-ready.');
      onApproved(res.data);
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { missing?: string[] } } })?.response;
      if (response?.status === 400 && Array.isArray(response.data?.missing)) {
        setApprovalMissing(response.data!.missing!);
      } else if (response?.status === 403) {
        toast.error("You don't have permission to approve this client.");
      } else {
        toast.error('Failed to submit client for approval.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-sm dark:text-white">Final Approval Summary</h3>
        {isApproved && <StatusBadge status="approved" variant="success" label="Approved" />}
      </div>

      {/* Client info recap */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4 border-b dark:border-gray-800">
        <Field label="Legal Name" value={client.company_name} />
        <Field label="Client Type" value={clientTypeLabel(client.client_type)} />
        <Field label="Country" value={client.country} />
        <Field label="Currency" value={client.currency} />
        <Field label="Tax ID" value={client.tax_id || client.gstin || client.pan} />
        <Field label="Billing Email" value={client.billing_email || client.email} />
      </div>

      {/* Per-step checklist */}
      <div className="pb-4 border-b dark:border-gray-800">
        <p className="text-xs text-gray-500 mb-2 dark:text-gray-400">Onboarding Checklist</p>
        <ul className="space-y-2">
          {ONBOARDING_STEPS.map((step) => {
            const status = client.step_statuses?.[step.value];
            const isCurrent = client.onboarding_step === step.value;
            return (
              <li key={step.value} className="flex items-center gap-2 text-sm">
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : status === 'requires_review' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <Circle className={`w-4 h-4 flex-shrink-0 ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-700'}`} />
                )}
                <span className={isCurrent ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}>
                  {step.label}
                </span>
                {status && <StatusBadge status={status} variant={stepStatusVariant(status)} label={stepStatusLabel(status)} className="ml-auto" />}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Risk + documents */}
      <div className="grid grid-cols-2 gap-4 pb-4 border-b dark:border-gray-800">
        <div>
          <p className="text-xs text-gray-500 mb-1 dark:text-gray-400">Risk Rating</p>
          <StatusBadge status={client.risk_rating} variant={riskRatingVariant(client.risk_rating)} label={riskRatingLabel(client.risk_rating)} />
        </div>
        <Field label="Documents Verified" value={`${verifiedCount} / ${documents.length}`} />
      </div>

      {/* Approval record, once set */}
      {isApproved && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4 border-b dark:border-gray-800">
          <Field label="Reviewed By" value={client.kyc_verified_by != null ? String(client.kyc_verified_by) : undefined} />
          <Field label="Review Date" value={client.kyc_verified_at ? new Date(client.kyc_verified_at).toLocaleString() : undefined} />
          <Field label="Approval Remarks" value={client.approval_remarks} />
        </div>
      )}

      {!isApproved && !canApprove && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Approving this client requires Admin or Manager permissions.</p>
      )}

      {approvalMissing && approvalMissing.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300">
          <p className="font-semibold mb-1">Cannot approve client. Missing:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {approvalMissing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Back
        </button>
        {canApprove && (
          <button
            type="button"
            onClick={() => setIsRequestChangesOpen(true)}
            className="px-6 py-2.5 rounded-lg border border-amber-300 text-amber-700 font-semibold hover:bg-amber-50 transition-colors dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            Request Changes
          </button>
        )}
        {canApprove && !isApproved && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting || blockers.length > 0}
            title={blockers.length > 0 ? `Missing: ${blockers.join(', ')}` : undefined}
            className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting…' : 'Approve & Mark Project Ready'}
          </button>
        )}
      </div>

      <RequestChangesDialog
        isOpen={isRequestChangesOpen}
        clientId={client.id}
        onClose={() => setIsRequestChangesOpen(false)}
        onCreated={onChangeRequestCreated}
      />
    </div>
  );
};
