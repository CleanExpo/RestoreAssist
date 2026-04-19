"use client";

/**
 * RA-1195 — AI auto-classify IICRC Category & Class panel.
 *
 * Renders a CTA button on the inspection detail page. On click calls
 * POST /api/inspections/[id]/classify and shows a preview card with the
 * suggestion, confidence, and reasoning. The user must click "Apply" to
 * propagate the value — this component does NOT persist on its own; it calls
 * the supplied onApply callback with the suggestion, and the parent handles
 * the inspection update flow.
 */

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import toast from "react-hot-toast";

export type ClassifySuggestion = {
  waterCategory: "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3";
  waterClass: "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4";
  confidence: number;
  reasoning: string;
  inputSummary?: { moistureReadings: number; affectedAreas: number };
};

type Props = {
  inspectionId: string;
  onApply?: (s: ClassifySuggestion) => void | Promise<void>;
};

const CAT_LABEL: Record<ClassifySuggestion["waterCategory"], string> = {
  CATEGORY_1: "Category 1 — Clean water",
  CATEGORY_2: "Category 2 — Significantly contaminated",
  CATEGORY_3: "Category 3 — Grossly contaminated",
};

const CLASS_LABEL: Record<ClassifySuggestion["waterClass"], string> = {
  CLASS_1: "Class 1 — Least water absorbed",
  CLASS_2: "Class 2 — Large amount absorbed",
  CLASS_3: "Class 3 — Greatest amount absorbed",
  CLASS_4: "Class 4 — Specialty drying",
};

function confidenceTone(c: number): string {
  if (c >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (c >= 65) return "text-cyan-600 dark:text-cyan-400";
  if (c >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function AutoClassifyPanel({ inspectionId, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<ClassifySuggestion | null>(null);
  const [applying, setApplying] = useState(false);

  async function handleClassify() {
    setLoading(true);
    setSuggestion(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/classify`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Auto-classify failed");
        return;
      }
      setSuggestion(data as ClassifySuggestion);
    } catch (err) {
      console.error(err);
      toast.error("Auto-classify failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!suggestion || !onApply) return;
    setApplying(true);
    try {
      await onApply(suggestion);
      toast.success("Classification applied");
      setSuggestion(null);
    } catch (err) {
      console.error(err);
      toast.error("Could not apply classification");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-slate-300">
            AI classification assistant
          </h3>
          <p className="text-xs text-neutral-500 dark:text-slate-500">
            Uses moisture readings and affected-area data to suggest IICRC
            S500:2025 Category and Class. Review before applying.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleClassify}
          disabled={loading}
          className="bg-gradient-to-r from-[#1C2E47] via-[#8A6B4E] to-[#D4A574] text-white hover:opacity-90 shadow-md"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Classifying…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Auto-classify
            </>
          )}
        </Button>
      </div>

      {suggestion && (
        <Card className="border-[#D4A574]/40 bg-gradient-to-br from-[#1C2E47]/5 to-[#D4A574]/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-[#8A6B4E]" />
              Suggested classification
              <span
                className={`ml-auto text-sm font-semibold ${confidenceTone(
                  suggestion.confidence,
                )}`}
              >
                {suggestion.confidence}% confidence
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-900/10">
                <div className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">
                  Water Category
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-800 dark:text-slate-200">
                  {CAT_LABEL[suggestion.waterCategory]}
                </div>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-800/50 dark:bg-purple-900/10">
                <div className="text-xs font-semibold uppercase text-purple-600 dark:text-purple-400">
                  Water Class
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-800 dark:text-slate-200">
                  {CLASS_LABEL[suggestion.waterClass]}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-slate-400">
                Reasoning
              </div>
              <p className="mt-1 text-sm text-neutral-700 dark:text-slate-300">
                {suggestion.reasoning}
              </p>
              {suggestion.inputSummary && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-slate-500">
                  Based on {suggestion.inputSummary.moistureReadings} moisture
                  reading(s) and {suggestion.inputSummary.affectedAreas}{" "}
                  affected area(s).
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSuggestion(null)}
                disabled={applying}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Dismiss
              </Button>
              {onApply && (
                <Button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="bg-gradient-to-r from-[#1C2E47] to-[#8A6B4E] text-white hover:opacity-90"
                >
                  {applying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Applying…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Apply to inspection
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
