/**
 * SP-A Task 2 — Inspection lifecycle state machine.
 *
 * Pure functions. No Prisma imports. Single source of truth for which
 * `InspectionStatus` transitions are legal and which preconditions gate
 * each one. Consumed today by:
 *   - SP-A `POST /api/inspections/[id]/close` (precondition re-check at write time)
 *   - SP-A `<CloseJobPrompt>` (decides whether to render the close card)
 *
 * Consumed downstream by:
 *   - SP-B `lib/lifecycle/subscribers/*` (webhook handlers re-evaluate)
 *   - SP-C completed-tab visibility checks
 *
 * Result shape matches the M-15 progress-gate contract: a hard reject lists
 * what's `missing`; a pass surfaces `softGaps` that should nudge the user
 * but never block.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 2.
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §3.1.
 */
import { InspectionStatus } from "@prisma/client";

/**
 * Context required to evaluate a transition. The caller (route handler or
 * UI fetch) is responsible for hydrating this from the live DB.
 */
export interface TransitionContext {
  /**
   * Current invoice status for the inspection's claim. `null` ⇒ no invoice
   * issued yet. Mirrors the `InvoiceStatus` enum values consumed at the
   * close-route boundary; the state machine only treats "PAID" as the
   * unlock for `invoice_paid`.
   */
  invoiceStatus:
    | "DRAFT"
    | "SENT"
    | "VIEWED"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "CANCELLED"
    | "WRITTEN_OFF"
    | "REFUNDED"
    | "ISSUED"
    | "VOID"
    | null;
  /**
   * Current report status. Per the `ReportStatus` enum, "COMPLETED" is the
   * terminal good state (the report has been finalised + delivered). The
   * spec's `report_sent` gate maps to ReportStatus === "COMPLETED".
   */
  reportStatus:
    | "DRAFT"
    | "PENDING"
    | "APPROVED"
    | "COMPLETED"
    | "ARCHIVED"
    | "SENT"
    | null;
  /** SP-J handover completion timestamp. `null` ⇒ handover not recorded; soft gap, never blocker. */
  handoverCompletedAt: Date | null;
}

export type TransitionResult =
  | { ok: true; softGaps: string[] }
  | { ok: false; missing: string[] };

export interface SuggestedAction {
  key: string;
  label: string;
  confidence: "high" | "medium" | "low";
}

interface RequirementSpec {
  /** Hard preconditions — failure means transition is rejected with `missing[]`. */
  required: readonly string[];
  /** Soft preconditions — surfaced but never block. */
  soft: readonly string[];
}

/**
 * The per-transition precondition matrix. Exported so SP-B's webhook
 * subscribers can re-evaluate the same gates without round-tripping
 * through the state machine.
 *
 * Keyed by `transitionKey` rather than (from,to) pair because the same
 * key (e.g. close_job) maps to exactly one edge and is how the audit
 * log records the event.
 */
export const TRANSITION_REQUIREMENTS = {
  // SUBMITTED → IN_BILLING is the post-sign-off transition. Sign-off is
  // already recorded at this point (Inspection.signedAt is set), and the
  // invoice draft is generated downstream. No additional gating here in v1
  // (SP-B will tighten this when the auto-progression webhook ships).
  issue_invoice: {
    required: [] as const,
    soft: [] as const,
  },
  // IN_BILLING → CLOSED — the terminal-state transition this whole plan
  // exists to ship. Hard preconditions: invoice paid + report sent.
  // Soft gap: handover (SP-J) recorded.
  close_job: {
    required: ["invoice_paid", "report_sent"] as const,
    soft: ["handover_pending"] as const,
  },
  // CLOSED → ARCHIVED — admin-driven, long-term retention. No automatic
  // gating; admin discretion only.
  archive_job: {
    required: [] as const,
    soft: [] as const,
  },
  // SP-J: CLOSED → CLOSED (self-loop) — the on-site handover moment.
  // Status does not change (handover happens AFTER close per the brief);
  // the transition records `handoverCompletedAt` + writes the package
  // storage key. Gate: `handover_not_yet_done` enforces idempotency so a
  // second call after a successful handover rejects with 409.
  complete_handover: {
    required: ["handover_not_yet_done"] as const,
    soft: [] as const,
  },
} as const satisfies Record<string, RequirementSpec>;

/**
 * The legal forward edges. Listed explicitly rather than computed so the
 * map is auditable in a single grep.
 */
const LEGAL_EDGES: Array<{
  from: InspectionStatus;
  to: InspectionStatus;
  transitionKey: keyof typeof TRANSITION_REQUIREMENTS;
}> = [
  {
    from: InspectionStatus.SUBMITTED,
    to: InspectionStatus.IN_BILLING,
    transitionKey: "issue_invoice",
  },
  {
    from: InspectionStatus.IN_BILLING,
    to: InspectionStatus.CLOSED,
    transitionKey: "close_job",
  },
  {
    from: InspectionStatus.CLOSED,
    to: InspectionStatus.ARCHIVED,
    transitionKey: "archive_job",
  },
  // SP-J — self-loop on CLOSED. Status does not change; the route writes
  // `handoverCompletedAt` + `handoverPackageStorageKey`.
  {
    from: InspectionStatus.CLOSED,
    to: InspectionStatus.CLOSED,
    transitionKey: "complete_handover",
  },
];

function findEdge(from: InspectionStatus, to: InspectionStatus) {
  return LEGAL_EDGES.find((e) => e.from === from && e.to === to);
}

function evaluateGate(
  required: readonly string[],
  ctx: TransitionContext,
): string[] {
  const missing: string[] = [];
  for (const gate of required) {
    switch (gate) {
      case "invoice_paid":
        if (ctx.invoiceStatus !== "PAID") missing.push(gate);
        break;
      case "report_sent":
        // Accept "COMPLETED" (the actual ReportStatus terminal value) or
        // the alias "SENT" for forward-compat if a Report.sentAt-driven
        // semantic ever lands.
        if (ctx.reportStatus !== "COMPLETED" && ctx.reportStatus !== "SENT")
          missing.push(gate);
        break;
      case "handover_not_yet_done":
        // SP-J idempotency gate: handover must NOT already be recorded.
        // A second call after a successful handover surfaces this key in
        // `missing` and the route returns 409.
        if (ctx.handoverCompletedAt) missing.push("handover_already_done");
        break;
      default:
        // Unknown gate keys surface as missing so a typo can't silently
        // approve a transition.
        missing.push(`unknown:${gate}`);
    }
  }
  return missing;
}

function evaluateSoft(
  soft: readonly string[],
  ctx: TransitionContext,
): string[] {
  const out: string[] = [];
  for (const gate of soft) {
    switch (gate) {
      case "handover_pending":
        if (!ctx.handoverCompletedAt) out.push(gate);
        break;
      default:
        // Unknown soft keys: ignore (don't surface).
        break;
    }
  }
  return out;
}

/**
 * Returns whether the (from → to) transition is permitted for the given
 * context. Pure; safe to call from both server and client.
 */
export function canTransition(
  from: InspectionStatus,
  to: InspectionStatus,
  ctx: TransitionContext,
): TransitionResult {
  const edge = findEdge(from, to);
  if (!edge) {
    return { ok: false, missing: ["invalid_transition"] };
  }
  const spec = TRANSITION_REQUIREMENTS[edge.transitionKey];
  const missing = evaluateGate(spec.required, ctx);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true, softGaps: evaluateSoft(spec.soft, ctx) };
}

/**
 * Returns the list of actions the current state can advance to, filtered to
 * those whose hard preconditions are satisfied. Empty for terminal states.
 */
/**
 * Suggestions surfaced by the Sidekick UI. `archive_job` is intentionally
 * excluded — archiving is admin-driven from a separate surface (SP-C),
 * not a user-suggested next step from a closed job.
 */
const SUGGESTABLE_KEYS: ReadonlySet<keyof typeof TRANSITION_REQUIREMENTS> =
  new Set(["issue_invoice", "close_job"]);

export function nextSuggestions(
  current: InspectionStatus,
  ctx: TransitionContext,
): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  for (const edge of LEGAL_EDGES) {
    if (edge.from !== current) continue;
    if (!SUGGESTABLE_KEYS.has(edge.transitionKey)) continue;
    const gate = canTransition(edge.from, edge.to, ctx);
    if (!gate.ok) continue;
    out.push({
      key: edge.transitionKey,
      label: labelFor(edge.transitionKey),
      confidence: "high",
    });
  }
  return out;
}

function labelFor(key: keyof typeof TRANSITION_REQUIREMENTS): string {
  switch (key) {
    case "issue_invoice":
      return "Issue invoice";
    case "close_job":
      return "Close this job";
    case "archive_job":
      return "Archive this job";
    case "complete_handover":
      return "Hand over to client";
  }
}
