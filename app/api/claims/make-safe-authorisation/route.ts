/**
 * POST /api/claims/make-safe-authorisation
 *
 * IICRC S500 §3.1 gate: records authorisation to proceed with make-safe work
 * before restoration begins. Creates the default MakeSafeAction checklist if
 * none exists.
 *
 * Body: { inspectionId: string, authorisedByName?: string, notes?: string }
 *
 * Standard make-safe actions (S500 §3.1):
 *   power_isolated | gas_isolated | mould_containment | water_stopped | occupant_briefing
 *
 * P1-CLAIM4 — RA-1129
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { inspectionId?: string; authorisedByName?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { inspectionId } = body;
  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
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

  // Create default action rows if they don't yet exist
  await Promise.all(
    DEFAULT_ACTIONS.map((action) =>
      prisma.makeSafeAction.upsert({
        where: { inspectionId_action: { inspectionId, action } },
        create: { inspectionId, action, applicable: true, notes: body.notes },
        update: {},
      }),
    ),
  );

  const actions = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    inspectionId,
    authorisedAt: new Date().toISOString(),
    authorisedBy: body.authorisedByName ?? session.user.name ?? session.user.id,
    standard: "IICRC S500 §3.1",
    actions,
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const inspectionId = searchParams.get("inspectionId");
  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId query param required" }, { status: 400 });
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

  const actions = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    orderBy: { createdAt: "asc" },
  });

  const completedCount = actions.filter((a) => a.completed).length;
  const applicableCount = actions.filter((a) => a.applicable).length;

  return NextResponse.json({
    inspectionId,
    actions,
    summary: {
      total: actions.length,
      applicable: applicableCount,
      completed: completedCount,
      allComplete: applicableCount > 0 && completedCount === applicableCount,
    },
  });
}
