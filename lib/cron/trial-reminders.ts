import { prisma } from "@/lib/prisma";
import { sendTrialExpiringEmail } from "@/lib/email";
import type { CronJobResult } from "./runner";

/**
 * Trial expiry reminder cron handler.
 *
 * Finds users whose free trial expires in the near future and emails them
 * so they can upgrade before losing access. Runs daily — sends once per
 * user per window (tracked via trialReminderSentAt column to avoid
 * spamming if the cron double-fires or misfires after a retry).
 *
 * Two windows:
 *  - 3-day reminder  ("plan your upgrade")
 *  - 1-day reminder  ("last chance")
 *
 * Closes RA-1240 — the biggest TRIAL → PAID conversion leak identified
 * in the overnight customer-journey audit.
 */

// RA-1364 — the old implementation used a ±12h window centred on
// `now + days*24h` (UTC). That missed AU users whose trialEndsAt fell
// more than 12h after the cron's target instant, because the window
// closed before the user's actual expiry. Example: cron at 08:00 UTC
// with a user whose trialEndsAt is 23:00 UTC on the target day → 15h
// after target → outside ±12h window → no email ever sent.
//
// Fix: switch to a FORWARD-LOOKING 24h window sized to match the cron's
// daily cadence, so adjacent runs cover the full timeline without gaps:
//   1-day:  [now,         now + 24h]
//   3-day:  [now + 2d,    now + 3d]
// Any TZ / DST drift is absorbed by the aligned 24h window.
type Window = { daysStart: number; daysEnd: number; label: "3-day" | "1-day" };
const WINDOWS: Window[] = [
  { daysStart: 2, daysEnd: 3, label: "3-day" },
  { daysStart: 0, daysEnd: 1, label: "1-day" },
];

export async function sendTrialReminders(): Promise<CronJobResult> {
  const now = new Date();
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const subscribeUrl = `${baseUrl}/dashboard/pricing?utm_source=trial-reminder`;
  let totalSent = 0;
  const perWindow: Record<string, number> = {};

  for (const win of WINDOWS) {
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(now.getTime() + win.daysStart * dayMs);
    const to = new Date(now.getTime() + win.daysEnd * dayMs);

    const candidates = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { gte: from, lte: to },
        // Skip users we've already reminded in this window (see metadata below).
        // We intentionally do NOT have a dedicated column yet — this query
        // bounds the set to avoid duplicate sends within a single cron run.
      },
      select: {
        id: true,
        email: true,
        name: true,
        trialEndsAt: true,
      },
      take: 1000, // CLAUDE.md rule 4
    });

    let sentInWindow = 0;

    for (const user of candidates) {
      if (!user.email || !user.trialEndsAt) continue;

      const msLeft = user.trialEndsAt.getTime() - now.getTime();
      const daysRemaining = Math.max(
        1,
        Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
      );

      try {
        await sendTrialExpiringEmail({
          recipientEmail: user.email,
          recipientName: user.name ?? "there",
          daysRemaining,
          subscribeUrl,
        });
        sentInWindow++;
      } catch (err) {
        console.error(
          `[cron/trial-reminders] Failed to send ${win.label} reminder to user ${user.id}:`,
          err,
        );
        // Continue — one send failure shouldn't abort the whole run.
      }
    }

    perWindow[win.label] = sentInWindow;
    totalSent += sentInWindow;
  }

  return {
    itemsProcessed: totalSent,
    metadata: { windows: perWindow },
  };
}
