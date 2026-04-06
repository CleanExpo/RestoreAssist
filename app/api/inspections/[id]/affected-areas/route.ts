import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Add affected area
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
    if (!body.roomZoneId || !body.roomZoneId.trim()) {
      return NextResponse.json(
        { error: "Room/Zone ID is required" },
        { status: 400 }
      )
    }
    
    const sqft = Number(body.affectedSquareFootage)
    if (!isFinite(sqft) || sqft <= 0 || sqft > 100_000) {
      return NextResponse.json(
        { error: "Affected square footage must be a finite number between 0 and 100,000" },
        { status: 400 }
      )
    }
    
    if (!body.waterSource) {
      return NextResponse.json(
        { error: "Water source is required" },
        { status: 400 }
      )
    }
    
    // Validate photos array length before serialising
    if (body.photos !== undefined && body.photos !== null) {
      if (!Array.isArray(body.photos) || body.photos.length > 50) {
        return NextResponse.json({ error: "photos must be an array of up to 50 items" }, { status: 400 })
      }
    }

    // Create affected area
    const affectedArea = await prisma.affectedArea.create({
      data: {
        inspectionId: id,
        roomZoneId: String(body.roomZoneId).trim().slice(0, 200),
        affectedSquareFootage: sqft,
        waterSource: String(body.waterSource).slice(0, 100),
        timeSinceLoss: body.timeSinceLoss ? String(body.timeSinceLoss).slice(0, 100) : null,
        description: body.description ? String(body.description).slice(0, 2000) : null,
        photos: body.photos ? JSON.stringify(body.photos) : null
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Affected area added",
        entityType: "AffectedArea",
        entityId: affectedArea.id,
        userId: session.user.id,
        changes: JSON.stringify({
          roomZoneId: affectedArea.roomZoneId,
          affectedSquareFootage: affectedArea.affectedSquareFootage,
          waterSource: affectedArea.waterSource
        })
      }
    })
    
    return NextResponse.json({ affectedArea }, { status: 201 })
  } catch (error) {
    console.error("Error saving affected area:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

