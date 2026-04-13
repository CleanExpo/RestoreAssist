"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Loader2 } from "lucide-react";

interface Props {
  currentStep: number;
  totalSteps: number;
  isValid: boolean;
  isLastStep: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function FormNavigation({
  currentStep,
  totalSteps,
  isValid,
  isLastStep,
  loading,
  onPrevious,
  onNext,
}: Props) {
  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 p-6 rounded-t-xl border-t-2",
        "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm",
        "border-neutral-200 dark:border-neutral-800",
        "shadow-2xl shadow-neutral-900/10",
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentStep === 0}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
            "border-2",
            currentStep === 0
              ? "border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
              : "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600",
          )}
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          <span
            className={cn("text-sm", "text-neutral-600 dark:text-neutral-400")}
          >
            Step {currentStep + 1} of {totalSteps}
          </span>
        </div>

        {isLastStep ? (
          <button
            type="submit"
            disabled={loading || !isValid}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
              "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
              "hover:shadow-lg hover:shadow-blue-500/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Save & Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!isValid}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
              !isValid
                ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/50",
            )}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
