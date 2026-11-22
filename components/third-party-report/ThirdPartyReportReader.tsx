"use client";

/**
 * RA-7687 slice 1 - third-party laboratory report reader.
 *
 * Upload a lab PDF, review each proposed fact with its page reference and a
 * label (agrees, conflicts, new to this job), then accept, edit or dismiss each
 * one. Nothing reaches the job until "Save accepted facts" is pressed, and
 * only accepted or edited facts are sent.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  LAB_FIELD_LABELS,
  type LabField,
} from "@/lib/third-party-report/schema";

type Status = "agrees" | "conflicts" | "new";

interface ProposedFact {
  field: LabField;
  value: string | number;
  pageRef: number;
  quote: string;
  status: Status;
  jobValue: string | null;
}

interface Proposal {
  proposalToken: string;
  fileName: string;
  sha256: string;
  document: { title: string | null; author: string | null; reportDate: string | null };
  facts: ProposedFact[];
  gaps: { code: string; message: string }[];
  rejectedCount: number;
}

type Decision = "accept" | "edit" | "dismiss" | "undecided";
interface WireDecision {
  index: number;
  action: "accept" | "edit" | "dismiss";
  value?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  agrees: "Agrees with the job",
  conflicts: "Conflicts with the job",
  new: "New to the job",
};

const STATUS_CLASS: Record<Status, string> = {
  agrees: "bg-green-100 text-green-900",
  conflicts: "bg-amber-100 text-amber-900",
  new: "bg-slate-100 text-slate-900",
};

export function readErrorMessage(status: number): string {
  switch (status) {
    case 504:
      return "The read took too long. Nothing was saved. Try again, or enter the results by hand.";
    case 502:
      return "The report could not be read reliably. Nothing was saved. Try again, or enter the results by hand.";
    case 503:
    case 429:
      return "The reading service is busy. Nothing was saved. Wait a moment and try again.";
    case 402:
      return "Reading reports is not available for this workspace. Check the AI key and plan in settings.";
    case 404:
      return "You do not have access to this job.";
    case 400:
      return "That file could not be used. Choose a PDF under 20 MB.";
    default:
      return "Something went wrong. Nothing was saved. Try again.";
  }
}

export default function ThirdPartyReportReader({
  inspectionId,
  onApplied,
}: {
  inspectionId: string;
  /** Called after facts are saved, with exactly the values written, so the
   *  host form shows them instead of a stale copy it could save back. */
  onApplied?: (applied: Partial<Record<LabField, string | number>>) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "review" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<string | null>(null);

  const base = `/api/inspections/${encodeURIComponent(inspectionId)}/third-party-reports`;

  async function upload(file: File) {
    setError(null);
    setPhase("reading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/extract`, { method: "POST", body: form });
      if (!res.ok) {
        setError(readErrorMessage(res.status));
        setPhase("idle");
        return;
      }
      const json = (await res.json()) as { proposal: Proposal };
      setProposal(json.proposal);
      setDecisions({});
      setEdits({});
      setPhase("review");
    } catch {
      setError(readErrorMessage(0));
      setPhase("idle");
    }
  }

  /** Only one value per field can be saved, so choosing one fact for a field
   *  clears an earlier choice of another fact for the same field. */
  function choose(i: number, decision: Decision) {
    if (!proposal) return;
    const next = { ...decisions, [i]: decision };
    if (decision === "accept" || decision === "edit") {
      proposal.facts.forEach((f, j) => {
        if (j !== i && f.field === proposal.facts[i]!.field) {
          if (next[j] === "accept" || next[j] === "edit") next[j] = "undecided";
        }
      });
    }
    setDecisions(next);
  }

  const accepted = proposal
    ? proposal.facts.filter((_, i) => decisions[i] === "accept" || decisions[i] === "edit")
    : [];

  async function save() {
    if (!proposal) return;
    setError(null);
    setPhase("saving");
    // The facts, pages and report hash live in the signed token. The screen
    // only says which fact it means and what the technician decided.
    const body = {
      proposalToken: proposal.proposalToken,
      decisions: proposal.facts.flatMap<WireDecision>((f, i) => {
        const d = decisions[i];
        if (d !== "accept" && d !== "edit" && d !== "dismiss") return [];
        return d === "edit"
          ? [{ index: i, action: d, value: edits[i] ?? String(f.value) }]
          : [{ index: i, action: d }];
      }),
    };
    try {
      const res = await fetch(`${base}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail: string | null = null;
        if (res.status === 400) {
          try {
            const err = (await res.json()) as { error?: { message?: unknown } };
            if (typeof err.error?.message === "string") detail = err.error.message;
          } catch {
            detail = null;
          }
        }
        setError(
          res.status === 400
            ? `${detail ?? "One of the values is not valid."} Nothing was saved.`
            : readErrorMessage(res.status),
        );
        setPhase("review");
        return;
      }
      const json = (await res.json()) as {
        written: number;
        dismissed: number;
        applied: Partial<Record<LabField, string | number>>;
      };
      setSummary(`${json.written} fact(s) saved to the job. ${json.dismissed} dismissed.`);
      setPhase("done");
      // The values the server actually wrote, typed as stored.
      onApplied?.(json.applied);
    } catch {
      setError(readErrorMessage(0));
      setPhase("review");
    }
  }

  function reset() {
    setProposal(null);
    setSummary(null);
    setError(null);
    setPhase("idle");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section
      className="py-3 space-y-3"
      aria-labelledby="third-party-report-heading"
      data-testid="third-party-report-reader"
    >
      <h3 id="third-party-report-heading" className="text-sm font-semibold text-neutral-700 dark:text-slate-200">
        Add a third-party laboratory report
      </h3>

      {(phase === "idle" || phase === "reading") && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Attach a laboratory PDF. The results are read for you to check. Nothing is saved until you confirm it.
          </p>
          <Input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Laboratory report PDF"
            disabled={phase === "reading"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          {phase === "reading" && (
            <p role="status" className="text-sm text-neutral-700 dark:text-neutral-300">
              Reading the report. This can take up to a minute.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" data-testid="third-party-report-error" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {(phase === "review" || phase === "saving") && proposal && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {proposal.fileName}
            {proposal.document.author ? ` - ${proposal.document.author}` : ""}
            {proposal.document.reportDate ? ` - ${proposal.document.reportDate}` : ""}. Reference only: this report does not clear or approve anything.
          </p>

          {proposal.facts.length === 0 && (
            <p data-testid="third-party-report-empty" className="text-sm text-neutral-700 dark:text-neutral-300">
              No laboratory results could be found in this report. Check that it is a laboratory report, or enter the results by hand.
            </p>
          )}

          <ul className="space-y-2">
            {proposal.facts.map((f, i) => {
              const d = decisions[i] ?? "undecided";
              return (
                <li
                  key={`${f.field}-${i}`}
                  data-testid="third-party-report-fact"
                  className="rounded-lg border border-neutral-200 dark:border-slate-700 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{LAB_FIELD_LABELS[f.field]}</span>
                    <Badge className={STATUS_CLASS[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">
                      Page {f.pageRef} of {proposal.fileName}
                    </span>
                  </div>
                  {d === "edit" ? (
                    <Input
                      aria-label={`Edit ${LAB_FIELD_LABELS[f.field]}`}
                      value={edits[i] ?? String(f.value)}
                      onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm">{String(f.value)}</p>
                  )}
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    From the report: &ldquo;{f.quote}&rdquo;
                  </p>
                  {f.status === "conflicts" && f.jobValue !== null && (
                    <p className="text-xs text-amber-900 dark:text-amber-300">
                      The job currently has: {f.jobValue}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={d === "accept" ? "default" : "outline"}
                      aria-pressed={d === "accept"}
                      onClick={() => choose(i, "accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={d === "edit" ? "default" : "outline"}
                      aria-pressed={d === "edit"}
                      onClick={() => choose(i, "edit")}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={d === "dismiss" ? "default" : "outline"}
                      aria-pressed={d === "dismiss"}
                      onClick={() => setDecisions({ ...decisions, [i]: "dismiss" })}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {proposal.gaps.length > 0 && (
            <ul data-testid="third-party-report-gaps" className="space-y-1">
              {proposal.gaps.map((g) => (
                <li key={g.code} className="text-xs text-amber-900 dark:text-amber-300">
                  Gap: {g.message}
                </li>
              ))}
            </ul>
          )}
          {proposal.rejectedCount > 0 && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {proposal.rejectedCount} item(s) in the read were withheld because they could not be checked.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={phase === "saving" || accepted.length === 0}
              onClick={() => void save()}
            >
              {phase === "saving" ? "Saving" : `Save ${accepted.length} accepted fact(s)`}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={phase === "saving"}>
              Cancel, save nothing
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-2">
          <p role="status" data-testid="third-party-report-done" className="text-sm text-neutral-700 dark:text-neutral-300">
            {summary}
          </p>
          <Button type="button" variant="outline" onClick={reset}>
            Add another report
          </Button>
        </div>
      )}
    </section>
  );
}
