import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET - List all rooms for an inspection
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const rooms = await prisma.room.findMany({
      where: { inspectionId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { photos: true },
        },
      },
    })

    // Map to include photoCount and thumbnail at top level
    const result = rooms.map((room) => ({
      id: room.id,
      inspectionId: room.inspectionId,
      name: room.name,
      type: room.type,
      sortOrder: room.sortOrder,
      thumbnailUrl: room.thumbnailUrl,
      length: room.length,
      width: room.width,
      height: room.height,
      photoCount: room._count.photos,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    }))

    return NextResponse.json({ rooms: result })
  } catch (error) {
    console.error("Error listing rooms:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create a new room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, type, sortOrder } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "Type is required" }, { status: 400 })
    }

    // Auto-set sortOrder to max+1 if not provided
    let finalSortOrder = sortOrder
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxRoom = await prisma.room.findFirst({
        where: { inspectionId: id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      })
      finalSortOrder = (maxRoom?.sortOrder ?? -1) + 1
    }

    const room = await prisma.room.create({
      data: {
        inspectionId: id,
        name: name.trim(),
        type,
        sortOrder: finalSortOrder,
      },
    })

    return NextResponse.json({ room }, { status: 201 })
  } catch (error) {
    console.error("Error creating room:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
