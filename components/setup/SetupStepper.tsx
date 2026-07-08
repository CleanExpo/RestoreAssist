"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  computeWizardState,
  type WizardStepDef,
} from "@/lib/setup/wizard-steps";

export interface SetupStepperItem {
  key: string;
  title: string;
  required: boolean;
  /** Whether this step's completion criteria are met (gates advancing). */
  complete: boolean;
  content: ReactNode;
}

/**
 * Locked one-step-at-a-time setup wizard shell (Phase 4). Renders exactly one
 * step's content at a time, disables "Next" until a required step is complete,
 * and ends with a "Generate your first report" CTA that only enables once every
 * required step is done. Presentational + self-contained so it can be unit
 * tested in isolation (RTL) without the live setup page's auth/DB.
 */
export function SetupStepper({
  items,
  initialIndex = 0,
  onFinish,
}: {
  items: SetupStepperItem[];
  initialIndex?: number;
  onFinish?: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  const steps: WizardStepDef[] = items.map((i) => ({
    key: i.key,
    title: i.title,
    required: i.required,
  }));
  const completion = Object.fromEntries(items.map((i) => [i.key, i.complete]));
  const state = computeWizardState(index, completion, steps);
  const current = items[state.currentIndex];

  const progressPct = Math.round(
    ((state.currentIndex + 1) / state.totalSteps) * 100,
  );

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            Step {state.currentIndex + 1} of {state.totalSteps}:{" "}
            {current.title}
          </span>
          <span className="text-muted-foreground">
            {state.completedCount}/{state.totalSteps} done
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-navy transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Current step only */}
      <div key={current.key}>{current.content}</div>

      {/* Required-but-incomplete hint */}
      {current.required && !current.complete && (
        <p className="text-sm text-amber-600" role="status">
          Complete this step to continue.
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={state.isFirstStep}
        >
          Back
        </Button>

        {state.isLastStep ? (
          <Button
            onClick={onFinish}
            disabled={!state.allRequiredComplete}
            title={
              state.allRequiredComplete
                ? undefined
                : "Finish the required steps first"
            }
          >
            Generate your first report
          </Button>
        ) : (
          <Button
            onClick={() =>
              setIndex((i) => Math.min(items.length - 1, i + 1))
            }
            disabled={!state.canAdvance}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
