"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type EstimateWorkflowStatus =
  | "DRAFT"
  | "INTERNAL_REVIEW"
  | "SENT"
  | "CLIENT_REVIEW"
  | "APPROVED"
  | "LOCKED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN";

const LEGAL_TRANSITIONS: Record<
  EstimateWorkflowStatus,
  readonly EstimateWorkflowStatus[]
> = {
  DRAFT: ["INTERNAL_REVIEW", "WITHDRAWN"],
  INTERNAL_REVIEW: ["DRAFT", "SENT", "WITHDRAWN"],
  SENT: ["CLIENT_REVIEW", "EXPIRED", "WITHDRAWN"],
  CLIENT_REVIEW: ["APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

const ACTION_LABELS: Record<EstimateWorkflowStatus, string> = {
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

const TERMINAL_ACTIONS = new Set<EstimateWorkflowStatus>([
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
]);

function isWorkflowStatus(value: string): value is EstimateWorkflowStatus {
  return Object.hasOwn(LEGAL_TRANSITIONS, value);
}

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
  estimateId?: string | null;
  status: string;
  beforeTransition?: () => Promise<boolean>;
  onTransition: (estimate: Record<string, unknown>) => void;
}

export function EstimateStatusWorkflow({
  estimateId,
  status,
  beforeTransition,
  onTransition,
}: EstimateStatusWorkflowProps) {
  const [transitioningTo, setTransitioningTo] =
    useState<EstimateWorkflowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const currentStatus = isWorkflowStatus(status) ? status : null;
  const legalTransitions = currentStatus
    ? LEGAL_TRANSITIONS[currentStatus]
    : [];

  async function transition(nextStatus: EstimateWorkflowStatus) {
    if (
      !estimateId ||
      !currentStatus ||
      !LEGAL_TRANSITIONS[currentStatus].includes(nextStatus)
    ) {
      setError("That estimate status transition is not available.");
      return;
    }

    setTransitioningTo(nextStatus);
    setError(null);
    setBlockers([]);
    setWarnings([]);
    try {
      if (beforeTransition && !(await beforeTransition())) {
        setError(
          "Save the current estimate successfully before changing its status.",
        );
        return;
      }

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

      if (!payload?.data || payload.data.status !== nextStatus) {
        setError(
          "The server did not confirm the requested estimate status. Refresh before trying again.",
        );
        return;
      }

      setWarnings(issueMessages(payload.warnings));
      onTransition(payload.data as Record<string, unknown>);
    } catch {
      setError(
        "The estimate status request failed. Check your connection and try again.",
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
          These controls update workflow status only. They do not send an
          estimate or create client approval evidence.
        </p>
        {currentStatus === "CLIENT_REVIEW" && (
          <p className="mt-2 max-w-2xl text-sm text-cyan-200">
            Approval succeeds only when the backend finds a matching approved
            client response for the current estimate total.
          </p>
        )}
      </div>

      {!estimateId && (
        <p role="status" className="text-sm text-amber-200">
          Save the estimate before changing its workflow status.
        </p>
      )}

      {estimateId && currentStatus && legalTransitions.length === 0 && (
        <p role="status" className="text-sm text-slate-400">
          No further status transitions are available.
        </p>
      )}

      {estimateId && !currentStatus && (
        <p role="alert" className="text-sm text-red-300">
          This estimate has an unrecognised status. Refresh before continuing.
        </p>
      )}

      {estimateId && legalTransitions.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Estimate status actions"
        >
          {legalTransitions.map((nextStatus) => (
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
