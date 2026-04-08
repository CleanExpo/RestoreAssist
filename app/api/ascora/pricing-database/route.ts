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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    console.error("[ascora/pricing-database GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { partNumber, accepted } = body as {
      partNumber: string;
      accepted: boolean;
    };

    if (!partNumber) {
      return NextResponse.json(
        { error: "partNumber is required" },
        { status: 400 },
      );
    }
    if (typeof accepted !== "boolean") {
      return NextResponse.json(
        { error: "accepted must be a boolean" },
        { status: 400 },
      );
    }

    const existing = await (prisma as any).scopePricingDatabase.findUnique({
      where: { partNumber },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "partNumber not found in pricing database" },
        { status: 404 },
      );
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
    console.error("[ascora/pricing-database POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
