import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link2, Loader2 } from 'lucide-react';
import { WizardFooter, WizardProgress } from '../../../components/onboarding/OnboardingWizard';
import { StatusBadge } from '../../../components/StatusBadge';
import { Tabs, type TabItem } from '../../../components/Tabs';
import * as api from '../../../services/freelancerOnboarding';
import type {
  FreelancerBankDetail, FreelancerChoices, FreelancerDetail, FreelancerDocument, FreelancerPermissions,
} from '../../../types/freelancerOnboarding.types';
import { useFreelancerWizard, type FreelancerWizardAdapter } from '../wizard/useFreelancerWizard';
import { FreelancerWizardBody, WizardStatusLine } from '../wizard/FreelancerWizardSteps';
import type { FreelancerRecord, WizardStepKey } from '../wizard/freelancerWizardModel';
import { FreelancerReviewPanel } from './FreelancerReviewPanel';
import { kycVariant, linkStatusText, statusVariant } from './freelancerDisplay';
import { FreelancerEquipmentTab } from '../FreelancerEquipmentTab';
import { FreelancerRateCardsTab } from '../FreelancerRateCardsTab';
import { FreelancerContractsTab } from '../FreelancerContractsTab';
import { FreelancerProjectAssignmentsTab } from '../FreelancerProjectAssignmentsTab';
import { FreelancerTasksTab } from '../FreelancerTasksTab';
import { FreelancerActivityTab } from '../FreelancerActivityTab';

export interface WorkspaceParts {
  title: string;
  subtitle: string;
  header: React.ReactNode;
  body: React.ReactNode;
  footer: React.ReactNode;
}

interface Props {
  /** Existing freelancer, or null to onboard a new one. */
  freelancerId: number | null;
  initialStep?: WizardStepKey;
  choices: FreelancerChoices | null;
  onSaved?: (freelancer: FreelancerDetail) => void;
  /** First save of a new freelancer. */
  onCreated?: (freelancer: FreelancerDetail) => void;
  onClose?: () => void;
  /** Lays the parts out (Drawer with a footer slot, or a full page). */
  children: (parts: WorkspaceParts) => React.ReactNode;
}

// A new record has no permissions payload yet - the server still enforces every call.
const NEW_RECORD_PERMISSIONS: FreelancerPermissions = {
  edit: true, submit: true, approve: false, request_changes: false, verify: false, manage_link: false,
  view_bank: true, edit_bank: true, view_unmasked_bank: false, view_pan_unmasked: false, view_unmasked_id: false,
  view_documents: true, upload_documents: true, delete_documents: true,
};

interface Loaded {
  detail: FreelancerDetail | null;
  bank: FreelancerBankDetail | null;
  documents: FreelancerDocument[];
}

const TOP_ID = 'freelancer-workspace-top';

/** Admin onboarding workspace: the 7-step wizard (with reviewer actions on Review) plus the
 * operational tabs (equipment, rate cards, contracts, projects, tasks, activity). */
export const FreelancerWorkspace: React.FC<Props> = (props) => {
  const { freelancerId, children } = props;
  const [loaded, setLoaded] = useState<Loaded | null>(freelancerId ? null : { detail: null, bank: null, documents: [] });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!freelancerId) return;
    let alive = true;
    (async () => {
      try {
        const detail = await api.getFreelancer(freelancerId);
        const [bank, documents] = await Promise.all([
          detail.permissions.view_bank ? api.getBankDetail(freelancerId).catch(() => null) : Promise.resolve(null),
          detail.permissions.view_documents ? api.listDocuments(freelancerId).catch(() => [] as FreelancerDocument[]) : Promise.resolve([] as FreelancerDocument[]),
        ]);
        if (alive) setLoaded({ detail, bank, documents });
      } catch (err) {
        console.error('Freelancer load failed', (err as { response?: { status?: number } })?.response?.status);
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [freelancerId]);

  if (!loaded) {
    return (
      <>
        {children({
          title: 'Freelancer',
          subtitle: '',
          header: null,
          body: failed
            ? <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">Failed to load the freelancer. Close and try again.</p>
            : <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading freelancer…</p>,
          footer: null,
        })}
      </>
    );
  }
  return <LoadedWorkspace {...props} loaded={loaded} />;
};

const idOf = (record: FreelancerRecord) => (record as FreelancerDetail).id;

const LoadedWorkspace: React.FC<Props & { loaded: Loaded }> = ({ loaded, initialStep, choices, onSaved, onCreated, onClose, children }) => {
  const [tab, setTab] = useState('onboarding');
  const detailPerms = loaded.detail?.permissions;

  const adapter: FreelancerWizardAdapter = {
    saveProfile: async (payload, current) => {
      if (current) return api.updateFreelancer(idOf(current), payload);
      const created = await api.addFreelancerManually(payload);
      onCreated?.(created);
      return created;
    },
    saveBank: (payload, record) => api.updateBankDetail(idOf(record), payload),
    submit: (record) => api.submitFreelancer(idOf(record)),
    reload: async (record) => {
      const id = idOf(record);
      const fresh = await api.getFreelancer(id);
      const documents = fresh.permissions.view_documents ? await api.listDocuments(id) : [];
      return { record: fresh, documents };
    },
    uploadDocument: (record, category, file, opts) =>
      api.uploadDocument(idOf(record), category, file, { replaces: opts.replaces, expiryDate: opts.expiryDate, onProgress: opts.onProgress }),
    deleteDocument: (record, docId) => api.deleteDocument(idOf(record), docId),
    downloadDocument: async (record, docId) => {
      const { download_url } = await api.downloadDocument(idOf(record), docId);
      window.open(download_url, '_blank', 'noopener');
    },
    uploadPhoto: (record, file) => api.uploadProfilePhoto(idOf(record), file),
    removePhoto: (record) => api.removeProfilePhoto(idOf(record)),
  };

  const w = useFreelancerWizard({
    mode: 'admin',
    adapter,
    initialRecord: loaded.detail,
    initialBank: loaded.bank,
    initialDocuments: loaded.documents,
    initialStep,
    readOnly: detailPerms ? !detailPerms.edit : false,
    bankEditable: detailPerms ? detailPerms.edit_bank : true,
    allowedCurrencies: choices?.currencies.map((c) => c.value),
    canSubmit: detailPerms ? detailPerms.submit : true,
    submitLabel: 'Submit for review',
    onRecordChange: (record) => onSaved?.(record as FreelancerDetail),
    onSubmitted: () => toast.success('Submitted for review'),
    onNavigate: () => document.getElementById(TOP_ID)?.scrollIntoView({ block: 'start' }),
  });

  const detail = w.record as FreelancerDetail | null;
  const perms = detail?.permissions ?? NEW_RECORD_PERMISSIONS;
  const id = detail?.id ?? null;

  const tabs: TabItem[] = [
    { key: 'onboarding', label: 'Onboarding' },
    ...(id ? [
      { key: 'equipment', label: 'Equipment' },
      { key: 'rates', label: 'Rate Cards' },
      { key: 'contracts', label: 'Contracts' },
      { key: 'projects', label: 'Projects' },
      { key: 'tasks', label: 'Tasks & Time' },
      { key: 'activity', label: 'Activity' },
    ] : []),
  ];

  const header = (
    <div id={TOP_ID} className="scroll-mt-4 space-y-3">
      {detail && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs dark:border-gray-800 dark:bg-gray-800/40">
          <StatusBadge status={detail.status} variant={statusVariant(detail.status)} label={detail.status_display} />
          <StatusBadge status={detail.kyc_status} variant={kycVariant(detail.kyc_status)} label={`KYC: ${detail.kyc_status_display}`} />
          {detail.freelancer_code && <span className="font-mono text-gray-700 dark:text-gray-200">{detail.freelancer_code}</span>}
          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><Link2 className="w-3.5 h-3.5" /> {linkStatusText(detail.access_link)}</span>
        </div>
      )}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );

  let body: React.ReactNode;
  if (tab === 'onboarding' || !id) {
    body = (
      <div className="space-y-5">
        <WizardProgress steps={w.steps} currentKey={w.step} onStepChange={(key) => w.goTo(key as WizardStepKey)} statusText={<WizardStatusLine w={w} />} />
        {detail?.status === 'changes_requested' && detail.review_remarks && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <strong>Changes requested:</strong> {detail.review_remarks}
          </div>
        )}
        <FreelancerWizardBody
          w={w}
          choices={choices}
          canVerifyDocuments={perms.verify}
          onVerifyDocument={perms.verify && id ? async (docId, status, remarks) => {
            await api.verifyDocument(id, docId, status, remarks);
            await w.refresh();
          } : undefined}
          documentsReadOnly={!perms.upload_documents}
          reveal={id ? {
            accountNumber: perms.view_unmasked_bank ? async () => (await api.getBankDetailUnmasked(id)).account_number || null : undefined,
            taxNumber: perms.view_pan_unmasked ? async () => (await api.getPANUnmasked(id)).tax_number || null : undefined,
            idNumber: perms.view_unmasked_id ? async () => (await api.getIdentityUnmasked(id)).id_document_number || null : undefined,
          } : undefined}
          reviewExtras={detail ? (
            <FreelancerReviewPanel
              detail={detail}
              bank={w.bank}
              onDetail={(d) => {
                w.setRecord(d);
                onSaved?.(d);
              }}
              onBank={w.setBank}
              onGoToStep={(step) => w.goTo(step)}
            />
          ) : null}
        />
      </div>
    );
  } else if (tab === 'equipment') {
    body = <FreelancerEquipmentTab freelancerId={id} ownerships={choices?.equipment_ownerships || []} conditions={choices?.equipment_conditions || []} />;
  } else if (tab === 'rates') {
    body = <FreelancerRateCardsTab freelancerId={id} pricingModels={choices?.pricing_models || []} currencies={choices?.currencies || []} />;
  } else if (tab === 'contracts') {
    body = <FreelancerContractsTab freelancerId={id} contractTypes={choices?.contract_types || []} contractStatuses={choices?.contract_statuses || []} />;
  } else if (tab === 'projects') {
    body = (
      <FreelancerProjectAssignmentsTab
        freelancerId={id}
        hoursPerWeek={detail?.hours_per_week ? Number(detail.hours_per_week) : null}
        assignmentStatuses={choices?.assignment_statuses || []}
      />
    );
  } else if (tab === 'tasks') {
    body = <FreelancerTasksTab freelancerId={id} taskAssignmentStatuses={choices?.task_assignment_statuses || []} timeEntryStatuses={choices?.time_entry_statuses || []} />;
  } else {
    body = <FreelancerActivityTab freelancerId={id} />;
  }

  const footer = tab === 'onboarding' || !id
    ? <WizardFooter {...w.footer} onCancel={onClose} />
    : onClose ? (
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
    ) : null;

  return (
    <>
      {children({
        title: detail?.full_name || 'Onboard Freelancer',
        subtitle: detail ? [detail.freelancer_code, detail.email].filter(Boolean).join(' · ') : 'Basic information, identity, address, banking, professional details and documents',
        header,
        body,
        footer,
      })}
    </>
  );
};
