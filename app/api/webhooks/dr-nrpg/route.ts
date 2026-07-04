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
import { mapPayloadToInspection } from "@/lib/dr-nrpg/inbound-mapper";
import { apiError } from "@/lib/api-errors";
import { decrypt } from "@/lib/credential-vault";
import { isEncryptedToken } from "@/lib/auth/account-tokens";

const MAX_ACTIVE_DRNRPG_INTEGRATIONS = 100;

// Replay-freshness window. The HMAC signature covers the raw body, which
// includes `timestamp`, so a captured request cannot have its timestamp
// forged forward. Reject events whose signed timestamp is older than this
// tolerance to defeat replay of an old captured request. Mirrors Stripe's
// signature-tolerance pattern.
const DRNRPG_REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

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

  // ── Find the active integration by looking for any active DrNrpgIntegration ──
  // DR-NRPG sends to a single endpoint per RestoreAssist instance.
  // We resolve which user/integration this belongs to via the signature check.
  const integrations = await (prisma as any).drNrpgIntegration.findMany({
    where: { isActive: true },
    select: { id: true, webhookSecret: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ACTIVE_DRNRPG_INTEGRATIONS,
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

  // Try each integration's webhookSecret until we find the matching one.
  // Secrets are encrypted at rest (AES-256-GCM credential vault); decrypt
  // before HMAC verification. Legacy plaintext rows (pre-backfill) aren't in
  // cipher shape, so verify against them unchanged until the backfill runs.
  const matchedIntegration = integrations.find((i: any) => {
    const secret = isEncryptedToken(i.webhookSecret)
      ? decrypt(i.webhookSecret)
      : i.webhookSecret;
    return verifySignature(rawBody, signature, secret);
  });

  if (!matchedIntegration) {
    console.error(
      "[dr-nrpg webhook] Signature verification failed — rejecting",
    );
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Invalid signature",
      status: 401,
    });
  }

  // ── Parse payload ──
  let payload: DrNrpgWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[dr-nrpg webhook] Invalid JSON body");
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  const { event, jobId, claimNumber } = payload;

  if (!event || !jobId || !claimNumber) {
    console.error("[dr-nrpg webhook] Missing required fields:", {
      event,
      jobId,
      claimNumber,
    });
    return apiError(request, {
      code: "VALIDATION",
      message: "event, jobId, and claimNumber are required",
      status: 400,
    });
  }

  // ── Replay-freshness check ──
  // `timestamp` is inside the HMAC-signed body, so it is tamper-evident.
  // Reject stale (replayed) events outside the tolerance window.
  const eventTimeMs = Date.parse(payload.timestamp);
  if (Number.isNaN(eventTimeMs)) {
    console.error("[dr-nrpg webhook] Missing or invalid timestamp");
    return apiError(request, {
      code: "VALIDATION",
      message: "Valid timestamp is required",
      status: 400,
    });
  }
  if (Math.abs(Date.now() - eventTimeMs) > DRNRPG_REPLAY_TOLERANCE_MS) {
    console.error("[dr-nrpg webhook] Stale event rejected (replay window):", {
      jobId,
      timestamp: payload.timestamp,
    });
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Event timestamp outside allowed window",
      status: 401,
    });
  }

  // ── Idempotency / replay marker ──
  // The (integrationId, drNrpgJobId) row records the last processed event's
  // timestamp in `lastEventAt`. DR-NRPG retries redeliver an identical signed
  // body — same timestamp — so an event whose timestamp is strictly older
  // than the last one we recorded is a stale, out-of-order redelivery.
  // Reject it as an idempotent no-op. An event at the SAME instant is only a
  // replay if it is also the SAME event type — two distinct events (e.g.
  // job.updated then job.completed) can legitimately land in the same
  // second and must not be dropped. `lastEventType` is the tiebreaker;
  // legacy rows that predate it (no lastEventType stored) fall back to the
  // old equal-timestamp-is-a-replay behaviour. Combined with the
  // tenant-scoped compound upsert below, this makes redelivery safe rather
  // than a double-apply. `lastEventAt` is the durable marker — no extra table.
  const existingJob = await (prisma as any).drNrpgJobSync.findUnique({
    where: {
      integrationId_drNrpgJobId: {
        integrationId: matchedIntegration.id,
        drNrpgJobId: jobId,
      },
    },
    select: { id: true, lastEventAt: true, lastEventType: true },
  });

  const lastEventAtMs = existingJob?.lastEventAt
    ? new Date(existingJob.lastEventAt).getTime()
    : null;
  const isStaleReplay =
    lastEventAtMs !== null &&
    (eventTimeMs < lastEventAtMs ||
      (eventTimeMs === lastEventAtMs &&
        (!existingJob!.lastEventType || existingJob!.lastEventType === event)));

  if (isStaleReplay) {
    console.warn(
      "[dr-nrpg webhook] Duplicate/stale event ignored (idempotency):",
      { jobId, timestamp: payload.timestamp },
    );

    // RA-6974: write the audit trail for the deduped delivery too — a
    // replay previously returned before this write, leaving no record that
    // DR-NRPG ever redelivered the event.
    await (prisma as any).drNrpgWebhookLog
      .create({
        data: {
          jobSyncId: existingJob!.id,
          direction: "inbound",
          eventType: event,
          payload: payload as unknown as Record<string, unknown>,
          responseStatus: 200,
          responseBody: "duplicate_ignored",
          deliveredAt: new Date(),
        },
      })
      .catch((e: any) =>
        console.warn("[dr-nrpg webhook] Dedup log write failed:", e),
      );

    return NextResponse.json({
      received: true,
      eventType: event,
      jobSyncId: existingJob!.id,
      status: "duplicate_ignored",
      deduplicated: true,
    });
  }

  const newStatus = mapEventToStatus(event as DrNrpgEventType, payload);

  // ── Upsert DrNrpgJobSync (tenant-scoped compound key) ──
  let jobSync: { id: string };
  try {
    jobSync = await (prisma as any).drNrpgJobSync.upsert({
      where: {
        integrationId_drNrpgJobId: {
          integrationId: matchedIntegration.id,
          drNrpgJobId: jobId,
        },
      },
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
          const mapped = mapPayloadToInspection({
            payload,
            randomHex: randomBytes(2).toString("hex"),
          });

          if (mapped) {
            if (mapped.needsPostcodeReview) {
              // Address had no extractable AU postcode — propertyPostcode fell
              // back to the sentinel "0000", which detectJurisdiction reads as
              // NSW. Flag for operator correction; do NOT guess the postcode.
              console.warn(
                "[dr-nrpg webhook] Inspection created with sentinel postcode (needs review):",
                {
                  jobId,
                  inspectionNumber: mapped.inspectionNumber,
                  propertyAddress: mapped.propertyAddress,
                },
              );
            }
            const inspection = await prisma.inspection.create({
              data: {
                userId: integration.userId,
                inspectionNumber: mapped.inspectionNumber,
                propertyAddress: mapped.propertyAddress,
                propertyPostcode: mapped.propertyPostcode,
                inspectionDate: mapped.inspectionDate,
                status: mapped.status,
                // source + claimType land via `as any` because the Prisma
                // client types lag the schema until the next generate runs
                // in CI. Migration 20260514110000 adds both columns.
                ...({
                  source: mapped.source,
                  claimType: mapped.claimType ?? undefined,
                } as any),
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
