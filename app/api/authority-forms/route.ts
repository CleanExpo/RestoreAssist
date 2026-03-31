import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/authority-forms
 * List all authority form instances for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    const whereClause: Record<string, unknown> = {
      report: {
        OR: [
          { userId: session.user.id },
          { assignedManagerId: session.user.id },
          { assignedAdminId: session.user.id },
        ],
      },
    }

    if (status && status !== "ALL") {
      whereClause.status = status
    }

    const forms = await prisma.authorityFormInstance.findMany({
      where: whereClause,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
        report: {
          select: {
            id: true,
            reportNumber: true,
            clientName: true,
            propertyAddress: true,
          },
        },
        signatures: {
          select: {
            id: true,
            signatoryName: true,
            signatoryRole: true,
            signedAt: true,
            signatureRequestSentAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ forms })
  } catch (error) {
    console.error("Error fetching authority forms:", error)
    return NextResponse.json(
      { error: "Failed to fetch authority forms" },
      { status: 500 }
    )
  }
}
