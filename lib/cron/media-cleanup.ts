import { prisma } from "@/lib/prisma";
import { deleteImage } from "@/lib/cloudinary";
import type { CronJobResult } from "./runner";

const MAX_ATTEMPTS = 5;

/** Retry durable PII cleanup tasks; terminal failures remain observable. */
export async function retryMediaCleanupTasks(): Promise<CronJobResult> {
  const ledger = (prisma as any).mediaCleanupTask;
  const tasks = await ledger.findMany({
    where: { status: "PENDING", attemptCount: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  let completed = 0;
  let failed = 0;
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
      await ledger.update({
        where: { id: task.id },
        data: {
          status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          attemptCount: nextAttempts,
          lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      });
      failed++;
    }
  }
  return { itemsProcessed: completed, metadata: { candidates: tasks.length, completed, failed } };
}
