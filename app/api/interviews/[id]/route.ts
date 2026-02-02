import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Get single interview session by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user from database to get userId
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: "Interview ID is required" }, { status: 400 })
    }

    // First check if session exists
    const interviewSession = await prisma.interviewSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        formTemplate: {
          select: { id: true, name: true, formType: true, category: true },
        },
        responses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            questionId: true,
            questionText: true,
            answerValue: true,
            answerType: true,
            answeredAt: true,
            createdAt: true,
          },
        },
      },
    })

    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json({ session: interviewSession })
  } catch (error) {
    console.error("Error fetching interview session:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    )
  }
}

// PATCH - Update interview session (e.g. save autoPopulatedFields and mark COMPLETED)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Interview ID is required" }, { status: 400 })
    }

    const existing = await prisma.interviewSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const { autoPopulatedFields, status, completedAt } = body

    const data: { autoPopulatedFields?: string; status?: string; completedAt?: Date } = {}
    if (typeof autoPopulatedFields === "string") data.autoPopulatedFields = autoPopulatedFields
    else if (autoPopulatedFields != null && typeof autoPopulatedFields === "object") {
      data.autoPopulatedFields = JSON.stringify(autoPopulatedFields)
    }
    if (status === "COMPLETED" || status === "IN_PROGRESS" || status === "STARTED" || status === "ABANDONED") {
      data.status = status
    }
    if (completedAt != null) {
      const d = new Date(completedAt)
      if (!Number.isNaN(d.getTime())) data.completedAt = d
    } else if (status === "COMPLETED") {
      data.completedAt = new Date()
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, sessionId: id })
    }

    await prisma.interviewSession.update({
      where: { id },
      data: data as { autoPopulatedFields?: string; status?: "COMPLETED" | "IN_PROGRESS" | "STARTED" | "ABANDONED"; completedAt?: Date },
    })

    return NextResponse.json({ success: true, sessionId: id })
  } catch (error) {
    console.error("Error updating interview session:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete single interview session (user must own it)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: "Interview ID is required" }, { status: 400 })
    }

    const interviewSession = await prisma.interviewSession.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })

    if (!interviewSession) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 })
    }

    await prisma.interviewSession.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting interview session:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
