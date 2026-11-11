/** Project Details header: ID, status, type, name, client, dates, Edit and More Actions. */
import React from 'react';
import { ArrowLeft, Building2, CalendarDays, Pencil } from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '../ActionMenu';
import { formatDate as toDMY } from '../../utils/date';

interface Props {
    projectNo: string | number;
    name: string;
    clientName?: string;
    statusLabel?: string;
    statusClass: string;
    typeLabel: string;
    typeClass: string;
    startDate?: string | null;
    endDate?: string | null;
    canEdit: boolean;
    onBack: () => void;
    onEdit: () => void;
    actions: ActionMenuItem[];
}

export const ProjectHeader: React.FC<Props> = ({
    projectNo, name, clientName, statusLabel, statusClass, typeLabel, typeClass, startDate, endDate, canEdit, onBack, onEdit, actions,
}) => (
    <header className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-start gap-3">
            <button
                type="button"
                onClick={onBack}
                aria-label="Back to Projects"
                title="Back to Projects"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
                <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="min-w-0 break-words text-xl font-semibold leading-7 text-gray-900 dark:text-white" title={name}>{name}</h1>
                    {statusLabel && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusClass}`}>{statusLabel}</span>
                    )}
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${typeClass}`}>{typeLabel}</span>
                </div>
                <dl className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                        <dt className="sr-only">Project ID</dt>
                        <dd className="font-medium tabular-nums">#{projectNo}</dd>
                    </div>
                    {clientName && (
                        <div className="flex min-w-0 items-center gap-1">
                            <dt><Building2 size={13} aria-label="Client" className="shrink-0" /></dt>
                            <dd className="truncate" title={clientName}>{clientName}</dd>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <dt><CalendarDays size={13} aria-label="Project dates" className="shrink-0" /></dt>
                        <dd className="tabular-nums">
                            <span className="sr-only">Start </span>{toDMY(startDate, 'Not set')}
                            <span aria-hidden="true"> – </span>
                            <span className="sr-only"> End </span>{toDMY(endDate, 'Not set')}
                        </dd>
                    </div>
                </dl>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {canEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                        <Pencil size={14} aria-hidden="true" /> Edit Project
                    </button>
                )}
                {actions.length > 0 && <ActionMenu label="More actions for this project" triggerText="More Actions" items={actions} />}
            </div>
        </div>
    </header>
);
