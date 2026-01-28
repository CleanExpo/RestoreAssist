import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET - Get single inspection by ID with all relations
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        environmentalData: true,
        moistureReadings: { orderBy: { createdAt: "asc" } },
        affectedAreas: { orderBy: { createdAt: "asc" } },
        scopeItems: { orderBy: { createdAt: "asc" } },
        classifications: { orderBy: { createdAt: "desc" } },
        costEstimates: { orderBy: { createdAt: "asc" } },
        photos: { orderBy: { timestamp: "asc" } },
        auditLogs: { orderBy: { timestamp: "desc" }, take: 50 },
      },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    return NextResponse.json({ inspection })
  } catch (error) {
    console.error("Error fetching inspection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete single inspection (user must own it)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    await prisma.inspection.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting inspection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
