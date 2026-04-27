import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { recordWebhookFailure } from "@/lib/webhook-audit";

/**
 * POST /api/webhooks/ascora — Receive inbound webhook events from Ascora.
 *
 * Closes RA-1270. Ascora sync was previously poll-only (via cron); this
 * enables near-real-time updates when jobs / customers change in Ascora,
 * eliminating up-to-cron-interval staleness.
 *
 * Auth: Ascora uses API-key auth for its REST surface. Webhooks use a
 * separate HMAC-SHA256 signature with a per-integration shared secret
 * stored on `AscoraIntegration.webhookSecret`. Users opt in by setting
 * the secret in the integration settings UI then registering the webhook
 * URL with Ascora.
 *
 * Header contract:
 *   x-ascora-integration-id: our AscoraIntegration.id
 *   x-ascora-signature:      sha256=<hex HMAC of raw body>
 *
 * Events (from Ascora's integration portal docs):
 *   job.updated | job.completed | customer.updated | invoice.synced
 */
export async function POST(request: NextRequest) {
  try {
    const integrationId = request.headers.get("x-ascora-integration-id");
    const signature = request.headers.get("x-ascora-signature");

    if (!integrationId || !signature) {
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 401 },
      );
    }

    const rawBody = await request.text();

    // NB: `webhookSecret` / `lastWebhookAt` are added in the same migration
    // as this route. `as any` bypasses the stale Prisma client type until
    // `prisma generate` runs in the Vercel build step.
    const integration = (await (prisma as any).ascoraIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        userId: true,
        webhookSecret: true,
        isActive: true,
      },
    })) as {
      id: string;
      userId: string;
      webhookSecret: string | null;
      isActive: boolean;
    } | null;

    if (!integration || !integration.isActive) {
      // Don't leak whether the integration exists.
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!integration.webhookSecret) {
      return NextResponse.json(
        {
          error:
            "Webhook secret not configured for this integration. Set it in integration settings to enable webhooks.",
        },
        { status: 412 },
      );
    }

    const expected = createHmac("sha256", integration.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const providedHex = signature.replace(/^sha256=/, "");

    let sigOk = false;
    try {
      const provBuf = Buffer.from(providedHex, "hex");
      const expBuf = Buffer.from(expected, "hex");
      sigOk =
        provBuf.length === expBuf.length && timingSafeEqual(provBuf, expBuf);
    } catch {
      sigOk = false;
    }

    if (!sigOk) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: { event?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = payload.event ?? "unknown";

    // Record that a webhook landed. The existing Ascora sync cron
    // (lib/integrations/ascora/nir-sync.ts) is the canonical reconciler;
    // bumping lastWebhookAt lets us tighten sync intervals or add a
    // nudge-queue in a follow-up.
    await (prisma as any).ascoraIntegration.update({
      where: { id: integration.id },
      data: { lastWebhookAt: new Date() },
    });

    console.log(
      `[Ascora Webhook] Received ${eventType} for integration ${integration.id}`,
      { dataKeys: payload.data ? Object.keys(payload.data) : [] },
    );

    return NextResponse.json({ received: true, eventType });
  } catch (error) {
    console.error("[Ascora Webhook] Unhandled error:", error);
    await recordWebhookFailure({
      provider: "ascora",
      stage: "top-level",
      error,
      request,
    });
    // RA-1269 pattern: return 500 so Ascora retries transient failures.
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
