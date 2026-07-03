import React from 'react';
import { Building2, Calendar, Clock, ArrowUpRight } from 'lucide-react';
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
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const val = parseFloat(quote.quote_value) || 0;

  // Auto-calculated priority based on value
  let priority: 'High' | 'Medium' | 'Low' = 'Low';
  let priorityStyle = 'bg-slate-50 text-slate-700 border-slate-100';
  if (val >= 500000) {
    priority = 'High';
    priorityStyle = 'bg-rose-50 text-rose-700 border-rose-100/60';
  } else if (val >= 150000) {
    priority = 'Medium';
    priorityStyle = 'bg-amber-50 text-amber-700 border-amber-100/60';
  }

  // Consistent mock timestamps based on quote_no
  const getMockTimestamp = (no: number) => {
    const states = ['Updated 2h ago', 'Updated yesterday', 'Updated 3 days ago', 'Updated 5h ago'];
    return states[no % states.length];
  };

  return (
    <Draggable draggableId={quote.quote_no.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(quote)}
          className={`bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-md transition-premium cursor-pointer group flex flex-col justify-between h-[180px] select-none ${
            snapshot.isDragging ? 'shadow-xl border-blue-500/30 ring-4 ring-blue-500/10' : ''
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 max-w-[70%]">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-800 text-[13px] truncate" title={quote.client_name}>
                {quote.client_name}
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-0.5 rounded-full shrink-0">
              #{quote.quote_no}
            </span>
          </div>

          {/* Deal Name */}
          <div className="my-2.5 flex-1">
            <h4 className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 transition-premium line-clamp-2 leading-tight" title={quote.quote_name}>
              {quote.quote_name}
            </h4>
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityStyle}`}>
              {priority} Priority
            </span>
            <span className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-350" /> {getMockTimestamp(quote.quote_no)}
            </span>
          </div>

          {/* Value and Date Footer */}
          <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Deal Value</span>
            <span className="font-extrabold text-slate-950 text-base tracking-tight flex items-center gap-0.5">
              ₹{val.toLocaleString('en-IN', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
};
