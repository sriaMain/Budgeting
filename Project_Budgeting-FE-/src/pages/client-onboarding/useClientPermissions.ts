import { useEffect, useState } from 'react';
import { fetchClientPermissions } from '../../services/clientOnboarding';
import type { Client, ClientPermissionFlags, ClientRecordPermissions, UserRole } from './clientTypes';

const FLAGS: (keyof ClientPermissionFlags)[] = [
  'view', 'create', 'edit', 'delete', 'approve', 'request_changes', 'edit_compliance', 'edit_banking',
  'edit_commercials', 'view_documents', 'upload_documents', 'delete_documents', 'verify_documents',
  'view_audit_log', 'view_unmasked_bank',
];

const flags = (on: (keyof ClientPermissionFlags)[]): ClientPermissionFlags =>
  Object.fromEntries(FLAGS.map((f) => [f, on.includes(f)])) as unknown as ClientPermissionFlags;

export const NO_CLIENT_PERMISSIONS = flags([]);

/**
 * Only used when GET /client/permissions/ can't be reached: an approximation of the default role
 * grants (client migrations 0010 / 0013 / 0017). The backend still enforces the real codes.
 */
export function roleFallbackPermissions(role: UserRole): ClientPermissionFlags {
  if (role === 'admin') return flags(FLAGS);
  if (role === 'manager') return flags(FLAGS.filter((f) => f !== 'delete'));
  return flags(['view', 'view_documents', 'view_audit_log']);
}

/** The signed-in user's Clients & KYC permission codes as flags (role names only as a fallback). */
export function useClientPermissions(role: UserRole): { can: ClientPermissionFlags; loading: boolean } {
  const [state, setState] = useState<{ flags: ClientPermissionFlags | null; failed: boolean }>({ flags: null, failed: false });

  useEffect(() => {
    let alive = true;
    fetchClientPermissions()
      .then((result) => {
        if (alive) setState({ flags: { ...NO_CLIENT_PERMISSIONS, ...result }, failed: false });
      })
      .catch(() => {
        if (alive) setState({ flags: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.flags) return { can: state.flags, loading: false };
  if (state.failed) return { can: roleFallbackPermissions(role), loading: false };
  return { can: NO_CLIENT_PERMISSIONS, loading: true };
}

/** User-level flags narrowed by the server's per-client permissions (workflow state, maker lock). */
export function clientRecordPermissions(can: ClientPermissionFlags, client?: Client | null): ClientRecordPermissions {
  const server = client?.permissions ?? {};
  const merged = { ...can, submit: false, locked: false } as ClientRecordPermissions;
  (Object.keys(server) as (keyof ClientRecordPermissions)[]).forEach((key) => {
    const value = server[key];
    if (typeof value === 'boolean') merged[key] = value;
  });
  if (!client) {
    // Before the client exists the creator works under client.company.create.
    merged.edit = can.create;
    merged.submit = false;
  }
  return merged;
}
