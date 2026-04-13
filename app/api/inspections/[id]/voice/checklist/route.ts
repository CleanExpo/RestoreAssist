/**
 * RA-396: GET /api/inspections/[id]/voice/checklist
 * Returns the S500:2025 completion checklist for an inspection.
 *
 * Response: { inspectionId, items, completedCount, totalCount, criticalMissing, readyToLeave }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompletion } from "@/lib/voice/completion-checker";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    if (inspection.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = await checkCompletion(id);
    const completedCount = items.filter((i) => i.complete).length;
    const criticalMissing = items.filter(
      (i) => !i.complete && i.priority === 1,
    );
    const readyToLeave = criticalMissing.length === 0;

    return NextResponse.json({
      inspectionId: id,
      items,
      completedCount,
      totalCount: items.length,
      criticalMissing,
      readyToLeave,
    });
  } catch (error) {
    console.error("[GET /api/inspections/[id]/voice/checklist] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
