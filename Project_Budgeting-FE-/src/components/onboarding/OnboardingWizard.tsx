import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Save, Send } from 'lucide-react';

/**
 * Step-based onboarding shell shared by Client, Vendor and Freelancer onboarding:
 * a progress header (WizardProgress) and an action footer (WizardFooter). They are separate
 * so a Drawer can put the footer in its own sticky footer slot.
 */

export type WizardStepState = 'complete' | 'error' | 'incomplete';

export interface WizardStep {
  key: string;
  title: string;
  description?: string;
  state?: WizardStepState;
  /** Shown as "(optional)" - e.g. commercial details an invitee doesn't provide. */
  optional?: boolean;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentKey: string;
  onStepChange: (key: string) => void;
  /** Extra line under the bar, e.g. "Draft saved 2 min ago". */
  statusText?: React.ReactNode;
}

export const WizardProgress: React.FC<WizardProgressProps> = ({ steps, currentKey, onStepChange, statusText }) => {
  const scrollerRef = useRef<HTMLOListElement>(null);
  const index = Math.max(0, steps.findIndex((s) => s.key === currentKey));
  const complete = steps.filter((s) => s.state === 'complete').length;
  const pct = steps.length ? Math.round((complete / steps.length) * 100) : 0;
  const current = steps[index];

  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-gray-700 dark:text-gray-200">
          Step {index + 1} of {steps.length}
          <span className="hidden sm:inline font-normal text-gray-500 dark:text-gray-400"> · {current?.title}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">{pct}% complete</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Onboarding progress">
        <div className="h-full rounded-full bg-blue-600 dark:bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <nav aria-label="Onboarding steps">
        <ol ref={scrollerRef} className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {steps.map((step, i) => {
            const isCurrent = step.key === currentKey;
            const tone = isCurrent
              ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-violet-500 dark:bg-violet-500/10 dark:text-violet-200'
              : step.state === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                : step.state === 'complete'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400';
            const marker = step.state === 'complete' && !isCurrent
              ? <Check className="w-3.5 h-3.5" />
              : step.state === 'error'
                ? <AlertTriangle className="w-3.5 h-3.5" />
                : <span className="text-[11px] font-bold">{i + 1}</span>;
            return (
              <li key={step.key} className="snap-start shrink-0">
                <button
                  type="button"
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => onStepChange(step.key)}
                  title={step.description}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tone}`}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center bg-white/70 dark:bg-black/20">{marker}</span>
                  {step.title}
                  {step.optional && <span className="font-normal opacity-70">(optional)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {statusText && <div className="text-xs text-gray-500 dark:text-gray-400">{statusText}</div>}
    </div>
  );
};

interface WizardFooterProps {
  isFirst: boolean;
  isLast: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSaveDraft?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** Submit is disabled (with this reason as tooltip/help) until everything is complete. */
  submitBlockedReason?: string;
  /** Read-only views (submitted / approved) only navigate. */
  readOnly?: boolean;
  /** Left-hand note, e.g. unsaved-changes warning. */
  note?: React.ReactNode;
}

export const WizardFooter: React.FC<WizardFooterProps> = ({
  isFirst, isLast, onPrevious, onNext, onSaveDraft, onSubmit, onCancel, isSaving, isSubmitting, submitLabel = 'Submit for approval',
  submitBlockedReason, readOnly, note,
}) => {
  const busy = isSaving || isSubmitting;
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
      <div className="flex items-center gap-2 min-w-0">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Cancel
          </button>
        )}
        {!readOnly && onSaveDraft && (
          <button type="button" onClick={onSaveDraft} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving…' : 'Save draft'}
          </button>
        )}
        {note && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{note}</span>}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onPrevious} disabled={isFirst || busy} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        {!isLast ? (
          <button type="button" onClick={onNext} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-700">
            {readOnly ? 'Next' : 'Save & next'} <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          !readOnly && onSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || !!submitBlockedReason}
              title={submitBlockedReason}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-violet-600 dark:hover:bg-violet-700"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSubmitting ? 'Submitting…' : submitLabel}
            </button>
          )
        )}
      </div>
    </div>
  );
};

/** Card grouping related fields inside a step. */
export const FormSection: React.FC<{ title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; id?: string }> = ({
  title, description, actions, children, id,
}) => (
  <section id={id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {description && <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{description}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

export interface ReviewRow {
  label: string;
  value: React.ReactNode;
  /** Highlight a missing required value. */
  missing?: boolean;
  wide?: boolean;
}

/** Read-only summary of one step on the Review & Submit screen. */
export const ReviewSection: React.FC<{ title: string; rows: ReviewRow[]; onEdit?: () => void; issues?: string[] }> = ({ title, rows, onEdit, issues }) => (
  <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        {issues && issues.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Check className="w-4 h-4 text-green-600" />}
        {title}
      </h3>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-xs font-medium text-blue-600 hover:underline dark:text-violet-400">
          Edit <ChevronRight className="inline w-3 h-3" />
        </button>
      )}
    </div>
    {issues && issues.length > 0 && (
      <ul className="px-4 pt-3 space-y-1">
        {issues.map((i) => (
          <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {i}</li>
        ))}
      </ul>
    )}
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
      {rows.map((r) => (
        <div key={r.label} className={r.wide ? 'sm:col-span-2' : ''}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{r.label}</dt>
          <dd className={`text-sm break-words ${r.missing ? 'text-amber-700 dark:text-amber-400 italic' : 'text-gray-900 dark:text-gray-100'}`}>
            {r.missing ? 'Missing' : r.value === '' || r.value === null || r.value === undefined ? <span className="text-gray-400">—</span> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);
