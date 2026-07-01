/**
 * RA-1131: Auto-SWMS Draft API
 *
 * GET /api/inspections/[id]/swms
 *   Returns the auto-generated SWMS draft for an inspection.
 *   Persists to SwmsDraft table for audit trail.
 *
 * Auth: getServerSession required.
 * Response shape: { data: SwmsDraft } | { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSwmsDraft } from "@/lib/swms/auto-generator";
import { apiError, fromException } from "@/lib/api-errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId } = await params;

    // Ownership check — user must own the inspection
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Generate SWMS draft
    const draft = await generateSwmsDraft(inspectionId);

    // Persist / overwrite draft for audit trail
    await prisma.swmsDraft.upsert({
      where: { inspectionId },
      create: {
        inspectionId,
        contentJson: JSON.stringify(draft),
      },
      update: {
        contentJson: JSON.stringify(draft),
      },
    });

    return NextResponse.json({ data: draft });
  } catch (err) {
    return fromException(request, err, { stage: "inspection-swms" });
  }
}
