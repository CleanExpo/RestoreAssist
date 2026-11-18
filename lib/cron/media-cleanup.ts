import { prisma } from "@/lib/prisma";
import { deleteImage } from "@/lib/cloudinary";
import type { CronJobResult } from "./runner";

const MAX_ATTEMPTS = 5;

/**
 * Retry durable PII cleanup tasks. A task that fails its fifth attempt goes
 * to FAILED and is never selected again, so it is returned as a terminal
 * failure: runCronJob records the count and raises an error report (RA-8452).
 */
export async function retryMediaCleanupTasks(): Promise<CronJobResult> {
  const ledger = (prisma as any).mediaCleanupTask;
  const tasks = await ledger.findMany({
    where: { status: "PENDING", attemptCount: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  let completed = 0;
  let failed = 0;
  let terminalFailures = 0;
  for (const task of tasks) {
    try {
      await deleteImage(task.publicId);
      await ledger.update({
        where: { id: task.id },
        data: { status: "COMPLETE", attemptCount: { increment: 1 }, lastError: null },
      });
      completed++;
    } catch (error) {
      const nextAttempts = task.attemptCount + 1;
      const terminal = nextAttempts >= MAX_ATTEMPTS;
      await ledger.update({
        where: { id: task.id },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          attemptCount: nextAttempts,
          lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      });
      failed++;
      if (terminal) terminalFailures++;
    }
  }
  return {
    itemsProcessed: completed,
    terminalFailures,
    metadata: { candidates: tasks.length, completed, failed },
  };
}
