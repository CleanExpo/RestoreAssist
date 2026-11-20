import { prisma } from "@/lib/prisma";
import { logAgentEvent } from "@/lib/agents";
import { unskipUpstreamFailed } from "@/lib/agents/lease";
import type { CronJobResult } from "./runner";

const BATCH_SIZE = 20;
const MIN_AGE_MS = 30 * 60 * 1000; // 30 minutes
const RETRYABLE_ERROR_CODES = ["TIMEOUT", "RATE_LIMIT", "AI_PROVIDER_ERROR"];
const MAX_DEAD_LETTER_RETRIES = 2;
// RA-8429: only these workflow states can take a re-queued task. The filter
// sits in the query, not in the loop, so a task the review will never act on
// (e.g. in a CANCELLED workflow) cannot hold a place in the oldest-first batch
// and starve every other dead-lettered task.
const RECOVERABLE_WORKFLOW_STATUSES = [
  "RUNNING",
  "PARTIALLY_FAILED",
  "FAILED",
] as const;

/**
 * Reviews DEAD_LETTER tasks and re-queues those with transient/retryable errors.
 * Only re-queues tasks that have been in DEAD_LETTER for at least 30 minutes.
 *
 * @returns Result with count of tasks reviewed and count re-queued
 */
export async function reviewDeadLetterTasks(): Promise<CronJobResult> {
  const ageThreshold = new Date(Date.now() - MIN_AGE_MS);

  const deadLetterTasks = await prisma.agentTask.findMany({
    where: {
      status: "DEAD_LETTER",
      errorCode: { in: RETRYABLE_ERROR_CODES },
      updatedAt: { lt: ageThreshold },
      attempts: { lt: MAX_DEAD_LETTER_RETRIES + 3 }, // original maxRetries + dead letter retries
      workflow: { status: { in: [...RECOVERABLE_WORKFLOW_STATUSES] } },
    },
    include: {
      workflow: { select: { status: true } },
    },
    take: BATCH_SIZE,
    orderBy: { updatedAt: "asc" },
  });

  let requeued = 0;

  for (const task of deadLetterTasks) {
    // The query already selects recoverable workflows only; this re-check
    // stays as a guard against a status change between read and write.
    if (
      (RECOVERABLE_WORKFLOW_STATUSES as readonly string[]).includes(
        task.workflow.status,
      )
    ) {
      // RA-7999: re-queue, un-skip the cascade's dependents and reopen the
      // workflow in one transaction, so a resumed workflow cannot complete
      // with steps missing.
      const moved = await prisma.$transaction(async (tx) => {
        const result = await tx.agentTask.updateMany({
          where: { id: task.id, status: "DEAD_LETTER" },
          data: {
            status: "READY",
            errorMessage: null,
            errorCode: null,
          },
        });
        if (result.count === 0) return false;

        await unskipUpstreamFailed(tx, task.workflowId);

        // Ensure workflow is RUNNING
        if (task.workflow.status !== "RUNNING") {
          await tx.agentWorkflow.update({
            where: { id: task.workflowId },
            data: {
              status: "RUNNING",
              completedAt: null,
              errorMessage: null,
            },
          });
        }
        return true;
      });
      if (!moved) continue;

      await logAgentEvent(
        task.id,
        "info",
        "Task re-queued from dead letter by cron review",
      );
      requeued++;
    }
  }

  return {
    itemsProcessed: deadLetterTasks.length,
    metadata: { reviewed: deadLetterTasks.length, requeued },
  };
}
