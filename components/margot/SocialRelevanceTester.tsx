"use client";

/**
 * Admin browser tool to verify Margot social relevance + reply style
 * before Hermes posts comments.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { dashboardSurfaceClass } from "@/app/dashboard/components/DashboardPanel";

type ApiResult = {
  canPost: boolean;
  relevance: {
    decision: "engage" | "ignore" | "unsure";
    relevant: boolean;
    reason: string;
    positiveHits: string[];
    negativeHits: string[];
  };
  reply: {
    canPost: boolean;
    text: string;
    issues: string[];
  } | null;
};

const SAMPLES = [
  {
    label: "Ignore: car",
    text: "Finished a classic car restoration on this Mustang",
    draft: "Looks sharp. What paint system did you use?",
  },
  {
    label: "Ignore: teeth",
    text: "Best teeth restoration clinic for veneers in Brisbane",
    draft: "Great smile results. Who was your dentist?",
  },
  {
    label: "Ignore: furniture",
    text: "Antique furniture restoration workshop this weekend",
    draft: "Love a good refinish. What finish are you using?",
  },
  {
    label: "Engage: water",
    text: "Water damage restoration after a burst pipe - moisture mapping tips?",
    draft:
      "Water damage jobs get messy fast when moisture maps are thin. How are you capturing readings on site right now?",
  },
  {
    label: "Engage: fire",
    text: "Fire and smoke restoration - contents vs structure on this claim",
    draft:
      "Contents vs structure calls get sticky after smoke. How are you documenting the split for the insurer?",
  },
];

export function SocialRelevanceTester() {
  const [text, setText] = useState(SAMPLES[0].text);
  const [draftReply, setDraftReply] = useState(SAMPLES[0].draft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/margot/social-relevance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, draftReply }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.error?.message || json?.error || `HTTP ${res.status}`,
        );
      }
      setResult(json as ApiResult);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  const decision = result?.relevance.decision;
  const decisionTone =
    decision === "engage"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : decision === "ignore"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200"
        : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";

  return (
    <section
      className={cn("space-y-4 rounded-lg p-4", dashboardSurfaceClass)}
      data-testid="social-relevance-tester"
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Relevance gate
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a social post (and optional draft). Engage only for property /
          insurance restoration. Drafts must stay human — no apostrophes or
          fancy dashes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Button
            key={s.label}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setText(s.text);
              setDraftReply(s.draft);
              setResult(null);
              setError(null);
            }}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="social-post">Post text</Label>
        <Textarea
          id="social-post"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="social-draft">Draft reply (optional)</Label>
        <Textarea
          id="social-draft"
          value={draftReply}
          onChange={(e) => setDraftReply(e.target.value)}
          rows={3}
          className="bg-background"
        />
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={runCheck}
        disabled={loading || !text.trim()}
      >
        {loading ? "Checking…" : "Run gate"}
      </Button>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3 text-sm" data-testid="social-relevance-result">
          <div className={cn("rounded-lg border px-3 py-2", decisionTone)}>
            <p className="text-xs font-semibold uppercase tracking-wide">
              {result.relevance.decision}
              {result.canPost ? " · can post" : " · do not post"}
            </p>
            <p className="mt-1">{result.relevance.reason}</p>
          </div>
          {(result.relevance.positiveHits.length > 0 ||
            result.relevance.negativeHits.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {result.relevance.positiveHits.map((h) => (
                <span
                  key={`p-${h}`}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs"
                >
                  + {h}
                </span>
              ))}
              {result.relevance.negativeHits.map((h) => (
                <span
                  key={`n-${h}`}
                  className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs"
                >
                  − {h}
                </span>
              ))}
            </div>
          )}
          {result.reply ? (
            <div
              className={cn(
                "space-y-1 rounded-lg border px-3 py-2",
                dashboardSurfaceClass,
              )}
            >
              <p className="font-medium">
                Style: {result.reply.canPost ? "clean" : "needs rewrite"}
              </p>
              {result.reply.issues.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Issues: {result.reply.issues.join("; ")}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{result.reply.text}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
