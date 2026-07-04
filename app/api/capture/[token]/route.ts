import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCaptureToken } from "@/lib/capture-token";
import { applyRateLimit } from "@/lib/rate-limiter";
import { fromException } from "@/lib/api-errors";

/**
 * Homeowner self-capture READ scope (design §"Scope of access").
 *
 * A valid capture token may read ONLY its bound inspection's display address +
 * floor sketches — nothing cross-tenant, no staff/billing data. Used by the
 * /capture/[token] page to orient the homeowner.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const limited = await applyRateLimit(request, {
      prefix: "capture-read",
      key: token,
      windowMs: 10 * 60 * 1000,
      maxRequests: 60,
      failClosedOnUpstashError: true, // sec M2 — unauthenticated surface
    });
    if (limited) return limited;

    const resolved = await verifyCaptureToken(token);
    if (!resolved) {
      return NextResponse.json(
        { error: "invalid_or_expired_token" },
        { status: 404 },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id: resolved.inspectionId },
      select: { propertyAddress: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // ra-query-ok: floors scoped to one token-resolved inspection (one
    // ClaimSketch per floor), capped at 50 floors to bound the payload on this
    // unauthenticated surface — matching the authenticated sibling
    // (app/api/inspections/[id]/sketches/route.ts take: 50).
    const floors = await prisma.claimSketch.findMany({
      where: { inspectionId: resolved.inspectionId },
      select: {
        floorNumber: true,
        floorLabel: true,
        sketchData: true,
        pendingHomeownerCapture: true,
      },
      orderBy: { floorNumber: "asc" },
      take: 50,
    });

    return NextResponse.json({
      propertyAddress: inspection.propertyAddress,
      floors,
    });
  } catch (err) {
    return fromException(request, err, { stage: "capture:get" });
  }
}
