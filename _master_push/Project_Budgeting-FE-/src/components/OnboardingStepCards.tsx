import React, { useEffect, useRef } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';

/**
 * Shared onboarding step cards - one visual language for every onboarding workflow
 * (Clients & KYC, Vendor onboarding). Each module maps its own data onto StepCardItem;
 * this component only renders.
 */

export type StepCardStatus = 'completed' | 'in_progress' | 'pending' | 'requires_review' | 'failed';

export interface StepCardItem {
  key: string;
  title: string;
  description: string;
  status: StepCardStatus;
  isCurrent: boolean;
}

type StepCardTone = 'completed' | 'current' | 'pending' | 'requires_review' | 'failed';

// Same tones as VendorStepper and the Active/Risk badges (green success, amber warning, risk/red danger)
// and the app's blue/violet accent for the current step.
const STEP_CARD_STYLES: Record<StepCardTone, { card: string; marker: string; text: string }> = {
  completed: {
    card: 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10',
    marker: 'bg-green-600 text-white',
    text: 'text-green-700 dark:text-green-300',
  },
  current: {
    card: 'border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:border-violet-500 dark:bg-violet-500/10 dark:ring-violet-500',
    marker: 'bg-blue-600 text-white dark:bg-violet-600',
    text: 'text-blue-700 dark:text-violet-300',
  },
  pending: {
    card: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
    marker: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    text: 'text-gray-500 dark:text-gray-400',
  },
  requires_review: {
    card: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
    marker: 'bg-amber-500 text-white',
    text: 'text-amber-700 dark:text-amber-300',
  },
  failed: {
    card: 'border-risk-600/40 bg-risk-50 dark:border-red-500/40 dark:bg-red-500/10',
    marker: 'bg-risk-600 text-white dark:bg-red-600',
    text: 'text-risk-700 dark:text-red-300',
  },
};

const stepCardTone = (step: StepCardItem): StepCardTone => {
  if (step.status === 'failed' || step.status === 'requires_review' || step.status === 'completed') return step.status;
  return step.isCurrent ? 'current' : 'pending';
};

export const stepCardStatusLabel = (step: StepCardItem): string => {
  if (step.status === 'completed') return 'Completed';
  if (step.status === 'failed') return step.isCurrent ? 'Current · Failed' : 'Failed';
  if (step.status === 'requires_review') return step.isCurrent ? 'Current · Requires review' : 'Requires review';
  if (step.isCurrent) return 'Current';
  return step.status === 'in_progress' ? 'In progress' : 'Pending';
};

/** Marks the current step: the preferred key if it isn't completed, else the first incomplete step. */
export const markCurrentStep = <T extends Omit<StepCardItem, 'isCurrent'>>(steps: T[], preferredKey?: string | null): (T & { isCurrent: boolean })[] => {
  const own = steps.findIndex((s) => s.key === preferredKey);
  const currentIndex = own >= 0 && steps[own].status !== 'completed' ? own : steps.findIndex((s) => s.status !== 'completed');
  return steps.map((s, i) => ({ ...s, isCurrent: i === currentIndex }));
};

interface OnboardingStepCardsProps {
  steps: StepCardItem[];
  /** Omit to render the cards read-only. */
  onStepClick?: (key: string) => void;
  clickHint?: (step: StepCardItem) => string;
  /** Re-scrolls the current card into view on narrow screens when this changes (e.g. selected record id). */
  scrollKey?: string | number | null;
  /** Hide the status line - e.g. for a generic, not-yet-selected overview of the steps. */
  showStatus?: boolean;
  /** Tighter cards without descriptions (e.g. inside a drawer), always one row from md up. */
  compact?: boolean;
}

export const OnboardingStepCards: React.FC<OnboardingStepCardsProps> = ({ steps, onStepClick, clickHint, scrollKey, showStatus = true, compact = false }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentKey = steps.find((s) => s.isCurrent)?.key;

  // On narrow screens the cards scroll horizontally - bring the current step into view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const currentCard = scroller?.querySelector<HTMLElement>('[data-current-step="true"]');
    if (scroller && currentCard && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollTo({ left: currentCard.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
    }
  }, [scrollKey, currentKey]);

  const desktopCols = steps.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-6';
  const layout = compact
    ? `flex gap-2 overflow-x-auto snap-x pb-1 md:grid md:overflow-visible md:pb-0 ${steps.length === 5 ? 'md:grid-cols-5' : 'md:grid-cols-6'}`
    : `flex gap-3 overflow-x-auto snap-x pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 ${desktopCols}`;

  return (
    <div ref={scrollerRef} className={layout}>
      {steps.map((step, i) => {
        const styles = STEP_CARD_STYLES[showStatus ? stepCardTone(step) : 'pending'];
        const clickable = Boolean(onStepClick);
        return (
          <button
            key={step.key}
            type="button"
            data-current-step={showStatus && step.isCurrent}
            aria-current={showStatus && step.isCurrent ? 'step' : undefined}
            disabled={!clickable}
            onClick={() => onStepClick?.(step.key)}
            title={clickable ? clickHint?.(step) : undefined}
            className={`${compact ? 'w-36 p-2.5 gap-1' : 'w-56 p-3 gap-1.5'} shrink-0 snap-start md:w-auto text-left rounded-lg border flex flex-col transition-shadow ${styles.card} ${
              clickable
                ? 'cursor-pointer hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-violet-500'
                : 'cursor-default'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${styles.marker}`}>
              {showStatus && step.status === 'completed' ? (
                <Check size={14} />
              ) : showStatus && step.status === 'failed' ? (
                <X size={14} />
              ) : showStatus && step.status === 'requires_review' ? (
                <AlertTriangle size={13} />
              ) : (
                i + 1
              )}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{step.title}</span>
            {!compact && <span className="text-xs text-gray-500 leading-snug dark:text-gray-400">{step.description}</span>}
            {showStatus && <span className={`mt-auto text-xs font-semibold ${styles.text}`}>{stepCardStatusLabel(step)}</span>}
          </button>
        );
      })}
    </div>
  );
};
