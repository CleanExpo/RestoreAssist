import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePortalToken, portalTokenExpiresAt } from "@/lib/portal-token"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { inspectionId } = body as { inspectionId?: string }

    if (!inspectionId || typeof inspectionId !== "string") {
      return NextResponse.json({ error: "inspectionId is required" }, { status: 400 })
    }

    // Verify the inspection belongs to the authenticated user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id: inspectionId,
        userId: session.user.id,
      },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const token = generatePortalToken(inspectionId)
    const expiresAt = portalTokenExpiresAt()

    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      (request.headers.get("origin") || "http://localhost:3000")

    const portalUrl = `${baseUrl}/portal/${token}`

    return NextResponse.json({ portalUrl, expiresAt })
  } catch (error) {
    console.error("Portal generate error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
