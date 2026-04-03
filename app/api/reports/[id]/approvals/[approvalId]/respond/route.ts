import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ApprovalStatus } from "@prisma/client"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; approvalId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, approvalId } = await params
    const body = await request.json()
    const { status, clientComments } = body

    // Validate status — only APPROVED or REJECTED are valid respond actions
    const allowedStatuses: ApprovalStatus[] = ["APPROVED", "REJECTED"]
    if (!status || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify the approval exists and belongs to a report owned by this user
    const approval = await prisma.reportApproval.findFirst({
      where: {
        id: approvalId,
        reportId: id,
        report: {
          userId: session.user.id,
        },
      },
    })

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 })
    }

    const updated = await prisma.reportApproval.update({
      where: { id: approvalId },
      data: {
        status,
        clientComments: clientComments ?? null,
        respondedAt: new Date(),
      },
    })

    return NextResponse.json({ approval: updated })
  } catch (error) {
    console.error("Error responding to approval:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
