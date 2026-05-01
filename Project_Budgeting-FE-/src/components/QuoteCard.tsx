import React from 'react';
import { Building2 } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';
import type { Quote } from '../types/pipeline.types';

interface QuoteCardProps {
  quote: Quote;
  index: number;
  onClick?: (quote: Quote) => void;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, index, onClick }) => {
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Parse quote value safely
  const quoteValue = parseFloat(quote.quote_value) || 0;

  return (
    <Draggable draggableId={quote.quote_no.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(quote)}
          className={`bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500 ring-opacity-50' : ''
            }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-gray-900 text-sm">{quote.client_name}</span>
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
              #{quote.quote_no}
            </span>
          </div>

          {/* Quote Name */}
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 truncate" title={quote.quote_name}>
              {quote.quote_name}
            </p>
          </div>

          {/* Date */}
          <div className="text-xs text-gray-500 mb-3">
            <span>Issue Date: {formatDate(quote.date_of_issue)}</span>
          </div>

          {/* Value */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Quote Value</span>
            <span className="font-bold text-gray-900">
              ₹{quoteValue.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
};
