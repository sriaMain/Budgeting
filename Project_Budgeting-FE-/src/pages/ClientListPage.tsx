import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Users, ShieldCheck, AlertTriangle, Globe2, ShieldAlert, Clock } from 'lucide-react';
import { ReusableTable, type Column } from '../components/ReusableTable';
import { StatusBadge } from '../components/StatusBadge';
import { StatCard } from '../components/StatCard';
import { OnboardingStepCards } from '../components/OnboardingStepCards';

import { useClientPermissions } from './client-onboarding/useClientPermissions';
import {
  computeJurisdiction,
  kycStatusLabel,
  kycStatusVariant,
  onboardingStepLabel,
  resolveOnboardingSteps,
  riskRatingLabel,
  riskRatingVariant,
  ONBOARDING_STEP_CARDS,
  type Client,
  type OnboardingStep,
  type UserRole,
} from './client-onboarding/clientTypes';

// Types moved to ./client-onboarding/clientTypes - re-exported for existing importers.
export type {
  Client,
  ClientAuditLogEntry,
  ClientChangeRequest,
  ClientDocument,
  ClientDocumentCategory,
  ClientType,
  CompanyTag,
  KycStatus,
  OnboardingStep,
  POC,
  StepStatuses,
  UserRole,
} from './client-onboarding/clientTypes';

interface OnboardingProcessPanelProps {
  client: Client | null;
  /** Opens the existing KYC drawer at the given step's section. Omit to render the cards read-only. */
  onStepClick?: (client: Client, step: OnboardingStep) => void;
}

/** "Client onboarding process" panel: the selected client's 6 onboarding steps as status cards. */
const OnboardingProcessPanel: React.FC<OnboardingProcessPanelProps> = ({ client, onStepClick }) => {
  const resolved = useMemo(() => (client ? resolveOnboardingSteps(client) : null), [client]);

  const currentLabel = resolved?.current ? resolved.current.title : 'Project-ready';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Client onboarding process</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {client && resolved ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-200">{client.company_name}</span>
                {' '}&middot; {currentLabel} &middot; {resolved.percent}% complete
              </>
            ) : (
              'Click a client row to see its onboarding progress here.'
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500 sm:whitespace-nowrap dark:text-gray-400">
          {ONBOARDING_STEP_CARDS.length} steps &middot; intake to project-ready approval
        </p>
      </div>

      {client && resolved && (
        <div className="px-4 sm:px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={client.kyc_status} variant={kycStatusVariant(client.kyc_status)} label={`KYC: ${kycStatusLabel(client.kyc_status)}`} />
            <StatusBadge status={client.risk_rating} variant={riskRatingVariant(client.risk_rating)} label={`${riskRatingLabel(client.risk_rating)} risk`} />
            <StatusBadge
              status={client.is_project_ready ? 'project_ready' : 'not_project_ready'}
              variant={client.is_project_ready ? 'success' : 'neutral'}
              label={client.is_project_ready ? 'Project-ready' : 'Not project-ready'}
            />
            <span>
              {[client.jurisdiction ?? computeJurisdiction(client.country), client.country, client.currency].filter(Boolean).join(' · ')}
            </span>
          </div>

          <OnboardingStepCards
            steps={resolved.steps.map((step) => ({ ...step, key: step.value }))}
            onStepClick={onStepClick ? (key) => onStepClick(client, key as OnboardingStep) : undefined}
            clickHint={(step) => `Open ${step.title} in the KYC drawer`}
            scrollKey={client.id}
          />

          {(client.approval_blockers?.length ?? 0) > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">Before approval:</span> {client.approval_blockers!.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ==================================================================
 * SECTION: ClientListPage Component
 * ==================================================================
 */

interface ClientListProps {
  clients: Client[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  userRole: UserRole;
  onAddClient: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (client: Client) => void;
  onViewClient: (id: number) => void;
  /** Debounced fetch callback wired to the real `?search=` query param on the parent's fetch. */
  onSearch: (query: string) => void;
  /** Optional lookup for a client's primary point of contact, shown under their name/phone in the table. */
  getPrimaryContact?: (clientId: number) => string | undefined;
  /** Opens the existing KYC drawer scrolled to an onboarding step's section (onboarding step cards). */
  onOpenStep?: (client: Client, step: OnboardingStep) => void;
}

const PAGE_SIZE = 10;

export function ClientListPage({
  clients,
  isLoading = false,
  error,
  onRetry,
  userRole,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onViewClient,
  onSearch,
  getPrimaryContact,
  onOpenStep,
}: ClientListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Debounce the search box before calling back up to the parent, which owns the actual
  // `GET /client/?search=` fetch (server-side filtering, not a client-side .filter()).
  useEffect(() => {
    const timer = setTimeout(() => onSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Back to page 1 whenever the result set changes size (derived during render, not in an effect).
  const [pagedLength, setPagedLength] = useState(clients.length);
  if (pagedLength !== clients.length) {
    setPagedLength(clients.length);
    setPage(1);
  }

  // Permission codes (client.company.create / edit / delete), not role names.
  const { can } = useClientPermissions(userRole);
  const canOnboard = can.create;
  const canEdit = can.edit;
  const canDelete = can.delete;

  const kpis = useMemo(() => {
    const total = clients.length;
    const verified = clients.filter((c) => c.kyc_status === 'verified').length;
    const awaitingApproval = clients.filter((c) => c.kyc_status === 'submitted').length;
    const needsReview = clients.filter((c) => ['enhanced_review', 'review_due', 'changes_requested'].includes(c.kyc_status)).length;
    const overseas = clients.filter((c) => (c.jurisdiction ?? computeJurisdiction(c.country)) === 'Overseas').length;
    const riskWatch = clients.filter((c) => c.risk_rating === 'medium' || c.risk_rating === 'high').length;
    const highRisk = clients.filter((c) => c.risk_rating === 'high').length;
    return { total, verified, awaitingApproval, needsReview, overseas, riskWatch, highRisk };
  }, [clients]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  const paginatedClients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, page]);

  const handleRowClick = (client: Client) => setSelectedClientId(client.id);

  const columns: Column<Client>[] = [
    {
      header: 'Client',
      accessor: (c) => {
        const primaryContact = getPrimaryContact?.(c.id);
        return (
          <div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewClient(c.id);
              }}
              className="font-bold text-gray-900 hover:text-blue-600 hover:underline text-left dark:text-white dark:hover:text-blue-400"
            >
              {c.company_name}
            </button>
            <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{c.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.mobile_number}</p>
            {primaryContact && <p className="text-xs text-gray-400 dark:text-gray-500">{primaryContact}</p>}
          </div>
        );
      },
    },
    {
      header: 'Jurisdiction',
      accessor: (c) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{c.jurisdiction ?? computeJurisdiction(c.country)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{[c.country, c.currency].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    {
      header: 'KYC',
      accessor: (c) => <StatusBadge status={c.kyc_status} variant={kycStatusVariant(c.kyc_status)} label={kycStatusLabel(c.kyc_status)} />,
    },
    {
      header: 'Onboarding',
      accessor: (c) => (
        <div className="min-w-[8rem]">
          <p className="text-xs font-medium text-gray-700 mb-1 dark:text-gray-300">{onboardingStepLabel(c.onboarding_step)}</p>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
            <div
              className={`h-full rounded-full ${c.onboarding_step === 'approved' ? 'bg-green-600' : 'bg-blue-600'}`}
              style={{ width: `${resolveOnboardingSteps(c).percent}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      header: 'Active',
      accessor: (c) => <StatusBadge status={c.is_active ? 'active' : 'inactive'} variant={c.is_active ? 'success' : 'neutral'} label={c.is_active ? 'Active' : 'Inactive'} />,
    },
    {
      header: 'Risk',
      accessor: (c) => <StatusBadge status={c.risk_rating} variant={riskRatingVariant(c.risk_rating)} label={riskRatingLabel(c.risk_rating)} />,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Clients</h2>

        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 text-sm sm:text-base dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
          </div>
          {canOnboard && (
            <button
              onClick={onAddClient}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
            >
              <Plus size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Onboard Client</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          label="Registered Clients"
          value={String(kpis.total)}
          icon={<Users size={16} />}
          loading={isLoading}
          status="good"
        />
        <StatCard
          label="Verified KYC"
          value={String(kpis.verified)}
          icon={<ShieldCheck size={16} />}
          loading={isLoading}
          status="good"
        />
        <StatCard
          label="Awaiting Approval"
          value={String(kpis.awaitingApproval)}
          icon={<Clock size={16} />}
          loading={isLoading}
          status={kpis.awaitingApproval > 0 ? 'watch' : 'good'}
          statusLabel={kpis.awaitingApproval > 0 ? 'Submitted for approval' : undefined}
        />
        <StatCard
          label="Needs Action"
          value={String(kpis.needsReview)}
          icon={<AlertTriangle size={16} />}
          loading={isLoading}
          status={kpis.needsReview > 0 ? 'watch' : 'good'}
          statusLabel={kpis.needsReview > 0 ? 'Changes requested / review due' : undefined}
        />
        <StatCard
          label="Overseas Clients"
          value={String(kpis.overseas)}
          icon={<Globe2 size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Risk Watch"
          value={String(kpis.riskWatch)}
          icon={<ShieldAlert size={16} />}
          loading={isLoading}
          status={kpis.highRisk > 0 ? 'risk' : kpis.riskWatch > 0 ? 'watch' : 'good'}
          statusLabel={kpis.highRisk > 0 ? `${kpis.highRisk} high-risk` : undefined}
        />
      </div>

      {/* Onboarding process - bound to whichever client was last row-clicked */}
      <OnboardingProcessPanel client={selectedClient} onStepClick={canEdit ? onOpenStep : undefined} />

      <ReusableTable<Client>
        data={paginatedClients}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onRowClick={handleRowClick}
        isRowSelected={(c) => c.id === selectedClientId}
        onEdit={canEdit ? onEditClient : undefined}
        onDelete={canDelete ? onDeleteClient : undefined}
        emptyMessage='No clients found. Click "Onboard Client" to create one.'
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={clients.length}
        onPageChange={setPage}
      />
    </div>
  );
}
