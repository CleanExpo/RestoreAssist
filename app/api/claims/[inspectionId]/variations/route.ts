/**
 * POST /api/claims/[inspectionId]/variations
 *
 * Creates a scope variation record for a claim (ICA Code of Practice §5 +
 * Insurance Contracts Act 1984). Auto-approves variations under 10% delta.
 *
 * Body:
 * {
 *   reason: string
 *   authorisationSource: AuthorisationSource
 *   authorisationRef?: string
 *   costDeltaCents: number          // positive = increase, negative = reduction
 *   costDeltaPercent?: number
 *   notes?: string
 * }
 *
 * GET /api/claims/[inspectionId]/variations — lists all variations for a claim.
 *
 * P1-CLAIM6 — RA-1129
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AUTO_APPROVE_THRESHOLD_PERCENT = 10;

function deriveAutoDecision(costDeltaPercent: number | undefined): {
  autoDecision: string;
  autoDecisionReason: string;
} | null {
  if (costDeltaPercent === undefined) return null;
  const abs = Math.abs(costDeltaPercent);
  if (abs <= AUTO_APPROVE_THRESHOLD_PERCENT) {
    return {
      autoDecision: "auto-approved",
      autoDecisionReason: `DELTA_UNDER_${AUTO_APPROVE_THRESHOLD_PERCENT}_PERCENT`,
    };
  }
  if (abs <= 20) {
    return { autoDecision: "needs-adjuster", autoDecisionReason: "DELTA_10_TO_20_PERCENT" };
  }
  return { autoDecision: "needs-insurer", autoDecisionReason: "DELTA_OVER_20_PERCENT" };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { inspectionId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = params;

  let body: {
    reason?: string;
    authorisationSource?: string;
    authorisationRef?: string;
    costDeltaCents?: number;
    costDeltaPercent?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reason, authorisationSource, costDeltaCents } = body;
  if (!reason || !authorisationSource || costDeltaCents === undefined) {
    return NextResponse.json(
      { error: "reason, authorisationSource, and costDeltaCents are required" },
      { status: 400 },
    );
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { userId: true },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const autoResult = deriveAutoDecision(body.costDeltaPercent);
  const status = autoResult?.autoDecision === "auto-approved" ? "AUTO_APPROVED" : "PENDING";

  const variation = await prisma.scopeVariation.create({
    data: {
      inspectionId,
      reason,
      authorisationSource: authorisationSource as any,
      authorisationRef: body.authorisationRef,
      costDeltaCents,
      costDeltaPercent: body.costDeltaPercent,
      approvedByUserId: session.user.id,
      status,
      autoApprovalRule: autoResult?.autoDecisionReason,
      autoDecision: autoResult?.autoDecision,
      autoDecisionReason: autoResult?.autoDecisionReason,
      autoDecisionAt: autoResult ? new Date() : undefined,
      notes: body.notes,
    },
  });

  return NextResponse.json(variation, { status: 201 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { inspectionId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { userId: true },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const variations = await prisma.scopeVariation.findMany({
    where: { inspectionId },
    orderBy: { createdAt: "desc" },
  });

  const totalDeltaCents = variations.reduce((sum, v) => sum + v.costDeltaCents, 0);

  return NextResponse.json({
    inspectionId,
    variations,
    summary: {
      count: variations.length,
      totalDeltaCents,
      pendingCount: variations.filter((v) => v.status === "PENDING").length,
    },
  });
}
