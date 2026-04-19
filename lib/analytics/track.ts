/**
 * RA-1246 — Activation funnel event tracker.
 *
 * Thin wrapper that always writes a row to `ActivationEvent` and
 * optionally mirrors to PostHog via the HTTP capture endpoint when
 * POSTHOG_API_KEY is set. No SDK dependency — plain fetch.
 *
 * Callers are expected to implement first-time-only gating themselves
 * via `hasEmitted(userId, eventName)` before invoking `track()`.
 */

import { prisma } from "@/lib/prisma";

export type ActivationEventName =
  | "signup_completed"
  | "first_report_started"
  | "first_report_saved"
  | "first_interview_completed"
  | "first_integration_connected";

export async function track(
  userId: string,
  eventName: ActivationEventName,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.activationEvent.create({
      data: {
        userId,
        eventName,
        properties: (properties ?? undefined) as any,
      },
    });
  } catch (err) {
    // Fire-and-forget: analytics must never break the user flow.
    console.error("[analytics/track] DB write failed:", err);
  }

  const posthogKey = process.env.POSTHOG_API_KEY;
  if (!posthogKey) return;

  const host = process.env.POSTHOG_HOST || "https://app.posthog.com";
  fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: posthogKey,
      event: eventName,
      distinct_id: userId,
      properties: properties ?? {},
      timestamp: new Date().toISOString(),
    }),
  }).catch((err) => {
    console.error("[analytics/track] PostHog capture failed:", err);
  });
}

/**
 * First-time-only gate. Returns true if the user has NOT yet emitted
 * this event. Caller should call `track()` only when this returns true.
 */
export async function isFirstTime(
  userId: string,
  eventName: ActivationEventName,
): Promise<boolean> {
  try {
    const count = await prisma.activationEvent.count({
      where: { userId, eventName },
    });
    return count === 0;
  } catch (err) {
    console.error("[analytics/track] isFirstTime check failed:", err);
    return false;
  }
}
