import { formatDate as toDMY, formatDateTime as toDMYTime } from '../utils/date';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Info, Loader2, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { ReusableTable } from './ReusableTable';
import type { Column } from './ReusableTable';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import axiosInstance from '../utils/axiosInstance';
import { parseApiErrors } from '../utils/parseApiErrors';
import type { Role } from '../types';
import {
  getHrmsEmployees, grantHrmsAccess, revokeHrmsAccess, autoSyncHrmsEmployees, syncHrmsEmployees, needsSetup,
  type HrmsEmployee, type HrmsSyncRun,
} from '../services/hrms';

interface ModuleOption {
  id: number;
  product_service_name: string;
  is_active?: boolean;
}

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'JPY'];
const FIELD_CLASS = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500';
const LABEL_CLASS = 'block text-base font-medium text-gray-900 mb-2 dark:text-gray-200';

const PAGE_SIZE = 25;

const SELECT_CLASS = 'pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500';

const formatDateTime = (value: string | null) => toDMYTime(value);

const errorMessage = (err: unknown) => parseApiErrors(err).general || 'Something went wrong. Please try again.';

type HrmsStatus = 'active' | 'removed' | 'all';
type AccessFilter = 'all' | 'granted' | 'setup' | 'none';

/**
 * Administration > HRMS Employees. Lists employees fetched from AIRA HRMS. There is no
 * Refresh button: opening the tab pulls from AIRA automatically (skipped if a pull ran in the
 * last few minutes), and a scheduled backend task pulls every 15 minutes. Each pull revokes
 * access for anyone no longer in AIRA.
 */
const HrmsEmployeesTab: React.FC = () => {
  const [employees, setEmployees] = useState<HrmsEmployee[]>([]);
  const [lastSync, setLastSync] = useState<HrmsSyncRun | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HrmsStatus>('active');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<HrmsEmployee | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [chargesPerHour, setChargesPerHour] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [revoking, setRevoking] = useState<HrmsEmployee | null>(null);

  const loadEmployees = async () => {
    const data = await getHrmsEmployees();
    setEmployees(data.employees);
    setLastSync(data.last_sync);
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [, rolesRes, modulesRes] = await Promise.all([
          loadEmployees(),
          axiosInstance.get('/roles/roles/'),
          axiosInstance.get('/product-services/'),
        ]);
        setRoles(rolesRes.data);
        setModules(modulesRes.data);
      } catch (err) {
        setLoadError(errorMessage(err));
      } finally {
        setIsLoading(false);
      }

      // Then pull the latest from AIRA in the background and show it when it lands.
      setIsSyncing(true);
      try {
        const { ran, sync } = await autoSyncHrmsEmployees();
        if (sync) setLastSync(sync);
        if (ran && sync?.status === 'success') await loadEmployees();
      } catch {
        // No permission to pull, or the backend is unreachable - the stored list stays on screen.
      } finally {
        setIsSyncing(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === 'active' && !e.is_active_in_hrms) return false;
      if (statusFilter === 'removed' && e.is_active_in_hrms) return false;
      if (accessFilter === 'granted' && !e.is_eligible) return false;
      if (accessFilter === 'setup' && !needsSetup(e)) return false;
      if (accessFilter === 'none' && e.is_eligible) return false;
      return !q || [e.full_name, e.email, e.employee_id, e.department, e.designation, e.branch]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [employees, searchQuery, statusFilter, accessFilter]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeRoles = roles.filter((r) => r.is_active);
  const activeModules = modules.filter((m) => m.is_active !== false);
  const setupCount = employees.filter(needsSetup).length;

  // Manual "Refresh from HRMS" - always pulls from AIRA now (the automatic pull may skip).
  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      const run = await syncHrmsEmployees();
      setLastSync(run);
      await loadEmployees();
      toast.success(
        `Refreshed: ${run.fetched_count} active in HRMS` +
        (run.created_count ? `, ${run.created_count} new` : '') +
        (run.access_revoked_count ? `, access revoked for ${run.access_revoked_count}` : ''),
      );
    } catch (err) {
      toast.error(errorMessage(err));
      // A failed run is still recorded - reload so the banner shows it.
      loadEmployees().catch(() => undefined);
    } finally {
      setIsSyncing(false);
    }
  };

  const replaceEmployee = (updated: HrmsEmployee) =>
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const openAccess = (employee: HrmsEmployee) => {
    setEditing(employee);
    setSelectedRoleIds(employee.roles.map((r) => r.id));
    setModuleId(employee.modules[0] ? String(employee.modules[0].id) : '');
    setChargesPerHour(employee.charges_per_hour ?? '');
    setCurrency(employee.currency || 'INR');
    setFormError(null);
  };

  const toggleRole = (id: number) =>
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const handleSaveAccess = async () => {
    if (!editing) return;
    const rate = Number(chargesPerHour);
    const missing = [
      selectedRoleIds.length === 0 && 'a role',
      !moduleId && 'a module',
      (chargesPerHour.trim() === '' || Number.isNaN(rate) || rate < 0) && 'the charges per hour',
    ].filter(Boolean);
    if (missing.length) {
      setFormError(`Select ${missing.join(', ')}.`);
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      const wasEligible = editing.is_eligible;
      replaceEmployee(await grantHrmsAccess(editing.id, {
        roles: selectedRoleIds,
        modules: [Number(moduleId)],
        charges_per_hour: rate.toFixed(2),
        currency,
      }));
      toast.success(wasEligible ? 'Access updated.' : `Access granted to ${editing.full_name}.`);
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revoking) return;
    try {
      replaceEmployee(await revokeHrmsAccess(revoking.id));
      toast.success(`Access revoked for ${revoking.full_name}.`);
      setRevoking(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns: Column<HrmsEmployee>[] = [
    {
      header: 'Employee',
      accessor: (e) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-gray-100">{e.full_name || '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{e.employee_id} · {e.email || 'no email'}</div>
          {e.phone && <div className="text-xs text-gray-500 dark:text-gray-400">{e.phone}</div>}
        </div>
      ),
    },
    {
      header: 'Department / Designation',
      accessor: (e) => (
        <div>
          <div>{e.department || '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{e.designation}{e.branch ? ` · ${e.branch}` : ''}</div>
          {(e.date_of_joining || e.employment_type) && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {e.employment_type ? e.employment_type.replace(/_/g, ' ') : ''}
              {e.employment_type && e.date_of_joining ? ' · ' : ''}
              {e.date_of_joining ? `Joined ${toDMY(e.date_of_joining)}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'HRMS',
      accessor: (e) => e.is_active_in_hrms ? (
        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">Active</span>
      ) : (
        <span
          className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          title={`Missing from HRMS since ${formatDateTime(e.removed_from_hrms_at)}`}
        >
          Not in HRMS
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 whitespace-nowrap dark:text-white">HRMS Employees</h2>
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="relative">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as HrmsStatus); setPage(1); }} className={SELECT_CLASS}>
              <option value="active">Active in HRMS</option>
              <option value="removed">Not in HRMS</option>
              <option value="all">All</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none dark:text-gray-500" />
          </div>
          <div className="relative">
            <select value={accessFilter} onChange={(e) => { setAccessFilter(e.target.value as AccessFilter); setPage(1); }} className={SELECT_CLASS}>
              <option value="all">Any Access</option>
              <option value="granted">Has Access</option>
              <option value="setup">Needs Module &amp; Rate{setupCount ? ` (${setupCount})` : ''}</option>
              <option value="none">No Access</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none dark:text-gray-500" />
          </div>
          <div className="relative flex-grow xl:flex-grow-0">
            <input
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full xl:w-64 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 dark:text-gray-500" />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-semibold shadow-sm transition-all whitespace-nowrap"
          >
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Refreshing...' : 'Refresh from HRMS'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          {lastSync ? (
            <>
              Last fetched from AIRA: <strong>{formatDateTime(lastSync.finished_at || lastSync.started_at)}</strong>
              {lastSync.triggered_by_name ? '' : ' (automatic)'} —{' '}
              {lastSync.status === 'success'
                ? `${lastSync.fetched_count} active employees, ${lastSync.access_revoked_count} access revoked.`
                : lastSync.status === 'running'
                  ? 'in progress...'
                  : <span className="text-red-700 dark:text-red-300">failed: {lastSync.error_message}</span>}
            </>
          ) : (
            'Employees have not been fetched from AIRA yet.'
          )}
          <div className="mt-1 text-blue-800/80 dark:text-blue-200/70">
            Employee data comes from AIRA HRMS automatically - when this tab opens and every 15 minutes - or right away with "Refresh from HRMS". Anyone who leaves AIRA is removed on the next fetch.
          </div>
        </div>
      </div>

      <ReusableTable
        data={pageRows}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        error={loadError}
        emptyMessage={employees.length === 0 ? 'No employees synced yet.' : 'No employees match these filters.'}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={filtered.length}
        onPageChange={setPage}
      />

      <Modal
        isOpen={!!editing}
        onClose={() => !isSaving && setEditing(null)}
        title={editing?.is_eligible ? 'Edit Budgeting Access' : 'Grant Budgeting Access'}
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setEditing(null)}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAccess}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing?.is_eligible ? 'Save Access' : 'Grant Access'}
            </button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <div className="font-semibold text-gray-900 dark:text-white">{editing.full_name}</div>
              <div>{editing.employee_id} · {editing.email || 'no email'}</div>
              {!editing.is_eligible && !editing.account_id && (
                <p className="mt-2">A Budgeting login will be created for this email and a temporary password emailed to them.</p>
              )}
            </div>
            <div>
              <div className="block text-base font-medium text-gray-900 mb-2 dark:text-gray-200">Budgeting Roles <span className="text-red-500">*</span></div>
              <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {activeRoles.length === 0 && <p className="text-sm text-gray-500">No active roles available.</p>}
                {activeRoles.map((role) => (
                  <label key={role.id} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {role.role_name}
                  </label>
                ))}
              </div>
            </div>

            {/* Budgeting-only fields - HRMS doesn't provide these */}
            <div>
              <label htmlFor="hrms-module" className={LABEL_CLASS}>Module <span className="text-red-500">*</span></label>
              <select id="hrms-module" value={moduleId} onChange={(ev) => setModuleId(ev.target.value)} className={FIELD_CLASS}>
                <option value="">Select module</option>
                {activeModules.map((m) => (
                  <option key={m.id} value={m.id}>{m.product_service_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hrms-rate" className={LABEL_CLASS}>Charges per hr <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <select aria-label="Currency" value={currency} onChange={(ev) => setCurrency(ev.target.value)} className={`${FIELD_CLASS} !w-28`}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  id="hrms-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={chargesPerHour}
                  onChange={(ev) => setChargesPerHour(ev.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used to cost this person's logged hours on projects. HRMS doesn't send it, so it's set here.
              </p>
            </div>
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={handleRevoke}
        title="Revoke Budgeting access?"
        message={`${revoking?.full_name} will lose Budgeting access immediately: their account is deactivated and their roles removed. You can grant access again later.`}
        confirmLabel="Revoke Access"
      />
    </div>
  );
};

export default HrmsEmployeesTab;
