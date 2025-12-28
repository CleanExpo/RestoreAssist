import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Add moisture reading
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const { id } = await params
    const body = await request.json()
    
    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    // Validate required fields
    if (!body.location || !body.location.trim()) {
      return NextResponse.json(
        { error: "Location is required" },
        { status: 400 }
      )
    }
    
    if (!body.surfaceType) {
      return NextResponse.json(
        { error: "Surface type is required" },
        { status: 400 }
      )
    }
    
    if (body.moistureLevel === undefined || body.moistureLevel < 0 || body.moistureLevel > 100) {
      return NextResponse.json(
        { error: "Moisture level must be between 0% and 100%" },
        { status: 400 }
      )
    }
    
    // Create moisture reading
    const moistureReading = await prisma.moistureReading.create({
      data: {
        inspectionId: id,
        location: body.location.trim(),
        surfaceType: body.surfaceType,
        moistureLevel: body.moistureLevel,
        depth: body.depth || "Surface",
        notes: body.notes || null,
        photoUrl: body.photoUrl || null
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Moisture reading added",
        entityType: "MoistureReading",
        entityId: moistureReading.id,
        userId: session.user.id,
        changes: JSON.stringify({
          location: moistureReading.location,
          surfaceType: moistureReading.surfaceType,
          moistureLevel: moistureReading.moistureLevel
        })
      }
    })
    
    return NextResponse.json({ moistureReading }, { status: 201 })
  } catch (error) {
    console.error("Error saving moisture reading:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

