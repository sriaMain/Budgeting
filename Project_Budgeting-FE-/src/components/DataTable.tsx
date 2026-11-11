/**
 * DataTable - compact enterprise table: 44px header, ~56-64px rows, 13px text, sortable headers
 * (aria-sort), server-side pagination, its own horizontal scroll (never the page's), and loading /
 * error / empty states. Data, sorting and paging are owned by the caller (the API does the work).
 */
import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { ErrorState } from './ErrorState';

export interface DataColumn<T> {
    key: string;
    header: React.ReactNode;
    cell: (row: T) => React.ReactNode;
    align?: 'left' | 'right' | 'center';
    /** Sort key sent to the API; omit for a column that can't be sorted. */
    sortKey?: string;
    /** Fixed column width, e.g. '160px'. */
    width?: string;
    className?: string;
}

export interface DataTableSort {
    key: string;
    direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
    columns: DataColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    /** Accessible name of the table. */
    label: string;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    /** Shown when there are no rows. */
    empty?: React.ReactNode;
    sort?: DataTableSort;
    onSort?: (key: string) => void;
    /** Table min width in px - narrower screens scroll inside the table box. */
    minWidth?: number;
    /** A <tr> (or rows) rendered in <tfoot>. */
    footer?: React.ReactNode;
    rowClassName?: (row: T) => string;
    page?: number;
    pageSize?: number;
    total?: number;
    onPageChange?: (page: number) => void;
    /** Whole row opens something (click or Enter). */
    onRowClick?: (row: T) => void;
    /** Compact 48px rows instead of 60px. */
    dense?: boolean;
    /** Scroll inside the table (max 70% of the screen height) with the header kept in view. */
    stickyHeader?: boolean;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function DataTable<T>({
    columns, rows, rowKey, label, loading = false, error, onRetry, empty, sort, onSort, minWidth = 960,
    footer, rowClassName, page, pageSize, total, onPageChange, onRowClick, dense = false, stickyHeader = false,
}: DataTableProps<T>) {
    const pages = page && pageSize && total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;
    const showPager = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange && total > 0;
    const first = showPager ? (page - 1) * pageSize + 1 : 0;
    const last = showPager ? Math.min(page * pageSize, total) : 0;

    if (error) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <ErrorState message={error} onRetry={onRetry} />
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className={`relative overflow-x-auto ${stickyHeader ? 'max-h-[70vh] overflow-y-auto' : ''}`} aria-busy={loading || undefined}>
                <table className="w-full border-collapse text-[13px]" style={{ minWidth }} aria-label={label}>
                    <thead className={stickyHeader ? 'sticky top-0 z-10' : undefined}>
                        <tr className="h-11 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
                            {columns.map((col) => {
                                const align = ALIGN[col.align || 'left'];
                                const active = sort && col.sortKey && sort.key === col.sortKey;
                                const ariaSort = active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined;
                                return (
                                    <th
                                        key={col.key}
                                        scope="col"
                                        aria-sort={col.sortKey && onSort ? (ariaSort || 'none') : undefined}
                                        style={col.width ? { width: col.width } : undefined}
                                        className={`px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap ${align}`}
                                    >
                                        {col.sortKey && onSort ? (
                                            <button
                                                type="button"
                                                onClick={() => onSort(col.sortKey!)}
                                                className={`inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:text-white ${col.align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-gray-900 dark:text-white' : ''}`}
                                            >
                                                {col.header}
                                                {active
                                                    ? (sort!.direction === 'asc' ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />)
                                                    : <ChevronsUpDown size={13} className="opacity-40" aria-hidden="true" />}
                                            </button>
                                        ) : col.header}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className={loading && rows.length > 0 ? 'opacity-60 transition-opacity' : undefined}>
                        {loading && rows.length === 0 ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={`skeleton-${i}`} className="h-14 border-b border-gray-100 dark:border-gray-800">
                                    {columns.map((col) => (
                                        <td key={col.key} className="px-4">
                                            <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="p-0">{empty}</td>
                            </tr>
                        ) : rows.map((row) => (
                            <tr
                                key={rowKey(row)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                                tabIndex={onRowClick ? 0 : undefined}
                                className={`${dense ? 'h-12' : 'h-[60px]'} border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-gray-800/40 ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:bg-blue-50/60 dark:focus-visible:bg-blue-500/10' : ''} ${rowClassName ? rowClassName(row) : ''}`}
                            >
                                {columns.map((col) => (
                                    <td key={col.key} className={`px-4 ${dense ? 'py-1.5' : 'py-2.5'} align-middle text-gray-700 dark:text-gray-300 ${ALIGN[col.align || 'left']} ${col.className || ''}`}>
                                        {col.cell(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {footer && rows.length > 0 && <tfoot>{footer}</tfoot>}
                </table>
            </div>
            {showPager && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 dark:border-gray-800 dark:text-gray-400">
                    <span className="tabular-nums">Showing {first.toLocaleString('en-IN')}–{last.toLocaleString('en-IN')} of {total!.toLocaleString('en-IN')}</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onPageChange!(page! - 1)}
                            disabled={page! <= 1 || loading}
                            aria-label="Previous page"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                            <ChevronLeft size={15} aria-hidden="true" />
                        </button>
                        <span className="px-2 tabular-nums">Page {page} of {pages}</span>
                        <button
                            type="button"
                            onClick={() => onPageChange!(page! + 1)}
                            disabled={page! >= pages || loading}
                            aria-label="Next page"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                            <ChevronRight size={15} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
