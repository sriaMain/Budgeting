import React from 'react';
import { Check } from 'lucide-react';

export interface StepConfig {
  index: number;
  label: string;
}

interface VendorStepperProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: Set<number>;
  errorSteps?: Set<number>;
  onStepClick: (index: number) => void;
}

export const VendorStepper: React.FC<VendorStepperProps> = ({ steps, currentStep, completedSteps, errorSteps, onStepClick }) => {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-center min-w-max sm:min-w-0 sm:justify-between">
        {steps.map((step, idx) => {
          const isCompleted = completedSteps.has(step.index);
          const isCurrent = step.index === currentStep;
          const hasError = errorSteps?.has(step.index);
          const isClickable = isCompleted || isCurrent;

          let circleClasses = 'bg-gray-100 text-gray-400 border-gray-300';
          if (hasError) circleClasses = 'bg-red-100 text-red-600 border-red-400';
          else if (isCompleted) circleClasses = 'bg-green-600 text-white border-green-600';
          else if (isCurrent) circleClasses = 'bg-blue-600 text-white border-blue-600';

          return (
            <React.Fragment key={step.index}>
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.index)}
                disabled={!isClickable}
                className={`flex flex-col items-center gap-1.5 px-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold ${circleClasses}`}>
                  {isCompleted && !hasError ? <Check className="w-4.5 h-4.5" /> : step.index}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? 'text-blue-700' : 'text-gray-500'}`}>
                  {step.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div className={`h-0.5 flex-1 min-w-8 mx-1 ${completedSteps.has(step.index) ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
