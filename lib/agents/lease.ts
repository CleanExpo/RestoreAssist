/**
 * Task leases (RA-7999, durable agents slice 1a).
 *
 * Every claim of an AgentTask takes a fencing lease: a fresh `leaseOwner`
 * token and a database-clock `leaseExpiresAt`. Every write after the claim is
 * guarded by that token, so a worker whose lease was reclaimed cannot
 * overwrite the new owner's row. A DB CHECK keeps both columns NULL whenever
 * the task is not RUNNING.
 *
 * The sweep is one conditional UPDATE that returns expired RUNNING tasks to
 * READY, dead-letters them when their attempts are spent, dead-letters legacy
 * unleased rows (never replays them) and cancels them on terminal workflows.
 * A move to DEAD_LETTER or FAILED skips the task's PENDING dependents in the
 * same transaction; both re-queue paths undo that skip.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PG_POOL_CONNECTION_TIMEOUT_MS } from "@/lib/prisma-pool-config";
import { refreshWorkflowProgress } from "./state-manager";

type Db = Prisma.TransactionClient;

/**
 * Covers the final write after the handler returns: two pool connection
 * waits plus 10 s for the statement itself.
 */
export const LEASE_MARGIN_MS = 2 * PG_POOL_CONNECTION_TIMEOUT_MS + 10_000;

/** Backoff for a retryable failure: the parked lease expires after this. */
export const DEFAULT_RETRY_AFTER_MS = 30_000;

/** A RUNNING row with no lease is legacy; it is only swept after this long. */
export const LEGACY_UNLEASED_AFTER_MS = 15 * 60 * 1000;

export const LEASE_EXPIRED_CODE = "LEASE_EXPIRED";
export const LEGACY_UNLEASED_CODE = "LEGACY_UNLEASED";
export const UPSTREAM_FAILED_CODE = "UPSTREAM_FAILED";

const TERMINAL_WORKFLOW_STATUSES = Prisma.sql`('CANCELLED', 'COMPLETED', 'FAILED', 'PARTIALLY_FAILED')`;

/**
 * The database clock as UTC wall time, which is how Prisma stores DateTime in
 * TIMESTAMP(3) columns. Never the JS clock: workers on different hosts must
 * agree on when a lease expires.
 */
export const DB_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

export function msInterval(ms: number): Prisma.Sql {
  return Prisma.sql`(${Math.round(ms)}::double precision * interval '1 millisecond')`;
}

/**
 * True when the RUNNING task under alias `t` holds a live lease: its lease has
 * not expired, or it is a legacy unleased row younger than the threshold. The
 * sweep reclaims exactly the RUNNING rows for which this is not true, and the
 * cron's stale check uses the same expression.
 */
export function liveLeaseSql(t: string): Prisma.Sql {
  const a = Prisma.raw(t);
  return Prisma.sql`(
    ${a}."leaseExpiresAt" >= ${DB_NOW}
    OR (
      ${a}."leaseOwner" IS NULL
      AND ${a}."leaseExpiresAt" IS NULL
      AND ${a}."startedAt" >= ${DB_NOW} - ${msInterval(LEGACY_UNLEASED_AFTER_MS)}
    )
  )`;
}

// ---------------------------------------------------------------------------
// Claim-guarded writes
// ---------------------------------------------------------------------------

/**
 * Extend this claim's lease. Matches only while the task is still RUNNING
 * under `leaseOwner`; returns false when the lease was lost.
 */
export async function extendLease(
  taskId: string,
  leaseOwner: string,
  ms: number,
): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "AgentTask"
    SET "leaseExpiresAt" = ${DB_NOW} + ${msInterval(ms)},
        "updatedAt" = ${DB_NOW}
    WHERE id = ${taskId}
      AND status = 'RUNNING'
      AND "leaseOwner" = ${leaseOwner}`;
  return count > 0;
}

// ---------------------------------------------------------------------------
// Failure cascade
// ---------------------------------------------------------------------------

/**
 * Mark every transitive PENDING dependent of `failedTaskId` SKIPPED with
 * errorCode UPSTREAM_FAILED. Run it in the transaction that moved the task to
 * DEAD_LETTER or FAILED.
 */
export async function skipDependentsOfFailedTask(
  db: Db,
  workflowId: string,
  failedTaskId: string,
): Promise<number> {
  const tasks = await db.agentTask.findMany({
    where: { workflowId },
    select: { id: true, status: true, dependsOnTaskIds: true },
  });

  const blocked = new Set<string>([failedTaskId]);
  const toSkip: string[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of tasks) {
      if (task.status !== "PENDING" || blocked.has(task.id)) continue;
      if (task.dependsOnTaskIds.some((dep) => blocked.has(dep))) {
        blocked.add(task.id);
        toSkip.push(task.id);
        grew = true;
      }
    }
  }
  if (toSkip.length === 0) return 0;

  const result = await db.agentTask.updateMany({
    where: { AND: [{ id: { in: toSkip } }, { workflowId, status: "PENDING" }] },
    data: {
      status: "SKIPPED",
      errorCode: UPSTREAM_FAILED_CODE,
      errorMessage: `Skipped: upstream task ${failedTaskId} failed`,
    },
  });
  return result.count;
}

/**
 * Undo the cascade when a workflow's failed tasks are re-queued: every
 * UPSTREAM_FAILED row goes back to PENDING, then the dependents of any task
 * that is still failed are skipped again. Run it in the re-queue transaction.
 */
export async function unskipUpstreamFailed(
  db: Db,
  workflowId: string,
): Promise<number> {
  const reset = await db.agentTask.updateMany({
    where: { workflowId, status: "SKIPPED", errorCode: UPSTREAM_FAILED_CODE },
    data: { status: "PENDING", errorCode: null, errorMessage: null },
  });

  const stillFailed = await db.agentTask.findMany({
    where: { workflowId, status: { in: ["FAILED", "DEAD_LETTER"] } },
    select: { id: true },
  });
  for (const task of stillFailed) {
    await skipDependentsOfFailedTask(db, workflowId, task.id);
  }
  return reset.count;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export interface SweepResult {
  /** Expired, attempts left: back to READY. */
  reclaimed: number;
  /** Expired, attempts spent: DEAD_LETTER with LEASE_EXPIRED. */
  deadLettered: number;
  /** Unleased and older than the threshold: DEAD_LETTER with LEGACY_UNLEASED. */
  legacyUnleased: number;
  /** Expired on a terminal workflow: CANCELLED. */
  cancelled: number;
  dryRun: boolean;
}

/** RUNNING task, on a RUNNING or terminal workflow, without a live lease. */
function sweepPredicate(workflowId?: string): Prisma.Sql {
  return Prisma.sql`
    t.status = 'RUNNING'
    AND (w.status = 'RUNNING' OR w.status IN ${TERMINAL_WORKFLOW_STATUSES})
    AND NOT COALESCE(${liveLeaseSql("t")}, false)
    ${workflowId ? Prisma.sql`AND t."workflowId" = ${workflowId}` : Prisma.empty}`;
}

const NEXT_STATUS = Prisma.sql`CASE
    WHEN w.status <> 'RUNNING' THEN 'CANCELLED'::"TaskStatus"
    WHEN t."leaseExpiresAt" IS NOT NULL AND t.attempts < t."maxRetries" THEN 'READY'::"TaskStatus"
    ELSE 'DEAD_LETTER'::"TaskStatus"
  END`;

const NEXT_ERROR_CODE = Prisma.sql`CASE
    WHEN w.status <> 'RUNNING' THEN t."errorCode"
    WHEN t."leaseExpiresAt" IS NOT NULL AND t.attempts < t."maxRetries" THEN t."errorCode"
    WHEN t."leaseExpiresAt" IS NOT NULL THEN ${LEASE_EXPIRED_CODE}
    ELSE ${LEGACY_UNLEASED_CODE}
  END`;

const NEXT_ERROR_MESSAGE = Prisma.sql`CASE
    WHEN w.status <> 'RUNNING' THEN t."errorMessage"
    WHEN t."leaseExpiresAt" IS NOT NULL AND t.attempts < t."maxRetries" THEN t."errorMessage"
    WHEN t."leaseExpiresAt" IS NOT NULL THEN 'Lease expired with no attempts left'
    ELSE 'RUNNING with no lease for longer than the legacy threshold; not replayed automatically'
  END`;

interface SweptRow {
  id: string;
  workflowId: string;
  status: string;
  errorCode: string | null;
  attempts: number;
  prevLeaseOwner: string | null;
  prevLeaseExpiresAt: Date | null;
  prevStartedAt: Date | null;
}

function tally(rows: Array<{ status: string; errorCode: string | null }>, dryRun: boolean): SweepResult {
  const result: SweepResult = {
    reclaimed: 0,
    deadLettered: 0,
    legacyUnleased: 0,
    cancelled: 0,
    dryRun,
  };
  for (const row of rows) {
    if (row.status === "READY") result.reclaimed++;
    else if (row.status === "CANCELLED") result.cancelled++;
    else if (row.errorCode === LEGACY_UNLEASED_CODE) result.legacyUnleased++;
    else result.deadLettered++;
  }
  return result;
}

/**
 * Reclaim RUNNING tasks whose lease has expired. One UPDATE decides every
 * row's outcome; in the same transaction, dead-lettered tasks cascade to
 * their dependents, workflow progress is refreshed, and each row gets an
 * AgentTaskLog entry naming its previous token, startedAt and attempts.
 *
 * `workflowId` scopes it to one workflow (the execute route). `dryRun`
 * reports what would happen and writes nothing.
 */
export async function sweepExpiredLeases(
  options: { workflowId?: string; dryRun?: boolean } = {},
): Promise<SweepResult> {
  const predicate = sweepPredicate(options.workflowId);

  if (options.dryRun) {
    const preview = await prisma.$queryRaw<
      Array<{ status: string; errorCode: string | null }>
    >`
      SELECT (${NEXT_STATUS})::text AS status, ${NEXT_ERROR_CODE} AS "errorCode"
      FROM "AgentTask" t
      JOIN "AgentWorkflow" w ON w.id = t."workflowId"
      WHERE ${predicate}`;
    return tally(preview, true);
  }

  return prisma.$transaction(
    async (tx) => {
      // `o` is the same row before the update, for the previous lease values.
      const rows = await tx.$queryRaw<SweptRow[]>`
        UPDATE "AgentTask" t
        SET status = ${NEXT_STATUS},
            "errorCode" = ${NEXT_ERROR_CODE},
            "errorMessage" = ${NEXT_ERROR_MESSAGE},
            "leaseOwner" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = ${DB_NOW}
        FROM "AgentWorkflow" w, "AgentTask" o
        WHERE w.id = t."workflowId"
          AND o.id = t.id
          AND ${predicate}
        RETURNING t.id, t."workflowId", t.status::text AS status, t."errorCode",
                  t.attempts, o."leaseOwner" AS "prevLeaseOwner",
                  o."leaseExpiresAt" AS "prevLeaseExpiresAt",
                  o."startedAt" AS "prevStartedAt"`;

      const failedWorkflows = new Set<string>();
      for (const row of rows) {
        if (row.status === "DEAD_LETTER") {
          await skipDependentsOfFailedTask(tx, row.workflowId, row.id);
          failedWorkflows.add(row.workflowId);
        }
      }
      for (const workflowId of failedWorkflows) {
        await refreshWorkflowProgress(workflowId, tx);
      }

      if (rows.length > 0) {
        await tx.agentTaskLog.createMany({
          data: rows.map((row) => ({
            taskId: row.id,
            level: row.status === "DEAD_LETTER" ? "error" : "warn",
            message: sweepMessage(row),
            data: JSON.stringify({
              previousLeaseOwner: row.prevLeaseOwner,
              previousLeaseExpiresAt: row.prevLeaseExpiresAt,
              startedAt: row.prevStartedAt,
              attempts: row.attempts,
              newStatus: row.status,
              errorCode: row.errorCode,
            }),
          })),
        });
      }

      return tally(rows, false);
    },
    { maxWait: PG_POOL_CONNECTION_TIMEOUT_MS, timeout: 30_000 },
  );
}

function sweepMessage(row: SweptRow): string {
  if (row.status === "READY") {
    return "Lease expired: task reclaimed and returned to READY";
  }
  if (row.status === "CANCELLED") {
    return "Lease expired on a terminal workflow: task cancelled";
  }
  if (row.errorCode === LEGACY_UNLEASED_CODE) {
    return `Unleased RUNNING task moved to dead letter (${LEGACY_UNLEASED_CODE})`;
  }
  return `Lease expired with no attempts left: moved to dead letter (${LEASE_EXPIRED_CODE})`;
}
