import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyXeroWebhookSignature } from "@/lib/integrations/xero/webhook-processor";
import {
  deriveExternalEventId,
  isUniqueConstraintError,
} from "@/lib/webhook-idempotency";
import { recordWebhookFailure } from "@/lib/webhook-audit";
import { apiError } from "@/lib/api-errors";
import { isWebhookEventFresh } from "@/lib/integrations/webhook-freshness";

/**
 * POST /api/webhooks/xero - Receive webhook events from Xero
 *
 * Xero sends webhook notifications for:
 * - INVOICES (invoice.created, invoice.updated, invoice.paid)
 * - PAYMENTS (payment.created, payment.updated)
 * - CONTACTS (contact.created, contact.updated)
 *
 * Documentation: https://developer.xero.com/documentation/guides/webhooks/overview/
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from header
    const signature = request.headers.get("x-xero-signature");

    if (!signature) {
      // Missing signature;
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Missing signature",
        status: 401,
      });
    }

    // Read raw body for signature verification
    const rawBody = await request.text();

    // Verify webhook signature
    const webhookKey = process.env.XERO_WEBHOOK_KEY;
    if (!webhookKey) {
      // XERO_WEBHOOK_KEY env var not set;
      return apiError(request, {
        code: "INTERNAL",
        message: "Webhook key not configured",
        status: 500,
        stage: "xero-webhook:config",
      });
    }

    // RA-871: Timing-safe HMAC-SHA256 verification via shared helper
    if (!verifyXeroWebhookSignature(rawBody, signature, webhookKey)) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Invalid signature",
        status: 401,
      });
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);

    // Xero sends array of events
    const events = payload.events || [];

    // Timestamp freshness check — reject stale replays, not genuine provider
    // retries. RA-6968: this was previously 5 minutes, which silently
    // dropped Xero's OWN retries — Xero redelivers a failed/slow webhook for
    // up to ~24 hours (RA-1269's top-level-error comment below references
    // the same retry window), so a transient failure on our end within that
    // window would have its retry rejected here too, permanently losing the
    // event. Widened to 24h; the (provider, externalEventId) unique-index +
    // P2002 idempotency guard below still prevents a retry from being
    // double-processed once accepted.
    //
    // RA-6987: the age check above was one-sided — a future-dated timestamp
    // was accepted unbounded. Now shares one shape with MYOB/DR-NRPG: reject
    // events older than the 24h horizon AND events more than a small
    // clock-skew allowance in the future (see webhook-freshness.ts).
    const now = Date.now();
    for (const evt of events) {
      if (evt.eventDateUtc) {
        const eventTimeMs = new Date(evt.eventDateUtc).getTime();
        if (!isWebhookEventFresh(eventTimeMs, now)) {
          console.warn(
            `[Xero Webhook] Stale event rejected (age: ${Math.round((now - eventTimeMs) / 1000)}s)`,
          );
          return apiError(request, {
            code: "VALIDATION",
            message: "Webhook event outside freshness window",
            status: 400,
          });
        }
      }
    }

    if (events.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Find integration by tenantId (Xero's organization ID)
    const firstEvent = events[0];
    const tenantId = firstEvent.tenantId;

    if (!tenantId) {
      console.error("[Xero Webhook] Missing tenantId in event");
      return apiError(request, {
        code: "VALIDATION",
        message: "Missing tenantId",
        status: 400,
      });
    }

    // Find the integration for this tenant
    const integration = await prisma.integration.findFirst({
      where: {
        provider: "XERO",
        tenantId: tenantId,
        status: "CONNECTED",
      },
    });

    if (!integration) {
      console.warn(
        `[Xero Webhook] No active integration found for tenant ${tenantId}`,
      );
      // Return 200 to prevent Xero from retrying
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Queue webhook events for async processing
    const queuedEvents = [];

    for (const event of events) {
      try {
        // Map Xero event types to our standard event types
        let eventType = event.eventType;
        const resourceType = event.resourceType; // INVOICE, CONTACT, PAYMENT

        // Normalize event types
        if (resourceType === "INVOICE") {
          if (eventType === "CREATE") {
            eventType = "invoice.created";
          } else if (eventType === "UPDATE") {
            eventType = "invoice.updated";
          } else if (eventType === "DELETE") {
            eventType = "invoice.deleted";
          }
        } else if (resourceType === "PAYMENT") {
          if (eventType === "CREATE") {
            eventType = "payment.created";
          } else if (eventType === "UPDATE") {
            eventType = "payment.updated";
          }
        } else if (resourceType === "CONTACT") {
          if (eventType === "CREATE") {
            eventType = "contact.created";
          } else if (eventType === "UPDATE") {
            eventType = "contact.updated";
          }
        }

        // RA-1265: atomic idempotency via (provider, externalEventId) unique
        // index + P2002. Previous findFirst-then-create was racy and lost
        // idempotency after a 1-hour window.
        try {
          const webhookEvent = await prisma.webhookEvent.create({
            data: {
              provider: "XERO",
              integrationId: integration.id,
              eventType,
              payload: event,
              signature,
              externalEventId: deriveExternalEventId(event),
              status: "PENDING",
            },
          });
          queuedEvents.push(webhookEvent.id);
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            // Duplicate — already processed/queued. Skip silently.
            continue;
          }
          console.error(`[Xero Webhook] Failed to queue event:`, err);
          // Continue processing other events
        }
      } catch (error) {
        console.error(`[Xero Webhook] Failed to queue event:`, error);
        // Continue processing other events
      }
    }

    // Return 200 OK immediately (async processing will happen later)
    return NextResponse.json({
      success: true,
      processed: queuedEvents.length,
      eventIds: queuedEvents,
    });
  } catch (error) {
    // RA-1269: return 500 so Xero retries. The previous 200-on-error
    // silently dropped invoice/payment events during transient DB
    // outages, desyncing invoice state with no way to recover. Xero
    // retries up to ~5× over 24h — that window recovers most blips.
    // Only return 200 once we've persisted the event to the queue
    // (which the normal path does above).
    console.error("[Xero Webhook] Error processing webhook:", error);
    await recordWebhookFailure({
      provider: "xero",
      stage: "top-level",
      error,
      request,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
