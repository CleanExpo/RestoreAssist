import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeString } from "@/lib/sanitize"

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

// PATCH - Update mutable scalar fields (lossDescription, technicianName)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    const existing = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const body = await request.json()
    const data: Record<string, unknown> = {}

    if (body.lossDescription !== undefined) {
      data.lossDescription = body.lossDescription
        ? sanitizeString(body.lossDescription, 2000)
        : null
    }
    if (body.technicianName !== undefined) {
      data.technicianName = body.technicianName
        ? sanitizeString(body.technicianName, 200)
        : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })
    }

    await prisma.inspection.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error patching inspection:", error)
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
