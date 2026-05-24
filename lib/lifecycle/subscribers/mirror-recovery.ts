/**
 * Punch-list P1 #11.2 — mirror-recovery subscriber (2 of 5 lifecycle hooks).
 *
 * Detects `StorageMirrorJob` rows that have exhausted their retry budget
 * (`status = FAILED` AND `attempts >= MAX_ATTEMPTS`), promotes them to
 * `status = DEAD_LETTER`, and writes one `Notification` per admin user of
 * the owning Organization. Surfaces the failure to a human who can react —
 * reconnect Drive, fix credentials, or shelve the queue.
 *
 * Idempotency: the sweep's selection filter excludes `DEAD_LETTER` rows
 * (only `FAILED` matches). Once promoted, a row is never re-selected, so
 * a second cron pass on the same data is a structural no-op. No AuditLog
 * row is written because `AuditLog.inspectionId` is required and most
 * mirror jobs (kind=PHOTO|REPORT|INVOICE) have no inspectionId; the status
 * column itself is the durable record.
 *
 * Out of scope: actually retrying failed mirrors. This subscriber DETECTS
 * dead-letters and NOTIFIES admins; retry strategy is a separate PR.
 *
 * Fire-and-forget per CLAUDE.md rule #13 — the cron route awaits and
 * surfaces stats, but neither this function nor the route blocks
 * user-facing requests.
 */

import { prisma } from "@/lib/prisma";

export const MIRROR_MAX_ATTEMPTS = 5;

const BATCH_SIZE = 100;

export type SweepResult = {
  deadLettered: number;
  notified: number;
};

export async function sweepDeadLetters(): Promise<SweepResult> {
  const jobs = await prisma.storageMirrorJob.findMany({
    where: {
      status: "FAILED",
      attempts: { gte: MIRROR_MAX_ATTEMPTS },
    },
    select: {
      id: true,
      orgId: true,
      kind: true,
      filename: true,
      attempts: true,
      lastError: true,
    },
    take: BATCH_SIZE,
  });

  if (jobs.length === 0) {
    return { deadLettered: 0, notified: 0 };
  }

  let deadLettered = 0;
  let notified = 0;

  for (const job of jobs) {
    // Resolve admins for the org — owner + members with role=ADMIN.
    // De-dupe by userId (owner may also appear in members).
    const org = await prisma.organization.findUnique({
      where: { id: job.orgId },
      select: {
        ownerId: true,
        members: {
          select: { id: true, role: true },
          where: { role: "ADMIN" },
          take: 50,
        },
      },
    });

    // Flip status regardless of org lookup — we never want to re-select
    // this row. If the org is gone, the notification step is skipped but
    // the audit-by-status guard still holds.
    await prisma.storageMirrorJob.update({
      where: { id: job.id },
      data: { status: "DEAD_LETTER" },
    });
    deadLettered += 1;

    if (!org) {
      console.warn("[mirror-recovery] org not found for dead-lettered job", {
        jobId: job.id,
        orgId: job.orgId,
      });
      continue;
    }

    const recipientIds = new Set<string>([
      org.ownerId,
      ...org.members.map((m) => m.id),
    ]);

    if (recipientIds.size === 0) {
      continue;
    }

    const title = `Drive mirror dead-lettered: ${job.filename}`;
    const message =
      `Mirror job for ${job.kind} (${job.filename}) failed ${job.attempts} times ` +
      `and has been moved to dead-letter. Last error: ` +
      `${(job.lastError ?? "unknown").slice(0, 200)}. Review at Settings → Storage.`;

    const created = await prisma.notification.createMany({
      data: Array.from(recipientIds).map((userId) => ({
        userId,
        type: "ERROR" as const,
        title,
        message,
        link: "/dashboard/settings/storage",
      })),
    });
    notified += created.count ?? recipientIds.size;
  }

  return { deadLettered, notified };
}
