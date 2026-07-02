/**
 * Pipeline Module Types
 * Defines all interfaces and types for the pipeline/opportunity management system
 */

export type PipelineStage = 'oppurtunity' | 'scoping' | 'proposal' | 'confirmed';

export interface Quote {
  quote_no: number;
  client_id: number;
  client_name: string;
  quote_name: string;
  date_of_issue: string;
  quote_value: string;
  status: string;
}

export interface StageColumn {
  stage: PipelineStage;
  title: string;
  count: number;
  total_sum: number;
  quotes: Quote[];
}

export interface PipelineStats {
  total_quotes: number;
  average_quote: number;
  total_sum: number;
  total_margin: number;
}

export interface PipelineData {
  stats: PipelineStats;
  stages: StageColumn[];
}

export interface QuoteFormData {
  client_id: number;
  client_name: string;
  margin_percentage: number;
  probability: number;
  quote_value: number;
  stage: PipelineStage;
}

export interface PipelineFilters {
  search?: string;
  client_id?: number;
  stage?: PipelineStage;
  min_value?: number;
  max_value?: number;
}
