"use client";
import { useEffect, useState } from "react";
import {
  ruleBasedClassify,
  type ClassificationResult,
  type ClaimType,
} from "@/lib/ai/auto-classify";
import { cn } from "@/lib/utils";
import { Lightbulb, X, Check } from "lucide-react";

// All selectable claim types displayed as additional chips when multi-select is open
const ALL_CLAIM_TYPES: ClaimType[] = [
  "water_damage",
  "fire_smoke",
  "storm",
  "mould",
  "contents",
];

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  water_damage: "Water Damage",
  fire_smoke: "Fire & Smoke",
  storm: "Storm",
  mould: "Mould",
  contents: "Contents",
};

interface Props {
  description: string;
  averageMoistureReading?: number;
  /**
   * Called when the user clicks Apply.
   * - Single-type: `claimTypes` has one entry, `result` reflects the primary suggestion.
   * - Multi-type: `claimTypes` has two or more entries; `result` is the primary suggestion
   *   and `claimTypes` carries all selected types for the multi-claim scope generator.
   */
  onApply: (result: ClassificationResult, claimTypes: ClaimType[]) => void;
}

export default function ClassificationSuggestion({
  description,
  averageMoistureReading,
  onApply,
}: Props) {
  const [suggestion, setSuggestion] = useState<ClassificationResult | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  // Additional claim types selected by the user beyond the primary suggestion
  const [extraTypes, setExtraTypes] = useState<Set<ClaimType>>(new Set());
  const [multiSelectOpen, setMultiSelectOpen] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setExtraTypes(new Set());
    setMultiSelectOpen(false);

    if (!description || description.length <= 20) {
      setSuggestion(null);
      return;
    }

    const timer = setTimeout(() => {
      const result = ruleBasedClassify({ description, averageMoistureReading });
      setSuggestion(result);
    }, 1000);

    return () => clearTimeout(timer);
  }, [description, averageMoistureReading]);

  if (!suggestion || dismissed) return null;

  const primaryType = suggestion.claimType;
  const selectedTypes: ClaimType[] = [
    primaryType,
    ...Array.from(extraTypes).filter((t) => t !== primaryType),
  ];

  const confidenceColour =
    suggestion.confidence === "high"
      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400"
      : suggestion.confidence === "medium"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-neutral-300 dark:border-slate-600 bg-neutral-100 dark:bg-slate-900/50 text-neutral-700 dark:text-slate-300";

  function toggleExtra(type: ClaimType) {
    if (type === primaryType) return; // primary is always selected
    setExtraTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const summaryParts: string[] = selectedTypes.map((t) => CLAIM_TYPE_LABELS[t]);
  if (selectedTypes.length === 1) {
    if (suggestion.damageCategory)
      summaryParts.push(`Category ${suggestion.damageCategory}`);
    if (suggestion.damageClass)
      summaryParts.push(`Class ${suggestion.damageClass}`);
  }
  const summaryText = summaryParts.join(" + ");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-4 py-3 mt-2 rounded-lg border text-sm",
        confidenceColour,
      )}
      role="status"
      aria-live="polite"
    >
      {/* Top row: icon, summary, actions */}
      <div className="flex items-center gap-3">
        <Lightbulb className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <strong>Suggested:</strong> {summaryText}
          {suggestion.reasoning && selectedTypes.length === 1 ? (
            <span className="ml-1 opacity-70">— {suggestion.reasoning}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setMultiSelectOpen((v) => !v)}
          aria-expanded={multiSelectOpen}
          aria-label="Select additional claim types for multi-loss job"
          className={cn(
            "px-2 py-1 rounded-md text-xs border transition-colors",
            "border-current hover:bg-current/10 active:scale-95",
            multiSelectOpen && "bg-current/10",
          )}
        >
          Multi-loss
        </button>
        <button
          type="button"
          onClick={() => onApply(suggestion, selectedTypes)}
          className={cn(
            "px-3 py-1 rounded-md font-medium text-xs border transition-colors",
            "border-current hover:bg-current/10 active:scale-95",
          )}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss suggestion"
          className="p-1 rounded hover:bg-current/10 transition-colors"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {/* Multi-select chip row — shown when expanded */}
      {multiSelectOpen && (
        <div
          className="flex flex-wrap gap-2 pt-1"
          role="group"
          aria-label="Select additional claim types"
        >
          {ALL_CLAIM_TYPES.map((type) => {
            const isSelected = type === primaryType || extraTypes.has(type);
            const isPrimary = type === primaryType;
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleExtra(type)}
                disabled={isPrimary}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  isSelected
                    ? "bg-current/20 border-current"
                    : "border-current/40 opacity-60 hover:opacity-90 hover:bg-current/10",
                  isPrimary && "cursor-default",
                )}
              >
                {isSelected && <Check className="w-3 h-3" aria-hidden="true" />}
                {CLAIM_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
