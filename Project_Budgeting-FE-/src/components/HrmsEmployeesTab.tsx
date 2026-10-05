import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Info, Loader2, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { ReusableTable } from './ReusableTable';
import type { Column } from './ReusableTable';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import axiosInstance from '../utils/axiosInstance';
import { parseApiErrors } from '../utils/parseApiErrors';
import type { Role } from '../types';
import {
  getHrmsEmployees, grantHrmsAccess, revokeHrmsAccess, syncHrmsEmployees,
  type HrmsEmployee, type HrmsSyncRun,
} from '../services/hrms';

const PAGE_SIZE = 25;

const SELECT_CLASS = 'pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500';

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

const errorMessage = (err: unknown) => parseApiErrors(err).general || 'Something went wrong. Please try again.';

type HrmsStatus = 'active' | 'removed' | 'all';
type AccessFilter = 'all' | 'granted' | 'none';

/**
 * Administration > HRMS Employees. Lists employees synced from HRMS and lets
 * an admin mark them eligible + assign Budgeting roles. "Refresh" is the only
 * sync trigger: it re-fetches the active list and revokes access for anyone
 * who is no longer in it.
 */
const HrmsEmployeesTab: React.FC = () => {
  const [employees, setEmployees] = useState<HrmsEmployee[]>([]);
  const [lastSync, setLastSync] = useState<HrmsSyncRun | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HrmsStatus>('active');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<HrmsEmployee | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
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
        const [, rolesRes] = await Promise.all([loadEmployees(), axiosInstance.get('/roles/roles/')]);
        setRoles(rolesRes.data);
      } catch (err) {
        setLoadError(errorMessage(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === 'active' && !e.is_active_in_hrms) return false;
      if (statusFilter === 'removed' && e.is_active_in_hrms) return false;
      if (accessFilter === 'granted' && !e.is_eligible) return false;
      if (accessFilter === 'none' && e.is_eligible) return false;
      return !q || [e.full_name, e.email, e.employee_id, e.department, e.designation, e.branch]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [employees, searchQuery, statusFilter, accessFilter]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeRoles = roles.filter((r) => r.is_active);

  const replaceEmployee = (updated: HrmsEmployee) =>
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      const run = await syncHrmsEmployees();
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

  const openAccess = (employee: HrmsEmployee) => {
    setEditing(employee);
    setSelectedRoleIds(employee.roles.map((r) => r.id));
  };

  const toggleRole = (id: number) =>
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const handleSaveAccess = async () => {
    if (!editing || selectedRoleIds.length === 0) return;
    setIsSaving(true);
    try {
      const wasEligible = editing.is_eligible;
      replaceEmployee(await grantHrmsAccess(editing.id, selectedRoleIds));
      toast.success(wasEligible ? 'Roles updated.' : `Access granted to ${editing.full_name}.`);
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
        </div>
      ),
    },
    {
      header: 'Department / Designation',
      accessor: (e) => (
        <div>
          <div>{e.department || '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{e.designation}{e.branch ? ` · ${e.branch}` : ''}</div>
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
    {
      header: 'Budgeting Access',
      accessor: (e) => e.is_eligible ? (
        <div className="flex flex-wrap gap-1">
          {e.roles.map((r) => (
            <span key={r.id} className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{r.role_name}</span>
          ))}
        </div>
      ) : (
        <span className="text-gray-400 italic dark:text-gray-500">
          {e.access_revoked_reason === 'hrms_missing' ? 'Revoked (left HRMS)' : e.access_revoked_reason === 'manual' ? 'Revoked' : 'No access'}
        </span>
      ),
    },
    {
      header: 'Actions',
      accessor: (e) => (
        <div className="flex gap-2">
          {e.is_active_in_hrms && (
            <button
              onClick={() => openAccess(e)}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              {e.is_eligible ? 'Edit Roles' : 'Grant Access'}
            </button>
          )}
          {e.is_eligible && (
            <button
              onClick={() => setRevoking(e)}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              Revoke
            </button>
          )}
        </div>
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
              Last refresh: <strong>{formatDateTime(lastSync.finished_at || lastSync.started_at)}</strong>
              {lastSync.triggered_by_name ? ` by ${lastSync.triggered_by_name}` : ''} —{' '}
              {lastSync.status === 'success'
                ? `${lastSync.fetched_count} active employees, ${lastSync.access_revoked_count} access revoked.`
                : <span className="text-red-700 dark:text-red-300">failed: {lastSync.error_message}</span>}
            </>
          ) : (
            'The employee list has not been refreshed yet. Click "Refresh from HRMS" to load it.'
          )}
          <div className="mt-1 text-blue-800/80 dark:text-blue-200/70">
            Employees who leave HRMS lose Budgeting access only when someone clicks Refresh, so refresh regularly (e.g. daily).
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
        title={editing?.is_eligible ? 'Edit Budgeting Roles' : 'Grant Budgeting Access'}
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
              disabled={isSaving || selectedRoleIds.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing?.is_eligible ? 'Save Roles' : 'Grant Access'}
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
