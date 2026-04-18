import { prisma } from "@/lib/prisma";
import { sendWinbackEmail } from "@/lib/email";
import type { CronJobResult } from "./runner";

/**
 * Win-back email cron handler — closes RA-1242.
 *
 * Finds users whose subscription ended ~30 days ago and sends them a single
 * win-back email. Runs daily; the ±12h window guarantees each user is
 * processed at most once per lifetime of their cancellation (same pattern as
 * trial-reminders — no dedicated tracking column needed).
 *
 * Signal: subscriptionStatus = EXPIRED + subscriptionEndsAt within the
 * target day ±12h. The EXPIRED state is set by the Stripe
 * `customer.subscription.deleted` webhook at period-end.
 *
 * Runs: /api/cron/winback, Vercel daily 09:00 AEST.
 */

const DAYS_SINCE_EXPIRED = 30;
const WINDOW_HOURS = 24;

export async function sendWinback(): Promise<CronJobResult> {
  const now = new Date();
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const resubscribeUrl = `${baseUrl}/dashboard/pricing?utm_source=winback&utm_campaign=d30`;

  // Target: expired exactly DAYS_SINCE_EXPIRED days ago, ±12h window
  const target = new Date(
    now.getTime() - DAYS_SINCE_EXPIRED * 24 * 60 * 60 * 1000,
  );
  const from = new Date(target.getTime() - (WINDOW_HOURS / 2) * 60 * 60 * 1000);
  const to = new Date(target.getTime() + (WINDOW_HOURS / 2) * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      subscriptionStatus: "EXPIRED",
      subscriptionEndsAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionEndsAt: true,
    },
    take: 1000, // CLAUDE.md rule 4
  });

  let sent = 0;
  let failed = 0;
  for (const user of candidates) {
    if (!user.email || !user.subscriptionEndsAt) continue;

    const msSinceExpired = now.getTime() - user.subscriptionEndsAt.getTime();
    const daysSinceExpired = Math.max(
      1,
      Math.round(msSinceExpired / (24 * 60 * 60 * 1000)),
    );

    try {
      await sendWinbackEmail({
        recipientEmail: user.email,
        recipientName: user.name ?? "there",
        resubscribeUrl,
        daysSinceExpired,
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(`[cron/winback] Failed to send to user ${user.id}:`, err);
    }
  }

  return {
    itemsProcessed: sent,
    metadata: {
      candidates: candidates.length,
      sent,
      failed,
      targetDate: target.toISOString(),
    },
  };
}
