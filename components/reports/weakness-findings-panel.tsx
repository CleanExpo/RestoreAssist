/**
 * Weakness Findings review panel (RA-5041 UI — follow-up to PR1
 * lib/services/weakness-detection/* and PR2 the weakness-check route).
 *
 * Renders the WeaknessFinding[] returned by
 * `POST /api/reports/[id]/weakness-check`, grouped by severity:
 *
 *   - P0 "hard stop"          — red-line breaches, rendered first and as a
 *                               visually unmissable destructive banner.
 *   - P1 "reviewer required"  — contradictions / unsupported causation etc.
 *   - P2 "improvement"        — non-blocking suggestions.
 *
 * The route is advisory only (it never blocks anything itself) — the UI
 * enforces the ticket's hard-stop acceptance criterion: this component
 * reports its gate state (`hasUnresolvedP0`) to the host page via
 * `onGateChange`, and the host page decides what to do with that (see
 * app/dashboard/reports/[id]/page.tsx, which requires an explicit
 * "Export anyway — P0 flags acknowledged" confirmation before the PDF/
 * insurer-share actions proceed). This panel never disables anything
 * itself — the human always has a path forward.
 *
 * Acknowledgement of P0 flags is a controlled prop (`acknowledged`) owned
 * by the host, not this panel, so a fresh "Run weakness check" always
 * re-arms the gate (see `onRunStart`) rather than silently trusting a
 * stale acknowledgement from a previous run.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  WeaknessCheckClass,
  WeaknessFinding,
  WeaknessSeverity,
} from "@/lib/services/weakness-detection/types";

export interface WeaknessGateState {
  /** True when the last run surfaced P0 findings that haven't been acknowledged. */
  hasUnresolvedP0: boolean;
  p0Count: number;
}

export interface WeaknessFindingsPanelProps {
  reportId: string;
  /** Host-controlled: true once the reviewer has explicitly acknowledged
   *  the current run's P0 findings (e.g. via an "Export anyway" confirm). */
  acknowledged?: boolean;
  /** Fired whenever the computed gate state changes. */
  onGateChange?: (gate: WeaknessGateState) => void;
  /** Fired the moment a run starts — the host should re-arm (clear) any
   *  prior acknowledgement here, since a fresh run may surface new P0s. */
  onRunStart?: () => void;
}

type PanelStatus = "idle" | "loading" | "error" | "loaded";

interface WeaknessCheckResponse {
  findings: WeaknessFinding[];
  llmReviewApplied: boolean;
  note?: string;
}

const CHECK_CLASS_LABELS: Record<WeaknessCheckClass, string> = {
  redline_language: "Red-line language",
  missing_field: "Missing field",
  category_separation: "Category separation",
  scope_expansion: "Scope expansion",
  contradiction: "Contradiction",
  unsupported_causation: "Unsupported causation",
};

function checkClassLabel(checkClass: WeaknessCheckClass): string {
  return CHECK_CLASS_LABELS[checkClass] ?? checkClass;
}

function EvidenceAnchorText({
  evidenceAnchor,
}: {
  evidenceAnchor: WeaknessFinding["evidenceAnchor"];
}) {
  if (evidenceAnchor === "unverified/missing") {
    return (
      <Badge variant="outline" className="font-normal">
        Evidence: unverified/missing
      </Badge>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Evidence: {evidenceAnchor.reportSectionId} &middot; {evidenceAnchor.field}
      {" — "}
      <span className="italic">&ldquo;{evidenceAnchor.quotedText}&rdquo;</span>
    </p>
  );
}

function DetectionMethodBadge({
  detectionMethod,
}: {
  detectionMethod: WeaknessFinding["detectionMethod"];
}) {
  return (
    <Badge variant={detectionMethod === "llm" ? "outline" : "secondary"}>
      {detectionMethod === "llm" ? "LLM" : "Deterministic"}
    </Badge>
  );
}

function FindingRow({ finding }: { finding: WeaknessFinding }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{checkClassLabel(finding.checkClass)}</span>
        <DetectionMethodBadge detectionMethod={finding.detectionMethod} />
      </div>
      <p>{finding.description}</p>
      <EvidenceAnchorText evidenceAnchor={finding.evidenceAnchor} />
      <p className="text-xs text-muted-foreground">
        Suggested action: {finding.suggestedAction}
      </p>
      {finding.standardsCitation && (
        <p className="text-xs text-muted-foreground">
          {finding.standardsCitation}
        </p>
      )}
    </div>
  );
}

const SEVERITY_GROUP_META: Record<
  Exclude<WeaknessSeverity, "P0">,
  { heading: (count: number) => string }
> = {
  P1: { heading: (n) => `Reviewer required — ${n} finding${n === 1 ? "" : "s"}` },
  P2: { heading: (n) => `Improvement — ${n} finding${n === 1 ? "" : "s"}` },
};

function SeverityGroup({
  severity,
  findings,
}: {
  severity: Exclude<WeaknessSeverity, "P0">;
  findings: WeaknessFinding[];
}) {
  if (findings.length === 0) return null;
  const meta = SEVERITY_GROUP_META[severity];
  return (
    <div className="space-y-2" data-testid={`weakness-group-${severity}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {meta.heading(findings.length)}
      </p>
      <div className="space-y-2">
        {findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} />
        ))}
      </div>
    </div>
  );
}

export function WeaknessFindingsPanel({
  reportId,
  acknowledged = false,
  onGateChange,
  onRunStart,
}: WeaknessFindingsPanelProps) {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [findings, setFindings] = useState<WeaknessFinding[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const p0Findings = findings.filter((f) => f.severity === "P0");
  const p1Findings = findings.filter((f) => f.severity === "P1");
  const p2Findings = findings.filter((f) => f.severity === "P2");
  const hasUnresolvedP0 = p0Findings.length > 0 && !acknowledged;

  useEffect(() => {
    onGateChange?.({ hasUnresolvedP0, p0Count: p0Findings.length });
    // Only the derived values matter here — onGateChange itself is expected
    // to be referentially stable enough for a status panel like this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnresolvedP0, p0Findings.length]);

  const runCheck = useCallback(async () => {
    onRunStart?.();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/weakness-check`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(body) ?? "Weakness check failed");
        setStatus("error");
        return;
      }
      const data = body.data as WeaknessCheckResponse;
      setFindings(data.findings);
      setNote(data.note ?? null);
      setStatus("loaded");
    } catch {
      setError("Failed to run weakness check — check your connection");
      setStatus("error");
    }
  }, [reportId, onRunStart]);

  return (
    <Card data-testid="weakness-findings-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold">Weakness Check</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={runCheck}
          disabled={status === "loading"}
        >
          {status === "loading" && <Spinner className="mr-1.5" />}
          {status === "loaded" || status === "error"
            ? "Re-run weakness check"
            : "Run weakness check"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Run the weakness check before handing this report off — it
            screens for contradictions, missing evidence, and red-line
            language.
          </p>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Running weakness check...
          </div>
        )}

        {status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Weakness check failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status === "loaded" && findings.length === 0 && (
          <Alert data-testid="weakness-all-clear">
            <AlertTitle>No weakness findings detected</AlertTitle>
            <AlertDescription>
              This report looks clear for handoff.
            </AlertDescription>
          </Alert>
        )}

        {status === "loaded" && findings.length > 0 && (
          <div className="space-y-4">
            {p0Findings.length > 0 && (
              <Alert
                variant="destructive"
                data-testid="weakness-group-P0"
                className="border-2"
              >
                <AlertTitle>
                  Hard stop &mdash; {p0Findings.length} red-line breach
                  {p0Findings.length === 1 ? "" : "es"} require resolution
                  before handoff
                </AlertTitle>
                <AlertDescription>
                  <div className="w-full space-y-2 pt-1">
                    {p0Findings.map((finding) => (
                      <FindingRow key={finding.id} finding={finding} />
                    ))}
                  </div>
                  {hasUnresolvedP0 ? (
                    <p className="pt-1 text-xs font-medium">
                      Export is blocked until these are acknowledged.
                    </p>
                  ) : (
                    <p className="pt-1 text-xs font-medium">
                      P0 flags acknowledged &mdash; export unblocked.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <SeverityGroup severity="P1" findings={p1Findings} />
            <SeverityGroup severity="P2" findings={p2Findings} />
          </div>
        )}

        {note && (
          <p className="text-xs text-muted-foreground border-t pt-3">{note}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default WeaknessFindingsPanel;
