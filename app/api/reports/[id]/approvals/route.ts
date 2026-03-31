import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ApprovalType } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const approvals = await prisma.reportApproval.findMany({
      where: { reportId: id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ approvals })
  } catch (error) {
    console.error("Error fetching approvals:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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
    const { approvalType, amount } = body

    // Validate approvalType
    if (!approvalType || !Object.values(ApprovalType).includes(approvalType)) {
      return NextResponse.json(
        { error: `Invalid approvalType. Must be one of: ${Object.values(ApprovalType).join(", ")}` },
        { status: 400 }
      )
    }

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const approval = await prisma.reportApproval.create({
      data: {
        reportId: id,
        approvalType,
        status: "PENDING",
        amount: amount ?? null,
      },
    })

    return NextResponse.json({ approval }, { status: 201 })
  } catch (error) {
    console.error("Error creating approval:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
