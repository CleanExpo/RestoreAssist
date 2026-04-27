/**
 * RA-1558 — standardised webhook failure audit.
 *
 * Every webhook handler that catches a processing error should call
 * `recordWebhookFailure` BEFORE returning its HTTP response. The helper
 * writes a `SecurityEvent` row with `eventType="WEBHOOK_FAILED"` and a
 * structured payload so ops can answer:
 *
 *   - Which provider retried this event how many times?
 *   - What was the failure message?
 *   - Did we silently accept-and-drop, or did status=FAILED land in the
 *     provider-specific table?
 *
 * Note: provider-specific tables (StripeWebhookEvent, WebhookEvent,
 * DrNrpgWebhookLog) still carry their own `status=FAILED` flip — this
 * helper is the cross-provider dead-letter feed, not a replacement.
 * Safe to call without a persisted event id (e.g. signature-verification
 * failure that happens before the event is looked up).
 */

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/observability";

export interface WebhookFailureInput {
  provider: string;
  externalEventId?: string | null;
  stage: string;
  error: unknown;
  request?: Request;
  details?: Record<string, unknown>;
}

function extractContext(req?: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent") || null;
  return { ipAddress, userAgent };
}

/**
 * Record a webhook processing failure. Never throws — audit failures
 * are logged but do not bubble so a SecurityEvent outage cannot cause
 * a webhook retry storm on top of an existing incident.
 */
export async function recordWebhookFailure(
  input: WebhookFailureInput,
): Promise<void> {
  const { ipAddress, userAgent } = extractContext(input.request);
  const errorMessage =
    input.error instanceof Error ? input.error.message : String(input.error);

  const details = {
    provider: input.provider,
    externalEventId: input.externalEventId ?? null,
    stage: input.stage,
    errorMessage,
    ...(input.details ?? {}),
  };

  reportError(input.error, {
    route: `/api/webhooks/${input.provider}`,
    stage: input.stage,
    externalEventId: input.externalEventId ?? undefined,
  });

  try {
    await prisma.securityEvent.create({
      data: {
        eventType: "WEBHOOK_FAILED",
        severity: "WARNING",
        ipAddress,
        userAgent,
        details: JSON.stringify(details),
      },
    });
  } catch (err) {
    console.error("[webhook-audit] persist failed:", err);
  }
}
