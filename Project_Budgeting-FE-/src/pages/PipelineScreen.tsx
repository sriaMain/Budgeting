import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Layout } from '../components/Layout';
import { PipelineStatistics } from '../components/PipelineStatistics';
import { PipelineStage } from '../components/PipelineStage';
import { ErrorState } from '../components/ErrorState';
import type { PipelineData, Quote, PipelineStage as StageType } from '../types/pipeline.types';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { parseApiErrors } from '../utils/parseApiErrors';
import { stageLabel } from '../utils/pipelineStages';

interface PipelineScreenProps {
  userRole?: 'admin' | 'user' | 'manager';
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

// Cards rendered per stage before "Show more" (keeps very long stages fast to draw and drag).
const PAGE_SIZE = 25;

export default function PipelineScreen({
  userRole = 'admin',
  currentPage = 'pipeline',
  onNavigate = () => { }
}: PipelineScreenProps) {
  const navigate = useNavigate();
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  // Filter state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  // The board fills the screen below the header + KPIs and owns the only scrollbars.
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardTop, setBoardTop] = useState(0);

  // Close filter dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFilterDropdown && !target.closest('.filter-dropdown-container')) {
        setShowFilterDropdown(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFilterDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showFilterDropdown]);

  useLayoutEffect(() => {
    const measure = () => {
      if (boardRef.current) setBoardTop(boardRef.current.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pipelineData, selectedStatuses.length]);

  const loadPipelineData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axiosInstance.get('/pipeline-data/');

      if (response.status === 200 && response.data) {
        // Normalize stats keys from backend to frontend expected shape
        const rawStats = response.data.stats || {};
        const normalizedStats = {
          total_quotes: rawStats.total_quotes ?? 0,
          average_quote: rawStats.average_quote ?? 0,
          total_sum: rawStats.total_sum ?? rawStats.revenue ?? 0,
          total_margin: rawStats.total_margin ?? rawStats.expected_profit ?? 0,
          avg_margin_percentage: rawStats.avg_margin_percentage,
        };

        const normalizedData = {
          ...response.data,
          stats: normalizedStats
        };

        setPipelineData(normalizedData);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Failed to load pipeline data:', err);
      setError('Failed to load pipeline data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPipelineData();
  }, []);

  const handleQuoteClick = (quote: Quote) => {
    navigate(`/pipeline/quote/${quote.quote_no}`);
  };

  const handleNewQuote = () => {
    navigate('/pipeline/add-quote');
  };

  const handleFilterClick = () => {
    setShowFilterDropdown(!showFilterDropdown);
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setSelectedStatuses([]);
  };

  const activeFilterCount = selectedStatuses.length;

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // If no destination or dropped in same place, do nothing
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return;
    }

    if (!pipelineData) return;

    const sourceStageId = source.droppableId as StageType;
    const destStageId = destination.droppableId as StageType;

    // Only Confirmed quotes may move to Closed; block Closed as a direct
    // destination from every other stage.
    if (destStageId === 'closed' && sourceStageId !== 'confirmed') {
      toast.error('Only Confirmed quotes can be moved to Closed');
      return;
    }

    // Find the quote being moved
    const sourceStage = pipelineData.stages.find(s => s.stage === sourceStageId);
    const destStage = pipelineData.stages.find(s => s.stage === destStageId);

    if (!sourceStage || !destStage) return;

    const movedQuote = sourceStage.quotes.find(q => q.quote_no.toString() === draggableId);
    if (!movedQuote) return;

    // Optimistically update UI
    let newStages = [...pipelineData.stages];

    if (sourceStageId === destStageId) {
      // Reordering within the same stage
      newStages = newStages.map(stage => {
        if (stage.stage === sourceStageId) {
          const newQuotes = Array.from(stage.quotes);
          const [removed] = newQuotes.splice(source.index, 1);
          newQuotes.splice(destination.index, 0, removed);
          return { ...stage, quotes: newQuotes };
        }
        return stage;
      });
    } else {
      // Moving between different stages
      newStages = newStages.map(stage => {
        if (stage.stage === sourceStageId) {
          const newQuotes = Array.from(stage.quotes);
          newQuotes.splice(source.index, 1);
          return {
            ...stage,
            quotes: newQuotes,
            count: stage.count - 1,
            total_sum: stage.total_sum - parseFloat(movedQuote.quote_value)
          };
        }
        if (stage.stage === destStageId) {
          const newQuotes = Array.from(stage.quotes);
          const updatedQuote = { ...movedQuote, status: destStage.title };
          newQuotes.splice(destination.index, 0, updatedQuote);
          return {
            ...stage,
            quotes: newQuotes,
            count: stage.count + 1,
            total_sum: stage.total_sum + parseFloat(movedQuote.quote_value)
          };
        }
        return stage;
      });
      // A dropped card joins the shown cards rather than pushing the last one behind "Show more".
      setVisibleCounts(prev => ({ ...prev, [destStageId]: (prev[destStageId] ?? PAGE_SIZE) + 1 }));
    }

    const oldData = { ...pipelineData };
    setPipelineData({ ...pipelineData, stages: newStages });

    if (sourceStageId !== destStageId) {
      try {
        // API call to update status
        const response = await axiosInstance.put(`/quotes/${movedQuote.quote_no}/`, {
          status: destStage.title
        });

        if (response.status !== 200 && response.status !== 204) {
          throw new Error('Failed to update quote status');
        }

        toast.success(`Quote #${movedQuote.quote_no} moved to ${stageLabel(destStage.title)}`);
      } catch (err) {
        console.error('Failed to update quote status:', err);
        const apiErrors = parseApiErrors(err);
        toast.error(apiErrors.general || 'Failed to move quote. Reverting changes.');
        setPipelineData(oldData);
      }
    }
  };

  // Filtering shows only the chosen stages (the summary always covers every quote).
  const visibleStages = pipelineData
    ? pipelineData.stages.filter(stage => selectedStatuses.length === 0 || selectedStatuses.includes(stage.title))
    : [];

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="min-w-0 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Pipeline</h1>

          <div className="flex items-center gap-2">
            <div className="relative filter-dropdown-container">
              <button
                type="button"
                onClick={handleFilterClick}
                disabled={!pipelineData}
                aria-haspopup="true"
                aria-expanded={showFilterDropdown}
                aria-controls="pipeline-filter-menu"
                className="relative inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1.5 text-xs font-semibold text-white" aria-label={`${activeFilterCount} stages selected`}>
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {showFilterDropdown && pipelineData && (
                <div id="pipeline-filter-menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40">
                  <div className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filter by stage</h3>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-violet-300"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      {pipelineData.stages.map(stage => (
                        <label key={stage.stage} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.includes(stage.title)}
                            onChange={() => toggleStatusFilter(stage.title)}
                            className="h-4 w-4 rounded border-gray-300 accent-teal-700 dark:border-gray-600"
                          />
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{stageLabel(stage.title)}</span>
                          <span className="text-xs tabular-nums text-gray-400">{stage.count}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleNewQuote}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <Plus size={16} aria-hidden="true" />
              <span>New</span>
            </button>
          </div>
        </header>

        {isLoading && !pipelineData ? (
          <div role="status" aria-label="Loading pipeline" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 min-[1024px]:grid-cols-4">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}
            </div>
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-80 w-[272px] shrink-0 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/60" />)}
            </div>
          </div>
        ) : error || !pipelineData ? (
          <ErrorState message={error || 'Failed to load pipeline data. Please try again.'} onRetry={loadPipelineData} />
        ) : (
          <>
            <PipelineStatistics stats={pipelineData.stats} stageCount={pipelineData.stages.length} />

            <div className="space-y-2">
              {activeFilterCount > 0 && (
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                  Showing {visibleStages.length} of {pipelineData.stages.length} stages: {visibleStages.map(s => stageLabel(s.title)).join(', ')} ·{' '}
                  <button type="button" onClick={clearFilters} className="font-medium text-teal-700 hover:underline dark:text-violet-300">Show all</button>
                </p>
              )}
              {/* One scroll container for the whole board (both directions): stage headers stick to
                  its top, its own horizontal scrollbar sits at the bottom of the screen, and drag
                  auto-scroll keeps working (no nested scroll areas). */}
              <div
                ref={boardRef}
                role="region"
                aria-label="Pipeline board"
                tabIndex={0}
                style={{ height: `max(26rem, calc(100dvh - ${boardTop}px - 2rem))` }}
                // relative: keeps absolutely positioned (sr-only) card text inside this scroll box,
                // otherwise it escapes and the whole page scrolls sideways.
                className="relative overflow-auto overscroll-x-contain rounded-lg border border-gray-200 bg-white [scrollbar-width:thin] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-gray-800 dark:bg-gray-900"
              >
                <DragDropContext onDragEnd={onDragEnd}>
                  <div className="flex min-h-full w-max items-stretch gap-3 p-3">
                    {visibleStages.map(stage => (
                      <PipelineStage
                        key={stage.stage}
                        stage={stage}
                        visibleCount={visibleCounts[stage.stage] ?? PAGE_SIZE}
                        onShowMore={() => setVisibleCounts(prev => ({ ...prev, [stage.stage]: (prev[stage.stage] ?? PAGE_SIZE) + PAGE_SIZE }))}
                        onQuoteClick={handleQuoteClick}
                      />
                    ))}
                  </div>
                </DragDropContext>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
