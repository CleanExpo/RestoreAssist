import { createHash } from "crypto";

/**
 * Shared helper for third-party webhook idempotency.
 *
 * Derives a stable external event ID from a webhook payload by hashing
 * the JSON representation. Provider retries send byte-identical payloads
 * so the hash collides deterministically — Prisma's P2002 on
 * `(provider, externalEventId)` unique index rejects the second write
 * atomically.
 *
 * Prefer a provider-native ID (Stripe event.id, Xero eventId) when
 * available — this hash fallback is for when the payload has no
 * obvious event-scoped identifier.
 *
 * RA-1265.
 */
export function deriveExternalEventId(event: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex")
    .slice(0, 32);
}

/**
 * True if the error is a Prisma unique-constraint violation (P2002).
 * Used to swallow duplicate-webhook inserts cleanly.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
