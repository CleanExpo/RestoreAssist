"use client";

/**
 * RA-7633: status buttons so an estimate can leave DRAFT.
 *
 * Offers only the next statuses the server allows (LEGAL_TRANSITIONS from
 * lib/estimate-status, the same map the status route enforces), less LOCKED
 * (see NOT_OFFERED_IN_UI), and sends the choice to
 * PATCH /api/estimates/[id]/status. The server stays the authority:
 * a refusal is shown with the server's own message, and the parent hears about
 * a change only once the server confirms the new status.
 *
 * Ported from archived commit c05a94b2 (components/estimation/
 * EstimateStatusWorkflow.tsx), minus its private copy of the transition map.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LEGAL_TRANSITIONS,
  isEstimateStatus,
  type EstimateStatus,
} from "@/lib/estimate-status";

const ACTION_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Return to Draft",
  INTERNAL_REVIEW: "Submit for Internal Review",
  SENT: "Mark Sent",
  CLIENT_REVIEW: "Begin Client Review",
  APPROVED: "Approve with Client Evidence",
  LOCKED: "Lock Estimate",
  REJECTED: "Record Rejection",
  EXPIRED: "Mark Expired",
  WITHDRAWN: "Withdraw Estimate",
};

// Statuses the server allows but this screen never offers. Invoice generation
// moves APPROVED -> LOCKED itself; locking by hand first leaves no APPROVED
// estimate, so invoicing refuses and LOCKED has no way out.
const NOT_OFFERED_IN_UI = new Set<EstimateStatus>(["LOCKED"]);

const TERMINAL_ACTIONS = new Set<EstimateStatus>([
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
]);

type EstimateRecord = Record<string, unknown>;

/**
 * The estimate the page should hold after a status change: the copy saved in
 * this session if there is one (a brand-new estimate has no
 * initialEstimateData), otherwise the one the page passed in, with the new
 * status. Null when neither exists. Pure; merges rather than using the status
 * route's raw row, which has no line items.
 */
export function estimateForParent(
  initialEstimateData: EstimateRecord | null | undefined,
  lastSavedEstimate: EstimateRecord | null | undefined,
  status: EstimateStatus,
): EstimateRecord | null {
  const base = lastSavedEstimate ?? initialEstimateData;
  return base ? { ...base, status } : null;
}

/** Blockers and warnings arrive as `{ code, message }` objects. */
function issueMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (
      item &&
      typeof item === "object" &&
      "message" in item &&
      typeof item.message === "string"
    ) {
      return [item.message];
    }
    return [];
  });
}

interface EstimateStatusWorkflowProps {
  /** Absent until the estimate has been saved; no buttons show without it. */
  estimateId?: string | null;
  status: string;
  /** Called only after the server confirms the new status. */
  onStatusChange: (status: EstimateStatus) => void;
}

export function EstimateStatusWorkflow({
  estimateId,
  status,
  onStatusChange,
}: EstimateStatusWorkflowProps) {
  const [transitioningTo, setTransitioningTo] = useState<EstimateStatus | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const currentStatus = isEstimateStatus(status) ? status : null;
  const nextStatuses = currentStatus
    ? LEGAL_TRANSITIONS[currentStatus].filter(
        (next) => !NOT_OFFERED_IN_UI.has(next),
      )
    : [];

  async function transition(nextStatus: EstimateStatus) {
    if (!estimateId || !currentStatus || !nextStatuses.includes(nextStatus)) {
      setError("That status change is not available.");
      return;
    }

    setTransitioningTo(nextStatus);
    setError(null);
    setBlockers([]);
    setWarnings([]);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          payload?.error?.message ??
            "The estimate status could not be changed. Refresh and try again.",
        );
        setBlockers(issueMessages(payload?.blockers));
        setWarnings(issueMessages(payload?.warnings));
        return;
      }

      if (payload?.data?.status !== nextStatus) {
        setError(
          "The server did not confirm the new status. Refresh before trying again.",
        );
        return;
      }

      setWarnings(issueMessages(payload.warnings));
      onStatusChange(nextStatus);
    } catch {
      setError(
        "The status change did not reach the server. Check your connection and try again.",
      );
    } finally {
      setTransitioningTo(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="w-fit rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white">
          {status.replace(/_/g, " ")}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          These buttons change the workflow status only. They do not send the
          estimate or record the client&apos;s approval.
        </p>
        {currentStatus === "CLIENT_REVIEW" && (
          <p className="mt-2 max-w-2xl text-sm text-cyan-200">
            Approval works only once the client has approved this estimate
            total in the client portal.
          </p>
        )}
      </div>

      {!estimateId && (
        <p role="status" className="text-sm text-amber-200">
          Save the estimate before changing its status.
        </p>
      )}

      {estimateId && currentStatus === "APPROVED" && (
        <p role="status" className="text-sm text-slate-400">
          Approved and ready to invoice. Generating the invoice locks the
          estimate.
        </p>
      )}

      {estimateId &&
        currentStatus &&
        currentStatus !== "APPROVED" &&
        nextStatuses.length === 0 && (
          <p role="status" className="text-sm text-slate-400">
            No further status changes are available.
          </p>
        )}

      {estimateId && !currentStatus && (
        <p role="alert" className="text-sm text-red-300">
          This estimate has an unrecognised status. Refresh before continuing.
        </p>
      )}

      {estimateId && nextStatuses.length > 0 && (
        <div
          role="group"
          aria-label="Estimate status actions"
          className="flex flex-wrap gap-2"
        >
          {nextStatuses.map((nextStatus) => (
            <Button
              key={nextStatus}
              type="button"
              size="sm"
              variant={
                TERMINAL_ACTIONS.has(nextStatus) ? "destructive" : "outline"
              }
              disabled={transitioningTo !== null}
              onClick={() => void transition(nextStatus)}
            >
              {transitioningTo === nextStatus
                ? "Updating…"
                : ACTION_LABELS[nextStatus]}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-200"
        >
          <p>{error}</p>
          {blockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          role="status"
          className="rounded-md border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100"
        >
          <p className="font-medium">Review these warnings:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
