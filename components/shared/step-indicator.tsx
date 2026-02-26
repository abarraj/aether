// Simple step indicator dots for multi-step onboarding flows.

import React from 'react';

import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps): JSX.Element {
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1);

  return (
    <div
      className="flex items-center justify-center gap-2"
      aria-label={`Step ${currentStep} of ${totalSteps}`}
    >
      {steps.map((step) => {
        const isActive = step === currentStep;
        return (
          <div
            key={step}
            className={cn(
              'h-2 w-2 rounded-full border border-zinc-700 transition-colors',
              isActive
                ? 'bg-emerald-500 border-emerald-500'
                : 'bg-zinc-900/80 group-hover:bg-zinc-800',
            )}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

