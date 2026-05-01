import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
}

interface ReusableTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  isLoading?: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  emptyMessage?: string;
}

export const ReusableTable = <T extends any>({
  data,
  columns,
  keyField,
  isLoading = false,
  onEdit,
  onDelete,
  emptyMessage = "No records found."
}: ReusableTableProps<T>) => {

  if (isLoading) {
    return (
      <>
        {/* Desktop Loading Skeleton */}
        <div className="hidden md:block w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-100 border-b border-gray-200" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 border-b border-gray-100 flex items-center px-6">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Loading Skeleton */}
        <div className="md:hidden space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-full mb-2" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                {columns.map((col, index) => (
                  <th key={index} className={`py-4 px-6 text-base ${col.className || ''}`}>
                    {col.header}
                  </th>
                ))}
                {(onEdit || onDelete) && <th className="py-4 px-6 text-center text-base w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length > 0 ? (
                data.map((item, rowIndex) => (
                  <tr key={String(item[keyField])} className="hover:bg-gray-50 transition-colors">
                    {columns.map((col, colIndex) => (
                      <td key={colIndex} className={`py-4 px-6 text-sm text-gray-600 ${col.className || ''}`}>
                        {typeof col.accessor === 'function'
                          ? col.accessor(item)
                          : (item[col.accessor] as React.ReactNode)}
                      </td>
                    ))}

                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="py-12 text-center text-gray-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {data.length > 0 ? (
          data.map((item) => (
            <div
              key={String(item[keyField])}
              className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
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
                          <h3 className="font-bold text-gray-900 text-lg flex-1">{value}</h3>
                          {onEdit && (
                            <button
                              onClick={() => onEdit(item)}
                              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit3 size={18} />
                            </button>
                          )}
                        </div>
                      ) : (
                        // Other columns as labeled fields
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">{col.header}</p>
                          <p className="text-sm text-gray-900">{value || 'N/A'}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        )}
      </div>
    </>
  );
};