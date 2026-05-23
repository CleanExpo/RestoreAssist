/**
 * SP-A Task 3 — Append-only lifecycle audit writer.
 *
 * Writes a `ProgressTransition` row (the immutable chain-of-custody event)
 * and a companion `AuditLog` row (the per-inspection event stream) in the
 * caller's transaction. The two writes are intentionally side-by-side so
 * an admin querying either surface sees the same close event.
 *
 * Mapping note: SP-A's user-facing transition is in `InspectionStatus`
 * (IN_BILLING → CLOSED) but the underlying `ProgressTransition` columns
 * are typed `ClaimState`. The route handler does the mapping — this
 * writer takes `ClaimState` directly so it composes cleanly with the
 * existing Board M-4 progress framework.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 3.
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §3.1, rule 22.
 */
import { createHash } from "crypto";
import type { ClaimState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface LifecycleTransitionArgs {
  inspectionId: string;
  fromState: ClaimState;
  toState: ClaimState;
  /** e.g. "close_job" — matches the keys in inspection-state-machine.TRANSITION_REQUIREMENTS. */
  transitionKey: string;
  actorUserId: string;
  actorRole: string;
  actorName: string;
  actorIp?: string | null;
  /** JSON snapshot of preconditions verified at write time. Stored on the row for audit defence. */
  guardSnapshot: Prisma.InputJsonValue;
  /** Companion AuditLog action string, e.g. "JOB_CLOSED". */
  auditAction: string;
  /**
   * Optional transaction client. SHOULD be passed by callers that need
   * atomicity with surrounding writes (e.g. the close route updates
   * Inspection + writes this row in the same tx). Defaults to the
   * global Prisma client when omitted.
   */
  prismaTx?: Prisma.TransactionClient;
}

export interface LifecycleTransitionResult {
  /** ProgressTransition.id, or null if the legacy-fallback path skipped that write. */
  id: string | null;
  /** AuditLog.id — always present (audit is the floor of the chain-of-custody). */
  auditLogId: string;
}

/**
 * Compute the tamper-evidence hash for a transition. Hash is over a
 * canonical pipe-joined string so re-computation on read is trivial.
 *
 * Matches the shape of `lib/progress/service.computeIntegrityHash` so the
 * existing M-4 verifiers can validate SP-A transitions interchangeably.
 */
export function computeLifecycleIntegrityHash(args: {
  claimProgressId: string;
  fromState: ClaimState;
  toState: ClaimState;
  actorUserId: string;
}): string {
  const canonical = [
    args.claimProgressId,
    args.fromState,
    args.toState,
    args.actorUserId,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Write the append-only lifecycle event. See module docstring for
 * semantics. Returns the new ProgressTransition.id (null in the legacy
 * fallback path) and the AuditLog.id (always present).
 */
export async function writeLifecycleTransition(
  args: LifecycleTransitionArgs,
): Promise<LifecycleTransitionResult> {
  const db: Prisma.TransactionClient | typeof prisma = args.prismaTx ?? prisma;

  // Resolve the ClaimProgress row owning this inspection's audit trail.
  // The lookup uses `inspectionId` (denormalised on ClaimProgress per the
  // M-4 model) so we don't need to round-trip through Report.
  const cp = await db.claimProgress.findUnique({
    where: { inspectionId: args.inspectionId },
    select: { id: true },
  });

  // Always write the AuditLog row. The companion AuditLog is the floor of
  // the audit trail — even legacy inspections without a ClaimProgress get
  // a JOB_CLOSED row so admin queries surface the event.
  const auditLog = await db.auditLog.create({
    data: {
      inspectionId: args.inspectionId,
      action: args.auditAction,
      userId: args.actorUserId,
      changes: serialiseChanges({
        transitionKey: args.transitionKey,
        fromState: args.fromState,
        toState: args.toState,
      }),
    },
    select: { id: true },
  });

  if (!cp) {
    // Legacy inspection — no progress row to anchor the transition. We
    // intentionally do NOT create one here: that would require also
    // creating a Report and ClaimType inference, which is too much
    // side-effect for an audit writer. The AuditLog row above is the
    // surviving record. Caller can backfill ClaimProgress later.
    console.warn(
      `[lifecycle-event] inspection ${args.inspectionId} has no ClaimProgress — skipping ProgressTransition write (AuditLog still recorded)`,
    );
    return { id: null, auditLogId: auditLog.id };
  }

  const integrityHash = computeLifecycleIntegrityHash({
    claimProgressId: cp.id,
    fromState: args.fromState,
    toState: args.toState,
    actorUserId: args.actorUserId,
  });

  const trans = await db.progressTransition.create({
    data: {
      claimProgressId: cp.id,
      transitionKey: args.transitionKey,
      fromState: args.fromState,
      toState: args.toState,
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      actorName: args.actorName,
      actorIp: args.actorIp ?? null,
      guardSnapshot: args.guardSnapshot,
      integrityHash,
    },
    select: { id: true },
  });

  return { id: trans.id, auditLogId: auditLog.id };
}

function serialiseChanges(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}
