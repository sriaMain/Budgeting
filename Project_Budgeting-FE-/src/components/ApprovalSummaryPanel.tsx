import { formatDateTime as toDMYTime } from '../utils/date';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { RequestChangesDialog } from './RequestChangesDialog';
import { approveClient, readClientApiError } from '../services/clientOnboarding';
import { slotStatus } from '../pages/client-onboarding/clientForm';
import { clientRecordPermissions, useClientPermissions } from '../pages/client-onboarding/useClientPermissions';
import {
  DOCUMENT_STATUS_LABELS,
  ONBOARDING_STEPS,
  clientTypeLabel,
  documentStatusVariant,
  kycStatusLabel,
  kycStatusVariant,
  riskRatingLabel,
  riskRatingVariant,
  stepStatusLabel,
  stepStatusVariant,
  type Client,
  type ClientChangeRequest,
  type ClientDocument,
  type UserRole,
} from '../pages/client-onboarding/clientTypes';

interface ApprovalSummaryPanelProps {
  client: Client;
  documents: ClientDocument[];
  userRole: UserRole;
  onBack: () => void;
  /** Fires with the server's updated client after a successful approval. */
  onApproved: (client: Client) => void;
  onChangeRequestCreated: (changeRequest: ClientChangeRequest) => void;
}

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-sm text-gray-900 font-medium break-words dark:text-gray-100">{value || '-'}</p>
  </div>
);

/**
 * Final-approval recap on the client details page: onboarding checklist, required documents and
 * their review status, the server's approval blockers, and the reviewer actions (approve /
 * request changes) for users holding those permissions.
 */
export const ApprovalSummaryPanel: React.FC<ApprovalSummaryPanelProps> = ({
  client,
  documents,
  userRole,
  onBack,
  onApproved,
  onChangeRequestCreated,
}) => {
  const { can } = useClientPermissions(userRole);
  const perms = clientRecordPermissions(can, client);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalMissing, setApprovalMissing] = useState<string[] | null>(null);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  const required = (client.required_documents ?? []).filter((s) => s.required);
  const verifiedCount = required.filter((s) => slotStatus(s, documents) === 'verified').length;
  const blockers = client.approval_blockers ?? [];
  const isApproved = !!client.is_project_ready;

  const handleApprove = async () => {
    setIsSubmitting(true);
    setApprovalMissing(null);
    try {
      const updated = await approveClient(client.id);
      toast.success('Client approved and marked project-ready.');
      onApproved(updated);
    } catch (err) {
      const apiError = readClientApiError(err, 'Failed to approve the client.');
      if (apiError.missing.length) setApprovalMissing(apiError.missing);
      else toast.error(apiError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-gray-900 text-sm dark:text-white">Final Approval Summary</h3>
        {isApproved ? (
          <StatusBadge status="approved" variant="success" label="Approved" />
        ) : (
          <StatusBadge status={client.kyc_status} variant={kycStatusVariant(client.kyc_status)} label={kycStatusLabel(client.kyc_status)} />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4 border-b dark:border-gray-800">
        <Field label="Legal Name" value={client.company_name} />
        <Field label="Client Type" value={clientTypeLabel(client.client_type)} />
        <Field label="Country" value={client.country} />
        <Field label="Currency" value={client.currency} />
        <Field label="Tax ID" value={client.jurisdiction === 'Overseas' ? client.tax_id : [client.pan, client.gstin].filter(Boolean).join(' · ')} />
        <Field label="Billing Email" value={client.billing_email} />
      </div>

      <div className="pb-4 border-b dark:border-gray-800">
        <p className="text-xs text-gray-500 mb-2 dark:text-gray-400">Onboarding Checklist</p>
        <ul className="space-y-2">
          {ONBOARDING_STEPS.map((step) => {
            const status = client.step_statuses?.[step.value];
            return (
              <li key={step.value} className="flex items-center gap-2 text-sm">
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : status === 'requires_review' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 flex-shrink-0 text-gray-300 dark:text-gray-700" />
                )}
                <span className="text-gray-600 dark:text-gray-300">{step.label}</span>
                {status && <StatusBadge status={status} variant={stepStatusVariant(status)} label={stepStatusLabel(status)} className="ml-auto" />}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pb-4 border-b dark:border-gray-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Required documents ({verifiedCount} of {required.length} verified)</p>
          <StatusBadge status={client.risk_rating} variant={riskRatingVariant(client.risk_rating)} label={`${riskRatingLabel(client.risk_rating)} risk`} />
        </div>
        <ul className="space-y-1.5">
          {required.map((slot) => {
            const status = slotStatus(slot, documents);
            return (
              <li key={slot.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{slot.reviewer_only ? `${slot.label} (reviewer)` : slot.label}</span>
                <StatusBadge status={status} variant={documentStatusVariant(status)} label={DOCUMENT_STATUS_LABELS[status]} />
              </li>
            );
          })}
        </ul>
      </div>

      {isApproved && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4 border-b dark:border-gray-800">
          <Field label="Approved On" value={client.kyc_verified_at ? toDMYTime(client.kyc_verified_at) : undefined} />
          <Field label="Approval Remarks" value={client.approval_remarks} />
        </div>
      )}

      {!isApproved && blockers.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300">
          <p className="font-semibold mb-1">Before approval:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {approvalMissing && approvalMissing.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300">
          <p className="font-semibold mb-1">The approval was refused:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {approvalMissing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {!isApproved && !perms.approve && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {can.approve ? 'The client must be submitted for approval first.' : 'Approving a client needs the client approval permission.'}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Back
        </button>
        {perms.request_changes && (
          <button
            type="button"
            onClick={() => setIsRequestChangesOpen(true)}
            className="px-6 py-2.5 rounded-lg border border-amber-300 text-amber-700 font-semibold hover:bg-amber-50 transition-colors dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            Request Changes
          </button>
        )}
        {perms.approve && !isApproved && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting || blockers.length > 0}
            title={blockers.length > 0 ? `Missing: ${blockers.join(', ')}` : undefined}
            className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Approving…' : 'Approve & Mark Project Ready'}
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
