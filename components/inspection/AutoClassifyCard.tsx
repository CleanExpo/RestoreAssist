"use client";

/**
 * RA-1195 — AI Auto-classify IICRC Water Category + Class
 *
 * Small card that calls POST /api/inspections/[id]/classify, shows the
 * suggestion + confidence + reasoning, and lets the user Apply (creates a
 * Classification record) or Dismiss.
 *
 * The API endpoint does NOT persist the suggestion — persistence happens here
 * on Apply, via the existing /api/inspections/[id]/classification endpoint.
 */

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

type WaterCategory = "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3";
type WaterClass = "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4";

interface Suggestion {
  waterCategory: WaterCategory;
  waterClass: WaterClass;
  confidence: number;
  reasoning: string;
  usage?: { inputTokens: number; outputTokens: number; estUsd: number };
}

interface Props {
  inspectionId: string;
  onApplied?: () => void;
}

// Pull "1" / "2" / "3" / "4" out of CATEGORY_N / CLASS_N for the Classification
// model, which stores plain digit strings.
function digit(v: string): string {
  const m = v.match(/(\d)$/);
  return m ? m[1] : v;
}

function humanCategory(c: WaterCategory): string {
  return `Category ${digit(c)}`;
}

function humanClass(c: WaterClass): string {
  return `Class ${digit(c)}`;
}

export default function AutoClassifyCard({ inspectionId, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  async function runClassify() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/classify`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? `Auto-classify failed (${res.status})`);
        return;
      }
      const data: Suggestion = await res.json();
      setSuggestion(data);
    } catch (e) {
      console.error("[AutoClassifyCard]", e);
      toast.error("Auto-classify failed");
    } finally {
      setLoading(false);
    }
  }

  async function applySuggestion() {
    if (!suggestion) return;
    setApplying(true);
    try {
      // Persist via existing Classification upsert path. The
      // /api/inspections/[id]/classification GET returns existing records; we
      // create a new Classification row via a direct call to the inspection
      // update endpoint if one is available. Minimal behaviour: POST to the
      // existing water-damage-classification endpoint, which takes CAT_N /
      // CLASS_N enum values.
      const res = await fetch(
        `/api/inspections/${inspectionId}/water-damage-classification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waterCategory: `CAT_${digit(suggestion.waterCategory)}`,
            damageClass: suggestion.waterClass,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Could not save classification");
        return;
      }
      toast.success("Classification applied");
      setSuggestion(null);
      onApplied?.();
    } catch (e) {
      console.error("[AutoClassifyCard apply]", e);
      toast.error("Could not save classification");
    } finally {
      setApplying(false);
    }
  }

  if (!suggestion) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-neutral-200 dark:border-slate-700/60 bg-gradient-to-br from-[#1C2E47]/5 to-[#8A6B4E]/5 dark:from-[#1C2E47]/20 dark:to-[#8A6B4E]/15">
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-white">
            AI auto-classify
          </div>
          <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
            Suggest the IICRC S500:2025 Water Category and Class from the
            inspection's moisture readings and affected-area data.
          </div>
        </div>
        <Button
          onClick={runClassify}
          disabled={loading}
          className="bg-gradient-to-r from-[#1C2E47] to-[#8A6B4E] hover:from-[#1C2E47]/90 hover:to-[#8A6B4E]/90 text-white"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" /> Classifying…
            </>
          ) : (
            <>
              <Sparkles size={14} className="mr-1.5" /> Auto-classify
            </>
          )}
        </Button>
      </div>
    );
  }

  const conf = suggestion.confidence;
  const confColour =
    conf >= 80
      ? "text-emerald-700 dark:text-emerald-300"
      : conf >= 60
      ? "text-amber-700 dark:text-amber-300"
      : "text-rose-700 dark:text-rose-300";

  return (
    <div className="p-5 rounded-xl border border-[#D4A574]/50 dark:border-[#8A6B4E]/50 bg-gradient-to-br from-[#1C2E47]/5 to-[#8A6B4E]/5 dark:from-[#1C2E47]/20 dark:to-[#8A6B4E]/15 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#8A6B4E]" />
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            AI suggestion
          </span>
        </div>
        <span className={`text-xs font-semibold ${confColour}`}>
          {conf}% confidence
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div>
          <div className="text-xs text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
            Water Category
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">
            {humanCategory(suggestion.waterCategory)}
          </div>
        </div>
        <div className="w-px h-10 bg-[#D4A574]/60" />
        <div>
          <div className="text-xs text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
            Water Class
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">
            {humanClass(suggestion.waterClass)}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
          Reasoning (AS-IICRC S500:2025)
        </div>
        <p className="text-sm text-neutral-700 dark:text-slate-300 leading-relaxed">
          {suggestion.reasoning}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="outline"
          onClick={() => setSuggestion(null)}
          disabled={applying}
        >
          <X size={14} className="mr-1.5" /> Dismiss
        </Button>
        <Button
          onClick={applySuggestion}
          disabled={applying}
          className="bg-gradient-to-r from-[#1C2E47] to-[#8A6B4E] hover:from-[#1C2E47]/90 hover:to-[#8A6B4E]/90 text-white"
        >
          {applying ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" /> Applying…
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="mr-1.5" /> Apply
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
