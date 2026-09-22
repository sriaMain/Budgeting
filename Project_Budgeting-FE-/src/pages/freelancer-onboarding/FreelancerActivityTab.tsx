import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../services/freelancerOnboarding';
import type { FreelancerAuditLog } from '../../types/freelancerOnboarding.types';

interface Props {
    freelancerId: number;
}

/** Section 22's audit trail - read-only history of sensitive/business-
 * critical changes (rate, bank details, PAN verification, status, project
 * assignment). Values shown here are already masked/sanitized server-side
 * when sensitive (see freelancer_onboarding.views._log_freelancer_audit). */
export const FreelancerActivityTab: React.FC<Props> = ({ freelancerId }) => {
    const [logs, setLogs] = useState<FreelancerAuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.listAuditLog(freelancerId)
            .then(setLogs)
            .catch(() => toast.error('Failed to load activity log'))
            .finally(() => setLoading(false));
    }, [freelancerId]);

    if (loading) {
        return <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading activity...</div>;
    }

    if (logs.length === 0) {
        return <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>;
    }

    return (
        <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900 mb-3 dark:text-white">Activity</h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => (
                    <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{log.action_display}</p>
                            {(log.old_value || log.new_value) && (
                                <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                                    {log.old_value && <span>{log.old_value} → </span>}
                                    <span>{log.new_value || '-'}</span>
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">by {log.performed_by_name}</p>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap dark:text-gray-500">
                            {new Date(log.created_at).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
