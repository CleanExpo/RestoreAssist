import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string; roomId: string }>
}

// GET - List annotations for a room
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

    // Validate room belongs to this inspection
    const room = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      select: { id: true },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    const annotations = await prisma.roomAnnotation.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({ annotations })
  } catch (error) {
    console.error("Error listing annotations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create annotation
export async function POST(request: NextRequest, context: RouteContext) {
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

    // Validate room belongs to this inspection
    const room = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      select: { id: true },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    const body = await request.json()
    const { type, data, photoId } = body

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "Type is required" }, { status: 400 })
    }

    if (!data || typeof data !== "string") {
      return NextResponse.json(
        { error: "Data is required and must be a JSON string" },
        { status: 400 }
      )
    }

    const annotation = await prisma.roomAnnotation.create({
      data: {
        roomId,
        type,
        data,
        photoId: photoId || null,
      },
    })

    return NextResponse.json({ annotation }, { status: 201 })
  } catch (error) {
    console.error("Error creating annotation:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete annotation by ID (query param: ?annotationId=xxx)
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

    // Validate room belongs to this inspection
    const room = await prisma.room.findFirst({
      where: { id: roomId, inspectionId: id },
      select: { id: true },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const annotationId = searchParams.get("annotationId")

    if (!annotationId) {
      return NextResponse.json(
        { error: "annotationId query parameter is required" },
        { status: 400 }
      )
    }

    // Verify annotation exists and belongs to this room
    const annotation = await prisma.roomAnnotation.findFirst({
      where: { id: annotationId, roomId },
      select: { id: true },
    })

    if (!annotation) {
      return NextResponse.json({ error: "Annotation not found" }, { status: 404 })
    }

    await prisma.roomAnnotation.delete({
      where: { id: annotationId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting annotation:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
