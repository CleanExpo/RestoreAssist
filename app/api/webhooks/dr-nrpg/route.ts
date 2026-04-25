/**
 * POST /api/webhooks/dr-nrpg
 *
 * Inbound webhook handler for DR-NRPG job dispatch events.
 * DR-NRPG sends events when jobs are dispatched to a RestoreAssist technician.
 *
 * SECURITY: All requests are verified via HMAC-SHA256 signature.
 *   Header: X-DRNRPG-Signature: sha256=<hex-digest>
 *   Signed over: raw request body using webhookSecret from DrNrpgIntegration.
 *
 * EXPECTED PAYLOAD (DR-NRPG API contract — confirm with DR-NRPG team):
 * {
 *   event: "job.dispatched" | "job.updated" | "job.completed" | "job.cancelled"
 *   jobId: string              // DR-NRPG internal job ID (stable UUID)
 *   claimNumber: string        // Insurer claim number
 *   insurer?: string           // Insurer name (e.g. "Suncorp", "IAG")
 *   policyHolder?: string      // Policyholder name
 *   propertyAddress?: string   // Full property address
 *   lossType?: string          // "water" | "fire" | "mould" | "storm" | "biohazard"
 *   status?: string            // Current job status in DR-NRPG
 *   timestamp: string          // ISO 8601 event timestamp
 *   metadata?: Record<string, unknown>
 * }
 *
 * RESPONSE: Always 200 immediately. Processing is synchronous but fast.
 *   Returns: { received: true, eventType: string, jobSyncId: string }
 *
 * All events are logged to DrNrpgWebhookLog for audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { recordWebhookFailure } from "@/lib/webhook-audit";
import { safeDecrypt } from "@/lib/credential-vault";

// ============================================================
// HMAC-SHA256 signature verification
// ============================================================

function verifySignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  try {
    // Expected format: "sha256=<hex-digest>"
    const [prefix, digest] = signature.split("=");
    if (prefix !== "sha256" || !digest) return false;

    const expected = createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(digest, "hex");

    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

// ============================================================
// Event payload types
// ============================================================

type DrNrpgEventType =
  | "job.dispatched"
  | "job.updated"
  | "job.completed"
  | "job.cancelled";

interface DrNrpgWebhookPayload {
  event: DrNrpgEventType;
  jobId: string;
  claimNumber: string;
  insurer?: string;
  policyHolder?: string;
  propertyAddress?: string;
  lossType?: string;
  status?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Map DR-NRPG event type → DrNrpgJobSync status
function mapEventToStatus(
  event: DrNrpgEventType,
  payload: DrNrpgWebhookPayload,
): string {
  switch (event) {
    case "job.dispatched":
      return "dispatched";
    case "job.updated":
      return payload.status ?? "in_progress";
    case "job.completed":
      return "completed";
    case "job.cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

// ============================================================
// Route handler
// ============================================================

// POST handler — Next.js 15 App Router (no auth — verified by HMAC)
export async function POST(request: NextRequest) {
  // Read raw body for HMAC verification (must happen before any parsing)
  const rawBody = await request.text();
  const signature = request.headers.get("x-drnrpg-signature") ?? "";
  const eventTimestamp = request.headers.get("x-drnrpg-timestamp") ?? "";

  // ── Find the active integration by looking for any active DrNrpgIntegration ──
  // DR-NRPG sends to a single endpoint per RestoreAssist instance.
  // We resolve which user/integration this belongs to via the signature check.
  const integrations = await (prisma as any).drNrpgIntegration.findMany({
    where: { isActive: true },
  });

  if (integrations.length === 0) {
    // No active integration — return 200 to prevent DR-NRPG retry storms
    console.warn(
      "[dr-nrpg webhook] No active DrNrpgIntegration found — ignoring event",
    );
    return NextResponse.json(
      { received: true, note: "No active integration" },
      { status: 200 },
    );
  }

  // Try each integration's webhookSecret until we find the matching one
  // safeDecrypt handles legacy plaintext rows written before RA-1221
  const matchedIntegration = integrations.find((i: any) =>
    verifySignature(rawBody, signature, safeDecrypt(i.webhookSecret)),
  );

  if (!matchedIntegration) {
    console.error(
      "[dr-nrpg webhook] Signature verification failed — rejecting",
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Parse payload ──
  let payload: DrNrpgWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[dr-nrpg webhook] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, jobId, claimNumber } = payload;

  if (!event || !jobId || !claimNumber) {
    console.error("[dr-nrpg webhook] Missing required fields:", {
      event,
      jobId,
      claimNumber,
    });
    return NextResponse.json(
      { error: "event, jobId, and claimNumber are required" },
      { status: 400 },
    );
  }

  const newStatus = mapEventToStatus(event as DrNrpgEventType, payload);

  // ── Upsert DrNrpgJobSync ──
  let jobSync: { id: string };
  try {
    jobSync = await (prisma as any).drNrpgJobSync.upsert({
      where: { drNrpgJobId: jobId },
      create: {
        integrationId: matchedIntegration.id,
        drNrpgJobId: jobId,
        claimNumber,
        insurer: payload.insurer ?? null,
        policyHolder: payload.policyHolder ?? null,
        propertyAddress: payload.propertyAddress ?? null,
        lossType: payload.lossType ?? null,
        status: newStatus,
        lastEventAt: new Date(payload.timestamp),
        lastEventType: event,
      },
      update: {
        // Merge in any new fields that arrived (address, insurer can update)
        insurer: payload.insurer ?? undefined,
        policyHolder: payload.policyHolder ?? undefined,
        propertyAddress: payload.propertyAddress ?? undefined,
        lossType: payload.lossType ?? undefined,
        status: newStatus,
        lastEventAt: new Date(payload.timestamp),
        lastEventType: event,
        updatedAt: new Date(),
      },
      select: { id: true },
    });
  } catch (upsertErr) {
    console.error("[dr-nrpg webhook] DrNrpgJobSync upsert failed:", upsertErr);
    await recordWebhookFailure({
      provider: "dr-nrpg",
      externalEventId: jobId,
      stage: "jobsync-upsert",
      error: upsertErr,
      request,
      details: { event, claimNumber },
    });

    // Log the failure and return 500 so DR-NRPG retries
    return NextResponse.json({ error: "Failed to sync job" }, { status: 500 });
  }

  // ── Log to DrNrpgWebhookLog ──
  await (prisma as any).drNrpgWebhookLog
    .create({
      data: {
        jobSyncId: jobSync.id,
        direction: "inbound",
        eventType: event,
        payload: payload as unknown as Record<string, unknown>,
        responseStatus: 200,
        responseBody: "received",
        deliveredAt: new Date(),
      },
    })
    .catch((e: any) => console.warn("[dr-nrpg webhook] Log write failed:", e));

  // ── Auto-create Inspection for new dispatched jobs ──
  // Only for job.dispatched and only if an inspection doesn't already exist
  if (event === "job.dispatched" && payload.propertyAddress) {
    const existingSync = await (prisma as any).drNrpgJobSync.findUnique({
      where: { id: jobSync.id },
      select: { inspectionId: true },
    });

    if (!existingSync?.inspectionId) {
      try {
        // Find the user for this integration to create the inspection under
        const integration = await (prisma as any).drNrpgIntegration.findUnique({
          where: { id: matchedIntegration.id },
          select: { userId: true },
        });

        if (integration?.userId) {
          // Extract postcode from address (AU 4-digit postcode at end of string)
          const postcodeMatch =
            payload.propertyAddress?.match(/\b(\d{4})\b\s*$/);
          const propertyPostcode = postcodeMatch?.[1] ?? "0000"; // fallback — must be updated manually

          // Generate NIR inspection number: NIR-YYYY-MM-{random 4 hex chars}{jobId suffix 4 chars}
          const now = new Date(payload.timestamp);
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const rand = randomBytes(2).toString("hex").toUpperCase(); // 4 hex chars
          const suffix = jobId
            .replace(/[^A-Z0-9]/gi, "")
            .slice(-4)
            .toUpperCase()
            .padStart(4, "0");
          const inspectionNumber = `NIR-${year}-${month}-${rand}${suffix}`;

          const inspection = await prisma.inspection.create({
            data: {
              userId: integration.userId,
              inspectionNumber,
              propertyAddress: payload.propertyAddress,
              propertyPostcode,
              inspectionDate: new Date(payload.timestamp),
              status: "DRAFT",
              // claimNumber, insurer, policyHolder live on DrNrpgJobSync — not duplicated here
            },
            select: { id: true },
          });

          // Link inspection to job sync
          await (prisma as any).drNrpgJobSync.update({
            where: { id: jobSync.id },
            data: { inspectionId: inspection.id },
          });
        }
      } catch (inspectionErr) {
        // Non-fatal — job sync succeeded, inspection auto-creation is best-effort
        console.warn(
          "[dr-nrpg webhook] Auto-inspection creation failed (non-fatal):",
          inspectionErr instanceof Error
            ? inspectionErr.message
            : inspectionErr,
        );
      }
    }
  }

  // ── Update integration lastSyncAt ──
  await (prisma as any).drNrpgIntegration
    .update({
      where: { id: matchedIntegration.id },
      data: { lastSyncAt: new Date() },
    })
    .catch(() => null);

  return NextResponse.json({
    received: true,
    eventType: event,
    jobSyncId: jobSync.id,
    status: newStatus,
  });
}

// DR-NRPG may send GET to verify the endpoint during setup
export async function GET() {
  return NextResponse.json({
    endpoint: "DR-NRPG webhook receiver",
    version: "1.0",
    events: ["job.dispatched", "job.updated", "job.completed", "job.cancelled"],
    signatureHeader: "X-DRNRPG-Signature",
    signatureFormat: "sha256=<hex-digest>",
  });
}
