import { prisma } from "@/lib/prisma";
import { sendPricingSetupReminderEmail } from "@/lib/email";
import { sendWithRetry } from "@/lib/email-retry";
import { isPricingConfigured } from "@/lib/pricing/effective-pricing";
import type { CronJobResult } from "./runner";

/**
 * Pricing-setup reminder cron — RA-7026.
 *
 * Nudges an organization owner, exactly once, when they've been active long
 * enough to have set pricing but still haven't. Until pricing is configured
 * Margot and every estimator fall back to generic default rates, so quotes
 * don't reflect the contractor's real prices.
 *
 * Design mirrors trial-reminders / winback:
 *  - once-per-owner idempotency via User.pricingReminderSentAt (a timestamp,
 *    not a window — set before the next iteration so a crash can't double-send);
 *  - "configured?" is decided by the SAME org-first resolver Margot, the
 *    estimators and onboarding use (isPricingConfigured), so this can never
 *    disagree with them and nag someone who is actually set up.
 *
 * DARK BY DEFAULT: sends nothing unless PRICING_REMINDER_ENABLED === "true".
 * Deploying the cron is therefore harmless; the operator flips the flag when
 * ready. (RESEND_API_KEY absence also no-ops the send, as with sibling crons.)
 *
 * Runs: /api/cron/pricing-setup-reminders, Vercel daily 19:00 UTC.
 */

/** Owners younger than this are still mid-onboarding — don't nag them yet. */
const GRACE_DAYS = 3;

/** Subscription states that represent an engaged owner worth nudging. */
const ENGAGED_STATUSES = new Set(["TRIAL", "ACTIVE"]);

/**
 * A deliverable, real-person contact address — excludes null, seed/test
 * fixtures, plus-addressed synthetics, and the app's own internal accounts
 * (demo@ / reviewer@restoreassist.app). Pure + exported for unit testing.
 */
export function isRealContactEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if (!e.includes("@")) return false;
  if (e.endsWith("@restoreassist.app")) return false; // internal demo/reviewer
  return !(
    e.includes("test") ||
    e.includes("e2e") ||
    e.includes("example.") ||
    e.includes("+")
  );
}

export async function sendPricingSetupReminders(): Promise<CronJobResult> {
  const enabled = process.env.PRICING_REMINDER_ENABLED === "true";
  if (!enabled) {
    return {
      itemsProcessed: 0,
      metadata: { skipped: "disabled", flag: "PRICING_REMINDER_ENABLED" },
    };
  }

  const now = new Date();
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const setupUrl = `${baseUrl}/dashboard/pricing-config?utm_source=pricing-reminder`;
  const graceCutoff = new Date(
    now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      owner: {
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionStatus: true,
          createdAt: true,
          pricingReminderSentAt: true,
        },
      },
    },
    take: 1000, // CLAUDE.md rule 4
  });

  let sent = 0;
  let failed = 0;
  let skippedConfigured = 0;
  let skippedIneligible = 0;

  for (const org of orgs) {
    const owner = org.owner;
    if (!owner) continue;

    if (
      owner.pricingReminderSentAt !== null ||
      !isRealContactEmail(owner.email) ||
      !ENGAGED_STATUSES.has(String(owner.subscriptionStatus)) ||
      owner.createdAt > graceCutoff
    ) {
      skippedIneligible++;
      continue;
    }

    // Org-first SSOT — identical notion of "configured" as Margot/estimators.
    if (await isPricingConfigured(prisma, owner.id)) {
      skippedConfigured++;
      continue;
    }

    try {
      await sendWithRetry(
        () =>
          sendPricingSetupReminderEmail({
            recipientEmail: owner.email as string,
            recipientName: owner.name ?? "there",
            setupUrl,
          }),
        { stage: "cron-pricing-setup-reminder" },
      );
      // Record BEFORE the next iteration so a crash can't re-send on retry.
      await prisma.user.update({
        where: { id: owner.id },
        data: { pricingReminderSentAt: now },
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(
        `[cron/pricing-setup-reminders] Failed to send to owner ${owner.id}:`,
        err,
      );
    }
  }

  return {
    itemsProcessed: sent,
    metadata: {
      orgs: orgs.length,
      sent,
      failed,
      skippedConfigured,
      skippedIneligible,
    },
  };
}
