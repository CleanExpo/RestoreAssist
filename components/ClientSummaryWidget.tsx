"use client";

/**
 * RA-1461 — Client-facing plain-English summary widget.
 *
 * Drop-in component for the client damage report view (RA-NEW-3 integration
 * point). Shows the cached summary if present, exposes a "Regenerate"
 * button, and handles loading / error / rate-limited states without
 * silently falling back to an empty string.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";

interface ClientSummaryWidgetProps {
  reportId: string;
  /** Initial summary loaded server-side from Report.clientSummaryCache. */
  initialSummary?: string | null;
  /** ISO timestamp of the initial cache. */
  initialCachedAt?: string | null;
}

interface SummaryState {
  summary: string;
  cachedAt: string | null;
  fellBack: boolean;
}

export function ClientSummaryWidget({
  reportId,
  initialSummary,
  initialCachedAt,
}: ClientSummaryWidgetProps) {
  const [state, setState] = useState<SummaryState | null>(
    initialSummary
      ? {
          summary: initialSummary,
          cachedAt: initialCachedAt ?? null,
          fellBack: false,
        }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(forceRefresh: boolean) {
    setLoading(true);
    setError(null);

    try {
      const url = forceRefresh
        ? `/api/reports/${reportId}/client-summary?refresh=1`
        : `/api/reports/${reportId}/client-summary`;
      const response = await fetch(url, { method: "POST" });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error ?? `Request failed (${response.status})`);
        return;
      }

      setState({
        summary: body.data.summary,
        cachedAt: body.data.cachedAt,
        fellBack: Boolean(body.data.fellBack),
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="Plain-English summary"
      className="rounded-lg border border-border bg-card p-6 space-y-4"
    >
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Plain-English Summary</h2>
          <p className="text-sm text-muted-foreground">
            Written for the property owner — no jargon.
          </p>
        </div>
        {state ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </>
            )}
          </Button>
        ) : null}
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state ? (
        <>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {state.summary}
          </div>
          {state.fellBack ? (
            <p className="text-xs text-muted-foreground">
              Shown from a safe template — regenerate to try the AI writer again.
            </p>
          ) : null}
          {state.cachedAt ? (
            <p className="text-xs text-muted-foreground">
              Generated {new Date(state.cachedAt).toLocaleString("en-AU")}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Button onClick={() => generate(false)} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              "Generate Summary"
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            Creates a 120–160-word explanation using the IICRC standards.
          </p>
        </div>
      )}
    </section>
  );
}
