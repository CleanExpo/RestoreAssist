import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** GET: Fetch one restoration document */
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

    const doc = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    return NextResponse.json({ document: doc })
  } catch (error) {
    console.error("Error fetching restoration document:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** PUT: Update a restoration document */
export async function PUT(
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
    const { documentNumber, title, reportId, data } = body

    const existing = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const updateData: {
      documentNumber?: string
      title?: string | null
      reportId?: string | null
      data?: object
    } = {}
    if (documentNumber !== undefined) updateData.documentNumber = String(documentNumber)
    if (title !== undefined) updateData.title = title || null
    if (reportId !== undefined) updateData.reportId = reportId || null
    if (data !== undefined) updateData.data = data as object

    const doc = await prisma.restorationDocument.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ document: doc })
  } catch (error) {
    console.error("Error updating restoration document:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** DELETE: Remove a restoration document */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    await prisma.restorationDocument.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting restoration document:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
