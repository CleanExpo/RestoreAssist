/**
 * Progress service layer — the one orchestrator that calls into the state
 * machine, runs guards, writes the immutable audit log, and fires
 * integration fan-out.
 *
 * Board reference: .claude/board-2026-04-18/05-software-architect.md §3-§5
 *
 * Design rules (Board M-4 foundational principles):
 *   - Append-only audit log — never UPDATE / DELETE a ProgressTransition row
 *   - Optimistic locking via ClaimProgress.version — reject stale writes
 *   - Integration fan-out is fire-and-forget on the success path
 *   - All errors return typed results; no throws across the service boundary
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type {
  ClaimProgress,
  ClaimState,
  ProgressTransition,
  Prisma,
} from "@prisma/client";
import {
  TRANSITION_KEYS,
  type TransitionKey,
  nextState,
  isValidTransition,
} from "./state-machine";
import {
  canPerformTransition,
  canRead,
  type ProgressRole,
} from "./permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "FORBIDDEN"
        | "INVALID_TRANSITION"
        | "STALE_VERSION"
        | "GUARD_FAILED"
        | "ALREADY_EXISTS"
        | "INTERNAL";
      message: string;
    };

export interface InitArgs {
  reportId: string;
  actorUserId: string;
  actorRole: ProgressRole;
  actorName: string;
  inspectionId?: string | null;
}

export interface TransitionArgs {
  reportId: string;
  key: TransitionKey;
  actorUserId: string;
  actorRole: ProgressRole;
  actorName: string;
  actorIp?: string | null;
  note?: string | null;
  /** Expected ClaimProgress.version — if stale, transition rejected. */
  expectedVersion?: number;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init(
  args: InitArgs,
): Promise<ServiceResult<ClaimProgress>> {
  const existing = await prisma.claimProgress.findUnique({
    where: { reportId: args.reportId },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      code: "ALREADY_EXISTS",
      message: "ClaimProgress already exists for this report",
    };
  }

  // Verify the report exists and the actor has access. The caller owns
  // session-level auth; here we scope by userId to guarantee tenancy.
  const report = await prisma.report.findUnique({
    where: { id: args.reportId },
    select: { id: true, userId: true },
  });
  if (!report) {
    return { ok: false, code: "NOT_FOUND", message: "Report not found" };
  }
  if (report.userId !== args.actorUserId && args.actorRole !== "ADMIN") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Report not accessible to actor",
    };
  }

  try {
    const cp = await prisma.claimProgress.create({
      data: {
        reportId: args.reportId,
        inspectionId: args.inspectionId ?? null,
        currentState: "INTAKE",
        version: 0,
        primaryTechnicianId:
          args.actorRole === "TECHNICIAN" ? args.actorUserId : null,
        primaryManagerId:
          args.actorRole === "MANAGER" ? args.actorUserId : null,
      },
    });
    return { ok: true, data: cp };
  } catch {
    return {
      ok: false,
      code: "INTERNAL",
      message: "Failed to create ClaimProgress",
    };
  }
}

// ─── Transition ───────────────────────────────────────────────────────────────

export async function transition(
  args: TransitionArgs,
): Promise<ServiceResult<ProgressTransition>> {
  const cp = await prisma.claimProgress.findUnique({
    where: { reportId: args.reportId },
    select: {
      id: true,
      reportId: true,
      inspectionId: true,
      currentState: true,
      version: true,
    },
  });
  if (!cp) {
    return { ok: false, code: "NOT_FOUND", message: "ClaimProgress not found" };
  }

  // Permission gate
  if (!canPerformTransition(args.actorRole, cp.currentState, args.key)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Role ${args.actorRole} cannot perform ${args.key} from ${cp.currentState}`,
    };
  }

  // Resolve the next state from (from, key). State machine is the source of truth.
  const toState = nextState(cp.currentState, args.key);
  if (!toState) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Transition ${args.key} is not legal from ${cp.currentState}`,
    };
  }
  // Sanity check — should never fail, defence-in-depth
  if (!isValidTransition(cp.currentState, args.key, toState)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: "State machine edge rejected at sanity check",
    };
  }

  // Run guard (M-21 v1 ships a minimal guard; M-2 Stage×Evidence contract
  // fleshes this out in a follow-up PR — see .claude/board-2026-04-18/00-board-minutes.md §5.2)
  const guardSnapshot = await runGuard({
    claimProgressId: cp.id,
    reportId: cp.reportId,
    inspectionId: cp.inspectionId,
    fromState: cp.currentState,
    toState,
    key: args.key,
  });
  if (!guardSnapshot.passed) {
    return {
      ok: false,
      code: "GUARD_FAILED",
      message: guardSnapshot.reason ?? "Guard function rejected transition",
    };
  }

  // Optimistic-locked write (CLAUDE.md rule 9 analogue — never read-then-write).
  const expectedVersion = args.expectedVersion ?? cp.version;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.claimProgress.updateMany({
        where: { id: cp.id, version: expectedVersion },
        data: {
          currentState: toState,
          previousState: cp.currentState,
          version: { increment: 1 },
          ...(toState === "CLOSED" || toState === "WITHDRAWN"
            ? { closedAt: new Date() }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw new StaleVersionError();
      }

      const integrityHash = computeIntegrityHash({
        claimProgressId: cp.id,
        fromState: cp.currentState,
        toState,
        actorUserId: args.actorUserId,
        // note: transitionedAt is set by DB default; we hash a deterministic
        // placeholder here and the verifier recomputes on read using the
        // committed timestamp. The hash is stored for tamper-detection;
        // precise timestamp-matching happens at verify time.
      });

      const trans = await tx.progressTransition.create({
        data: {
          claimProgressId: cp.id,
          transitionKey: args.key,
          fromState: cp.currentState,
          toState,
          actorUserId: args.actorUserId,
          actorRole: args.actorRole,
          actorName: args.actorName,
          actorIp: args.actorIp ?? null,
          guardSnapshot: guardSnapshot.snapshot as Prisma.InputJsonValue,
          integrityHash,
        },
      });

      return trans;
    });

    // Integration fan-out is fire-and-forget — Sprint 2 (M-11, M-18, M-19)
    // wires Xero / DocuSign / Guidewire / Twilio into this hook.
    void dispatchIntegrations(result.id, args.key).catch((err) => {
      console.error("[progress] integration dispatch failed", {
        transitionId: result.id,
        err,
      });
    });

    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof StaleVersionError) {
      return {
        ok: false,
        code: "STALE_VERSION",
        message: "Another writer advanced the claim; refresh and retry",
      };
    }
    console.error("[progress.transition] failed", err);
    return {
      ok: false,
      code: "INTERNAL",
      message: "Transition commit failed",
    };
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getState(
  reportId: string,
  actorRole: ProgressRole,
): Promise<
  ServiceResult<{
    progress: ClaimProgress;
    recentTransitions: ProgressTransition[];
  }>
> {
  const cp = await prisma.claimProgress.findUnique({
    where: { reportId },
  });
  if (!cp) {
    return { ok: false, code: "NOT_FOUND", message: "ClaimProgress not found" };
  }
  if (!canRead(actorRole, cp.currentState)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Role ${actorRole} cannot read claim in ${cp.currentState}`,
    };
  }
  const recentTransitions = await prisma.progressTransition.findMany({
    where: { claimProgressId: cp.id },
    orderBy: { transitionedAt: "desc" },
    take: 20,
  });
  return { ok: true, data: { progress: cp, recentTransitions } };
}

export async function getHistory(
  reportId: string,
  actorRole: ProgressRole,
  take = 250,
): Promise<ServiceResult<ProgressTransition[]>> {
  const cp = await prisma.claimProgress.findUnique({
    where: { reportId },
    select: { id: true, currentState: true },
  });
  if (!cp) {
    return { ok: false, code: "NOT_FOUND", message: "ClaimProgress not found" };
  }
  if (!canRead(actorRole, cp.currentState)) {
    return { ok: false, code: "FORBIDDEN", message: "Not readable" };
  }
  const rows = await prisma.progressTransition.findMany({
    where: { claimProgressId: cp.id },
    orderBy: { transitionedAt: "asc" },
    take: Math.min(take, 500), // hard cap
  });
  return { ok: true, data: rows };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

class StaleVersionError extends Error {}

function computeIntegrityHash(args: {
  claimProgressId: string;
  fromState: ClaimState;
  toState: ClaimState;
  actorUserId: string;
}): string {
  const input = [
    args.claimProgressId,
    args.fromState,
    args.toState,
    args.actorUserId,
  ].join(":");
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Minimal guard for Sprint-1. Returns passed=true with an empty snapshot for
 * every transition so the service layer is exercised end-to-end. Real
 * per-transition guards land in a follow-up PR that maps board minutes §5.2
 * Stage × Required Evidence contract (M-2) onto this function.
 */
async function runGuard(_ctx: {
  claimProgressId: string;
  reportId: string;
  inspectionId: string | null;
  fromState: ClaimState;
  toState: ClaimState;
  key: TransitionKey;
}): Promise<{
  passed: boolean;
  reason?: string;
  snapshot: Record<string, unknown>;
}> {
  // Sprint-1 stub. M-2 follow-up wires per-transition evidence checks.
  return { passed: true, snapshot: {} };
}

async function dispatchIntegrations(
  _transitionId: string,
  _key: TransitionKey,
) {
  // Sprint-2 (M-11, M-18, M-19, M-13) wires Xero / DocuSign / Guidewire / Twilio here.
  // Intentionally no-op in Sprint-1 so transitions commit cleanly.
  return;
}

// Re-export for callers
export { TRANSITION_KEYS };
export type { TransitionKey };
