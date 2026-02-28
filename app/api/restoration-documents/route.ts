import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const DOC_TYPE_INVOICE = "RESTORATION_INVOICE"

/** GET: List restoration documents (optionally by reportId or documentType) */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get("reportId")
    const documentType = searchParams.get("documentType")

    const where: { userId: string; reportId?: string; documentType?: string } = {
      userId: session.user.id,
    }
    if (reportId) where.reportId = reportId
    if (documentType) where.documentType = documentType

    const docs = await prisma.restorationDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        documentNumber: true,
        title: true,
        reportId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ documents: docs })
  } catch (error) {
    console.error("Error listing restoration documents:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** POST: Create a new restoration document */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { documentType, documentNumber, title, reportId, data } = body

    if (!documentType || !documentNumber || data === undefined) {
      return NextResponse.json(
        { error: "documentType, documentNumber, and data are required" },
        { status: 400 }
      )
    }

    const doc = await prisma.restorationDocument.create({
      data: {
        userId: session.user.id,
        reportId: reportId || null,
        documentType: documentType,
        documentNumber: String(documentNumber),
        title: title || null,
        data: data as object,
      },
    })

    return NextResponse.json({ document: doc })
  } catch (error) {
    console.error("Error creating restoration document:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
