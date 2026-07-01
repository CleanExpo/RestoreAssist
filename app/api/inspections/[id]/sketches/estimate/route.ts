/**
 * GET /api/inspections/[id]/sketches/estimate — RA2-053 (RA-123)
 *
 * Computes structured estimate data from all sketch floors for an inspection:
 *   - Room area line items (from Fabric.js polygon objects)
 *   - Damage zone areas → material quantity derivations
 *   - Equipment schedule (from MoistureMappingCanvas equipment points)
 *   - IICRC S500 equipment recommendations when no manual placement exists
 *
 * Returns { estimate: SketchEstimate }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { measuredSketchData } from "@/lib/sketch/measured-sketch-data";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Verify inspection ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(_req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const sketches = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      orderBy: { floorNumber: "asc" },
      select: {
        floorLabel: true,
        sketchType: true,
        sketchData: true,
        equipmentPoints: true,
        moisturePoints: true,
      },
      take: 50,
    });

    // Only process structural sketches for the estimate
    const floors = sketches
      .filter((s: any) => s.sketchType === "structural" || !s.sketchType)
      .map((s: any) => ({
        floorLabel: s.floorLabel,
        // RA-6761: strip underlay_reference (AI/imported) geometry before the
        // extractor parses it, so unconfirmed geometry never inflates billed
        // quantities. Untagged/technician geometry is measured and kept.
        sketchData: measuredSketchData(
          s.sketchData as Record<string, unknown> | null,
        ),
        equipmentPoints: s.equipmentPoints as unknown[] | null,
        moisturePoints: s.moisturePoints as unknown[] | null,
      }));

    const estimate = extractSketchEstimate(floors);

    return NextResponse.json({ estimate });
  } catch (err) {
    return fromException(_req, err, { stage: "estimate:get" });
  }
}
