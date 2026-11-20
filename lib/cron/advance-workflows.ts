import type { AgentTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  advanceWorkflow,
  getAgent,
  getExecutableTasks,
  getWorkflowContext,
  executeBatch,
  liveLeaseSql,
  sweepExpiredLeases,
  LEASE_MARGIN_MS,
} from "@/lib/agents";
import type { ExecutionResult } from "@/lib/agents";
import { DB_NOW, msInterval } from "@/lib/agents/lease";
import type { CronJobResult } from "./runner";

const BATCH_SIZE = 10;
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * The caller aborts at 330 s (scripts/ci/trigger-production-crons.mjs), so a
 * run stops claiming new work once a claim could no longer finish by 240 s.
 */
export const ADVANCE_WORKFLOWS_DEADLINE_MS = 240_000;

/** Used when a READY task's agent is not registered (its claim fails fast). */
const FALLBACK_STEP_TIMEOUT_MS = 120_000;

export interface AdvanceWorkflowsOptions {
  /** Report what the sweep would reclaim; write nothing and run nothing. */
  dryRun?: boolean;
  /** Clock for the deadline check (tests inject one; defaults to Date.now). */
  now?: () => number;
}

/**
 * Performs four workflow management tasks:
 * 0. Sweeps expired task leases (RA-7999), before anything else
 * 1. Activates scheduled workflows whose scheduledFor time has arrived
 * 2. Advances RUNNING workflows that have READY tasks waiting
 * 3. Detects and fails stale workflows (no progress for 15+ minutes)
 *
 * @returns Result with count of workflows processed and breakdown by action type
 */
export async function advanceWorkflows(
  options: AdvanceWorkflowsOptions = {},
): Promise<CronJobResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();

  // 0. Sweep at top level, outside any per-item catch: if it fails, the run fails.
  if (options.dryRun) {
    const preview = await sweepExpiredLeases({ dryRun: true });
    return {
      itemsProcessed: 0,
      metadata: {
        dryRun: true,
        reclaimed: preview.reclaimed,
        deadLettered: preview.deadLettered,
        legacyUnleased: preview.legacyUnleased,
        cancelled: preview.cancelled,
      },
    };
  }
  const sweep = await sweepExpiredLeases();

  let processed = 0;
  let errors = 0;
  let leaseLost = 0;
  let unprocessed = 0;
  let deadlineReached = false;
  const details: any[] = [];

  /** Can a claim of these tasks still finish (timeout + margin) by the deadline? */
  const withinDeadline = (tasks: AgentTask[]): boolean => {
    const maxStepTimeoutMs = Math.max(
      0,
      ...tasks.map(
        (t) =>
          getAgent(t.agentSlug as any)?.timeoutMs ?? FALLBACK_STEP_TIMEOUT_MS,
      ),
    );
    return (
      now() - startedAt + maxStepTimeoutMs + LEASE_MARGIN_MS <=
      ADVANCE_WORKFLOWS_DEADLINE_MS
    );
  };
  const countLeaseLost = (results: ExecutionResult[]) => {
    leaseLost += results.filter((r) => r.status === "LEASE_LOST").length;
  };

  // 1. Activate scheduled workflows
  const scheduledWorkflows = await prisma.agentWorkflow.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: new Date() },
    },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  });

  for (const [index, wf] of scheduledWorkflows.entries()) {
    try {
      const readyTasks = await getExecutableTasks(wf.id);
      if (!withinDeadline(readyTasks)) {
        deadlineReached = true;
        unprocessed += scheduledWorkflows.length - index;
        break;
      }

      await prisma.agentWorkflow.update({
        where: { id: wf.id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      if (readyTasks.length > 0) {
        const context = await getWorkflowContext(wf.id);
        countLeaseLost(await executeBatch(readyTasks, context));
        await advanceWorkflow(wf.id);
      }

      processed++;
      details.push({ workflowId: wf.id, action: "scheduled-start" });
    } catch (err) {
      errors++;
      console.error(
        `[CronAdvance] Failed to start scheduled workflow ${wf.id}:`,
        err,
      );
    }
  }

  // 2. Advance RUNNING workflows with READY tasks
  const activeWorkflows = deadlineReached
    ? []
    : await prisma.agentWorkflow.findMany({
        where: {
          status: "RUNNING",
          tasks: { some: { status: "READY" } },
        },
        take: Math.max(BATCH_SIZE - processed, 0),
        orderBy: { updatedAt: "asc" },
      });

  for (const [index, wf] of activeWorkflows.entries()) {
    try {
      const readyTasks = await getExecutableTasks(wf.id);
      if (!withinDeadline(readyTasks)) {
        deadlineReached = true;
        unprocessed += activeWorkflows.length - index;
        break;
      }
      if (readyTasks.length > 0) {
        const context = await getWorkflowContext(wf.id);
        countLeaseLost(await executeBatch(readyTasks, context));
        await advanceWorkflow(wf.id);

        await prisma.agentWorkflow.update({
          where: { id: wf.id },
          data: { lastActivityAt: new Date() },
        });
      }

      processed++;
      details.push({
        workflowId: wf.id,
        action: "advanced",
        tasks: readyTasks.length,
      });
    } catch (err) {
      errors++;
      console.error(`[CronAdvance] Failed to advance workflow ${wf.id}:`, err);
    }
  }

  // 3. Detect and fail stale workflows
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const staleWorkflows = await prisma.agentWorkflow.findMany({
    where: {
      status: "RUNNING",
      lastActivityAt: { lt: staleThreshold },
      tasks: { none: { status: { in: ["READY", "RUNNING"] } } },
    },
    take: 5,
  });

  for (const wf of staleWorkflows) {
    try {
      const progress = await advanceWorkflow(wf.id);

      if (
        progress.status === "RUNNING" &&
        progress.nextExecutable.length === 0
      ) {
        // Truly stuck — fail the workflow, but only if at the moment of the
        // write it is still RUNNING, still stale, and has no READY task and no
        // live lease (the sweep's own predicate). Compare-and-swap.
        const failed = await prisma.$executeRaw`
          UPDATE "AgentWorkflow" w
          SET status = 'FAILED',
              "completedAt" = ${DB_NOW},
              "errorMessage" = ${"Workflow stalled: no executable tasks and no progress for 15+ minutes"},
              "updatedAt" = ${DB_NOW}
          WHERE w.id = ${wf.id}
            AND w.status = 'RUNNING'
            AND w."lastActivityAt" < ${DB_NOW} - ${msInterval(STALE_THRESHOLD_MS)}
            AND NOT EXISTS (
              SELECT 1 FROM "AgentTask" t
              WHERE t."workflowId" = w.id
                AND (
                  t.status = 'READY'
                  OR (t.status = 'RUNNING' AND COALESCE(${liveLeaseSql("t")}, false))
                )
            )`;
        details.push({
          workflowId: wf.id,
          action: failed > 0 ? "stale-failed" : "stale-changed",
        });
      } else {
        details.push({
          workflowId: wf.id,
          action: "stale-resolved",
          newStatus: progress.status,
        });
      }

      processed++;
    } catch (err) {
      errors++;
      console.error(
        `[CronAdvance] Failed to handle stale workflow ${wf.id}:`,
        err,
      );
    }
  }

  const counts = {
    reclaimed: sweep.reclaimed,
    deadLettered: sweep.deadLettered,
    legacyUnleased: sweep.legacyUnleased,
    cancelled: sweep.cancelled,
    leaseLost,
    errors,
    unprocessed,
  };

  // Every item failed: fail the run so the cron watchdog sees a failed run.
  if (errors > 0 && processed === 0) {
    throw new Error(
      `advance-workflows: all ${errors} item(s) failed ${JSON.stringify(counts)}`,
    );
  }

  return {
    itemsProcessed: processed,
    metadata: { ...counts, deadlineReached, details },
  };
}
