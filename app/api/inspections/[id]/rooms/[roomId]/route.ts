import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string; roomId: string }>
}

// GET - Get single room with all relations
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, roomId } = await context.params

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const room = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      include: {
        photos: { orderBy: { timestamp: "asc" } },
        moistureReadings: { orderBy: { createdAt: "asc" } },
        annotations: { orderBy: { createdAt: "asc" } },
        affectedArea: true,
        scopeItems: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    return NextResponse.json({ room })
  } catch (error) {
    console.error("Error fetching room:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update room details
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, roomId } = await context.params

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    // Validate room exists and belongs to this inspection
    const existingRoom = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      select: { id: true },
    })

    if (!existingRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, type, length, width, height, floorPlanData, thumbnailUrl } = body

    // Build update data with only provided fields
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (length !== undefined) updateData.length = length
    if (width !== undefined) updateData.width = width
    if (height !== undefined) updateData.height = height
    if (floorPlanData !== undefined) updateData.floorPlanData = floorPlanData
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl

    const room = await prisma.room.update({
      where: { id: roomId },
      data: updateData,
    })

    return NextResponse.json({ room })
  } catch (error) {
    console.error("Error updating room:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete room (cascade annotations, unlink related records)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, roomId } = await context.params

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    // Validate room exists and belongs to this inspection
    const existingRoom = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      select: { id: true },
    })

    if (!existingRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    // Unlink related records by setting roomId to null
    await prisma.$transaction([
      prisma.inspectionPhoto.updateMany({
        where: { roomId },
        data: { roomId: null },
      }),
      prisma.moistureReading.updateMany({
        where: { roomId },
        data: { roomId: null },
      }),
      prisma.scopeItem.updateMany({
        where: { roomId },
        data: { roomId: null },
      }),
      prisma.affectedArea.updateMany({
        where: { roomId },
        data: { roomId: null },
      }),
      // Annotations cascade-delete via schema, but room delete handles that
      prisma.room.delete({
        where: { id: roomId },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting room:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
