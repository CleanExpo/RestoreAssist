/**
 * Count-only read of Synthex-attributed trial signups (SPM audit G7).
 *
 * Synthex, the internal marketing agency, reports these numbers to Mission
 * Control as its `outcome.trials` event. Output is counts only: no email, no
 * user id, no attribution detail leaves this module.
 *
 * Attribution comes from the first-touch `ra_ft` cookie stored on the
 * `signup_completed` ActivationEvent (lib/analytics/attribution.ts). A signup
 * counts as Synthex when its first touch carried `utm_source=synthex`, or a
 * Synthex Studio campaign tag (`utm_campaign=studio-<client>`). Studio tags
 * the source with the social platform, so source alone misses its posts.
 */

import { prisma } from "@/lib/prisma";
import { parseFirstTouch } from "@/lib/analytics/attribution";

export const SYNTHEX_ATTRIBUTION_KEY =
  "utm_source=synthex OR utm_campaign=studio-*";

export const TRIAL_COUNT_WINDOWS = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type TrialCountWindow = keyof typeof TRIAL_COUNT_WINDOWS;

/** Upper bound on signup events read per call (rule 4). Reported if reached. */
const MAX_EVENTS = 5000;

const INTERNAL_DOMAINS = new Set([
  "restoreassist.app",
  "restoreassist.com.au",
  "unite-group.in",
  "carsi.com.au",
  "example.com",
  "example.org",
  "example.net",
]);
const RESERVED_TLDS = [".test", ".example", ".invalid", ".local", ".localhost"];
const TEST_LOCAL_PART =
  /(^|[._+-])(test|tester|e2e|qa|smoke|demo|probe|review|reviewer)([._+-]|\d|$)/i;

/**
 * Staff, demo and automated-test accounts must not inflate a campaign's
 * result. Unknown or malformed addresses are excluded too: a count that
 * cannot be attributed to a real firm is not evidence.
 */
export function isInternalOrTestEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const at = email.lastIndexOf("@");
  if (at <= 0) return true;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return true;
  if (INTERNAL_DOMAINS.has(domain)) return true;
  if ([...INTERNAL_DOMAINS].some((d) => domain.endsWith(`.${d}`))) return true;
  if (RESERVED_TLDS.some((tld) => domain.endsWith(tld))) return true;
  return TEST_LOCAL_PART.test(local);
}

export function isSynthexAttributed(properties: unknown): boolean {
  if (!properties || typeof properties !== "object") return false;
  const raw = (properties as Record<string, unknown>).attribution;
  if (!raw || typeof raw !== "object") return false;
  // Re-sanitise: properties is JSON written from a browser cookie.
  const touch = parseFirstTouch(encodeURIComponent(JSON.stringify(raw)));
  if (!touch) return false;
  if (touch.source?.toLowerCase() === "synthex") return true;
  return touch.campaign?.toLowerCase().startsWith("studio-") ?? false;
}

export type SynthexTrialCounts = {
  source: "synthex";
  attributionKey: string;
  window: TrialCountWindow;
  from: string;
  to: string;
  signups: number;
  first_report_saved: number;
  active_paid: number;
  excluded_internal: number;
  truncated: boolean;
};

export async function countSynthexTrials(
  window: TrialCountWindow,
  now: Date = new Date(),
): Promise<SynthexTrialCounts> {
  const from = new Date(
    now.getTime() - TRIAL_COUNT_WINDOWS[window] * 24 * 60 * 60 * 1000,
  );

  const events = await prisma.activationEvent.findMany({
    where: { eventName: "signup_completed", createdAt: { gte: from, lte: now } },
    select: {
      userId: true,
      properties: true,
      user: { select: { email: true, subscriptionStatus: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_EVENTS,
  });

  const attributed = new Map<string, string | null>();
  const seen = new Set<string>();
  let excludedInternal = 0;
  for (const event of events) {
    if (!isSynthexAttributed(event.properties)) continue;
    if (seen.has(event.userId)) continue;
    seen.add(event.userId);
    if (isInternalOrTestEmail(event.user?.email)) {
      excludedInternal++;
      continue;
    }
    attributed.set(event.userId, event.user?.subscriptionStatus ?? null);
  }

  const userIds = [...attributed.keys()];
  const activated =
    userIds.length === 0
      ? []
      : await prisma.activationEvent.findMany({
          where: { eventName: "first_report_saved", userId: { in: userIds } },
          select: { userId: true },
          distinct: ["userId"],
          take: userIds.length,
        });

  return {
    source: "synthex",
    attributionKey: SYNTHEX_ATTRIBUTION_KEY,
    window,
    from: from.toISOString(),
    to: now.toISOString(),
    signups: userIds.length,
    first_report_saved: activated.length,
    active_paid: [...attributed.values()].filter((s) => s === "ACTIVE").length,
    excluded_internal: excludedInternal,
    truncated: events.length === MAX_EVENTS,
  };
}
