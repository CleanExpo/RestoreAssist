/**
 * Client-safe claim status feed (client portal Phase 4).
 *
 * Pure projection of internal claim state into what a client may see — derived
 * from stable status/timestamp/progress fields (NOT raw AuditLog strings, which
 * carry internal jargon). Drives the portal's live auto-updating status view.
 */

const STEPS = [
  { key: "DRAFT", label: "Received" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "CLASSIFIED", label: "Assessed" },
  { key: "SCOPED", label: "Scope prepared" },
  { key: "COMPLETED", label: "Completed" },
] as const;

// Internal InspectionStatus → nearest client-visible step.
const STATUS_TO_STEP: Record<string, string> = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PROCESSING: "SUBMITTED",
  CLASSIFIED: "CLASSIFIED",
  SCOPED: "SCOPED",
  ESTIMATED: "SCOPED",
  IN_BILLING: "COMPLETED",
  CLOSED: "COMPLETED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "COMPLETED",
  REJECTED: "SUBMITTED",
};

const APPROVAL_LABELS: Record<string, string> = {
  SCOPE_OF_WORK: "Scope of works",
  COST_ESTIMATE: "Cost estimate",
};

export interface ClientFeedInput {
  status: string;
  workflow: { submissionScore: number | null } | null;
  reportStatus: string | null;
  pendingApprovals: { id: string; approvalType: string }[];
}

export interface ClientFeed {
  currentStep: string;
  progressPct: number;
  steps: { key: string; label: string; done: boolean }[];
  reportReady: boolean;
  pendingApprovals: { id: string; type: string; label: string }[];
}

export function buildClientStatusFeed(input: ClientFeedInput): ClientFeed {
  const stepKey = STATUS_TO_STEP[input.status] ?? "DRAFT";
  const idx = Math.max(
    0,
    STEPS.findIndex((s) => s.key === stepKey),
  );
  const steps = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    done: i <= idx,
  }));
  const derivedPct =
    STEPS.length > 1 ? Math.round((idx / (STEPS.length - 1)) * 100) : 0;
  const score = input.workflow?.submissionScore;
  const progressPct =
    score != null && Number.isFinite(score) ? Math.round(score) : derivedPct;

  return {
    currentStep: STEPS[idx]?.label ?? "Received",
    progressPct: Math.max(0, Math.min(100, progressPct)),
    steps,
    reportReady: input.reportStatus === "COMPLETED",
    pendingApprovals: input.pendingApprovals.map((a) => ({
      id: a.id,
      type: a.approvalType,
      label: APPROVAL_LABELS[a.approvalType] ?? "Approval needed",
    })),
  };
}
