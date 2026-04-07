/**
 * POST /api/webhooks/heygen
 *
 * Receives HeyGen webhook callbacks when video rendering completes.
 * Backup mechanism — the poll-heygen cron is the primary completion detector.
 *
 * HeyGen webhook payload (v2):
 *   {
 *     event_type: "avatar_video.success" | "avatar_video.fail",
 *     event_data: {
 *       video_id: string,
 *       url?: string,       // present on success
 *       error?: string,     // present on failure
 *       duration?: number,
 *     }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Optional: verify webhook signature if HEYGEN_WEBHOOK_SECRET is set
    const secret = process.env.HEYGEN_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get("x-heygen-signature") || "";
      const body = await request.text();
      const expected = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      if (signature !== expected) {
        console.warn("[heygen-webhook] Invalid signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }

      // Re-parse the body since we consumed it
      return handleWebhook(JSON.parse(body));
    }

    // No signature verification — parse directly
    const payload = await request.json();
    return handleWebhook(payload);
  } catch (err) {
    console.error("[heygen-webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface HeyGenWebhookPayload {
  event_type: string;
  event_data: {
    video_id: string;
    url?: string;
    error?: string;
    duration?: number;
  };
}

async function handleWebhook(payload: HeyGenWebhookPayload) {
  const { event_type, event_data } = payload;

  if (!event_data?.video_id) {
    return NextResponse.json({ error: "Missing video_id" }, { status: 400 });
  }

  // Find the ContentJob by HeyGen render job ID
  const job = await prisma.contentJob.findFirst({
    where: { heygenRenderJobId: event_data.video_id },
    select: { id: true, status: true },
  });

  if (!job) {
    // Webhook for a video we don't track — acknowledge and move on
    console.warn(
      `[heygen-webhook] No ContentJob for video_id ${event_data.video_id}`,
    );
    return NextResponse.json({ received: true, matched: false });
  }

  // Only process if the job is still in VIDEO_RENDERING state
  // (the poll-heygen cron may have already updated it)
  if (job.status !== "VIDEO_RENDERING") {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  if (event_type === "avatar_video.success" && event_data.url) {
    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        videoUrl: event_data.url,
        status: "VIDEO_READY",
      },
    });
    console.log(`[heygen-webhook] Job ${job.id} completed: ${event_data.url}`);
    return NextResponse.json({ received: true, status: "VIDEO_READY" });
  }

  if (event_type === "avatar_video.fail") {
    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: `HeyGen render failed: ${event_data.error || "Unknown"}`,
      },
    });
    console.error(`[heygen-webhook] Job ${job.id} failed: ${event_data.error}`);
    return NextResponse.json({ received: true, status: "FAILED" });
  }

  // Unknown event type — acknowledge
  return NextResponse.json({ received: true, event_type });
}
