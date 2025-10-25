import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No report IDs provided" }, { status: 400 })
    }

    // Verify all reports belong to the user
    const reports = await prisma.report.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id
      }
    })

    if (reports.length !== ids.length) {
      return NextResponse.json({ error: "Some reports not found or not authorized" }, { status: 404 })
    }

    // Delete all reports
    await prisma.report.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id
      }
    })

    return NextResponse.json({ 
      message: `${ids.length} reports deleted successfully`,
      deletedCount: ids.length 
    })
  } catch (error) {
    console.error("Error deleting reports:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
