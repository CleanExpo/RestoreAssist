/**
 * POST /api/inspections/[id]/sketches/pdf — RA2-051 (RA-121)
 *
 * Generates a standalone A4-landscape floor plan PDF from canvas PNG exports.
 *
 * Body: {
 *   floors: Array<{ label: string, pngDataUrl: string, fabricJson?: object }>,
 *   propertyAddress?: string,
 *   reportNumber?: string,
 * }
 *
 * Returns: application/pdf stream
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateSketchPdf, type SketchFloor } from "@/lib/generate-sketch-pdf"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Verify the inspection belongs to the current user
  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, propertyAddress: true },
  })
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
  }

  let body: {
    floors: SketchFloor[]
    propertyAddress?: string
    reportNumber?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(body.floors) || body.floors.length === 0) {
    return NextResponse.json({ error: "floors[] must be a non-empty array" }, { status: 400 })
  }

  // Validate each floor has required fields
  for (const floor of body.floors) {
    if (!floor.label || typeof floor.label !== "string") {
      return NextResponse.json({ error: "Each floor must have a label" }, { status: 400 })
    }
    if (!floor.pngDataUrl || !floor.pngDataUrl.startsWith("data:image/png")) {
      return NextResponse.json({ error: "Each floor must have a valid pngDataUrl" }, { status: 400 })
    }
  }

  try {
    const pdfBytes = await generateSketchPdf({
      floors: body.floors,
      propertyAddress: body.propertyAddress ?? inspection.propertyAddress ?? "",
      reportNumber: body.reportNumber ?? id.slice(-8).toUpperCase(),
    })

    const fileName = `floor-plan-${id.slice(-8)}.pdf`

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("Sketch PDF generation error:", err)
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 })
  }
}
