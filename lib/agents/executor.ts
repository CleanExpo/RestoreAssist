/**
 * Task Executor — runs agent tasks within the current API request scope.
 *
 * Each task is dispatched to the appropriate agent handler function
 * via the registry. Results are recorded as ExecutionResult objects.
 *
 * RA-7999: a claim takes a fencing lease (lease.ts). Every write after the
 * claim matches only `{id, status: RUNNING, leaseOwner: <this claim>}`; when
 * it matches nothing the lease was reclaimed, and the outcome is discarded as
 * LEASE_LOST. The executor is the only retry layer: one provider request per
 * attempt, and a retryable failure parks the task RUNNING until its lease
 * (the backoff gate) expires and the sweep returns it to READY.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AgentTask } from "@prisma/client";
import type {
  ExecutionResult,
  TaskInput,
  WorkflowContext,
} from "./types";
import { getAgent, getAgentHandler } from "./registry";
import { classifyError } from "./error-handler";
import { logAgentEvent } from "./logger";
import { refreshWorkflowProgress } from "./state-manager";
import {
  DB_NOW,
  DEFAULT_RETRY_AFTER_MS,
  LEASE_MARGIN_MS,
  extendLease,
  msInterval,
  skipDependentsOfFailedTask,
} from "./lease";

export interface TaskClaim {
  leaseOwner: string;
  /** attempts after this claim's increment, read back from the row. */
  attempts: number;
  maxRetries: number;
  workflowId: string;
}

/**
 * Claim a READY task: RUNNING, a fresh lease token, a database-clock lease of
 * `timeoutMs + LEASE_MARGIN_MS`, and `attempts + 1`, in one compare-and-swap.
 * Returns null when the task was not READY (another worker has it).
 */
export async function claimTask(
  taskId: string,
  timeoutMs: number,
): Promise<TaskClaim | null> {
  const leaseOwner = randomUUID();
  const rows = await prisma.$queryRaw<
    Array<{ attempts: number; maxRetries: number; workflowId: string }>
  >`
    UPDATE "AgentTask"
    SET status = 'RUNNING',
        "leaseOwner" = ${leaseOwner},
        "leaseExpiresAt" = ${DB_NOW} + ${msInterval(timeoutMs + LEASE_MARGIN_MS)},
        attempts = attempts + 1,
        "startedAt" = ${DB_NOW},
        "lastAttemptAt" = ${DB_NOW},
        "updatedAt" = ${DB_NOW}
    WHERE id = ${taskId}
      AND status = 'READY'
    RETURNING attempts, "maxRetries", "workflowId"`;

  const row = rows[0];
  if (!row) return null;

  // Stale detection reads lastActivityAt.
  await prisma.agentWorkflow
    .update({
      where: { id: row.workflowId },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => {}); // Non-blocking

  return {
    leaseOwner,
    attempts: row.attempts,
    maxRetries: row.maxRetries,
    workflowId: row.workflowId,
  };
}

/**
 * Execute a single agent task.
 */
export async function executeTask(
  task: AgentTask,
  context: WorkflowContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const agentSlug = task.agentSlug as any;

  const config = getAgent(agentSlug);
  if (!config) {
    return {
      taskId: task.id,
      status: "FAILED",
      error: {
        code: "VALIDATION_ERROR",
        message: `Agent "${task.agentSlug}" is not registered`,
        retryable: false,
        attempt: task.attempts + 1,
        maxRetries: task.maxRetries,
      },
    };
  }

  const handler = getAgentHandler(agentSlug);
  if (!handler) {
    return {
      taskId: task.id,
      status: "FAILED",
      error: {
        code: "VALIDATION_ERROR",
        message: `No handler registered for agent "${task.agentSlug}"`,
        retryable: false,
        attempt: task.attempts + 1,
        maxRetries: task.maxRetries,
      },
    };
  }

  // Claim the task (READY -> RUNNING) under a fresh lease
  const claim = await claimTask(task.id, config.timeoutMs);

  if (!claim) {
    // Another process already claimed this task
    await logAgentEvent(
      task.id,
      "warn",
      "Task claim failed — already claimed by another process",
    );
    return {
      taskId: task.id,
      status: "FAILED",
      error: {
        code: "VALIDATION_ERROR",
        message: "Task already claimed",
        retryable: false,
        attempt: task.attempts,
        maxRetries: task.maxRetries,
      },
    };
  }

  const { leaseOwner, attempts, maxRetries, workflowId } = claim;
  const leaseLost = (
    path: "pre-invoke" | "completion" | "retry" | "failure",
    tokensUsed: number | null,
  ) => recordLeaseLost(task.id, leaseOwner, path, tokensUsed, attempts, maxRetries);

  await logAgentEvent(
    task.id,
    "info",
    `Executing agent "${task.agentSlug}" (attempt ${attempts})`,
  );

  try {
    // Parse the task input and merge workflow context
    const input: TaskInput = {
      ...JSON.parse(task.input),
      context: context.completedOutputs,
    };

    // Re-extend immediately before the handler, so the margin only has to
    // cover the final write.
    if (!(await extendLease(task.id, leaseOwner, config.timeoutMs + LEASE_MARGIN_MS))) {
      return leaseLost("pre-invoke", null);
    }

    // Execute the handler with a timeout that aborts the in-flight request
    const output = await withTimeout(
      (signal) => handler(input, { signal }),
      config.timeoutMs,
      `Agent "${task.agentSlug}" timed out after ${config.timeoutMs}ms`,
    );

    const durationMs = Date.now() - startTime;

    // Record success, only while this claim still holds the lease
    const written = await prisma.agentTask.updateMany({
      where: { id: task.id, status: "RUNNING", leaseOwner },
      data: {
        status: "COMPLETED",
        output: JSON.stringify(output),
        completedAt: new Date(),
        durationMs,
        provider: output.metadata.provider,
        model: output.metadata.model,
        tokensUsed: output.metadata.tokensUsed,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (written.count === 0) {
      return leaseLost("completion", output.metadata.tokensUsed ?? null);
    }

    await logAgentEvent(task.id, "info", `Task completed in ${durationMs}ms`, {
      provider: output.metadata.provider,
      model: output.metadata.model,
      tokensUsed: output.metadata.tokensUsed,
    });

    return { taskId: task.id, status: "COMPLETED", output };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const classified = classifyError(err);
    const canRetry = classified.retryable && attempts < maxRetries;

    if (canRetry) {
      // Park: stay RUNNING under this claim's token; the lease is the backoff
      // gate, and the sweep returns the task to READY once it expires.
      const retryAfterMs = classified.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
      const parked = await prisma.$executeRaw`
        UPDATE "AgentTask"
        SET "leaseExpiresAt" = ${DB_NOW} + ${msInterval(retryAfterMs)},
            "errorMessage" = ${classified.message},
            "errorCode" = ${classified.code},
            "durationMs" = ${durationMs}::int,
            "updatedAt" = ${DB_NOW}
        WHERE id = ${task.id}
          AND status = 'RUNNING'
          AND "leaseOwner" = ${leaseOwner}`;
      if (parked === 0) return leaseLost("retry", null);

      await logAgentEvent(task.id, "error", `Task failed: ${classified.message}`, {
        errorCode: classified.code,
        attempt: attempts,
        maxRetries,
        durationMs,
        willRetry: true,
        retryAfterMs,
      });

      return {
        taskId: task.id,
        status: "RETRY",
        error: {
          code: classified.code,
          message: classified.message,
          retryable: true,
          attempt: attempts,
          maxRetries,
        },
      };
    }

    // No more retries — mark as failed and skip its dependents in one transaction
    const finalStatus = attempts >= maxRetries ? "DEAD_LETTER" : "FAILED";
    const failed = await prisma.$transaction(async (tx) => {
      const result = await tx.agentTask.updateMany({
        where: { id: task.id, status: "RUNNING", leaseOwner },
        data: {
          status: finalStatus,
          errorMessage: classified.message,
          errorCode: classified.code,
          durationMs,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (result.count === 0) return false;
      await skipDependentsOfFailedTask(tx, workflowId, task.id);
      await refreshWorkflowProgress(workflowId, tx);
      return true;
    });
    if (!failed) return leaseLost("failure", null);

    await logAgentEvent(task.id, "error", `Task failed: ${classified.message}`, {
      errorCode: classified.code,
      attempt: attempts,
      maxRetries,
      durationMs,
      willRetry: false,
      finalStatus,
    });

    return {
      taskId: task.id,
      status: "FAILED",
      error: {
        code: classified.code,
        message: classified.message,
        retryable: false,
        attempt: attempts,
        maxRetries,
      },
    };
  }
}

/**
 * A guarded write matched 0 rows: this claim's lease was reclaimed. The
 * outcome is discarded (never reported COMPLETED) and a warn names the stale
 * token and the tokens spent on the discarded work.
 */
async function recordLeaseLost(
  taskId: string,
  staleLeaseOwner: string,
  path: "pre-invoke" | "completion" | "retry" | "failure",
  tokensUsed: number | null,
  attempt: number,
  maxRetries: number,
): Promise<ExecutionResult> {
  await logAgentEvent(
    taskId,
    "warn",
    `Lease lost before the ${path} write; outcome discarded`,
    { staleLeaseOwner, tokensUsed, path },
  );
  return {
    taskId,
    status: "LEASE_LOST",
    error: {
      code: "LEASE_LOST",
      message: `Lease ${staleLeaseOwner} was reclaimed before the ${path} write`,
      retryable: false,
      attempt,
      maxRetries,
    },
  };
}

/**
 * Execute a batch of independent tasks in parallel.
 */
export async function executeBatch(
  tasks: AgentTask[],
  context: WorkflowContext,
): Promise<ExecutionResult[]> {
  const results = await Promise.allSettled(
    tasks.map((task) => executeTask(task, context)),
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      taskId: tasks[i].id,
      status: "FAILED" as const,
      error: {
        code: "UNKNOWN",
        message: result.reason?.message ?? "Unknown execution error",
        retryable: false,
        attempt: tasks[i].attempts + 1,
        maxRetries: tasks[i].maxRetries,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `run` with a deadline. When it fires, the AbortController's signal is
 * aborted (cancelling the in-flight provider request) and the promise rejects.
 */
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(message);
      controller.abort(error);
      reject(error);
    }, ms);
    let promise: Promise<T>;
    try {
      promise = run(controller.signal);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
