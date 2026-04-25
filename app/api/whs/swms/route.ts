/**
 * POST /api/whs/swms
 *
 * Auto-generates a Safe Work Method Statement for an inspection and persists it.
 * Every job ≥ 2 days should auto-generate a SWMS before the first technician arrives.
 *
 * Body: { inspectionId: string }
 *
 * P1-WHS1 — RA-1130
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSwmsDraft } from "@/lib/swms/auto-generator";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { inspectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { inspectionId } = body;
  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
  }

  // Verify the caller owns this inspection
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

  const draft = await generateSwmsDraft(inspectionId);

  // Persist (upsert — re-running overwrites the draft before signing)
  const record = await (prisma as any).swmsDraft.upsert({
    where: { inspectionId },
    create: {
      inspectionId,
      contentJson: JSON.stringify(draft),
    },
    update: {
      contentJson: JSON.stringify(draft),
      signedAt: null,
      signedByUserId: null,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: record.id,
    inspectionId,
    draft,
    signedAt: record.signedAt,
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

  const record = await (prisma as any).swmsDraft.findUnique({
    where: { inspectionId },
  });

  if (!record) {
    return NextResponse.json({ error: "No SWMS found for this inspection" }, { status: 404 });
  }

  return NextResponse.json({
    id: record.id,
    inspectionId: record.inspectionId,
    draft: JSON.parse(record.contentJson),
    signedAt: record.signedAt,
    signedByUserId: record.signedByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
