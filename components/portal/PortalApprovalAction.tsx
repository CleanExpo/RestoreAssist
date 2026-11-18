"use client";

import { clientPortalPrimaryLink } from "@/lib/portal/client-portal-theme";
import type {
  PortalApprovalRow,
  PortalApprovalState,
} from "@/lib/portal/approval-state";

// RA-8455: the control beside an approval heading in the client portal. An
// open restorer request always gets an actionable button; an answered one
// shows only its badge.

const ANSWERED_BADGE: Record<string, string> = {
  APPROVED: "bg-green-100 text-success",
  REJECTED: "bg-red-100 text-destructive",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-700",
};

export function PortalApprovalAction<T extends PortalApprovalRow>({
  state,
  onRespond,
}: {
  state: PortalApprovalState<T>;
  onRespond: () => void;
}) {
  if (state.kind === "answered") {
    const status = state.approval.status;
    return (
      <div
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          ANSWERED_BADGE[status] ?? "bg-yellow-100 text-yellow-700"
        }`}
      >
        {status.replace("_", " ")}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {state.kind === "requested" && (
        <p className="text-xs text-yellow-300">
          Your restorer has asked for your decision.
        </p>
      )}
      <button
        type="button"
        onClick={onRespond}
        className={`${clientPortalPrimaryLink} !min-h-10 text-sm`}
      >
        Review & Approve
      </button>
    </div>
  );
}
