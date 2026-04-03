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

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Verify inspection ownership
  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
  }

  const sketches = await prisma.claimSketch.findMany({
    where: { inspectionId: id },
    orderBy: { floorNumber: "asc" },
    select: {
      floorLabel: true,
      sketchType: true,
      sketchData: true,
      equipmentPoints: true,
      moisturePoints: true,
    },
  })

  // Only process structural sketches for the estimate
  const floors = sketches
    .filter(s => s.sketchType === "structural" || !s.sketchType)
    .map(s => ({
      floorLabel: s.floorLabel,
      sketchData: s.sketchData as Record<string, unknown> | null,
      equipmentPoints: s.equipmentPoints as unknown[] | null,
      moisturePoints: s.moisturePoints as unknown[] | null,
    }))

  const estimate = extractSketchEstimate(floors)

  return NextResponse.json({ estimate })
}
