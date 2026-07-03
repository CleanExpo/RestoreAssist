import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  deriveExternalEventId,
  isUniqueConstraintError,
} from "@/lib/webhook-idempotency";
import { recordWebhookFailure } from "@/lib/webhook-audit";
import { apiError } from "@/lib/api-errors";

/**
 * RA-6968 — resolve which CONNECTED SERVICEM8 integration a webhook event
 * belongs to.
 *
 * ServiceM8 does not include an account/tenant id on webhook entries — every
 * object it sends (Job, Client, JobContact, GeoActivity) is scoped to
 * whichever account owns it, with no separate "this is account X" field.
 * A Job entry's `company_uuid` references its linked customer (a "Client"
 * record); a Client entry's own `uuid` IS that customer record. Both are
 * ServiceM8-generated ids that are globally unique and — because a customer
 * can only ever have been synced from the ServiceM8 account it lives in —
 * matching one against our previously-synced ExternalClient rows tells us
 * exactly which RestoreAssist user's ServiceM8 connection this event came
 * from, without ServiceM8 needing to send an explicit account id.
 *
 * Resolution order:
 *   1. Match a candidate company_uuid against ExternalClient rows scoped to
 *      CONNECTED SERVICEM8 integrations. Exactly one distinct integration
 *      match wins.
 *   2. If there's no match (e.g. the very first event for a brand-new
 *      customer, or an entry type with no company_uuid) AND exactly one
 *      SERVICEM8 integration is CONNECTED, use it — there is no other
 *      integration this could possibly be misattributed to.
 *   3. Anything else (zero connected integrations, or an ambiguous /
 *      multi-integration match) is unresolvable — reject rather than guess.
 */
async function resolveServiceM8Integration(
  service: string,
  entries: Record<string, unknown>[],
): Promise<{ id: string } | null> {
  const candidateCompanyUuids = new Set<string>();
  for (const entry of entries) {
    if (service === "Client") {
      const uuid = entry.uuid as string | undefined;
      if (uuid) candidateCompanyUuids.add(uuid);
    } else {
      const companyUuid = entry.company_uuid as string | undefined;
      if (companyUuid) candidateCompanyUuids.add(companyUuid);
    }
  }

  if (candidateCompanyUuids.size > 0) {
    const matches = await prisma.externalClient.findMany({
      where: {
        externalId: { in: Array.from(candidateCompanyUuids) },
        integration: { provider: "SERVICEM8", status: "CONNECTED" },
      },
      select: { integrationId: true },
      distinct: ["integrationId"],
      take: 2, // only need to know whether the match is unique
    });

    if (matches.length === 1) {
      return { id: matches[0].integrationId };
    }
    if (matches.length > 1) {
      // Ambiguous — the same company_uuid resolved to more than one
      // integration. Should not happen (ServiceM8 ids are globally
      // unique), but never guess.
      return null;
    }
    // matches.length === 0 falls through to the single-integration fallback.
  }

  const connected = await prisma.integration.findMany({
    where: { provider: "SERVICEM8", status: "CONNECTED" },
    select: { id: true },
    take: 2,
  });

  return connected.length === 1 ? { id: connected[0].id } : null;
}

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
      // Missing signature;
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Missing signature",
        status: 401,
      });
    }

    const rawBody = await request.text();

    const webhookSecret = process.env.SERVICEM8_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // SERVICEM8_WEBHOOK_SECRET env var not set;
      return apiError(request, {
        code: "INTERNAL",
        message: "Webhook secret not configured",
        status: 500,
        stage: "servicem8-webhook:config",
      });
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.error("[ServiceM8 Webhook] Invalid signature");
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Invalid signature",
        status: 401,
      });
    }

    const payload = JSON.parse(rawBody);

    // ServiceM8 sends a single event per request
    const { entry: entries = [], service = "" } = payload;

    if (!entries.length) {
      return NextResponse.json({ success: true, processed: 0 });
    }

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

    // RA-6968: resolve the CONNECTED integration this event actually belongs
    // to, instead of grabbing an arbitrary "first CONNECTED" row (previously
    // cross-tenant misattribution — event data for user A could land on
    // user B's integration once a second ServiceM8 connection existed).
    // ServiceM8 does not stamp its own account id on webhook entries, so we
    // resolve via the entry's own company_uuid (a Job's linked customer, or
    // a Client entry's own uuid — both are globally unique ServiceM8 ids)
    // against ExternalClient rows we've already synced per integration. If
    // there's no unambiguous match, fall back to the sole CONNECTED
    // integration when exactly one exists (nothing else it could be); any
    // other outcome is rejected rather than guessed.
    const integration = await resolveServiceM8Integration(service, entries);

    if (!integration) {
      console.warn(
        "[ServiceM8 Webhook] Could not resolve a unique CONNECTED integration for this event",
      );
      return apiError(request, {
        code: "VALIDATION",
        message: "Unable to resolve integration for event",
        status: 400,
      });
    }

    const queuedEvents: string[] = [];

    for (const entry of entries as Record<string, unknown>[]) {
      try {
        const entryUuid = entry.uuid as string | undefined;
        const standardEventType = mapEventType(service, entry);

        if (!standardEventType || !entryUuid) continue;

        // RA-1265: atomic idempotency via P2002 on (provider, externalEventId)
        try {
          const webhookEvent = await prisma.webhookEvent.create({
            data: {
              provider: "SERVICEM8",
              integrationId: integration.id,
              eventType: standardEventType,
              payload: entry as Record<
                string,
                string | number | boolean | null
              >,
              signature,
              externalEventId: entryUuid || deriveExternalEventId(entry),
              status: "PENDING",
            },
          });
          queuedEvents.push(webhookEvent.id);
        } catch (err) {
          if (isUniqueConstraintError(err)) continue;
          throw err;
        }
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
    await recordWebhookFailure({
      provider: "servicem8",
      stage: "top-level",
      error,
      request,
    });
    // Always 200 — prevents ServiceM8 from flooding retries
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 200 },
    );
  }
}
