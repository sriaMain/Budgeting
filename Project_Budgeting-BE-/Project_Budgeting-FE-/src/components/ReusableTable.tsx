import React from 'react';
import { Edit3, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { ErrorState } from './ErrorState';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
  /** Enables a clickable sort header. Requires `onSortChange` on the table and a resolvable sort key. */
  sortable?: boolean;
  /** Sort key reported to `onSortChange`. Defaults to `accessor` when accessor is a plain field name. */
  sortKey?: string;
}

interface ReusableTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  isLoading?: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  /** Rich empty state (e.g. <EmptyState .../>). Takes priority over `emptyMessage` when provided. */
  emptyState?: React.ReactNode;
  /** When set, renders an error state with an optional retry action instead of the table. */
  error?: string | null;
  onRetry?: () => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void;
  /** 1-indexed current page. Provide with `pageSize`/`totalCount`/`onPageChange` for server-side pagination. */
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
}

export const ReusableTable = <T extends any>({
  data,
  columns,
  keyField,
  isLoading = false,
  onEdit,
  onDelete,
  onRowClick,
  emptyMessage = "No records found.",
  emptyState,
  error,
  onRetry,
  sortKey,
  sortDirection,
  onSortChange,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: ReusableTableProps<T>) => {

  if (error) {
    return (
      <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <>
        {/* Desktop Loading Skeleton */}
        <div className="hidden md:block w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-100 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 border-b border-gray-100 flex items-center px-6 dark:border-gray-800">
                <div className="h-4 bg-gray-200 rounded w-3/4 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Loading Skeleton */}
        <div className="md:hidden space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse dark:bg-gray-900 dark:border-gray-800">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3 dark:bg-gray-700" />
              <div className="h-4 bg-gray-200 rounded w-full mb-2 dark:bg-gray-700" />
              <div className="h-4 bg-gray-200 rounded w-3/4 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </>
    );
  }

  const isEmpty = data.length === 0;

  const resolveSortKey = (col: Column<T>): string | undefined =>
    col.sortKey ?? (typeof col.accessor === 'string' ? String(col.accessor) : undefined);

  const rowProps = (item: T) =>
    onRowClick
      ? {
          onClick: () => onRowClick(item),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(item);
            }
          },
          role: 'button' as const,
          tabIndex: 0,
        }
      : {};

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
                {columns.map((col, index) => {
                  const key = resolveSortKey(col);
                  const isSortable = Boolean(col.sortable && key && onSortChange);
                  const isActive = isSortable && sortKey === key;
                  return (
                    <th key={index} className={`py-4 px-6 text-base ${col.className || ''}`}>
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => onSortChange!(key!, isActive && sortDirection === 'asc' ? 'desc' : 'asc')}
                          className="inline-flex items-center gap-1 font-semibold hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600 rounded dark:hover:text-white"
                        >
                          {col.header}
                          {isActive ? (
                            sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                          ) : (
                            <ChevronsUpDown size={14} className="opacity-30" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {(onEdit || onDelete) && <th className="py-4 px-6 text-center text-base w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {!isEmpty ? (
                data.map((item) => (
                  <tr
                    key={String(item[keyField])}
                    className={`hover:bg-gray-50 transition-colors dark:hover:bg-gray-800 ${onRowClick ? 'cursor-pointer' : ''}`}
                    {...rowProps(item)}
                  >
                    {columns.map((col, colIndex) => (
                      <td key={colIndex} className={`py-4 px-6 text-sm text-gray-600 dark:text-gray-300 ${col.className || ''}`}>
                        {typeof col.accessor === 'function'
                          ? col.accessor(item)
                          : (item[col.accessor] as React.ReactNode)}
                      </td>
                    ))}

                    <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors dark:text-blue-400 dark:hover:bg-blue-500/10"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(item)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors dark:text-red-400 dark:hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="p-0">
                    {emptyState ?? <div className="py-12 text-center text-gray-500 dark:text-gray-400">{emptyMessage}</div>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {!isEmpty ? (
          data.map((item) => (
            <div
              key={String(item[keyField])}
              className={`bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800 ${onRowClick ? 'cursor-pointer' : ''}`}
              {...rowProps(item)}
            >
              {/* Card Content */}
              <div className="space-y-3">
                {columns.map((col, index) => {
                  const value = typeof col.accessor === 'function'
                    ? col.accessor(item)
                    : (item[col.accessor] as React.ReactNode);

                  return (
                    <div key={index}>
                      {index === 0 ? (
                        // First column as main heading
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-bold text-gray-900 text-lg flex-1 dark:text-white">{value}</h3>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {onEdit && (
                              <button
                                onClick={() => onEdit(item)}
                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
                                title="Edit"
                              >
                                <Edit3 size={18} />
                              </button>
                            )}
                            {onDelete && (
                              <button
                                onClick={() => onDelete(item)}
                                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Other columns as labeled fields
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1 dark:text-gray-400">{col.header}</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{value || 'N/A'}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center dark:bg-gray-900 dark:border-gray-800">
            {emptyState ?? <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>}
          </div>
        )}
      </div>

      {typeof totalCount === 'number' && typeof pageSize === 'number' && onPageChange && !isEmpty && (
        <div className="flex items-center justify-between bg-white border border-gray-200 border-t-0 rounded-b-lg px-6 py-3 text-sm text-gray-600 md:mt-0 mt-4 md:rounded-t-none rounded-t-lg dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400">
          <span>
            {totalCount === 0
              ? '0 of 0'
              : `${((page ?? 1) - 1) * pageSize + 1}–${Math.min((page ?? 1) * pageSize, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, (page ?? 1) - 1))}
              disabled={(page ?? 1) <= 1}
              className="p-1.5 rounded-md border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => onPageChange((page ?? 1) + 1)}
              disabled={(page ?? 1) * pageSize >= totalCount}
              className="p-1.5 rounded-md border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// Design-system alias: same component, name matches enterprise-artifacts/UI_BUILD_HANDOFF.md's "DataTable".
export { ReusableTable as DataTable };
