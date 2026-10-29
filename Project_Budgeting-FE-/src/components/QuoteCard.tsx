import { formatDate } from '../utils/date';
import React from 'react';
import { CalendarDays, FolderKanban } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';
import type { Quote } from '../types/pipeline.types';
import { formatMoney } from '../utils/format';
import { stageLabel, stageTheme } from '../utils/pipelineStages';

interface QuoteCardProps {
  quote: Quote;
  index: number;
  onClick?: (quote: Quote) => void;
}

/** One quotation on the pipeline board: click or Enter opens it; drag (or Space + arrows) moves it. */
export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, index, onClick }) => {
  const amount = formatMoney(quote.quote_value, quote.currency, 2);
  const status = stageLabel(quote.status);

  return (
    <Draggable draggableId={quote.quote_no.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(quote)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClick?.(quote);
            }
          }}
          className={`block cursor-pointer rounded-lg border bg-white p-3 transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-gray-900 ${snapshot.isDragging
            ? 'border-teal-400 shadow-lg ring-2 ring-teal-500/40 dark:border-violet-500'
            : 'border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:hover:border-gray-700'
            }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white" title={quote.client_name || undefined}>
              {quote.client_name || 'No client'}
            </p>
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              #{quote.quote_no}
            </span>
          </div>

          <p className="mt-1 truncate text-[13px] text-gray-600 dark:text-gray-300" title={quote.quote_name}>
            {quote.quote_name}
          </p>

          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex min-w-0 items-center gap-1">
              <CalendarDays size={12} aria-hidden="true" className="shrink-0" />
              <span className="sr-only">Issued</span>
              <span className="truncate">{formatDate(quote.date_of_issue)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {quote.has_project && (
                <span title="A project has been created from this quote" className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium text-teal-700 dark:text-violet-300">
                  <FolderKanban size={12} aria-hidden="true" /> Project
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${stageTheme(quote.status.toLowerCase()).pill}`}>{status}</span>
            </span>
          </div>

          <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400">Quote value</span>
            <span className="min-w-0 truncate text-[15px] font-bold tabular-nums text-gray-900 dark:text-white" title={amount}>{amount}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
};
