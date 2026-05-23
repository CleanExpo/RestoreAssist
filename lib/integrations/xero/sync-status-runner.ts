/**
 * sync-status-runner.ts — RA-1112
 *
 * Thin Prisma wrapper over `sync-status.ts` pure logic. Wraps any outbound
 * Xero call with a state-machine: upsert `syncing` → run the work → upsert
 * `synced` (with xeroEntityId) OR `queued`/`dead_letter` based on attempt
 * count.
 *
 * Rule #13 preserved: `runWithSyncStatus` never throws out to its caller
 * on sync failure. Write-path errors of the status row itself ARE logged
 * but also swallowed — the whole point is "sync state must never block
 * the user action".
 */

import { prisma } from "@/lib/prisma";
import {
  applyAttemptStart,
  applyAttemptSuccess,
  applyAttemptFailure,
  type XeroSyncEntityType,
  type XeroSyncState,
} from "./sync-status";

export interface RunWithSyncStatusArgs<T> {
  entityType: XeroSyncEntityType;
  entityId: string;
  userId: string;
  /** The actual Xero call. Must return the Xero-side id on success. */
  run: () => Promise<{ xeroEntityId: string; payload?: T }>;
}

export interface RunWithSyncStatusResult<T> {
  ok: boolean;
  finalState: XeroSyncState;
  xeroEntityId: string | null;
  payload: T | null;
}

/**
 * Wrap a Xero outbound call with full state-machine tracking.
 *
 * Idempotent on the (entityType, entityId) unique index: replaying a
 * successful run is a no-op status rewrite.
 */
export async function runWithSyncStatus<T>(
  args: RunWithSyncStatusArgs<T>,
): Promise<RunWithSyncStatusResult<T>> {
  const { entityType, entityId, userId, run } = args;
  const now = new Date();

  // Read prior row so we can preserve attemptCount + xeroEntityId.
  const prior = await safeFindStatus(entityType, entityId);
  const priorAttemptCount = prior?.attemptCount ?? 0;
  const priorXeroId = prior?.xeroEntityId ?? null;

  // Move to `syncing`.
  await safeUpsertStatus({
    entityType,
    entityId,
    userId,
    attemptCount: priorAttemptCount,
    ...applyAttemptStart(
      { attemptCount: priorAttemptCount, xeroEntityId: priorXeroId },
      now,
    ),
  });

  try {
    const res = await run();
    const patch = applyAttemptSuccess(
      { attemptCount: priorAttemptCount },
      res.xeroEntityId,
      new Date(),
    );
    await safeUpsertStatus({
      entityType,
      entityId,
      userId,
      ...patch,
    });
    return {
      ok: true,
      finalState: "synced",
      xeroEntityId: res.xeroEntityId,
      payload: res.payload ?? null,
    };
  } catch (err) {
    // Log server-side with the real message; only sanitised text reaches
    // the DB/UI (rule #7).
    console.error(`[xero-sync-status] ${entityType}:${entityId} failed`, err);
    const patch = applyAttemptFailure(
      { attemptCount: priorAttemptCount },
      err,
      new Date(),
    );
    await safeUpsertStatus({
      entityType,
      entityId,
      userId,
      xeroEntityId: priorXeroId,
      ...patch,
    });
    return {
      ok: false,
      finalState: patch.state,
      xeroEntityId: priorXeroId,
      payload: null,
    };
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────────
//
// Both helpers swallow Prisma errors — rule #13. A status-persist failure
// must never break the user-facing flow.

async function safeFindStatus(entityType: string, entityId: string) {
  try {
    return await prisma.xeroSyncStatus.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      select: {
        attemptCount: true,
        xeroEntityId: true,
        state: true,
      },
    });
  } catch (e) {
    console.error("[xero-sync-status] findUnique failed", e);
    return null;
  }
}

interface UpsertInput {
  entityType: string;
  entityId: string;
  userId: string;
  state: XeroSyncState;
  attemptCount?: number;
  lastAttemptAt?: Date | null;
  lastError?: string | null;
  nextRetryAt?: Date | null;
  xeroEntityId?: string | null;
}

async function safeUpsertStatus(input: UpsertInput) {
  try {
    await prisma.xeroSyncStatus.upsert({
      where: {
        entityType_entityId: {
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      create: {
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        state: input.state,
        attemptCount: input.attemptCount ?? 0,
        lastAttemptAt: input.lastAttemptAt ?? null,
        lastError: input.lastError ?? null,
        nextRetryAt: input.nextRetryAt ?? null,
        xeroEntityId: input.xeroEntityId ?? null,
      },
      update: {
        state: input.state,
        ...(input.attemptCount !== undefined && {
          attemptCount: input.attemptCount,
        }),
        ...(input.lastAttemptAt !== undefined && {
          lastAttemptAt: input.lastAttemptAt,
        }),
        ...(input.lastError !== undefined && { lastError: input.lastError }),
        ...(input.nextRetryAt !== undefined && {
          nextRetryAt: input.nextRetryAt,
        }),
        ...(input.xeroEntityId !== undefined && {
          xeroEntityId: input.xeroEntityId,
        }),
      },
    });
  } catch (e) {
    console.error("[xero-sync-status] upsert failed", e);
  }
}
