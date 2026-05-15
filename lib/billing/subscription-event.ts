/**
 * SP-3 T2 — Idempotent SubscriptionEvent writer.
 *
 * Used by Stripe webhook handlers (T7 + T8) to record subscription lifecycle
 * events while deduping replays. Stripe retries webhooks on network failure
 * and lets operators manually replay events; without an idempotency key the
 * same activation could fire `recordSubscriptionEvent` multiple times. Dedupe
 * is performed by `stripeEventId @unique`.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type SubscriptionEventType =
  | "SUBSCRIPTION_ACTIVATED"
  | "SUBSCRIPTION_REACTIVATED"
  | "TIER_CHANGED"
  | "CANCELED"
  | "PAYMENT_FAILED"
  | "TRIAL_EXPIRED";

export type RecordSubscriptionEventInput = {
  userId: string;
  eventType: SubscriptionEventType;
  stripeEventId: string | null;
  payload: Prisma.InputJsonValue | null;
};

export type RecordSubscriptionEventResult =
  | { kind: "recorded"; id: string }
  | { kind: "deduped"; existingId: string };

/**
 * Idempotent write to SubscriptionEvent. Dedupes by stripeEventId @unique.
 * Returns `deduped` if a row with the given stripeEventId already exists.
 *
 * Callers that pass `stripeEventId: null` (e.g. internal trial-expired sweeps
 * with no Stripe event) always get `recorded`; idempotency must be enforced
 * upstream in that case.
 */
export async function recordSubscriptionEvent(
  input: RecordSubscriptionEventInput,
): Promise<RecordSubscriptionEventResult> {
  if (input.stripeEventId) {
    const existing = await prisma.subscriptionEvent.findUnique({
      where: { stripeEventId: input.stripeEventId },
      select: { id: true },
    });
    if (existing) {
      return { kind: "deduped", existingId: existing.id };
    }
  }
  const created = await prisma.subscriptionEvent.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      stripeEventId: input.stripeEventId,
      payload: input.payload ?? undefined,
    },
    select: { id: true },
  });
  return { kind: "recorded", id: created.id };
}
