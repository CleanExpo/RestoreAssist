/**
 * Wave 5 — live ops metrics backing program status + stall map.
 */

import type { PrismaClient } from "@prisma/client";
import { listCompletenessInboxForOwner } from "@/lib/completeness/org-inbox";
import { summarizeInboxStalls } from "@/lib/completeness/inbox-stall-summary";

export async function loadOperationalMetrics(
  prisma: PrismaClient,
  args: { userId: string; organizationId?: string | null },
) {
  const inboxRows = await listCompletenessInboxForOwner(prisma, args, {
    limit: 100,
  });
  const stallSummary = summarizeInboxStalls(inboxRows);

  const failedSyncs = await prisma.integrationSyncLog.count({
    where: {
      status: "FAILED",
      integration: { userId: args.userId },
      startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  const deadLetterWebhooks = await prisma.webhookEvent.count({
    where: {
      status: "FAILED",
      retryCount: { gte: 5 },
      integration: { userId: args.userId },
    },
  });

  return {
    stallSummary,
    integrationFailures: {
      failedSyncsLast7d: failedSyncs,
      webhookDeadLetter: deadLetterWebhooks,
    },
  };
}