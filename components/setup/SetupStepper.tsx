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
  /** One-line supporting copy shown under the step title in the content pane. */
  description?: string;
}

// Inline SVG marks (Phill Rule 1: no generic icon-library imports).
function CheckMark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function ArrowMark({
  direction,
  size = 16,
}: {
  direction: "left" | "right";
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={direction === "left" ? "rotate-180" : undefined}
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* house-with-pulse mark — restoration + health */}
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9h13v-9" />
      <path d="M8.5 15h2l1.5-3 1.5 4 1-2h1.5" />
    </svg>
  );
}

/**
 * Locked one-step-at-a-time setup wizard — full-viewport split layout.
 * Left rail + content pane + pinned footer fill the screen with no empty
 * navy void under the card.
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
    (state.completedCount / state.totalSteps) * 100,
  );

  const stepBadge = (item: SetupStepperItem, i: number) => {
    const isCurrent = i === state.currentIndex;
    const isDone = item.complete && !isCurrent;
    return (
      <span
        aria-hidden="true"
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200",
          isDone
            ? "border-brand-gold/80 bg-brand-gold/90 text-brand-navy"
            : isCurrent
              ? "border-white bg-white text-brand-navy shadow-[0_0_0_4px_rgba(255,255,255,0.15)]"
              : "border-white/25 bg-transparent text-white/50",
        ].join(" ")}
      >
        {isDone ? <CheckMark /> : i + 1}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex w-full overflow-hidden bg-white">
      {/* Screen-reader + test-visible canonical step announcement */}
      <p className="sr-only" aria-live="polite">
        Step {state.currentIndex + 1} of {state.totalSteps}: {current.title}
      </p>

      {/* ————— Brand rail (desktop) ————— */}
      <aside className="relative hidden h-full w-80 shrink-0 flex-col overflow-hidden bg-brand-navy text-white lg:flex xl:w-96">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-gold/15 blur-3xl" />
          <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-brand-bronze/20 blur-3xl" />
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/25" />
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col px-8 py-8 lg:px-10 xl:px-12 xl:py-10">
          <div className="shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <LogoMark className="text-brand-gold" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                RestoreAssist
              </span>
            </div>

            <div className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
                Workspace setup
              </p>
              <h1 className="mt-2 text-[26px] font-semibold leading-snug tracking-tight">
                Let&apos;s get you set up
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                One step at a time — we&apos;ll have you generating your first
                report in minutes.
              </p>
            </div>
          </div>

          {/* Step map scrolls if needed; progress stays pinned below */}
          <ol
            className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1"
            aria-label="Setup steps"
          >
            {items.map((item, i) => {
              const isCurrent = i === state.currentIndex;
              return (
                <li
                  key={item.key}
                  aria-current={isCurrent ? "step" : undefined}
                  className={[
                    "flex items-center gap-3 rounded-lg px-4 py-2 transition-colors duration-200",
                    isCurrent ? "bg-white/10 ring-1 ring-white/10" : "",
                  ].join(" ")}
                >
                  {stepBadge(item, i)}
                  <span
                    className={[
                      "min-w-0 flex-1 truncate text-sm",
                      isCurrent
                        ? "font-medium text-white"
                        : item.complete
                          ? "text-white/70"
                          : "text-white/45",
                    ].join(" ")}
                  >
                    {item.title}
                  </span>
                  {!item.required && (
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
                      Optional
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="relative mt-6 shrink-0 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-3 text-xs text-white/60">
              <span className="min-w-0 truncate">
                {state.completedCount} of {state.totalSteps} complete
              </span>
              <span className="shrink-0 font-medium text-brand-gold">
                {progressPct}%
              </span>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-linear-to-r from-brand-bronze to-brand-gold transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* ————— Content pane (fills remaining viewport) ————— */}
      <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
        <header className="shrink-0 border-b border-brand-navy/10 bg-white px-5 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-navy">
                <LogoMark size={16} className="text-brand-gold" />
              </span>
              <span className="text-sm font-semibold tracking-tight text-brand-navy">
                RestoreAssist
              </span>
            </div>
            <span className="text-xs font-medium text-brand-slate">
              {state.currentIndex + 1} of {state.totalSteps}
            </span>
          </div>
          <div
            className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-brand-navy/10"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-brand-bronze to-brand-gold transition-all duration-500"
              style={{
                width: `${Math.round(((state.currentIndex + 1) / state.totalSteps) * 100)}%`,
              }}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
            <div className="mb-6 shrink-0 sm:mb-7">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                <span
                  className={
                    current.required
                      ? "rounded-full bg-brand-navy px-2.5 py-1 text-white"
                      : "rounded-full border border-brand-navy/15 px-2.5 py-1 text-brand-slate"
                  }
                >
                  {current.required ? "Required" : "Optional"}
                </span>
                <span className="text-brand-slate/70">
                  {state.currentIndex + 1} of {state.totalSteps}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-brand-navy sm:text-[28px]">
                {current.title}
              </h2>
              {current.description && (
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-brand-slate">
                  {current.description}
                </p>
              )}
            </div>

            <div key={current.key} className="min-h-0 flex-1">
              {current.content}
            </div>

            {current.required && !current.complete && (
              <p
                className="mt-5 flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                />
                Complete this step to continue.
              </p>
            )}
          </div>
        </main>

        <footer className="shrink-0 border-t border-brand-navy/10 bg-white shadow-[0_-4px_16px_-8px_rgba(28,46,71,0.12)]">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5 lg:px-12">
            <Button
              variant="outline"
              className="h-12 gap-2 rounded-xl border-brand-navy/20 px-6 text-[15px] font-medium text-brand-navy hover:bg-brand-navy/5"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={state.isFirstStep}
            >
              <ArrowMark direction="left" />
              Back
            </Button>

            <div className="flex items-center gap-4">
              {!state.isLastStep && (
                <span className="hidden text-sm text-brand-slate/80 sm:block">
                  Next up:{" "}
                  <span className="font-medium text-brand-navy">
                    {items[state.currentIndex + 1]?.title}
                  </span>
                </span>
              )}

              {state.isLastStep ? (
                <Button
                  className="h-12 gap-2 rounded-xl bg-brand-navy px-7 text-[15px] font-semibold text-white shadow-lg shadow-brand-navy/25 transition-all hover:bg-brand-navy-hover hover:shadow-brand-navy/35 disabled:shadow-none"
                  onClick={onFinish}
                  disabled={!state.allRequiredComplete}
                  title={
                    state.allRequiredComplete
                      ? undefined
                      : "Finish the required steps first"
                  }
                >
                  Generate your first report
                  <ArrowMark direction="right" />
                </Button>
              ) : (
                <Button
                  className="h-12 gap-2 rounded-xl bg-brand-navy px-8 text-[15px] font-semibold text-white shadow-lg shadow-brand-navy/25 transition-all hover:bg-brand-navy-hover hover:shadow-brand-navy/35 disabled:shadow-none"
                  onClick={() =>
                    setIndex((i) => Math.min(items.length - 1, i + 1))
                  }
                  disabled={!state.canAdvance}
                >
                  Next
                  <ArrowMark direction="right" />
                </Button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
