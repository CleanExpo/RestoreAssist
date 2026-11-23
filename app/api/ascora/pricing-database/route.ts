/**
 * GET /api/ascora/pricing-database
 * Query the AU-native scope pricing database.
 *
 * Query params:
 *   ?q=<search>            — filter by partNumber or description (case-insensitive)
 *   ?claimType=water       — filter to items used for a specific claim type
 *   ?minAcceptance=0.8     — only return items with acceptanceRate >= threshold
 *   ?limit=50              — max results (default 50, max 200)
 *
 * POST /api/ascora/pricing-database/[partNumber]/accept
 * Record an insurer acceptance/rejection for a line item.
 * Increments acceptedCount or rejectedCount and recomputes acceptanceRate.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertMoneyViewer } from "@/lib/auth/redact-money";

/**
 * RA-8602: every row here is a price (average, median, min, max) and the
 * acceptance counts feed pricing, so both handlers are owner-or-manager only.
 * Checked before any query, so a technician learns nothing.
 */
async function refuseNonMoneyViewer(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const gate = await assertMoneyViewer(session);
  if (gate.ok) return null;
  return apiError(request, {
    code: gate.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    message: gate.reason,
    status: gate.status,
  });
}

export async function GET(request: NextRequest) {
  try {
    const refused = await refuseNonMoneyViewer(request);
    if (refused) return refused;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const claimType = searchParams.get("claimType")?.trim();
    const minAcceptance = searchParams.get("minAcceptance")
      ? parseFloat(searchParams.get("minAcceptance")!)
      : undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10),
      200,
    );

    const where: Record<string, unknown> = { isActive: true };

    if (q) {
      where.OR = [
        { partNumber: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    if (claimType) {
      where.claimTypes = { has: claimType };
    }

    if (minAcceptance !== undefined) {
      where.acceptanceRate = { gte: minAcceptance };
    }

    const items = await (prisma as any).scopePricingDatabase.findMany({
      where,
      orderBy: [{ usageCount: "desc" }, { acceptanceRate: "desc" }],
      take: limit,
      select: {
        id: true,
        partNumber: true,
        description: true,
        claimTypes: true,
        usageCount: true,
        averageUnitPriceAU: true,
        medianUnitPriceAU: true,
        minPriceAU: true,
        maxPriceAU: true,
        averageQuantity: true,
        acceptanceRate: true,
        acceptedCount: true,
        rejectedCount: true,
        source: true,
        lastUpdated: true,
      },
    });

    const total = await (prisma as any).scopePricingDatabase.count({ where });

    return NextResponse.json({ items, total, limit });
  } catch (error) {
    return fromException(request, error, { stage: "pricing-list" });
  }
}

/**
 * POST /api/ascora/pricing-database
 * Record insurer acceptance/rejection for a scope line item.
 * Body: { partNumber: string, accepted: boolean }
 *
 * This is the compounding mechanism: every job run through RestoreAssist
 * adds to the acceptance rate dataset. After 500 jobs, RestoreAssist
 * has the only AU-specific insurer acceptance dataset in existence.
 */
export async function POST(request: NextRequest) {
  try {
    const refused = await refuseNonMoneyViewer(request);
    if (refused) return refused;

    const parsed = await request.json().catch(() => null);
    const body = (
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {}
    ) as { partNumber?: unknown; accepted?: unknown };
    const partNumber =
      typeof body.partNumber === "string" ? body.partNumber : undefined;
    const accepted = body.accepted;

    if (!partNumber) {
      return apiError(request, {
        code: "VALIDATION",
        message: "partNumber is required",
        status: 400,
      });
    }
    if (typeof accepted !== "boolean") {
      return apiError(request, {
        code: "VALIDATION",
        message: "accepted must be a boolean",
        status: 400,
      });
    }

    const existing = await (prisma as any).scopePricingDatabase.findUnique({
      where: { partNumber },
    });

    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "partNumber not found in pricing database",
        status: 404,
      });
    }

    const newAccepted = existing.acceptedCount + (accepted ? 1 : 0);
    const newRejected = existing.rejectedCount + (accepted ? 0 : 1);
    const newTotal = newAccepted + newRejected;
    const newRate = newTotal > 0 ? newAccepted / newTotal : null;

    const updated = await (prisma as any).scopePricingDatabase.update({
      where: { partNumber },
      data: {
        acceptedCount: newAccepted,
        rejectedCount: newRejected,
        usageCount: { increment: 1 },
        acceptanceRate: newRate,
      },
      select: {
        partNumber: true,
        acceptedCount: true,
        rejectedCount: true,
        usageCount: true,
        acceptanceRate: true,
      },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    return fromException(request, error, { stage: "pricing-accept" });
  }
}
