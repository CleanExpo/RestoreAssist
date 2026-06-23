"use client";

/**
 * SP-A Task 8 — Close-job Sidekick card.
 *
 * Renders only when the parent page deems the inspection eligible to close.
 * Pulls a fresh AI draft on mount, lets the user edit it, then opens a
 * confirmation dialog before firing POST /api/inspections/[id]/close.
 *
 * Visual language matches InspectionSignOff (cyan accent, rounded-xl,
 * bordered card). Uses shadcn primitives — no custom controls (rule 16).
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 8.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  inspectionId: string;
  inspectionNumber: string;
  invoiceId?: string | null;
  /** Once closed, the parent passes the timestamp so the card flips to its locked state. */
  completedAt?: string | null;
  /** Existing close summary if the inspection has already been closed (locked-state body text). */
  closeSummary?: string | null;
  /** Called after a successful close — parent re-fetches the inspection. */
  onClosed?: () => void;
}

interface DraftResponse {
  draft: { text: string; inspectionNumber: string };
  source: "ai" | "byok" | "fallback";
}

export default function CloseJobPrompt({
  inspectionId,
  inspectionNumber,
  invoiceId,
  completedAt,
  closeSummary,
  onClosed,
}: Props) {
  const alreadyClosed = useMemo(() => Boolean(completedAt), [completedAt]);

  // Locked terminal state — replaces the prompt once the job has been closed.
  if (alreadyClosed) {
    return (
      <div
        role="status"
        className="p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50 dark:bg-cyan-950/20"
      >
        <div className="flex items-start gap-3">
          <Lock
            className="h-5 w-5 text-cyan-600 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-semibold text-cyan-700 dark:text-cyan-400">
              Job Closed
            </p>
            <p className="text-sm text-cyan-700/80 dark:text-cyan-300/80 mt-0.5">
              Inspection {inspectionNumber} was closed on{" "}
              {new Date(completedAt as string).toLocaleString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              .
            </p>
            {closeSummary ? (
              <p className="text-sm text-neutral-700 dark:text-slate-300 mt-3 whitespace-pre-wrap">
                {closeSummary}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <CloseJobPromptActive
      inspectionId={inspectionId}
      inspectionNumber={inspectionNumber}
      invoiceId={invoiceId}
      onClosed={onClosed}
    />
  );
}

function CloseJobPromptActive({
  inspectionId,
  inspectionNumber,
  invoiceId,
  onClosed,
}: Pick<Props, "inspectionId" | "inspectionNumber" | "invoiceId" | "onClosed">) {
  const [draft, setDraft] = useState<string>("");
  const [loadingDraft, setLoadingDraft] = useState<boolean>(true);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missingPreconditions, setMissingPreconditions] = useState<string[]>(
    [],
  );
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Fetch the draft on mount.
  useEffect(() => {
    void fetchDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  async function fetchDraft() {
    setLoadingDraft(true);
    setDraftError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/close-summary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invoiceId: invoiceId ?? undefined }),
        },
      );
      if (res.status === 402) {
        setDraftError(
          "An active subscription is required to draft a close summary. Please renew to continue, or write the summary manually below.",
        );
        setDraft("");
        return;
      }
      if (!res.ok) {
        setDraftError(
          "Couldn't fetch the AI draft. You can still type a summary below.",
        );
        setDraft("");
        return;
      }
      const body = (await res.json()) as DraftResponse;
      setDraft(body.draft.text);
    } catch {
      setDraftError(
        "Network error — write the summary manually and try closing again.",
      );
    } finally {
      setLoadingDraft(false);
    }
  }

  async function submitClose() {
    setSubmitting(true);
    setSubmitError(null);
    setMissingPreconditions([]);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ closeSummary: draft }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as {
          error?: string;
          missing?: string[];
        };
        setMissingPreconditions(body.missing ?? []);
        setSubmitError(body.error ?? "Preconditions not met");
        setDialogOpen(false);
        return;
      }
      if (!res.ok) {
        setSubmitError("Couldn't close the job. Please try again.");
        setDialogOpen(false);
        return;
      }
      setDialogOpen(false);
      onClosed?.();
    } catch {
      setSubmitError("Network error — please try again.");
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (dismissed) return null;

  return (
    <div
      className="p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/50 dark:bg-cyan-950/10"
      data-testid="close-job-prompt"
    >
      <div className="flex items-start gap-3">
        <Sparkles
          className="h-5 w-5 text-cyan-600 mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-cyan-700 dark:text-cyan-400">
              Ready to close inspection {inspectionNumber}?
            </p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-slate-200"
            >
              Not yet
            </button>
          </div>
          <p className="text-sm text-cyan-700/80 dark:text-cyan-300/80 mt-1">
            Review the AI-drafted summary below before closing. You can edit
            anything before confirming.
          </p>

          {loadingDraft ? (
            <Skeleton className="mt-3 h-32 w-full" />
          ) : (
            <Textarea
              className="mt-3 min-h-[140px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the client-facing close summary…"
              aria-label="Close summary draft"
            />
          )}

          {draftError ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{draftError}</span>
            </p>
          ) : null}

          {missingPreconditions.length > 0 ? (
            <MissingPreconditionsBanner items={missingPreconditions} />
          ) : null}

          {submitError && missingPreconditions.length === 0 ? (
            <p className="mt-2 text-sm text-destructive flex items-start gap-1">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={loadingDraft || !draft.trim() || submitting}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin mr-1.5"
                    aria-hidden="true"
                  />
                  Closing…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Looks right, close job
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void fetchDraft()}
              disabled={loadingDraft || submitting}
              className="text-cyan-700 hover:text-cyan-800"
            >
              Regenerate draft
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close inspection {inspectionNumber}?</DialogTitle>
            <DialogDescription>
              Once closed, this job moves to the terminal state. Re-opening
              requires admin intervention. The summary will be packaged with
              your invoice and report and sent to the customer record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitClose()}
              disabled={submitting}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin mr-1.5"
                    aria-hidden="true"
                  />
                  Closing…
                </>
              ) : (
                "Confirm close"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MissingPreconditionsBanner({ items }: { items: string[] }) {
  return (
    <div
      role="alert"
      data-testid="missing-preconditions"
      className="mt-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20"
    >
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Can&apos;t close yet — these need to clear first:
      </p>
      <ul className="mt-1 text-sm text-amber-700 dark:text-amber-400 list-disc list-inside">
        {items.map((it) => (
          <li key={it}>{labelFor(it)}</li>
        ))}
      </ul>
    </div>
  );
}

function labelFor(key: string): string {
  switch (key) {
    case "invoice_paid":
      return "Invoice must be marked PAID";
    case "report_sent":
      return "Report must be COMPLETED and sent to the customer";
    case "status_drift":
      return "Inspection status changed while you were editing — refresh to retry";
    default:
      return key;
  }
}
