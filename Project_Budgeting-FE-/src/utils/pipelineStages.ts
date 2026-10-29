/** Pipeline stage colours and display labels shared by the board, its stage columns and cards. */
import type { PipelineStage } from '../types/pipeline.types';

interface StageTheme {
  /** Column body tint + border. */
  column: string;
  /** Header tint, laid over an opaque base (the header stays pinned while cards scroll under it). */
  header: string;
  /** Coloured top edge of the column. */
  accent: string;
  /** Status pill on a card. */
  pill: string;
}

const NEUTRAL: StageTheme = {
  column: 'bg-gray-50/70 border-gray-200 dark:bg-gray-800/40 dark:border-gray-700',
  header: 'bg-gray-50 dark:bg-gray-800',
  accent: 'border-t-gray-400 dark:border-t-gray-500',
  pill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

export const STAGE_THEME: Record<PipelineStage, StageTheme> = {
  oppurtunity: NEUTRAL,
  scoping: {
    column: 'bg-blue-50/60 border-blue-200 dark:bg-blue-500/5 dark:border-blue-900',
    header: 'bg-blue-50 dark:bg-blue-500/10',
    accent: 'border-t-blue-500',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  proposal: {
    column: 'bg-yellow-50/60 border-yellow-200 dark:bg-yellow-500/5 dark:border-yellow-900',
    header: 'bg-yellow-50 dark:bg-yellow-500/10',
    accent: 'border-t-yellow-500',
    pill: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  },
  confirmed: {
    column: 'bg-green-50/60 border-green-200 dark:bg-green-500/5 dark:border-green-900',
    header: 'bg-green-50 dark:bg-green-500/10',
    accent: 'border-t-green-500',
    pill: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  rejected: {
    column: 'bg-red-50/60 border-red-200 dark:bg-red-500/5 dark:border-red-900',
    header: 'bg-red-50 dark:bg-red-500/10',
    accent: 'border-t-red-500',
    pill: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  closed: {
    column: 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-500/5 dark:border-emerald-900',
    header: 'bg-emerald-50 dark:bg-emerald-500/10',
    accent: 'border-t-emerald-600',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  cancelled: NEUTRAL,
};

export const stageTheme = (stage: string): StageTheme => STAGE_THEME[stage as PipelineStage] ?? NEUTRAL;

/** Display label for a stage/status value; the stored "Oppurtunity" value is kept for the API. */
export const stageLabel = (title: string) => (title === 'Oppurtunity' ? 'Opportunity' : title);
