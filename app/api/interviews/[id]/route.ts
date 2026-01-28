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
            answerValue: true, // Use answerValue from schema
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
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
    })
    
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: errorMessage
      },
      { status: 500 }
    )
  }
}
