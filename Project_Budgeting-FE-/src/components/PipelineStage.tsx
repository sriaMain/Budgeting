import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { QuoteCard } from './QuoteCard';
import type { StageColumn, Quote } from '../types/pipeline.types';
import { formatMoney } from '../utils/format';
import { stageLabel, stageTheme } from '../utils/pipelineStages';

interface PipelineStageProps {
  stage: StageColumn;
  /** Cards rendered (the first N); the rest wait behind "Show more". */
  visibleCount: number;
  onShowMore: () => void;
  onQuoteClick?: (quote: Quote) => void;
}

/**
 * One stage column. It doesn't scroll by itself: the whole board is the single scroll container
 * (which keeps drag auto-scroll working), and this header sticks to its top.
 */
export const PipelineStage: React.FC<PipelineStageProps> = ({ stage, visibleCount, onShowMore, onQuoteClick }) => {
  const theme = stageTheme(stage.stage);
  const label = stageLabel(stage.title);
  const total = formatMoney(stage.total_sum);
  const shown = stage.quotes.slice(0, visibleCount);
  const hidden = stage.quotes.length - shown.length;
  const headingId = `pipeline-stage-${stage.stage}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`flex w-[260px] shrink-0 flex-col rounded-lg border border-t-[3px] min-[1024px]:w-[272px] min-[1440px]:w-[288px] ${theme.column} ${theme.accent}`}
    >
      <header className="sticky top-0 z-10 rounded-t-md bg-white dark:bg-gray-900">
        <div className={`flex h-16 flex-col justify-center rounded-t-md border-b border-black/5 px-3 dark:border-white/5 ${theme.header}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 id={headingId} className="truncate text-sm font-semibold text-gray-900 dark:text-white">{label}</h2>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 ring-1 ring-black/5 dark:bg-gray-900/60 dark:text-gray-200 dark:ring-white/10">
              {stage.count}
            </span>
          </div>
          <p className="mt-1 truncate text-xs tabular-nums text-gray-600 dark:text-gray-400" title={formatMoney(stage.total_sum, 'INR', 2)}>
            {stage.count} {stage.count === 1 ? 'quote' : 'quotes'} · {total}
          </p>
        </div>
      </header>

      <Droppable droppableId={stage.stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex flex-1 flex-col gap-2.5 rounded-b-md p-2.5 transition-colors ${snapshot.isDraggingOver ? 'bg-teal-50/70 ring-2 ring-inset ring-teal-300 dark:bg-violet-500/10 dark:ring-violet-700' : ''}`}
          >
            {shown.map((quote, index) => (
              <QuoteCard key={quote.quote_no} quote={quote} index={index} onClick={onQuoteClick} />
            ))}
            {provided.placeholder}
            {stage.quotes.length === 0 && !snapshot.isDraggingOver && (
              <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">No quotes in this stage</p>
            )}
            {hidden > 0 && (
              <button
                type="button"
                onClick={onShowMore}
                className="rounded-md border border-dashed border-gray-300 bg-white/70 py-2 text-xs font-medium text-teal-700 hover:border-teal-400 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-violet-300 dark:hover:bg-gray-900"
              >
                Show {Math.min(hidden, 25)} more ({hidden} hidden)
              </button>
            )}
          </div>
        )}
      </Droppable>
    </section>
  );
};
