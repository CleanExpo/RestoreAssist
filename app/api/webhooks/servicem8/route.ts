import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhooks/servicem8
 * Receive webhook events from ServiceM8.
 *
 * ServiceM8 sends webhooks for:
 * - GeoActivity (job status changes, location updates)
 * - Job (Created, Updated, Completed, Cancelled)
 * - Client (Created, Updated)
 * - JobContact (Created, Updated)
 *
 * Signature: HMAC-SHA256 of raw body, key = SERVICEM8_WEBHOOK_SECRET
 * Header: x-servicem8-signature
 *
 * Documentation: https://developer.servicem8.com/docs/webhooks
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("x-servicem8-signature");

    if (!signature) {
      console.error("[ServiceM8 Webhook] Missing signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const rawBody = await request.text();

    const webhookSecret = process.env.SERVICEM8_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "[ServiceM8 Webhook] SERVICEM8_WEBHOOK_SECRET not configured",
      );
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.error("[ServiceM8 Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // ServiceM8 sends a single event per request
    const { entry: entries = [], service = "" } = payload;

    if (!entries.length) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(
      `[ServiceM8 Webhook] Received ${entries.length} entries for service: ${service}`,
    );

    // Map ServiceM8 service to standard event type
    function mapEventType(
      svc: string,
      entry: Record<string, unknown>,
    ): string | null {
      const active = entry.active === 1 || entry.active === "1";
      switch (svc) {
        case "GeoActivity":
          return "job.status_updated";
        case "Job":
          return active ? "job.updated" : "job.cancelled";
        case "Client":
          return "customer.updated";
        case "JobContact":
          return "contact.updated";
        default:
          return null;
      }
    }

    // Find active ServiceM8 integration — use first CONNECTED one
    // (ServiceM8 webhooks are per-account, not per-company-file like MYOB)
    const integration = await prisma.integration.findFirst({
      where: { provider: "SERVICEM8", status: "CONNECTED" },
    });

    if (!integration) {
      console.warn("[ServiceM8 Webhook] No active SERVICEM8 integration found");
      // Return 200 — prevent ServiceM8 retrying
      return NextResponse.json({ success: true, processed: 0 });
    }

    const queuedEvents: string[] = [];

    for (const entry of entries as Record<string, unknown>[]) {
      try {
        const entryUuid = entry.uuid as string | undefined;
        const standardEventType = mapEventType(service, entry);

        if (!standardEventType || !entryUuid) continue;

        // Deduplicate — same UUID in last hour
        const existing = await prisma.webhookEvent.findFirst({
          where: {
            provider: "SERVICEM8",
            integrationId: integration.id,
            payload: { path: ["uuid"], equals: entryUuid },
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        });

        if (existing) {
          console.log(
            `[ServiceM8 Webhook] Duplicate event for ${entryUuid} — skipping`,
          );
          continue;
        }

        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            provider: "SERVICEM8",
            integrationId: integration.id,
            eventType: standardEventType,
            payload: entry as Record<string, string | number | boolean | null>,
            signature,
            status: "PENDING",
          },
        });

        queuedEvents.push(webhookEvent.id);
        console.log(
          `[ServiceM8 Webhook] Queued ${webhookEvent.id}: ${standardEventType} for ${entryUuid}`,
        );
      } catch (err) {
        console.error("[ServiceM8 Webhook] Failed to queue entry:", err);
      }
    }

    return NextResponse.json({
      success: true,
      processed: queuedEvents.length,
      eventIds: queuedEvents,
    });
  } catch (error) {
    console.error("[ServiceM8 Webhook] Error:", error);
    // Always 200 — prevents ServiceM8 from flooding retries
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 200 },
    );
  }
}
