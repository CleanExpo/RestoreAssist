"use client";

/**
 * RA-1208: AI narrative card for /dashboard/analytics.
 *
 * Fetches `/api/analytics/narrative` and renders the "what changed" prose
 * above the charts. Handles loading (skeleton), empty (onboarding CTA),
 * and error (muted toast + retry) states per ticket spec.
 */
import { useState, useEffect, useCallback } from "react";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type NarrativePeriod = "month" | "quarter" | "year";

interface NarrativeResponse {
  narrative: string;
  generatedAt: string;
  cacheHit: boolean;
}

interface AINarrativeCardProps {
  period?: NarrativePeriod;
}

export default function AINarrativeCard({
  period = "month",
}: AINarrativeCardProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const fetchNarrative = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/analytics/narrative", window.location.origin);
      url.searchParams.set("period", period);
      url.searchParams.set("compareTo", "previous");

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: NarrativeResponse = await res.json();
      setNarrative(data.narrative);
      setGeneratedAt(data.generatedAt);
      setCacheHit(data.cacheHit);
      setEmpty(
        data.narrative.toLowerCase().includes("no reports in the selected"),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load narrative";
      setError(message);
      toast.error(message, { id: "narrative-error" });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchNarrative();
  }, [fetchNarrative]);

  if (loading) {
    return (
      <Card
        className={cn(
          "bg-gradient-to-br from-[#1C2E47]/10 via-[#8A6B4E]/10 to-[#D4A574]/10",
          "border-[#D4A574]/30 dark:border-[#8A6B4E]/30",
        )}
      >
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-[#D4A574]" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card
        className={cn(
          "bg-gradient-to-br from-[#1C2E47]/5 via-[#8A6B4E]/5 to-[#D4A574]/5",
          "border-[#D4A574]/20",
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#D4A574] mt-0.5" />
            <p
              className={cn(
                "text-sm",
                "text-neutral-700 dark:text-neutral-300",
              )}
            >
              Generate your first report to see trends.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        className={cn(
          "bg-neutral-50 dark:bg-slate-800/50",
          "border-neutral-200 dark:border-slate-700",
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-neutral-500 mt-0.5" />
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Couldn&apos;t load the AI narrative.
                </p>
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-500 dark:text-neutral-400",
                  )}
                >
                  {error}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchNarrative}
              aria-label="Retry loading AI narrative"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                "border border-neutral-300 dark:border-slate-600",
                "bg-white dark:bg-slate-900",
                "hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors",
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "bg-gradient-to-br from-[#1C2E47]/10 via-[#8A6B4E]/10 to-[#D4A574]/15",
        "border-[#D4A574]/40 dark:border-[#8A6B4E]/40",
        "shadow-lg",
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-lg shrink-0",
              "bg-gradient-to-br from-[#1C2E47] to-[#8A6B4E]",
            )}
          >
            <Sparkles className="w-5 h-5 text-[#D4A574]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h3
                className={cn(
                  "text-sm font-semibold uppercase tracking-wide",
                  "text-[#1C2E47] dark:text-[#D4A574]",
                )}
              >
                What changed this {period}
              </h3>
              <button
                type="button"
                onClick={fetchNarrative}
                aria-label="Refresh AI narrative"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  "text-neutral-500 dark:text-neutral-400",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                )}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p
              className={cn(
                "text-base leading-relaxed",
                "text-neutral-800 dark:text-slate-200",
              )}
            >
              {narrative}
            </p>
            {generatedAt && (
              <p
                className={cn(
                  "text-xs mt-3",
                  "text-neutral-500 dark:text-neutral-400",
                )}
              >
                Generated {new Date(generatedAt).toLocaleString("en-AU")}
                {cacheHit ? " (cached)" : ""}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
