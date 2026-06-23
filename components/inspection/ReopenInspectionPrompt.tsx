"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REOPENABLE_STATUSES = new Set(["CLOSED", "ARCHIVED"]);
const MIN_REASON_LENGTH = 10;

interface Props {
  inspectionId: string;
  inspectionNumber: string;
  status: string;
  isAdmin: boolean;
  errorIcon?: ReactNode;
  loadingIcon?: ReactNode;
  reopenIcon?: ReactNode;
  onReopened?: () => void;
}

export default function ReopenInspectionPrompt({
  inspectionId,
  inspectionNumber,
  status,
  isAdmin,
  errorIcon,
  loadingIcon,
  reopenIcon,
  onReopened,
}: Props) {
  const canReopen = isAdmin && REOPENABLE_STATUSES.has(status);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonTooShort = useMemo(
    () => reason.trim().length < MIN_REASON_LENGTH,
    [reason],
  );

  if (!canReopen) return null;

  async function submitReopen() {
    if (reasonTooShort) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/reopen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't reopen this inspection.");
        return;
      }
      setDialogOpen(false);
      setReason("");
      onReopened?.();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20"
      data-testid="reopen-inspection-prompt"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {reopenIcon ? (
            <span className="text-warning dark:text-warning mt-0.5 shrink-0">
              {reopenIcon}
            </span>
          ) : null}
          <div>
            <p className="font-semibold text-warning dark:text-warning">
              Reopen inspection {inspectionNumber}
            </p>
            <p className="text-sm text-warning/80 dark:text-warning/80 mt-0.5">
              Admins can move this {status.toLowerCase()} job back to billing
              when finance, audit, or dispute corrections are required.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="border-amber-500 text-warning hover:bg-amber-100 dark:text-warning dark:hover:bg-amber-900/20"
        >
          {reopenIcon ? <span className="mr-1.5">{reopenIcon}</span> : null}
          Reopen job
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen inspection {inspectionNumber}?</DialogTitle>
            <DialogDescription>
              This moves the job back to billing. The reason is written to the
              lifecycle audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={MIN_REASON_LENGTH}
              placeholder="Explain why this inspection needs to be reopened..."
              aria-label="Reason for reopening"
              className="min-h-[120px]"
            />
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Minimum {MIN_REASON_LENGTH} characters.
            </p>
            {error ? (
              <p
                role="alert"
                className="text-sm text-destructive dark:text-destructive flex items-start gap-1"
              >
                {errorIcon ? (
                  <span className="mt-0.5 shrink-0">{errorIcon}</span>
                ) : null}
                <span>{error}</span>
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitReopen()}
              disabled={reasonTooShort || submitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {submitting ? (
                <>
                  {loadingIcon ? (
                    <span className="mr-1.5">{loadingIcon}</span>
                  ) : null}
                  Reopening...
                </>
              ) : (
                "Confirm reopen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
