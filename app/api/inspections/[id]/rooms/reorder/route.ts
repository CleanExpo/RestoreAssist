import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string }>
}

// PATCH - Reorder rooms
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { roomIds } = body

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return NextResponse.json(
        { error: "roomIds must be a non-empty array" },
        { status: 400 }
      )
    }

    // Verify all room IDs belong to this inspection
    const existingRooms = await prisma.room.findMany({
      where: { inspectionId: id },
      select: { id: true },
    })

    const existingIds = new Set(existingRooms.map((r) => r.id))
    const invalidIds = roomIds.filter((rid: string) => !existingIds.has(rid))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Invalid room IDs: " + invalidIds.join(", ") },
        { status: 400 }
      )
    }

    // Update sortOrder for each room in a transaction
    await prisma.$transaction(
      roomIds.map((roomId: string, index: number) =>
        prisma.room.update({
          where: { id: roomId },
          data: { sortOrder: index },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error reordering rooms:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
