import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/useAppSelector';
import { Plus, SlidersHorizontal, Folder, ChevronRight, Briefcase, FileText, TrendingUp, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Layout } from '../components/Layout';
import { PremiumKpiCard } from '../components/PremiumKpiCard';
import { QuoteCard } from '../components/QuoteCard';
import type { PipelineData, Quote, PipelineStage as StageType } from '../types/pipeline.types';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import { parseApiErrors } from '../utils/parseApiErrors';

export default function PipelineScreen({
  userRole = 'admin',
  currentPage = 'pipeline',
  onNavigate = () => { }
}: any) {
  const navigate = useNavigate();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StageType>('oppurtunity');

  // Filter state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    loadPipelineData();
  }, [accessToken]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFilterDropdown && !target.closest('.filter-dropdown-container')) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterDropdown]);

  const loadPipelineData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axiosInstance.get('/pipeline-data/');

      if (response.status === 200 && response.data) {
        // Normalize stats keys from backend
        const rawStats = response.data.stats || {};
        const normalizedStats = {
          total_quotes: rawStats.total_quotes ?? 0,
          average_quote: rawStats.average_quote ?? 0,
          total_sum: rawStats.total_sum ?? rawStats.revenue ?? 0,
          total_margin: rawStats.total_margin ?? rawStats.expected_profit ?? 0
        };

        const normalizedData = {
          ...response.data,
          stats: normalizedStats
        };

        setPipelineData(normalizedData);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      console.error('Failed to load pipeline data:', err);
      setError('Failed to load pipeline data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
      // Moving from active stage grid to a sidebar stage folder!
      newStages = newStages.map(stage => {
        if (stage.stage === sourceStageId) {
          const newQuotes = Array.from(stage.quotes);
          const idx = newQuotes.findIndex(q => q.quote_no.toString() === draggableId);
          if (idx !== -1) {
            newQuotes.splice(idx, 1);
          }
          return {
            ...stage,
            quotes: newQuotes,
            count: Math.max(0, stage.count - 1),
            total_sum: Math.max(0, stage.total_sum - parseFloat(movedQuote.quote_value))
          };
        }
        if (stage.stage === destStageId) {
          const newQuotes = Array.from(stage.quotes);
          const updatedQuote = { ...movedQuote, status: destStage.title };
          newQuotes.push(updatedQuote);
          return {
            ...stage,
            quotes: newQuotes,
            count: stage.count + 1,
            total_sum: stage.total_sum + parseFloat(movedQuote.quote_value)
          };
        }
        return stage;
      });
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

        toast.success(`Quote #${movedQuote.quote_no} moved to ${destStage.title}`);
      } catch (err) {
        console.error('Failed to update quote status:', err);
        const apiErrors = parseApiErrors(err);
        toast.error(apiErrors.general || 'Failed to move quote. Reverting changes.');
        setPipelineData(oldData);
      }
    }
  };

  if (isLoading) {
    return (
      <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={loadPipelineData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  if (!pipelineData) {
    return null;
  }

  // Filter stage folders & quotes
  const filteredPipelineData = {
    ...pipelineData,
    stages: pipelineData.stages.map(stage => {
      if (selectedStatuses.length === 0) {
        return stage;
      }
      const isVisible = selectedStatuses.includes(stage.title);
      return {
        ...stage,
        quotes: isVisible ? stage.quotes : [],
        count: isVisible ? stage.count : 0,
        total_sum: isVisible ? stage.total_sum : 0
      };
    })
  };

  // Calculations for stats using filtered data
  const totalPipelineValue = filteredPipelineData.stages.reduce((acc, s) => acc + s.total_sum, 0);
  const totalQuotesCount = filteredPipelineData.stages.reduce((acc, s) => acc + s.count, 0);
  const confirmedStage = filteredPipelineData.stages.find(s => s.stage === 'confirmed');
  const confirmedQuotesCount = confirmedStage ? confirmedStage.count : 0;
  
  const conversionRate = totalQuotesCount > 0 
    ? Math.round((confirmedQuotesCount / totalQuotesCount) * 100) 
    : 0;
  const averageDealValue = totalQuotesCount > 0 
    ? Math.round(totalPipelineValue / totalQuotesCount) 
    : 0;

  const currentStageColumn = filteredPipelineData.stages.find(s => s.stage === activeStage);
  const activeQuotes = currentStageColumn ? currentStageColumn.quotes : [];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <Layout userRole={userRole} currentPage={currentPage} onNavigate={onNavigate}>
      <div className="space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pipeline</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="relative filter-dropdown-container">
              <button
                onClick={handleFilterClick}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200/60 rounded-xl hover:bg-slate-50 transition-premium text-slate-700 font-bold text-sm relative"
              >
                <span>Filter</span>
                <SlidersHorizontal size={16} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Filter Dropdown */}
              {showFilterDropdown && (
                <div className="absolute top-full mt-2 right-0 bg-white border border-slate-200/60 rounded-xl shadow-lg z-50 w-64 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900">Filter by Stage</h3>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {['Oppurtunity', 'Scoping', 'Proposal', 'Confirmed'].map(status => (
                      <label key={status} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-premium select-none">
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(status)}
                          onChange={() => toggleStatusFilter(status)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 transition-premium"
                        />
                        <span className="text-xs font-semibold text-slate-700">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleNewQuote}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-premium shadow-sm hover:shadow hover:scale-[1.02] text-sm flex-1 sm:flex-initial justify-center"
            >
              <Plus size={16} />
              <span>Add Quotation</span>
            </button>
          </div>
        </div>

        {/* Statistics Header using PremiumKpiCard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PremiumKpiCard 
            title="Pipeline Value" 
            value={totalPipelineValue}
            isLoading={isLoading}
            formatter={formatCurrency}
            icon={<Briefcase className="w-5 h-5" />}
            sparklineData={[8, 12, 10, 15, 14, 18]}
          />
          <PremiumKpiCard 
            title="Total Proposals" 
            value={totalQuotesCount}
            isLoading={isLoading}
            icon={<FileText className="w-5 h-5" />}
            sparklineData={[10, 11, 10, 14, 15, 15]}
          />
          <PremiumKpiCard 
            title="Win Conversion" 
            value={`${conversionRate}%`}
            isLoading={isLoading}
            icon={<TrendingUp className="w-5 h-5" />}
            sparklineData={[5, 10, 15, 12, 18, 25]}
          />
          <PremiumKpiCard 
            title="Avg Deal Value" 
            value={averageDealValue}
            isLoading={isLoading}
            formatter={formatCurrency}
            icon={<DollarSign className="w-5 h-5" />}
            sparklineData={[12, 10, 11, 15, 14, 16]}
          />
        </div>

        {/* Focus Mode: Split-Pane Workspace */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            
            {/* Left Sidebar: Stages list (Droppable fold targets) */}
            <div className="w-full lg:w-[260px] shrink-0 space-y-3 lg:sticky lg:top-[96px] z-10 bg-slate-50/50 p-2.5 rounded-2xl border border-slate-200/50">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">Pipeline Stages</span>
              <div className="space-y-2">
                {filteredPipelineData.stages.map(stage => {
                  const isActive = activeStage === stage.stage;
                  
                  return (
                    <Droppable droppableId={stage.stage} key={stage.stage} isDropDisabled={isActive}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          onClick={() => setActiveStage(stage.stage)}
                          className={`p-3.5 rounded-xl border transition-premium cursor-pointer flex flex-col gap-1 relative ${
                            isActive 
                              ? 'bg-blue-50/90 border-blue-200 shadow-sm text-blue-700' 
                              : 'bg-white border-slate-200/60 text-slate-700 hover:bg-slate-50'
                          } ${snapshot.isDraggingOver ? 'bg-blue-100 border-blue-500 border-dashed scale-[1.02] shadow-md ring-4 ring-blue-500/10' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs tracking-tight flex items-center gap-1.5">
                              <Folder className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                              {stage.title}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isActive ? 'bg-blue-200/75 text-blue-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {stage.count}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center mt-1">
                            <span className={`text-[11px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                              {formatCurrency(stage.total_sum)}
                            </span>
                            {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-500" />}
                          </div>
                          
                          {/* Hide placeholder to prevent rendering offset */}
                          <div className="hidden">{provided.placeholder}</div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </div>

            {/* Right Main Workspace: Responsive quotes grid for the active stage */}
            <div className="flex-1 w-full bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm min-h-[500px]">
              <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                    {currentStageColumn?.title} Quotes
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">Drag to reorder deals or drop on stage folders to transition</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stage Value</span>
                  <p className="font-extrabold text-slate-950 text-base mt-0.5">
                    {formatCurrency(currentStageColumn?.total_sum || 0)}
                  </p>
                </div>
              </div>

              {/* Quotes Grid Droppable */}
              <Droppable droppableId={activeStage} direction="vertical">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5 min-h-[400px] transition-premium ${
                      snapshot.isDraggingOver ? 'bg-slate-50/50 rounded-2xl p-2 border-2 border-dashed border-slate-200/60' : ''
                    }`}
                  >
                    {activeQuotes.length > 0 ? (
                      activeQuotes.map((quote, index) => (
                        <QuoteCard
                          key={quote.quote_no}
                          quote={quote}
                          index={index}
                          onClick={handleQuoteClick}
                        />
                      ))
                    ) : (
                      <div className="col-span-full flex flex-col items-center justify-center py-20 text-center space-y-2">
                        <Folder className="w-12 h-12 text-slate-200" />
                        <h3 className="font-bold text-slate-700 text-sm">No Active Proposals</h3>
                        <p className="text-xs text-slate-400 max-w-[240px]">There are currently no deal quotes in this stage. Drag deals here or create a new quote.</p>
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>

          </div>
        </DragDropContext>

      </div>
    </Layout>
  );
}
