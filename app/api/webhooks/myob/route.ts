import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  deriveExternalEventId,
  isUniqueConstraintError,
} from "@/lib/webhook-idempotency";
import { apiError } from "@/lib/api-errors";
import { isWebhookEventFresh } from "@/lib/integrations/webhook-freshness";

/**
 * POST /api/webhooks/myob - Receive webhook events from MYOB
 *
 * MYOB sends webhook notifications for:
 * - Sale.Invoice (Created, Updated, Deleted)
 * - Sale.CustomerPayment (Created, Updated, Deleted)
 * - Contact.Customer (Created, Updated, Deleted)
 *
 * Documentation: https://developer.myob.com/api/accountright/v2/
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from header
    const signature = request.headers.get("x-myob-signature");

    if (!signature) {
      console.error("[MYOB Webhook] Missing signature header");
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Missing signature",
        status: 401,
      });
    }

    // Read raw body for signature verification
    const rawBody = await request.text();

    // Verify webhook signature
    const webhookSecret = process.env.MYOB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[MYOB Webhook] MYOB_WEBHOOK_SECRET not configured");
      return apiError(request, {
        code: "INTERNAL",
        message: "Webhook secret not configured",
        status: 500,
        stage: "myob-webhook:config",
      });
    }

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.error("[MYOB Webhook] Invalid signature");
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Invalid signature",
        status: 401,
      });
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);

    // MYOB sends array of events
    const events = payload.Events || [];

    // Timestamp freshness check — reject stale replays, not genuine provider
    // retries. RA-6973: this was previously 5 minutes, which silently
    // dropped MYOB's OWN retries — MYOB redelivers a failed/slow webhook for
    // up to ~24 hours (same retry window as Xero, see RA-6968's fix on the
    // Xero route), so a transient failure on our end within that window
    // would have its retry rejected here too, permanently losing the event.
    // Widened to 24h; the (provider, externalEventId) unique-index + P2002
    // idempotency guard below still prevents a retry from being
    // double-processed once accepted.
    //
    // RA-6987: the age check above was one-sided — a future-dated timestamp
    // was accepted unbounded. Now shares one shape with Xero/DR-NRPG: reject
    // events older than the 24h horizon AND events more than a small
    // clock-skew allowance in the future (see webhook-freshness.ts).
    const now = Date.now();
    for (const evt of events) {
      if (evt.EventDateTime) {
        const eventTimeMs = new Date(evt.EventDateTime).getTime();
        if (!isWebhookEventFresh(eventTimeMs, now)) {
          console.warn(
            `[MYOB Webhook] Stale event rejected (age: ${Math.round((now - eventTimeMs) / 1000)}s)`,
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

    // Find integration by company file ID
    const firstEvent = events[0];
    const companyFileId = firstEvent.CompanyFileId;

    if (!companyFileId) {
      console.error("[MYOB Webhook] Missing CompanyFileId in event");
      return apiError(request, {
        code: "VALIDATION",
        message: "Missing CompanyFileId",
        status: 400,
      });
    }

    // Find the integration for this company file
    const integration = await prisma.integration.findFirst({
      where: {
        provider: "MYOB",
        companyId: companyFileId,
        status: "CONNECTED",
      },
    });

    if (!integration) {
      console.warn(
        `[MYOB Webhook] No active integration found for company ${companyFileId}`,
      );
      // Return 200 to prevent MYOB from retrying
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Queue webhook events for async processing
    const queuedEvents = [];

    for (const event of events) {
      try {
        // MYOB event structure:
        // EventType: "Created" | "Updated" | "Deleted"
        // ResourceType: "Sale.Invoice" | "Sale.CustomerPayment" | "Contact.Customer"
        const eventType = event.EventType; // Created, Updated, Deleted
        const resourceType = event.ResourceType; // Sale.Invoice, Sale.CustomerPayment, etc.

        // Map MYOB resource types to our standard event types
        let standardEventType = "";

        if (resourceType === "Sale.Invoice") {
          if (eventType === "Created") {
            standardEventType = "invoice.created";
          } else if (eventType === "Updated") {
            standardEventType = "invoice.updated";
          } else if (eventType === "Deleted") {
            standardEventType = "invoice.deleted";
          }
        } else if (resourceType === "Sale.CustomerPayment") {
          if (eventType === "Created") {
            standardEventType = "payment.created";
          } else if (eventType === "Updated") {
            standardEventType = "payment.updated";
          } else if (eventType === "Deleted") {
            standardEventType = "payment.deleted";
          }
        } else if (resourceType === "Contact.Customer") {
          if (eventType === "Created") {
            standardEventType = "customer.created";
          } else if (eventType === "Updated") {
            standardEventType = "customer.updated";
          } else if (eventType === "Deleted") {
            standardEventType = "customer.deleted";
          }
        } else {
          // Skip unsupported resource types
          continue;
        }

        // RA-6974: a payment.created notification carries only the raw MYOB
        // notification stub (CompanyFileId/EventType/ResourceType/ResourceUID)
        // — never the Amount/InvoiceUID needed to resolve a real payment. The
        // downstream processor's guard against fabricating a $0/unresolved
        // payment simply returns without recording, so the generic completion
        // path was marking every one of these events COMPLETED — invisible to
        // FAILED-status monitoring even though nothing was ever reconciled.
        // Mark it SKIPPED with an explanatory errorMessage at ingest instead,
        // since this is permanently unresolvable, not a transient failure.
        const isUnresolvablePaymentStub = standardEventType === "payment.created";

        // RA-1265: atomic idempotency via P2002 on (provider, externalEventId)
        try {
          const webhookEvent = await prisma.webhookEvent.create({
            data: {
              provider: "MYOB",
              integrationId: integration.id,
              eventType: standardEventType,
              payload: event,
              signature,
              externalEventId:
                (event as { ResourceUID?: string }).ResourceUID ||
                deriveExternalEventId(event),
              ...(isUnresolvablePaymentStub
                ? {
                    status: "SKIPPED" as const,
                    processedAt: new Date(),
                    errorMessage:
                      "MYOB payment notification is a CDC stub with no Amount/InvoiceUID - cannot resolve a settled payment from the webhook payload alone",
                  }
                : { status: "PENDING" as const }),
            },
          });
          queuedEvents.push(webhookEvent.id);
        } catch (err) {
          if (isUniqueConstraintError(err)) continue;
          throw err;
        }
      } catch (error) {
        console.error(`[MYOB Webhook] Failed to queue event:`, error);
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
    console.error("[MYOB Webhook] Error processing webhook:", error);

    // Return 200 to prevent MYOB from retrying on our errors
    // Log the error for manual investigation
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 200 },
    );
  }
}
