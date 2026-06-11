import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCaptureToken } from "@/lib/capture-token";
import { applyRateLimit } from "@/lib/rate-limiter";
import { verifyBotId } from "@/lib/auth/botid";
import { validateCsrf } from "@/lib/csrf";
import { sanitizeString } from "@/lib/sanitize";

/**
 * Homeowner self-capture WRITE surface (spec §2; design §0/D1–D4).
 *
 * Unauthenticated, capability-token-scoped. The token is the credential — there
 * is NO session here. Every defence the design requires runs before any write:
 *   rate-limit (per token) → BotID → CSRF → token verify → size/shape validation
 *   → resolve inspection FROM THE TOKEN ONLY → write to the quarantine sidecar.
 *
 * D4 quarantine: the payload is stored in `ClaimSketch.pendingHomeownerCapture`,
 * NEVER `sketchData`, so it cannot feed compliance/scope/PDF until a technician
 * promotes it (Phase 5).
 */

export const dynamic = "force-dynamic";

const MAX_SKETCH_BYTES = 512 * 1024; // D3
const MAX_MOISTURE_POINTS = 200; // D3
const MAX_MOISTURE_BYTES = 256 * 1024; // D3 — cap weight, not just count (sec M1)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // D3 — rate-limit keyed by token so one token/home-network can't spam.
  // Fail CLOSED on limiter outage (sec M2): this is an unauthenticated write
  // surface — never silently degrade to permissive per-instance limiting.
  const limited = await applyRateLimit(request, {
    prefix: "capture",
    key: token,
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    failClosedOnUpstashError: true,
  });
  if (limited) return limited;

  // Abuse gate on an unauthenticated surface.
  const bot = await verifyBotId();
  if (!bot.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  // Resolve the inspection FROM THE TOKEN BINDING ONLY — never a client id.
  const resolved = await verifyCaptureToken(token);
  if (!resolved) {
    return NextResponse.json(
      { error: "invalid_or_expired_token" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 422 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // D3 — payload size caps.
  const sketchData = b.sketchData ?? null;
  if (sketchData && JSON.stringify(sketchData).length > MAX_SKETCH_BYTES) {
    return NextResponse.json({ error: "sketch_too_large" }, { status: 413 });
  }
  const moisturePoints = Array.isArray(b.moisturePoints)
    ? b.moisturePoints
    : [];
  if (moisturePoints.length > MAX_MOISTURE_POINTS) {
    return NextResponse.json(
      { error: "too_many_moisture_points" },
      { status: 413 },
    );
  }
  // sec M1 — cap moisturePoints by serialized WEIGHT, not just count, so heavy
  // per-element payloads can't slip a multi-MB write past the count check.
  if (JSON.stringify(moisturePoints).length > MAX_MOISTURE_BYTES) {
    return NextResponse.json(
      { error: "moisture_points_too_large" },
      { status: 413 },
    );
  }
  const country = b.country === "NZ" ? "NZ" : "AU";
  const floorNumber = Number.isInteger(b.floorNumber)
    ? (b.floorNumber as number)
    : 0;
  const floorLabel = sanitizeString(b.floorLabel, 80) || "Ground Floor";
  const now = new Date();

  const existing = await prisma.claimSketch.findFirst({
    where: { inspectionId: resolved.inspectionId, floorNumber },
  });

  // Offline-queue staleness guard: drop an older submission that arrives late.
  const clientUpdatedAtRaw = request.headers.get("x-client-updated-at");
  const prevPending = existing?.pendingHomeownerCapture as {
    submittedAt?: string;
  } | null;
  if (prevPending?.submittedAt && clientUpdatedAtRaw) {
    const clientMs = Number.isFinite(Number(clientUpdatedAtRaw))
      ? Number(clientUpdatedAtRaw)
      : Date.parse(clientUpdatedAtRaw);
    const serverMs = Date.parse(prevPending.submittedAt);
    if (Number.isFinite(clientMs) && clientMs < serverMs) {
      return NextResponse.json({ stale: true }, { status: 409 });
    }
  }

  const pending = {
    sketchData: sketchData ?? null,
    moisturePoints,
    country,
    submittedAt: now.toISOString(),
    captureTokenId: resolved.captureTokenId,
  };

  await prisma.$transaction([
    existing
      ? prisma.claimSketch.update({
          where: { id: existing.id },
          data: { pendingHomeownerCapture: pending },
        })
      : prisma.claimSketch.create({
          data: {
            inspectionId: resolved.inspectionId,
            floorNumber,
            floorLabel,
            pendingHomeownerCapture: pending,
          },
        }),
    prisma.captureToken.update({
      where: { id: resolved.captureTokenId },
      data: { submittedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true, status: "submitted_for_review" });
}
