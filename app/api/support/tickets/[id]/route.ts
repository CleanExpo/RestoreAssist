import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// Validation schema for PATCH
// ---------------------------------------------------------------------------

const patchTicketSchema = z.object({
  status: z
    .enum(["open", "in_progress", "resolved", "closed"])
    .optional(),
  priority: z
    .enum(["low", "normal", "high", "urgent"])
    .optional(),
  category: z
    .enum(["general", "billing", "technical", "feature_request", "bug"])
    .optional(),
})

// ---------------------------------------------------------------------------
// GET /api/support/tickets/[id] — admin only
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await context.params

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error("[support/tickets/[id] GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/support/tickets/[id] — admin only
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await context.params

    const rawBody = await request.json()
    const parsed = patchTicketSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 }
      )
    }

    const { status, priority, category } = parsed.data

    // Nothing to update
    if (!status && !priority && !category) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })
    }

    const resolvedAt =
      status === "resolved" ? new Date() : status === "open" || status === "in_progress" ? null : undefined

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      },
    })

    return NextResponse.json({ ticket })
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }
    console.error("[support/tickets/[id] PATCH]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
